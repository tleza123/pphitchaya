import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getEmployeesCol,
  getEmployeeRef,
  getRatesCol,
  getExtraTemplatesCol,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { dateKey } from '@/lib/payroll/dates';
import { moneySatang } from '@/lib/payroll/money';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const shopId = getShopId();

    const employeesSnap = await getEmployeesCol(shopId).get();
    const employees = await Promise.all(
      employeesSnap.docs.map(async doc => {
        const d = doc.data();
        const ratesSnap = await getRatesCol(doc.id, shopId)
          .orderBy('effectiveFrom', 'desc')
          .limit(1)
          .get();
        const currentRate = ratesSnap.docs[0]?.data();

        const templatesSnap = await getExtraTemplatesCol(doc.id, shopId).get();
        const extraTemplates = templatesSnap.docs.map(tDoc => ({
          templateId: tDoc.id,
          ...tDoc.data()
        }));

        return {
          employeeId: doc.id,
          name: d.name,
          nickname: d.nickname || '',
          position: d.position,
          startDate: d.startDate,
          endDate: d.endDate || null,
          notes: d.notes || '',
          photo: d.photo ? { version: d.photo.version, width: d.photo.width, height: d.photo.height } : null,
          revision: d.revision || 1,
          currentRate: currentRate ? { effectiveFrom: currentRate.effectiveFrom, dailySatang: currentRate.dailySatang } : null,
          extraTemplates
        };
      })
    );

    return createSuccessResponse(employees);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const owner = await verifyOwner(req);
    const body = await req.json();
    const {
      name,
      nickname,
      position,
      startDate: rawStart,
      dailyRate: rawRate,
      notes,
      extraTemplates,
      requestId
    } = body;

    if (!requestId || typeof requestId !== 'string' || requestId.length < 10) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }

    const cleanNick = nickname ? String(nickname).trim().slice(0, 50) : '';
    const cleanName = name ? String(name).trim().slice(0, 100) : '';
    const finalDisplayName = cleanNick || cleanName;
    if (!finalDisplayName) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุชื่อเล่นหรือชื่อพนักงาน', 422);
    }
    const finalName = cleanName || cleanNick;

    if (!position || typeof position !== 'string' || position.trim().length === 0 || position.length > 80) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุตำแหน่งพนักงาน ไม่เกิน 80 ตัวอักษร', 422);
    }

    const startDate = dateKey(rawStart);
    const dailySatang = typeof rawRate === 'number' ? rawRate : moneySatang(String(rawRate));

    const shopId = getShopId();
    const db = getAdminFirestore();
    const employeeId = 'emp_' + crypto.randomUUID();
    const payloadHash = computePayloadHash(owner.uid, 'POST', employeeId, {
      name: finalName,
      nickname: cleanNick,
      position: position.trim(),
      startDate,
      dailySatang,
      notes: notes ? String(notes).slice(0, 500) : ''
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const employeeRef = getEmployeeRef(employeeId, shopId);
    const rateRef = getRatesCol(employeeId, shopId).doc('rate_' + crypto.randomUUID());

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      const now = new Date().toISOString();
      const employeeData = {
        name: finalName,
        nickname: cleanNick,
        position: position.trim(),
        startDate,
        endDate: null,
        notes: notes ? String(notes).slice(0, 500) : '',
        revision: 1,
        createdAt: now,
        updatedAt: now
      };

      const rateData = {
        employeeId,
        effectiveFrom: startDate,
        dailySatang,
        revision: 1,
        createdAt: now,
        updatedAt: now
      };

      tx.set(employeeRef, employeeData);
      tx.set(rateRef, rateData);

      // Save initial extra templates if any
      if (Array.isArray(extraTemplates)) {
        for (const t of extraTemplates) {
          if (t.label && t.amountSatang !== undefined) {
            const templateRef = getExtraTemplatesCol(employeeId, shopId).doc('tpl_' + crypto.randomUUID());
            tx.set(templateRef, {
              employeeId,
              label: String(t.label).trim().slice(0, 80),
              amountSatang: Number(t.amountSatang),
              effectiveFromMonth: startDate.slice(0, 7),
              effectiveToMonth: null,
              version: 1,
              revision: 1,
              createdAt: now,
              updatedAt: now
            });
          }
        }
      }

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'CREATE_EMPLOYEE',
        employeeId,
        null,
        employeeData,
        requestId
      );

      const responsePayload = {
        employeeId,
        ...employeeData,
        currentRate: { effectiveFrom: startDate, dailySatang }
      };

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: employeeId,
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
