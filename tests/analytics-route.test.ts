import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/reports/analytics/route';

test('Detailed reports read closed snapshots without recalculating current rates and fail on missing snapshots', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previous = globals.adminDb;
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const closure = `${shop}/months/2026-08/closures/closed-test`;
  const docs = new Map<string, any>([
    [`${shop}/months/2026-08`, { state: 'CLOSED', currentClosureId: 'closed-test' }],
    [closure, { employeeIds: ['former-employee'], status: 'READY' }],
    [`${closure}/employees/former-employee`, { name: 'Historical employee', position: 'Worker',
      counts: { full: 1, half: 0, absent: 0, workedDays: 1, paidDayUnits: 1 },
      days: [{ dateKey: '2026-08-01', status: 'FULL', dailySatang: 10000, amountSatang: 10000, advanceSatang: 2000, deductionSatang: 1000 }],
      baseSatang: 10000, extraSatang: 5000, advanceSatang: 2000, deductionSatang: 1000, totalSatang: 12000,
      extras: [{ extraId: 'historical-bonus', label: 'Historical bonus', amountSatang: 5000 }], ratePeriods: [] }]
  ]);
  const reads: string[] = [];
  const snapshot = (path: string) => ({ exists: docs.has(path), data: () => docs.get(path) });
  function reference(path: string): any {
    return { path,
      collection: (name: string) => reference(`${path}/${name}`),
      doc: (name: string) => reference(`${path}/${name}`),
      get: async () => {
        reads.push(path);
        const records = [...docs.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'));
        return { ...snapshot(path), size: records.length, empty: records.length === 0,
          docs: records.map(([key, value]) => ({ id: key.slice(path.length + 1), data: () => value })) };
      }
    };
  }
  globals.adminDb = { collection: (name: string) => reference(name),
    getAll: async (...refs: Array<{ path: string }>) => refs.map(ref => snapshot(ref.path)) };
  try {
    const request = new NextRequest('http://localhost/api/reports/analytics?period=day&month=2026-08');
    const response = await GET(request);
    assert.equal(response.status, 200);
    const report = (await response.json()).data;
    assert.equal(report.totals.totalSatang, 12000);
    assert.equal(report.totals.grossSatang, 15000);
    assert.equal(report.employees[0].name, 'Historical employee');
    assert.deepEqual(report.closedMonths, ['2026-08']);
    assert.equal(reads.some(path => path.endsWith('/rates') || path.endsWith('/attendance')), false);
    docs.delete(`${closure}/employees/former-employee`);
    const missing = await GET(request);
    assert.notEqual(missing.status, 200);
    assert.equal((await missing.json()).ok, false);
  } finally { globals.adminDb = previous; }
});
