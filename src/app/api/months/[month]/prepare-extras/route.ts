import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getMonthRef,
  getEmployeesCol,
  getExtraTemplatesCol,
  getMonthlyExtrasCol,
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

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      // Check finance gate
      await verifyFinanceGate(tx, controlRef, monthRef, targetMonth);

      const employeesSnap = await tx.get(getEmployeesCol(shopId));
      const monthlyExtrasCol = getMonthlyExtrasCol(targetMonth, shopId);
      const existingExtrasSnap = await tx.get(monthlyExtrasCol);
      const existingTemplateIds = new Set<string>();

      existingExtrasSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.sourceTemplateId) {
          existingTemplateIds.add(`${d.employeeId}:${d.sourceTemplateId}`);
        }
      });

      let createdCount = 0;
      const now = new Date().toISOString();

      for (const empDoc of employeesSnap.docs) {
        const empId = empDoc.id;
        const emp = empDoc.data();
        // Skip employees who already ended before this month
        if (emp.endDate && emp.endDate < `${targetMonth}-01`) continue;
        if (emp.startDate > `${targetMonth}-31`) continue;

        const templatesSnap = await tx.get(getExtraTemplatesCol(empId, shopId));
        for (const tDoc of templatesSnap.docs) {
          const t = tDoc.data();
          // Check template effective range
          if (t.effectiveFromMonth > targetMonth) continue;
          if (t.effectiveToMonth && t.effectiveToMonth < targetMonth) continue;

          const key = `${empId}:${t.templateId}`;
          if (!existingTemplateIds.has(key)) {
            const extraId = 'extra_' + crypto.randomUUID();
            const extraRef = monthlyExtrasCol.doc(extraId);
            const extraData = {
              extraId,
              employeeId: empId,
              monthKey: targetMonth,
              label: t.label,
              amountSatang: t.amountSatang,
              sourceTemplateId: t.templateId,
              sourceTemplateVersion: t.version || 1,
              revision: 1,
              createdAt: now,
              updatedAt: now
            };
            tx.set(extraRef, extraData);
            createdCount++;
            existingTemplateIds.add(key);
          }
        }
      }

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'PREPARE_EXTRAS',
        targetMonth,
        null,
        { createdCount },
        requestId
      );

      const responsePayload = {
        month: targetMonth,
        createdCount
      };

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: `${targetMonth}:prepare-extras`,
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
