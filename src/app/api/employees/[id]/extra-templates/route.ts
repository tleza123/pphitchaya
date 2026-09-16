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
import { monthKey, getBangkokMonth } from '@/lib/payroll/dates';
import { moneySatang, validateSatang } from '@/lib/payroll/money';
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
      name,
      amount: rawAmount,
      amountSatang: rawAmountSatang,
      effectiveFromMonth: rawMonth,
      effectiveToMonth: rawToMonth,
      extraTemplates,
      expectedRevision,
      requestId
    } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'POST', `${employeeId}:extra-templates`, {
      requestId,
      label,
      extraTemplates
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

      const now = new Date().toISOString();

      if (Array.isArray(extraTemplates)) {
        // Bulk replace/set templates for this employee
        const existingSnap = await tx.get(getExtraTemplatesCol(employeeId, shopId));
        for (const d of existingSnap.docs) {
          tx.delete(d.ref);
        }

        const createdTemplates = [];
        for (const t of extraTemplates) {
          const lbl = String(t.label || t.name || '').trim().slice(0, 80);
          const amt = typeof t.amountSatang === 'number'
            ? t.amountSatang
            : (t.amount ? Math.round(Number(t.amount) * 100) : 0);
          if (lbl && Number.isSafeInteger(amt) && amt >= 0) {
            const templateId = 'tpl_' + crypto.randomUUID();
            const templateRef = getExtraTemplatesCol(employeeId, shopId).doc(templateId);
            const tData = {
              templateId,
              employeeId,
              label: lbl,
              amountSatang: amt,
              effectiveFromMonth: t.effectiveFromMonth ? monthKey(t.effectiveFromMonth) : getBangkokMonth(),
              effectiveToMonth: t.effectiveToMonth ? monthKey(t.effectiveToMonth) : null,
              version: 1,
              revision: 1,
              createdAt: now,
              updatedAt: now
            };
            tx.set(templateRef, tData);
            createdTemplates.push(tData);
          }
        }

        recordAudit(
          tx,
          shopId,
          owner.uid,
          'SET_EXTRA_TEMPLATES',
          employeeId,
          null,
          { count: createdTemplates.length },
          requestId
        );

        const responsePayload = { employeeId, templates: createdTemplates };
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
      }

      // Single template handling
      const effectiveLabel = String(label || name || '').trim();
      if (!effectiveLabel || effectiveLabel.length > 80) {
        return createErrorResponse('INVALID_INPUT', 'กรุณาระบุชื่อรายการเงินพิเศษ ไม่เกิน 80 ตัวอักษร', 422);
      }

      let amountSatang: number;
      if (typeof rawAmountSatang === 'number') {
        amountSatang = validateSatang(rawAmountSatang);
      } else if (typeof rawAmount === 'number') {
        amountSatang = validateSatang(rawAmount);
      } else if (typeof rawAmount === 'string') {
        amountSatang = moneySatang(rawAmount.trim());
      } else {
        amountSatang = 0;
      }

      const effectiveFromMonth = rawMonth ? monthKey(rawMonth) : getBangkokMonth();
      const effectiveToMonth = rawToMonth ? monthKey(rawToMonth) : null;

      const templateId = 'tpl_' + crypto.randomUUID();
      const templateRef = getExtraTemplatesCol(employeeId, shopId).doc(templateId);

      const templateData = {
        templateId,
        employeeId,
        label: effectiveLabel,
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
