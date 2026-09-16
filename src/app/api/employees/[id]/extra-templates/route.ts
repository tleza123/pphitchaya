import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getEmployeeRef,
  getExtraTemplatesCol,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { monthKey } from '@/lib/payroll/dates';
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
    const {
      label,
      amount: rawAmount,
      effectiveFromMonth: rawMonth,
      effectiveToMonth: rawToMonth,
      expectedRevision,
      requestId
    } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (!label || typeof label !== 'string' || label.trim().length === 0 || label.length > 80) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุชื่อรายการเงินพิเศษ (ไม่เกิน 80 ตัวอักษร)', 422);
    }

    const amountSatang = typeof rawAmount === 'number' ? rawAmount : moneySatang(String(rawAmount));
    const effectiveFromMonth = monthKey(rawMonth);
    const effectiveToMonth = rawToMonth ? monthKey(rawToMonth) : null;

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'POST', `${employeeId}:extra-templates`, {
      label: label.trim(),
      amountSatang,
      effectiveFromMonth,
      effectiveToMonth,
      expectedRevision
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const employeeRef = getEmployeeRef(employeeId, shopId);

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      const empSnap = await tx.get(employeeRef);
      if (!empSnap.exists) {
        throw new Error('NOT_FOUND');
      }

      const templateId = 'tpl_' + crypto.randomUUID();
      const templateRef = getExtraTemplatesCol(employeeId, shopId).doc(templateId);
      const now = new Date().toISOString();

      const templateData = {
        templateId,
        employeeId,
        label: label.trim(),
        amountSatang,
        effectiveFromMonth,
        effectiveToMonth,
        version: 1,
        revision: 1,
        createdAt: now,
        updatedAt: now
      };

      tx.set(templateRef, templateData);

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'ADD_EXTRA_TEMPLATE',
        `${employeeId}:${templateId}`,
        null,
        templateData,
        requestId
      );

      const responsePayload = templateData;

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: `${employeeId}:extra-templates`,
        payloadHash,
        response: responsePayload,
        createdAt: now
      });

      return responsePayload;
    });

    return createSuccessResponse(result, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
