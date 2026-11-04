import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getMonthRef,
  getFinanceControlRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { monthKey } from '@/lib/payroll/dates';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { verifyFinanceGate } from '@/lib/server/finance-gate';
import { ensureMonthExtrasPrepared } from '@/lib/server/extra-sync';

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
    const { requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'POST', `${targetMonth}:prepare-extras`, {
      targetMonth
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const controlRef = getFinanceControlRef(shopId);
    const monthRef = getMonthRef(targetMonth, shopId);

    const cached = await db.runTransaction(async tx => {
      const receipt = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (receipt) return receipt;
      await verifyFinanceGate(tx, controlRef, monthRef, targetMonth);
      return null;
    });
    if (cached) return createSuccessResponse(cached, requestId);

    const prepResult = await ensureMonthExtrasPrepared(db, shopId, targetMonth, owner.uid);

    const responsePayload = {
      month: targetMonth,
      createdCount: prepResult.createdCount,
      updatedCount: prepResult.updatedCount
    };

    await db.runTransaction(async tx => {
      const now = new Date().toISOString();
      recordAudit(
        tx,
        shopId,
        owner.uid,
        'PREPARE_EXTRAS',
        targetMonth,
        null,
        responsePayload,
        requestId
      );

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: `${targetMonth}:prepare-extras`,
        payloadHash,
        response: responsePayload,
        createdAt: now
      });
    });

    return createSuccessResponse(responsePayload, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'MONTH_CLOSED') {
      return createErrorResponse('MONTH_CLOSED', undefined, 409);
    }
    if (error.message === 'MONTH_CLOSING') {
      return createErrorResponse('MONTH_CLOSING', undefined, 409);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
