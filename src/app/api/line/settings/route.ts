import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import { getShopId, recordAudit } from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';

export const dynamic = 'force-dynamic';

function maskToken(token?: string): string {
  if (!token) return '';
  const clean = token.trim();
  if (clean.length === 0) return '';
  if (clean.length <= 4) return '••••';
  return '••••' + clean.slice(-4);
}

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const shopId = getShopId();
    const db = getAdminFirestore();

    const lineSnap = await db.collection('shops').doc(shopId).collection('profile').doc('line').get();
    const current = lineSnap.exists ? lineSnap.data() : null;

    const rawToken = current?.channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    const defaultTargetId = current?.defaultTargetId ?? process.env.LINE_DEFAULT_TARGET_ID ?? '';
    const attendanceTargetId = current?.attendanceTargetId ?? process.env.LINE_ATTENDANCE_TARGET_ID ?? '';
    const truckTargetId = current?.truckTargetId ?? process.env.LINE_TRUCK_TARGET_ID ?? '';
    const dailySummaryEnabled = typeof current?.dailySummaryEnabled === 'boolean'
      ? current.dailySummaryEnabled
      : (process.env.LINE_DAILY_SUMMARY_ENABLED !== 'false');
    const dailySummaryHour = typeof current?.dailySummaryHour === 'number'
      ? current.dailySummaryHour
      : 19;
    const revision = current?.revision || 1;

    return createSuccessResponse({
      profile: {
        channelAccessTokenMasked: maskToken(rawToken),
        defaultTargetId,
        attendanceTargetId,
        truckTargetId,
        dailySummaryEnabled,
        dailySummaryHour,
        revision
      }
    });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const owner = await verifyOwner(req);
    const body = await req.json();
    const {
      channelAccessToken,
      defaultTargetId,
      attendanceTargetId,
      truckTargetId,
      dailySummaryEnabled,
      dailySummaryHour,
      expectedRevision,
      requestId
    } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (typeof expectedRevision !== 'number') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'PATCH', 'profile:line', {
      defaultTargetId,
      attendanceTargetId,
      truckTargetId,
      dailySummaryEnabled,
      dailySummaryHour,
      expectedRevision
    });

    const shopRef = db.collection('shops').doc(shopId);
    const lineRef = shopRef.collection('profile').doc('line');
    const requestRef = shopRef.collection('requests').doc(requestId);

    const result = await db.runTransaction(async tx => {
      // 1. Strict Read phase (All reads must precede writes)
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      const lineSnap = await tx.get(lineRef);
      const current = lineSnap.exists
        ? lineSnap.data()
        : {
            channelAccessToken: '',
            defaultTargetId: '',
            attendanceTargetId: '',
            truckTargetId: '',
            dailySummaryEnabled: true,
            dailySummaryHour: 19,
            revision: 1
          };

      if ((current?.revision || 1) !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      // 2. Prepare mutations
      const now = new Date().toISOString();
      const newRevision = (current?.revision || 1) + 1;

      const updated: Record<string, any> = {
        ...current,
        revision: newRevision,
        updatedAt: now
      };

      if (typeof channelAccessToken === 'string' && !channelAccessToken.startsWith('••••')) {
        updated.channelAccessToken = channelAccessToken.trim();
      }
      if (typeof defaultTargetId === 'string') {
        updated.defaultTargetId = defaultTargetId.trim();
      }
      if (typeof attendanceTargetId === 'string') {
        updated.attendanceTargetId = attendanceTargetId.trim();
      }
      if (typeof truckTargetId === 'string') {
        updated.truckTargetId = truckTargetId.trim();
      }
      if (typeof dailySummaryEnabled === 'boolean') {
        updated.dailySummaryEnabled = dailySummaryEnabled;
      }
      if (typeof dailySummaryHour === 'number') {
        updated.dailySummaryHour = dailySummaryHour;
      }

      // 3. Write phase
      tx.set(lineRef, updated, { merge: true });

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'UPDATE_LINE_SETTINGS',
        'profile:line',
        current,
        updated,
        requestId
      );

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'PATCH',
        entityKey: 'profile:line',
        payloadHash,
        response: updated,
        createdAt: now
      });

      return updated;
    });

    return createSuccessResponse(result, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
