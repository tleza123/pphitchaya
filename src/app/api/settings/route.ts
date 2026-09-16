import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getProfileRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  try {
    const owner = await verifyOwner(req);
    const body = await req.json();
    const { displayName, shopName, expectedRevision, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (typeof expectedRevision !== 'number') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision', 422);
    }
    const targetName = typeof shopName === 'string' ? shopName.trim() : (typeof displayName === 'string' ? displayName.trim() : '');
    if (!targetName || targetName.length === 0 || targetName.length > 80) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุชื่อร้าน 1-80 ตัวอักษร', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'PATCH', 'profile:main', {
      shopName: targetName,
      expectedRevision
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const profileRef = getProfileRef(shopId);

    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      const profileSnap = await tx.get(profileRef);
      const current = profileSnap.exists
        ? profileSnap.data()
        : { displayName: 'DE TEAM', shopName: 'DE TEAM', timezone: 'Asia/Bangkok', systemStartDate: '2026-08-01', revision: 1 };

      if (current?.revision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      const now = new Date().toISOString();
      const newRevision = (current?.revision || 1) + 1;
      const updated = {
        displayName: targetName,
        shopName: targetName,
        revision: newRevision,
        updatedAt: now
      };

      tx.set(profileRef, updated, { merge: true });

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'UPDATE_SETTINGS',
        'profile:main',
        current,
        { ...current, ...updated },
        requestId
      );

      const responsePayload = {
        ...current,
        ...updated
      };

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'PATCH',
        entityKey: 'profile:main',
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
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
