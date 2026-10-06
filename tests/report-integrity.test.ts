import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as summary } from '../src/app/api/reports/route';
import { GET as individual } from '../src/app/api/reports/[employeeId]/route';

test('Reports retain actual month revision and never recalculate missing closed payroll snapshots', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previous = globals.adminDb;
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const month = `${shop}/months/2026-08`, closure = `${month}/closures/test`;
  const docs = new Map<string, any>([
    [month, { state: 'CLOSED', revision: 7, currentClosureId: 'test' }],
    [closure, { employeeIds: ['person'], totalsSatang: { base: 10000, total: 10000 } }],
    [`${closure}/employees/person`, { name: 'Test', position: 'Worker', counts: { full: 1, half: 0, absent: 0, workedDays: 1, paidDayUnits: 1 }, baseSatang: 10000, extraSatang: 0, totalSatang: 10000, days: [] }]
  ]);
  const reads: string[] = [];
  function reference(path: string): any {
    return { path, doc: (id: string) => reference(`${path}/${id}`), collection: (name: string) => reference(`${path}/${name}`),
      get: async () => {
        reads.push(path);
        const entries = [...docs.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'));
        return { exists: docs.has(path), data: () => docs.get(path), size: entries.length,
          docs: entries.map(([key, value]) => ({ id: key.slice(path.length + 1), data: () => value })) };
      } };
  }
  globals.adminDb = { collection: (name: string) => reference(name) };
  const request = new NextRequest('http://localhost/api/reports?month=2026-08');
  try {
    assert.equal((await (await summary(request)).json()).data.revision, 7);
    const detailResponse = await individual(request, { params: Promise.resolve({ employeeId: 'person' }) });
    assert.equal(detailResponse.status, 200);
    assert.equal((await detailResponse.json()).data.full, 1);
    docs.delete(`${closure}/employees/person`);
    assert.equal((await summary(request)).status, 409);
    assert.equal((await individual(request, { params: Promise.resolve({ employeeId: 'person' }) })).status, 409);
    docs.set(month, { state: 'CLOSED', revision: 9 });
    assert.equal((await summary(request)).status, 409);
    assert.equal((await individual(request, { params: Promise.resolve({ employeeId: 'person' }) })).status, 409);
    assert.equal(reads.some(path => path.endsWith('/rates') || path.endsWith('/attendance')), false);
    docs.set(month, { state: 'OPEN', revision: 10 });
    assert.equal((await (await summary(request)).json()).data.revision, 10);
  } finally { globals.adminDb = previous; }
});
