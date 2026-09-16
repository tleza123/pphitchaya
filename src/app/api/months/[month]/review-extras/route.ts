import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getMonthRef,
  getExtraReviewsCol,
  getFinanceControlRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { monthKey } from '@/lib/payroll/dates';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { verifyFinanceGate } from '@/lib/server/finance-gate';

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
    const { employeeId, expectedExtrasRevision, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (!employeeId || typeof employeeId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ employeeId', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'POST', `${targetMonth}:review:${employeeId}`, {
      employeeId,
      expectedExtrasRevision
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const controlRef = getFinanceControlRef(shopId);
    const monthRef = getMonthRef(targetMonth, shopId);
    const reviewRef = getExtraReviewsCol(targetMonth, shopId).doc(employeeId);

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      // Finance gate
      await verifyFinanceGate(tx, controlRef, monthRef, targetMonth);

      const reviewSnap = await tx.get(reviewRef);
      const current = reviewSnap.exists ? reviewSnap.data() : { extrasRevision: 1 };
      const currentRev = current?.extrasRevision || 1;

      if (expectedExtrasRevision !== undefined && currentRev !== expectedExtrasRevision) {
        throw new Error('CONFLICT');
      }

      const now = new Date().toISOString();
      const reviewData = {
        employeeId,
        extrasRevision: currentRev,
        reviewedExtrasRevision: currentRev, // Match = Reviewed!
        confirmedAt: now,
        confirmedBy: owner.uid
      };

      tx.set(reviewRef, reviewData, { merge: true });

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'REVIEW_EXTRAS',
        `${targetMonth}:${employeeId}`,
        current,
        reviewData,
        requestId
      );

      const responsePayload = reviewData;

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: `${targetMonth}:review:${employeeId}`,
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
      return createErrorResponse('CONFLICT', 'ข้อมูลเงินพิเศษมีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง', 409);
    }
    if (error.message === 'MONTH_CLOSED') {
      return createErrorResponse('MONTH_CLOSED', undefined, 409);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
