import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/attendance/route';

// Exercise the real handler against an isolated store; never write production records.
test('Attendance batching preserves revisions, money, receipts and finance protections', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previousDb = globals.adminDb;
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const date = '2026-09-14';
  const month = `${shop}/months/2026-09`;
  const employeeId = 'emp_test';
  const attendancePath = `${month}/attendance/${date}_${employeeId}`;
  const docs = new Map<string, any>([
    [`${shop}/employees/${employeeId}`, { name: 'Test', startDate: '2026-09-01' }],
    [month, { state: 'OPEN' }],
    [`${shop}/control/finance`, { closingMonth: null }],
    [attendancePath, { revision: 4, advanceSatang: 15000, deductionSatang: 2500 }]
  ]);
  const ref = (path: string): any => ({
    path,
    collection: (name: string) => ref(`${path}/${name}`),
    doc: (id = 'audit-test') => ref(`${path}/${id}`)
  });
  let writes: Array<[string, any]> = [];
  const snap = (path: string): any => path.endsWith('/calendarVersions')
    ? { docs: [{ id: 'calendar', data: () => ({ effectiveFrom: '2026-08-01', weekdays: [1, 2, 3, 4, 5, 6, 0] }) }] }
    : { exists: docs.has(path), data: () => docs.get(path) };
  globals.adminDb = {
    collection: (name: string) => ref(name),
    runTransaction: async (run: (tx: any) => Promise<unknown>) => {
      const staged: Array<[string, any]> = [];
      const read = (r: any) => {
        assert.equal(staged.length, 0, 'All transaction reads must precede writes');
        return snap(r.path);
      };
      const result = await run({
        get: async (r: any) => read(r),
        getAll: async (...refs: any[]) => refs.map(read),
        set: (r: any, value: any) => staged.push([r.path, value])
      });
      staged.forEach(([path, data]) => docs.set(path, data));
      writes = staged;
      return result;
    }
  };
  const send = async (body: object) => {
    writes = [];
    return POST(new NextRequest('http://localhost/api/attendance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }));
  };
  const body = { dateKey: date, employeeId, status: 'HALF', expectedRevision: 4, requestId: 'performance-test-request' };
  try {
    const saved = await (await send(body)).json();
    assert.equal(saved.ok, true);
    assert.equal(saved.data.revision, 5);
    assert.equal(saved.data.advanceSatang, 15000);
    assert.equal(saved.data.deductionSatang, 2500);
    assert.equal(docs.get(attendancePath).status, 'HALF');
    assert.equal(writes.length, 3, 'Attendance, audit and receipt are committed together');
    const replay = await (await send(body)).json();
    assert.deepEqual(replay.data, saved.data);
    assert.equal(writes.length, 0, 'Duplicate request must not write again');
    const conflict = await send({ ...body, requestId: 'different-request', expectedRevision: 4 });
    assert.equal(conflict.status, 409);
    assert.equal(writes.length, 0);
    docs.set(month, { state: 'CLOSED' });
    assert.equal((await send({ ...body, requestId: 'closed-month-request', expectedRevision: 5 })).status, 409);
    assert.equal(writes.length, 0);
    docs.set(month, { state: 'OPEN' });
    docs.set(`${shop}/calendarOverrides/${date}`, { kind: 'HOLIDAY' });
    assert.equal((await send({ ...body, requestId: 'holiday-request', expectedRevision: 5 })).status, 422);
    assert.equal(writes.length, 0);
    assert.equal(docs.get(attendancePath).revision, 5);
  } finally {
    globals.adminDb = previousDb;
  }
});
