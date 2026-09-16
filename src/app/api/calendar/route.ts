import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getCalendarVersionsCol,
  getCalendarOverridesCol,
  getMonthRef,
  getFinanceControlRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { dateKey } from '@/lib/payroll/dates';
import { validateWeekdays } from '@/lib/payroll/calendar';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const shopId = getShopId();

    const versionsSnap = await getCalendarVersionsCol(shopId).get();
    const versions = versionsSnap.docs.map(doc => ({
      versionId: doc.id,
      ...doc.data()
    }));

    const overridesSnap = await getCalendarOverridesCol(shopId).get();
    const overrides = overridesSnap.docs.map(doc => ({
      dateKey: doc.id,
      ...doc.data()
    }));

    return createSuccessResponse({ versions, overrides });
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
    const { type, effectiveFrom: rawFrom, weekdays, dateKey: rawDate, kind, note, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();

    if (type === 'OVERRIDE') {
      const targetDate = dateKey(rawDate);
      const targetMonthKey = targetDate.slice(0, 7);
      if (!['WORKDAY', 'HOLIDAY'].includes(kind)) {
        return createErrorResponse('INVALID_INPUT', 'kind ต้องเป็น WORKDAY หรือ HOLIDAY', 422);
      }

      const payloadHash = computePayloadHash(owner.uid, 'POST', `calendar:override:${targetDate}`, {
        targetDate,
        kind,
        note
      });

      const requestRef = getRequestsCol(shopId).doc(requestId);
      const overrideRef = getCalendarOverridesCol(shopId).doc(targetDate);
      const monthRef = getMonthRef(targetMonthKey, shopId);

      const result = await db.runTransaction(async tx => {
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
        if (cached) return cached;

        const monthSnap = await tx.get(monthRef);
        if (monthSnap.exists && monthSnap.data()?.state === 'CLOSED') {
          throw new Error('MONTH_CLOSED');
        }

        const currentSnap = await tx.get(overrideRef);
        const current = currentSnap.exists ? currentSnap.data() : null;
        const now = new Date().toISOString();
        const data = {
          dateKey: targetDate,
          kind,
          note: note ? String(note).slice(0, 200) : '',
          revision: (current?.revision || 0) + 1,
          updatedAt: now
        };

        tx.set(overrideRef, data);

        recordAudit(
          tx,
          shopId,
          owner.uid,
          'SAVE_CALENDAR_OVERRIDE',
          targetDate,
          current,
          data,
          requestId
        );

        recordRequestReceipt(tx, requestRef, {
          requestId,
          actorUid: owner.uid,
          method: 'POST',
          entityKey: `calendar:override:${targetDate}`,
          payloadHash,
          response: data,
          createdAt: now
        });

        return data;
      });

      return createSuccessResponse(result, requestId);
    }

    if (type === 'VERSION') {
      const effectiveFrom = dateKey(rawFrom);
      validateWeekdays(weekdays);
      const targetMonthKey = effectiveFrom.slice(0, 7);

      const payloadHash = computePayloadHash(owner.uid, 'POST', `calendar:version:${effectiveFrom}`, {
        effectiveFrom,
        weekdays
      });

      const requestRef = getRequestsCol(shopId).doc(requestId);
      const versionId = 'cal_' + crypto.randomUUID();
      const versionRef = getCalendarVersionsCol(shopId).doc(versionId);
      const monthRef = getMonthRef(targetMonthKey, shopId);

      const result = await db.runTransaction(async tx => {
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
        if (cached) return cached;

        const monthSnap = await tx.get(monthRef);
        if (monthSnap.exists && monthSnap.data()?.state === 'CLOSED') {
          throw new Error('MONTH_CLOSED');
        }

        const now = new Date().toISOString();
        const data = {
          versionId,
          effectiveFrom,
          weekdays,
          revision: 1,
          createdAt: now
        };

        tx.set(versionRef, data);

        recordAudit(
          tx,
          shopId,
          owner.uid,
          'SAVE_CALENDAR_VERSION',
          effectiveFrom,
          null,
          data,
          requestId
        );

        recordRequestReceipt(tx, requestRef, {
          requestId,
          actorUid: owner.uid,
          method: 'POST',
          entityKey: `calendar:version:${effectiveFrom}`,
          payloadHash,
          response: data,
          createdAt: now
        });

        return data;
      });

      return createSuccessResponse(result, requestId);
    }

    return createErrorResponse('INVALID_INPUT', 'ประเภทปฏิทินไม่ถูกต้อง', 422);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'MONTH_CLOSED') {
      return createErrorResponse('MONTH_CLOSED', 'เดือนนี้ปิดแล้ว ไม่สามารถแก้ไขปฏิทินได้', 409);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
