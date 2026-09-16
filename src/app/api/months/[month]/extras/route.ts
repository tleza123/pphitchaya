import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
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
import { validateSatang } from '@/lib/payroll/engine';
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
    const { employeeId, label, amount: rawAmount, requestId, type: rawType } = body;

    const extraType: 'BONUS' | 'DEDUCTION' = rawType === 'DEDUCTION' ? 'DEDUCTION' : 'BONUS';

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (!employeeId || typeof employeeId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ employeeId', 422);
    }
    if (!label || typeof label !== 'string' || label.trim().length === 0 || label.length > 80) {
      return createErrorResponse(
        'INVALID_INPUT',
        extraType === 'DEDUCTION'
          ? 'กรุณาระบุชื่อรายการหักเงิน (ไม่เกิน 80 ตัวอักษร)'
          : 'กรุณาระบุชื่อรายการเงินพิเศษ (ไม่เกิน 80 ตัวอักษร)',
        422
      );
    }

    const rawSatang = typeof rawAmount === 'number' ? rawAmount : moneySatang(String(rawAmount));
    let amountSatang: number;
    try {
      amountSatang = validateSatang(rawSatang);
    } catch {
      return createErrorResponse(
        'INVALID_INPUT',
        extraType === 'DEDUCTION' ? 'จำนวนเงินหักไม่ถูกต้อง' : 'จำนวนเงินพิเศษไม่ถูกต้อง',
        422
      );
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const extraId = 'extra_' + crypto.randomUUID();
    const payloadHash = computePayloadHash(owner.uid, 'POST', `${targetMonth}:extra:${extraId}`, {
      employeeId,
      label: label.trim(),
      amountSatang,
      type: extraType
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const controlRef = getFinanceControlRef(shopId);
    const monthRef = getMonthRef(targetMonth, shopId);
    const extraRef = getMonthlyExtrasCol(targetMonth, shopId).doc(extraId);
    const reviewRef = getExtraReviewsCol(targetMonth, shopId).doc(employeeId);

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      // Finance gate
      await verifyFinanceGate(tx, controlRef, monthRef, targetMonth);

      const now = new Date().toISOString();
      const extraData = {
        extraId,
        employeeId,
        monthKey: targetMonth,
        label: label.trim(),
        amountSatang,
        type: extraType,
        sourceTemplateId: null,
        sourceTemplateVersion: null,
        revision: 1,
        createdAt: now,
        updatedAt: now
      };

      tx.set(extraRef, extraData);

      // Invalidate review for this employee
      const reviewSnap = await tx.get(reviewRef);
      const currentReviewRev = reviewSnap.exists ? reviewSnap.data()?.extrasRevision || 1 : 1;
      tx.set(
        reviewRef,
        {
          employeeId,
          extrasRevision: currentReviewRev + 1,
          reviewedExtrasRevision: 0, // Invalidate review!
          confirmedAt: null,
          confirmedBy: null
        },
        { merge: true }
      );

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'ADD_MONTH_EXTRA',
        `${targetMonth}:${extraId}`,
        null,
        extraData,
        requestId
      );

      const responsePayload = extraData;

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
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
