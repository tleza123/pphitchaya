import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getMonthRef,
  getFinanceControlRef,
  getEmployeesCol,
  getCloseJobsCol,
  getClosuresCol,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { monthKey, getBangkokToday, monthDates } from '@/lib/payroll/dates';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  try {
    const owner = await verifyOwner(req);
    const { month: rawMonth } = await params;
    const targetMonth = monthKey(rawMonth);
    const body = await req.json();
    const { expectedRevision, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (typeof expectedRevision !== 'number') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision ของเดือน', 422);
    }

    const today = getBangkokToday();
    const allDates = monthDates(targetMonth);
    const lastDate = allDates[allDates.length - 1];

    // Must be at or past month end to close
    if (today < lastDate) {
      return createErrorResponse(
        'INVALID_INPUT',
        `ไม่สามารถปิดเดือนก่อนสิ้นสุดเดือนได้ (สิ้นสุดวันที่ ${lastDate})`,
        422
      );
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'POST', `${targetMonth}:start-close`, {
      expectedRevision
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const controlRef = getFinanceControlRef(shopId);
    const monthRef = getMonthRef(targetMonth, shopId);
    const jobId = 'job_' + crypto.randomUUID();
    const closureId = 'closure_' + crypto.randomUUID();
    const jobRef = getCloseJobsCol(shopId).doc(jobId);
    const closureRef = getClosuresCol(targetMonth, shopId).doc(closureId);

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      // Check control doc
      const controlSnap = await tx.get(controlRef);
      const control = controlSnap.exists
        ? controlSnap.data()
        : { revision: 1, closingMonth: null, activeCloseJobId: null };

      if (control?.closingMonth && control.closingMonth !== targetMonth) {
        throw new Error('SYSTEM_BUSY');
      }

      // Check month doc
      const monthSnap = await tx.get(monthRef);
      const monthData = monthSnap.exists
        ? monthSnap.data()
        : { state: 'OPEN', revision: 0, extrasRevision: 0 };

      if (monthData?.state === 'CLOSED') {
        throw new Error('MONTH_CLOSED');
      }
      if (monthData?.state === 'CLOSING' && control?.activeCloseJobId) {
        // Return existing in-progress job
        return {
          jobId: control.activeCloseJobId,
          monthKey: targetMonth,
          status: 'IN_PROGRESS'
        };
      }
      if (monthData?.revision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      // Gather active employees
      const employeesSnap = await tx.get(getEmployeesCol(shopId));
      const employeeIds = employeesSnap.docs
        .filter(doc => {
          const emp = doc.data();
          if (emp.startDate > lastDate) return false;
          if (emp.endDate && emp.endDate < `${targetMonth}-01`) return false;
          return true;
        })
        .map(doc => doc.id);

      const now = new Date().toISOString();
      const newMonthRev = (monthData?.revision || 0) + 1;

      // 1. Lock finance gate
      tx.set(
        controlRef,
        {
          revision: (control?.revision || 0) + 1,
          closingMonth: targetMonth,
          activeCloseJobId: jobId,
          updatedAt: now
        },
        { merge: true }
      );

      // 2. Set month CLOSING
      tx.set(
        monthRef,
        {
          state: 'CLOSING',
          revision: newMonthRev,
          updatedAt: now
        },
        { merge: true }
      );

      // 3. Create Job
      const jobData = {
        jobId,
        monthKey: targetMonth,
        status: 'IN_PROGRESS',
        cursor: 0,
        sourceRevision: newMonthRev,
        closureId,
        employeeIds,
        totalEmployees: employeeIds.length,
        errors: [],
        createdAt: now,
        updatedAt: now
      };
      tx.set(jobRef, jobData);

      // 4. Create STAGING closure
      tx.set(closureRef, {
        closureId,
        monthKey: targetMonth,
        status: 'STAGING',
        sourceRevision: newMonthRev,
        employeeIds,
        createdAt: now
      });

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'START_CLOSE_MONTH',
        targetMonth,
        monthData,
        { state: 'CLOSING', jobId, closureId },
        requestId
      );

      const responsePayload = {
        jobId,
        closureId,
        monthKey: targetMonth,
        totalEmployees: employeeIds.length,
        status: 'IN_PROGRESS'
      };

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: `${targetMonth}:start-close`,
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
    if (error.message === 'MONTH_CLOSED') {
      return createErrorResponse('MONTH_CLOSED', undefined, 409);
    }
    if (error.message === 'SYSTEM_BUSY') {
      return createErrorResponse('BUSY', 'ระบบกำลังดำเนินการปิดเดือนอื่นอยู่', 429);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
