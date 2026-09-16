import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getEmployeeRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const owner = await verifyOwner(req);
    const { id: employeeId } = await params;
    const body = await req.json();
    const { name, nickname, position, notes, expectedRevision, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (typeof expectedRevision !== 'number') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const payloadHash = computePayloadHash(owner.uid, 'PATCH', employeeId, {
      name,
      nickname,
      position,
      notes,
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

      const current = empSnap.data() as any;
      if (current.revision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      const newRevision = current.revision + 1;
      const now = new Date().toISOString();
      const updatedNick = nickname !== undefined ? String(nickname).trim().slice(0, 50) : (current.nickname || '');
      const updatedName = name !== undefined ? String(name).trim().slice(0, 100) : (current.name || '');
      const finalDisplayName = updatedNick || updatedName;
      if (!finalDisplayName) {
        throw new Error('INVALID_NAME');
      }
      const finalName = updatedName || updatedNick;

      const updated = {
        name: finalName,
        nickname: updatedNick,
        position: position !== undefined ? String(position).trim().slice(0, 80) : current.position,
        notes: notes !== undefined ? String(notes).slice(0, 500) : current.notes,
        revision: newRevision,
        updatedAt: now
      };

      tx.update(employeeRef, updated);

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'UPDATE_EMPLOYEE',
        employeeId,
        current,
        { ...current, ...updated },
        requestId
      );

      const responsePayload = {
        employeeId,
        ...current,
        ...updated
      };

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'PATCH',
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
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    if (error.message === 'NOT_FOUND') {
      return createErrorResponse('NOT_FOUND', undefined, 404);
    }
    if (error.message === 'INVALID_NAME') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุชื่อเล่นหรือชื่อพนักงาน', 422);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
