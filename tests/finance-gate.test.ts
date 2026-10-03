import { test } from 'node:test';
import assert from 'node:assert/strict';
import type * as admin from 'firebase-admin';
import { verifyFinanceGate } from '../src/lib/server/finance-gate';

function fixture(control: object | null, month: object | null) {
  const controlRef = {} as admin.firestore.DocumentReference;
  const monthRef = {} as admin.firestore.DocumentReference;
  let reads = 0;
  const transaction = {
    getAll: async (...refs: unknown[]) => {
      reads++;
      assert.deepEqual(refs, [controlRef, monthRef]);
      return [control, month].map(value => ({ exists: value !== null, data: () => value }));
    }
  } as unknown as admin.firestore.Transaction;
  return { check: () => verifyFinanceGate(transaction, controlRef, monthRef, '2026-10'), reads: () => reads };
}

test('Batched finance reads allow an open or new month with the original defaults', async () => {
  const missing = fixture(null, null);
  const result = await missing.check();
  assert.equal(result.control.closingMonth, null);
  assert.equal(result.month, null);
  assert.equal(missing.reads(), 1);
  const open = fixture({ closingMonth: '2026-09' }, { state: 'OPEN', revision: 3 });
  assert.equal((await open.check()).month?.revision, 3);
});

test('Batched finance reads still reject closing and closed months before writes', async () => {
  await assert.rejects(fixture({ closingMonth: '2026-10' }, { state: 'OPEN' }).check(), /MONTH_CLOSING/);
  await assert.rejects(fixture(null, { state: 'CLOSING' }).check(), /MONTH_CLOSING/);
  await assert.rejects(fixture(null, { state: 'CLOSED' }).check(), /MONTH_CLOSED/);
});
