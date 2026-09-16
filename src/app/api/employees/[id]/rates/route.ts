import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getEmployeeRef,
  getRatesCol,
  getMonthRef,
  getFinanceControlRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { dateKey } from '@/lib/payroll/dates';
import { moneySatang } from '@/lib/payroll/money';
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
    const { effectiveFrom: rawFrom, dailyRate: rawRate, expectedRevision, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (typeof expectedRevision !== 'number') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision ของพนักงาน', 422);
    }

    const effectiveFrom = dateKey(rawFrom);
    const dailySatang = typeof rawRate === 'number' ? rawRate : moneySatang(String(rawRate));
    const targetMonthKey = effectiveFrom.slice(0, 7);

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'POST', `${employeeId}:rates`, {
      effectiveFrom,
      dailySatang,
      expectedRevision
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const employeeRef = getEmployeeRef(employeeId, shopId);
    const monthRef = getMonthRef(targetMonthKey, shopId);

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      // Check if target month is closed
      const monthSnap = await tx.get(monthRef);
      if (monthSnap.exists && monthSnap.data()?.state === 'CLOSED') {
        throw new Error('MONTH_CLOSED');
      }

      const empSnap = await tx.get(employeeRef);
      if (!empSnap.exists) {
        throw new Error('NOT_FOUND');
      }

      const current = empSnap.data() as any;
      if (current.revision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      if (effectiveFrom < current.startDate) {
        throw new Error('RATE_BEFORE_START');
      }

      // Check duplicate effectiveFrom
      const existingRatesSnap = await tx.get(
        getRatesCol(employeeId, shopId).where('effectiveFrom', '==', effectiveFrom)
      );
      if (!existingRatesSnap.empty) {
        throw new Error('DUPLICATE_RATE');
      }

      const rateId = 'rate_' + crypto.randomUUID();
      const rateRef = getRatesCol(employeeId, shopId).doc(rateId);
      const now = new Date().toISOString();

      const rateData = {
        rateId,
        employeeId,
        effectiveFrom,
        dailySatang,
        revision: 1,
        createdAt: now,
        updatedAt: now
      };

      const newEmpRevision = current.revision + 1;
      tx.set(rateRef, rateData);
      tx.update(employeeRef, {
        revision: newEmpRevision,
        updatedAt: now
      });

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'ADD_RATE',
        `${employeeId}:${rateId}`,
        null,
        rateData,
        requestId
      );

      const responsePayload = {
        rateId,
        employeeId,
        effectiveFrom,
        dailySatang,
        employeeRevision: newEmpRevision
      };

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: `${employeeId}:rates`,
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
      return createErrorResponse('MONTH_CLOSED', 'เดือนที่มีผลของอัตรานี้ปิดแล้ว กรุณาเปิดเดือนก่อนแก้ไข', 409);
    }
    if (error.message === 'DUPLICATE_RATE') {
      return createErrorResponse('DUPLICATE_RATE', 'มีอัตราค่าแรงในวันเดียวกันอยู่แล้ว', 409);
    }
    if (error.message === 'RATE_BEFORE_START') {
      return createErrorResponse('INVALID_INPUT', 'วันที่เริ่มใช้อัตราต้องไม่ก่อนวันเริ่มงาน', 422);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
