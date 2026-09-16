import 'server-only';
import crypto from 'node:crypto';
import * as admin from 'firebase-admin';

export interface RequestReceipt {
  requestId: string;
  actorUid: string;
  method: string;
  entityKey: string;
  payloadHash: string;
  response: unknown;
  createdAt: string;
}

/**
 * Computes deterministic SHA-256 hash for actor, method, entityKey and payload object.
 */
export function computePayloadHash(
  actorUid: string,
  method: string,
  entityKey: string,
  payload: unknown
): string {
  const normalized = {
    actorUid,
    method: method.toUpperCase(),
    entityKey,
    payload: sortKeys(payload)
  };
  const json = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(json).digest('hex');
}

function sortKeys(val: unknown): unknown {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(sortKeys);
  const sortedObj: Record<string, unknown> = {};
  for (const key of Object.keys(val as object).sort()) {
    sortedObj[key] = sortKeys((val as Record<string, unknown>)[key]);
  }
  return sortedObj;
}

/**
 * Checks if request receipt exists inside Firestore transaction.
 * Returns the cached response if existing request with same payload is found.
 * Throws REQUEST_ID_REUSED if payload hash differs.
 */
export async function checkRequestReceipt(
  transaction: admin.firestore.Transaction,
  requestRef: admin.firestore.DocumentReference,
  expectedPayloadHash: string
): Promise<unknown | null> {
  const snap = await transaction.get(requestRef);
  if (!snap.exists) {
    return null;
  }

  const data = snap.data() as RequestReceipt;
  if (data.payloadHash !== expectedPayloadHash) {
    throw new Error('REQUEST_ID_REUSED');
  }

  return data.response;
}

/**
 * Records receipt in Firestore transaction.
 */
export function recordRequestReceipt(
  transaction: admin.firestore.Transaction,
  requestRef: admin.firestore.DocumentReference,
  receipt: RequestReceipt
): void {
  transaction.set(requestRef, receipt);
}
