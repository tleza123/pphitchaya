import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getEmployeeRef,
  getRequestsCol,
  recordAudit,
  getMonthRef
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { dateKey } from '@/lib/payroll/dates';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const owner = await verifyOwner(req);
    const { id: employeeId } = await params;
    const body = await req.json();
    const { endDate: rawEnd, expectedRevision, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (typeof expectedRevision !== 'number') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision', 422);
    }

    const endDate = dateKey(rawEnd);
    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'POST', `${employeeId}:end-employment`, {
      endDate,
      expectedRevision
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const employeeRef = getEmployeeRef(employeeId, shopId);

    // Pre-check attendance conflict across collectionGroup
    const conflictingSnap = await db
      .collectionGroup('attendance')
      .where('employeeId', '==', employeeId)
      .where('dateKey', '>', endDate)
      .get();

    const conflictingDates = conflictingSnap.docs
      .filter(doc => doc.data()?.status && doc.data()?.status !== 'UNMARKED')
      .map(doc => doc.data()?.dateKey);

    if (conflictingDates.length > 0) {
      return createErrorResponse(
        'CONFLICT',
        `พบข้อมูลเช็คชื่อหลังวันสิ้นสุดการทำงาน (${conflictingDates.join(', ')}) กรุณาตรวจสอบหรือล้างการเช็คชื่อก่อนสิ้นสุดงาน`,
        409,
        { conflictingDates: conflictingDates.join(', ') }
      );
    }

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      const empSnap = await tx.get(employeeRef);
      if (!empSnap.exists) {
        throw new Error('NOT_FOUND');
      }

      const current = empSnap.data() as any;
      if (current.revision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      if (endDate < current.startDate) {
        throw new Error('INVALID_EMPLOYMENT_DATES');
      }

      const newRevision = current.revision + 1;
      const now = new Date().toISOString();
      const updated = {
        endDate,
        revision: newRevision,
        updatedAt: now
      };

      tx.update(employeeRef, updated);

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'END_EMPLOYMENT',
        employeeId,
        current,
        { ...current, ...updated },
        requestId
      );

      const responsePayload = {
        employeeId,
        ...current,
        ...updated
      };

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: `${employeeId}:end-employment`,
        payloadHash,
        response: responsePayload,
        createdAt: now
      });

      return responsePayload;
    });

    return createSuccessResponse(result, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    if (error.message === 'INVALID_EMPLOYMENT_DATES') {
      return createErrorResponse('INVALID_INPUT', 'วันสิ้นสุดการทำงานต้องไม่ก่อนวันเริ่มงาน', 422);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
