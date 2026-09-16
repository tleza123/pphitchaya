import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getMonthRef,
  getMonthlyExtrasCol,
  getExtraReviewsCol,
  getFinanceControlRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { monthKey } from '@/lib/payroll/dates';
import { moneySatang } from '@/lib/payroll/money';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { verifyFinanceGate } from '@/lib/server/finance-gate';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ month: string; extraId: string }> }
) {
  try {
    const owner = await verifyOwner(req);
    const { month: rawMonth, extraId } = await params;
    const targetMonth = monthKey(rawMonth);
    const body = await req.json();
    const { label, amount: rawAmount, deleted, expectedRevision, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (typeof expectedRevision !== 'number') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'PATCH', `${targetMonth}:extra:${extraId}`, {
      label,
      rawAmount,
      deleted,
      expectedRevision
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const controlRef = getFinanceControlRef(shopId);
    const monthRef = getMonthRef(targetMonth, shopId);
    const extraRef = getMonthlyExtrasCol(targetMonth, shopId).doc(extraId);

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      // Finance gate
      await verifyFinanceGate(tx, controlRef, monthRef, targetMonth);

      const extraSnap = await tx.get(extraRef);
      if (!extraSnap.exists) {
        throw new Error('NOT_FOUND');
      }
      const current = extraSnap.data() as any;
      if (current.revision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      const now = new Date().toISOString();
      const newRevision = current.revision + 1;
      const updated: Record<string, any> = {
        revision: newRevision,
        updatedAt: now
      };

      if (deleted) {
        updated.deletedAt = now;
      } else {
        if (label !== undefined) updated.label = String(label).trim().slice(0, 80);
        if (rawAmount !== undefined) {
          updated.amountSatang = typeof rawAmount === 'number' ? rawAmount : moneySatang(String(rawAmount));
        }
      }

      tx.update(extraRef, updated);

      // Invalidate review for this employee
      const reviewRef = getExtraReviewsCol(targetMonth, shopId).doc(current.employeeId);
      const reviewSnap = await tx.get(reviewRef);
      const currentReviewRev = reviewSnap.exists ? reviewSnap.data()?.extrasRevision || 1 : 1;
      tx.set(
        reviewRef,
        {
          employeeId: current.employeeId,
          extrasRevision: currentReviewRev + 1,
          reviewedExtrasRevision: 0,
          confirmedAt: null,
          confirmedBy: null
        },
        { merge: true }
      );

      recordAudit(
        tx,
        shopId,
        owner.uid,
        deleted ? 'DELETE_MONTH_EXTRA' : 'UPDATE_MONTH_EXTRA',
        `${targetMonth}:${extraId}`,
        current,
        { ...current, ...updated },
        requestId
      );

      const responsePayload = {
        extraId,
        ...current,
        ...updated
      };

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'PATCH',
        entityKey: `${targetMonth}:extra:${extraId}`,
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
