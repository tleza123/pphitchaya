import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salaryLines } from '../src/lib/payroll/salary-statement';
import { createSalaryPdf } from '../src/lib/server/salary-pdf';
import { AnalyticsMonth } from '../src/lib/payroll/analytics';
import { loadSalaryReports } from '../src/lib/server/salary-reports';
import { GET } from '../src/app/api/reports/export/route';
import { NextRequest } from 'next/server';
import { unzipSync } from 'fflate';

const example = (): AnalyticsMonth => ({ employeeId: 'test', name: 'เก่ง', position: 'พนักงาน', month: '2026-10',
  full: 1, half: 1, absent: 1, pending: 0, workedDays: 2, paidDayUnits: 1.5,
  baseSatang: 67500, extraSatang: 50000, grossSatang: 117500, advanceSatang: 30000, deductionSatang: 10000, totalSatang: 77500,
  days: [
    { dateKey: '2026-10-01', status: 'FULL', dailySatang: 45000, amountSatang: 45000, advanceSatang: 30000 },
    { dateKey: '2026-10-02', status: 'HALF', dailySatang: 45000, amountSatang: 22500, deductionSatang: 5000 },
    { dateKey: '2026-10-03', status: 'ABSENT', dailySatang: 45000, amountSatang: 0 }
  ], extras: [{ extraId: 'bonus', label: 'ค่าล้างรถ', amountSatang: 50000 }, { extraId: 'deduct', label: 'หักประจำเดือน', type: 'DEDUCTION', amountSatang: 5000 }], ratePeriods: [] });

test('Salary export retains dated advances, half-day pay, named extras and authoritative totals', () => {
  const report = example(), lines = salaryLines(report);
  assert.equal(lines.income.length, 3);
  assert.equal(lines.income[1].satang, 22500);
  assert.equal(lines.income[2].label, 'ค่าล้างรถ');
  assert.match(lines.advances[0].date, /1/);
  assert.equal(lines.deductions.length, 2);
  const historical = { ...report, baseSatang: 70000, grossSatang: 120000, totalSatang: 80000 };
  assert.equal(salaryLines(historical).income[0].satang, 70000);
  assert.throws(() => salaryLines({ ...report, totalSatang: 1 }), /ยอดสุทธิ/);
  assert.throws(() => salaryLines({ ...report, advanceSatang: 1 }), /รายละเอียดเงิน/);
});

test('PDF export supports long labels and multiple pages without mutating report data', async () => {
  const report = example();
  report.extras = Array.from({ length: 60 }, (_, i) => ({ extraId: String(i), label: 'ค่าล้างรถและรายการเพิ่มเติมที่ต้องแสดงครบถ้วน ' + i, amountSatang: 1000 }));
  report.extraSatang = 60000; report.grossSatang = 127500; report.deductionSatang = 5000; report.totalSatang = 92500;
  const original = JSON.stringify(report);
  const pdf = await createSalaryPdf(report);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 3);
  assert.equal(JSON.stringify(report), original);
});

test('Three income lines and fifteen dated advances with no deductions fit one A4 page', async () => {
  const report = example();
  report.days = Array.from({ length: 15 }, (_, i) => ({ dateKey: `2026-10-${String(i + 1).padStart(2, '0')}`,
    status: i === 0 ? 'HALF' : 'FULL', dailySatang: 45000, amountSatang: i === 0 ? 22500 : 45000,
    advanceSatang: 10000, deductionSatang: 0 }));
  report.full = 14; report.half = 1; report.absent = 0;
  report.extras = [{ extraId: 'bonus', label: 'ค่าล้างรถ', amountSatang: 50000 }];
  report.baseSatang = 652500; report.grossSatang = 702500;
  report.advanceSatang = 150000; report.deductionSatang = 0; report.totalSatang = 552500;
  const lines = salaryLines(report);
  assert.equal(lines.income.length, 3); assert.equal(lines.advances.length, 15);
  const pdf = await createSalaryPdf(report);
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
});

test('Closed salary exports only read immutable snapshots and reject incomplete closure data', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown }, previous = globals.adminDb;
  const shop = `shops/${process.env.SHOP_ID || 'main'}`, closure = `${shop}/months/2026-10/closures/closed`;
  const report = example();
  const docs = new Map<string, any>([
    [`${shop}/months/2026-10`, { state: 'CLOSED', currentClosureId: 'closed' }],
    [closure, { employeeIds: ['test'] }],
    [`${closure}/employees/test`, { ...report, counts: { full: 1, half: 1, absent: 1, workedDays: 2, paidDayUnits: 1.5 } }]
  ]);
  const reads: string[] = [];
  const reference = (p: string): any => ({ collection: (name: string) => reference(`${p}/${name}`), doc: (name: string) => reference(`${p}/${name}`),
    get: async () => {
      reads.push(p);
      const children = [...docs].filter(([key]) => key.startsWith(`${p}/`) && !key.slice(p.length + 1).includes('/'));
      return { exists: docs.has(p), data: () => docs.get(p), size: children.length,
        docs: children.map(([key, data]) => ({ id: key.slice(p.length + 1), data: () => data })) };
    } });
  globals.adminDb = { collection: (name: string) => reference(name) };
  try {
    const results = await loadSalaryReports('2026-10');
    assert.equal(results[0].totalSatang, 77500);
    assert.equal(reads.some(p => p.endsWith('/rates') || p.endsWith('/attendance')), false);
    const single = await GET(new NextRequest('http://localhost/api/reports/export?month=2026-10&employeeId=test'));
    assert.equal(single.headers.get('Content-Type'), 'application/pdf');
    assert.equal(Buffer.from(await single.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    const batch = await GET(new NextRequest('http://localhost/api/reports/export?month=2026-10'));
    assert.equal(batch.headers.get('Content-Type'), 'application/zip');
    const files = unzipSync(new Uint8Array(await batch.arrayBuffer()));
    assert.equal(Object.keys(files).length, 1);
    assert.match(Object.keys(files)[0], /เก่ง/);
    docs.delete(`${closure}/employees/test`);
    await assert.rejects(loadSalaryReports('2026-10'), /ไม่ครบถ้วน/);
    assert.notEqual((await GET(new NextRequest('http://localhost/api/reports/export?month=2026-10'))).status, 200);
  } finally { globals.adminDb = previous; }
});
