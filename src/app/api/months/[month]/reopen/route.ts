import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getMonthRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { monthKey } from '@/lib/payroll/dates';
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
    const { reason, expectedRevision, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุเหตุผลในการเปิดเดือนเพื่อแก้ไข', 422);
    }
    if (typeof expectedRevision !== 'number') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'POST', `${targetMonth}:reopen`, {
      reason: reason.trim(),
      expectedRevision
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const monthRef = getMonthRef(targetMonth, shopId);

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      const monthSnap = await tx.get(monthRef);
      if (!monthSnap.exists) {
        throw new Error('NOT_FOUND');
      }

      const current = monthSnap.data() as any;
      if (current.state !== 'CLOSED') {
        throw new Error('MONTH_NOT_CLOSED');
      }
      if (current.revision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      const now = new Date().toISOString();
      const newRevision = current.revision + 1;

      // Keep previous currentClosureId intact so history is never lost
      const updated = {
        state: 'OPEN',
        revision: newRevision,
        reopenedAt: now,
        reopenedBy: owner.uid,
        reopenReason: reason.trim(),
        updatedAt: now
      };

      tx.update(monthRef, updated);

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'REOPEN_MONTH',
        targetMonth,
        current,
        { ...current, ...updated },
        requestId,
        reason.trim()
      );

      const responsePayload = {
        month: targetMonth,
        ...current,
        ...updated
      };

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: `${targetMonth}:reopen`,
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
    if (error.message === 'MONTH_NOT_CLOSED') {
      return createErrorResponse('INVALID_INPUT', 'เดือนนี้ไม่ได้อยู่ในสถานะปิด', 422);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
