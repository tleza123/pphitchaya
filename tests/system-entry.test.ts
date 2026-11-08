import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/app/api/system-entry/route';

const send = (body: unknown) => POST(new Request('http://localhost/api/system-entry', { method: 'POST', body: JSON.stringify(body) }));

test('The home chooser checks its code and returns only a permitted system destination', async () => {
  const previous = process.env.SYSTEM_ENTRY_PASSWORD;
  delete process.env.SYSTEM_ENTRY_PASSWORD;
  try {
    for (const destination of ['/attendance', '/truck']) {
      const wrong = await send({ destination, password: '000000' });
      assert.equal(wrong.status, 401);
      assert.equal((await wrong.json()).data, undefined);
      const correct = await send({ destination, password: '231050' });
      assert.equal(correct.status, 200);
      assert.deepEqual((await correct.json()).data, { destination });
    }
    for (const body of [null, {}, {destination:'https://example.com',password:'231050'}, {destination:'/truck',password:231050}, {destination:'/truck',password:'x'.repeat(129)}]) assert.equal((await send(body)).status, 422);
    assert.equal((await POST(new Request('http://localhost/api/system-entry', {method:'POST',body:'invalid-json'}))).status,422);
  } finally { if (previous === undefined) delete process.env.SYSTEM_ENTRY_PASSWORD; else process.env.SYSTEM_ENTRY_PASSWORD = previous; }
});

test('A configured chooser password overrides the initial code', async () => {
  const previous = process.env.SYSTEM_ENTRY_PASSWORD;
  process.env.SYSTEM_ENTRY_PASSWORD = '123456';
  try {
    assert.equal((await send({destination:'/truck',password:'231050'})).status,401);
    assert.equal((await send({destination:'/truck',password:'123456'})).status,200);
  } finally { if (previous === undefined) delete process.env.SYSTEM_ENTRY_PASSWORD; else process.env.SYSTEM_ENTRY_PASSWORD = previous; }
});
