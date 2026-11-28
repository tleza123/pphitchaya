import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalytics, AnalyticsMonth } from '../src/lib/payroll/analytics';
import { calculateEmployeeMonth } from '../src/lib/payroll/engine';
import { computeHrInsights } from '../src/lib/payroll/hr-insights';

function makeEmployeeMonth(opts: {
  id: string;
  name: string;
  nickname?: string;
  position: string;
  rate: number;
  attendance?: Array<{ dateKey: string; status: 'FULL' | 'HALF' | 'ABSENT'; advanceSatang?: number; deductionSatang?: number }>;
  extras?: Array<{ extraId: string; label: string; amountSatang: number; type?: 'BONUS' | 'DEDUCTION' }>;
  month?: string;
  today?: string;
}): AnalyticsMonth {
  const month = opts.month || '2026-10';
  const today = opts.today || '2026-10-10';
  const result = calculateEmployeeMonth({
    month,
    today,
    systemStartDate: '2026-08-01',
    employee: { employeeId: opts.id, name: opts.name, nickname: opts.nickname, position: opts.position, startDate: '2026-08-01', revision: 1 },
    rates: [{ employeeId: opts.id, effectiveFrom: '2026-08-01', dailySatang: opts.rate }],
    attendance: (opts.attendance || []).map(a => ({ employeeId: opts.id, ...a })),
    extras: (opts.extras || []).map(x => ({ ...x, employeeId: opts.id, monthKey: month })),
    weekdays: [1, 2, 3, 4, 5, 6],
    calendar: {}
  });
  return { ...result, name: opts.name, nickname: opts.nickname, position: opts.position };
}

test('computeHrInsights calculates attendance, cash-flow alerts, positions, and weekday patterns accurately', () => {
  const emp1 = makeEmployeeMonth({
    id: 'e1',
    name: 'สมชาย สุขสบาย',
    nickname: 'ชาย',
    position: 'หัวหน้าช่าง',
    rate: 60000,
    extras: [{ extraId: 'b1', label: 'ค่าตำแหน่ง', amountSatang: 100000 }]
  });
  const emp2 = makeEmployeeMonth({
    id: 'e2',
    name: 'สมศักดิ์ มีชัย',
    nickname: 'ศักดิ์',
    position: 'ช่างเทคนิค',
    rate: 50000,
    attendance: [
      { dateKey: '2026-10-05', status: 'ABSENT' }, // Monday
      { dateKey: '2026-10-06', status: 'ABSENT' },
      { dateKey: '2026-10-07', status: 'HALF', advanceSatang: 150000 }
    ]
  });
  const emp3 = makeEmployeeMonth({
    id: 'e3',
    name: 'วิชัย มั่นคง',
    nickname: 'บอย',
    position: 'ผู้ช่วยช่าง',
    rate: 40000,
    attendance: [
      { dateKey: '2026-10-05', status: 'HALF', advanceSatang: 500000 } // Negative net!
    ]
  });

  const report = buildAnalytics([emp1, emp2, emp3], 'day', '2026-10-10', ['2026-10'], []);
  const insights = computeHrInsights(report, 'all');

  assert.equal(insights.employees.length, 3);
  assert.equal(insights.positions.length, 3);
  assert.equal(insights.heatmapCells.length, report.buckets.length);

  const e1 = insights.employees.find(e => e.employeeId === 'e1')!;
  const e2 = insights.employees.find(e => e.employeeId === 'e2')!;
  const e3 = insights.employees.find(e => e.employeeId === 'e3')!;

  assert.equal(e1.attendanceRate, 100);
  assert.equal(e1.isReliable, true);
  assert.equal(e1.longestStreak, 9); // Oct 1-3, 5-10 (Oct 4 is Sunday holiday)

  assert.equal(e2.isAttendanceWatch, true);
  assert.equal(e2.isCashWatch, true); // advance 1500 out of 3250 = 46.2% >= 30%
  assert.equal(e2.advanceEvents, 1);

  assert.equal(e3.isNegativeNet, true);
  assert.equal(e3.primaryBadge.tone, 'danger');

  assert.ok(insights.alerts.some(a => a.id === 'neg-e3' && a.severity === 'danger'));
  assert.ok(insights.alerts.some(a => a.id === 'att-e2'));
  assert.ok(insights.alerts.some(a => a.id === 'reliable-team' && a.severity === 'positive'));

  // Monday (2026-10-05) had 1 full (e1), 1 absent (e2), 1 half (e3) => 1.5 / 3 = 50%
  const monday = insights.weekdays.find(w => w.weekday === 1)!;
  assert.equal(monday.attendanceRate, 50);
  assert.equal(monday.absentCount, 1);
  assert.equal(monday.halfCount, 1);
  assert.ok(insights.alerts.some(a => a.id === 'weekday-1'));

  assert.equal(insights.segmentCounts.all, 3);
  assert.equal(insights.segmentCounts.reliable, 1);
  assert.equal(insights.segmentCounts.attendance_watch, 1);
  assert.equal(insights.segmentCounts.cash_watch, 2);
});

test('computeHrInsights handles empty reports and single-employee scope cleanly without NaN', () => {
  const emptyReport = buildAnalytics([], 'month', '2026-10-10', ['2026-10'], []);
  const emptyInsights = computeHrInsights(emptyReport, 'all');
  assert.equal(emptyInsights.summary.attendanceRate, 0);
  assert.equal(emptyInsights.summary.advanceRatio, 0);
  assert.equal(emptyInsights.summary.effectiveCostPerPaidUnitSatang, 0);
  assert.equal(emptyInsights.employees.length, 0);
  assert.equal(emptyInsights.alerts.length, 0);

  const emp = makeEmployeeMonth({ id: 'solo', name: 'ทดสอบ เดี่ยว', position: 'ช่าง', rate: 50000 });
  const report = buildAnalytics([emp], 'month', '2026-10-10', ['2026-10'], ['2026-10']);
  const soloInsights = computeHrInsights(report, 'solo');
  assert.equal(soloInsights.employees.length, 1);
  assert.equal(soloInsights.summary.attendanceRate, 100);
  assert.equal(soloInsights.summary.healthStatus, 'healthy');
  assert.equal(soloInsights.summary.avgCostPerShopWorkdaySatang, 50000);
});
