import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mutationData } from '../src/lib/client/mutation-response';

test('Partial employee updates must not report success on rejected rates, templates or photos', async () => {
  await assert.rejects(mutationData(Response.json({ ok: false, error: { message: 'CONFLICT' } }, { status: 409 }), 'failed'), /CONFLICT/);
  await assert.rejects(mutationData(Response.json({ ok: false, error: { message: 'PHOTO_ERROR' } }), 'failed'), /PHOTO_ERROR/);
  await assert.rejects(mutationData(new Response('invalid', { status: 502 }), 'failed'), /failed/);
  assert.equal((await mutationData(Response.json({ ok: true, data: { revision: 7 } }), 'failed')).revision, 7);
});
