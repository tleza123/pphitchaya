import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalytics, AnalyticsMonth, reportMonths } from '../src/lib/payroll/analytics';
import { calculateEmployeeMonth } from '../src/lib/payroll/engine';

function monthly(employeeId: string, month = '2026-10'): AnalyticsMonth {
  const result = calculateEmployeeMonth({ month, today: '2026-10-06', systemStartDate: '2026-08-01',
    employee: { employeeId, name: employeeId, position: 'Worker', startDate: '2026-10-01', revision: 1 },
    rates: [{ employeeId, effectiveFrom: '2026-10-01', dailySatang: 40000 }],
    attendance: [
      { employeeId, dateKey: '2026-10-02', status: 'HALF', advanceSatang: 50000 },
      { employeeId, dateKey: '2026-10-03', status: 'ABSENT', deductionSatang: 1500 }
    ],
    extras: [{ extraId: 'bonus', employeeId, monthKey: month, label: 'Monthly bonus', amountSatang: 10000 },
      { extraId: 'deduction', employeeId, monthKey: month, label: 'Monthly deduction', type: 'DEDUCTION', amountSatang: 2500 }],
    weekdays: [1, 2, 3, 4, 5, 6], calendar: {}
  });
  return { ...result, name: employeeId, position: 'Worker' };
}

test('Daily report retains default full days, half days, absences, holidays and money without duplicating advances', () => {
  const source = monthly('emp1');
  const original = JSON.stringify(source);
  const report = buildAnalytics([source], 'day', '2026-10-06', ['2026-10'], []);
  assert.equal(JSON.stringify(source), original, 'Read-only aggregation must not mutate source payroll data');
  assert.equal(report.totals.workedDays, 4);
  assert.equal(report.totals.full, 3);
  assert.equal(report.totals.half, 1);
  assert.equal(report.totals.absent, 1);
  assert.equal(report.totals.holiday, 1);
  assert.equal(report.totals.grossSatang, 150000);
  assert.equal(report.totals.advanceSatang, 50000);
  assert.equal(report.totals.deductionSatang, 4000);
  assert.equal(report.totals.totalSatang, 96000);
  assert.equal(report.buckets.find(row => row.key === '2026-10-02')?.totalSatang, -30000);
  assert.equal(report.employees[0].buckets.find(row => row.key === '2026-10-02')?.dailyRateSatang, 40000);
  assert.equal(report.buckets.find(row => row.key === '2026-10-04')?.holiday, 1);
  assert.equal(report.buckets.reduce((sum, row) => sum + row.extraSatang, 0), 0, 'Undated bonus has no invented daily allocation');
  assert.equal(report.employees[0].adjustments.length, 2);
});

test('Monthly and yearly reports reconcile all money and keep individuals separate', () => {
  const results = [monthly('emp1'), monthly('emp2')];
  for (const period of ['month', 'year'] as const) {
    const report = buildAnalytics(results, period, '2026-10-06', ['2026-10'], ['2026-10']);
    assert.equal(report.totals.totalSatang, 192000);
    assert.equal(report.buckets[0].totalSatang, report.totals.totalSatang);
    assert.equal(report.totals.totalSatang, report.employees.reduce((sum, employee) => sum + employee.totals.totalSatang, 0));
    assert.equal(report.employees[0].buckets[0].deductionSatang, 4000);
    assert.deepEqual(report.closedMonths, ['2026-10']);
  }
});

test('Closed snapshot totals remain authoritative even if daily details differ', () => {
  const snapshot = { ...monthly('emp1'), baseSatang: 12345, extraSatang: 10000, grossSatang: 22345, totalSatang: -31655, isClosed: true };
  const report = buildAnalytics([snapshot], 'month', '2026-10-06', ['2026-10'], ['2026-10']);
  assert.equal(report.totals.baseSatang, 12345);
  assert.equal(report.totals.totalSatang, -31655);
});

test('Duplicate monthly data and unsafe totals fail instead of silently producing wrong payroll', () => {
  const source = monthly('emp1');
  assert.throws(() => buildAnalytics([source, source], 'month', '2026-10-06', ['2026-10'], []), /DUPLICATE_REPORT/);
  assert.throws(() => buildAnalytics([{ ...source, totalSatang: Number.MAX_SAFE_INTEGER }, monthly('emp2')], 'month', '2026-10-06', ['2026-10'], []), /MONEY_OVERFLOW/);
});

test('Report ranges exclude future months and reject invalid or unbounded requests', () => {
  assert.deepEqual(reportMonths('day', { month: '2026-10' }, '2026-10-06'), ['2026-10']);
  assert.equal(reportMonths('month', { year: '2026' }, '2026-10-06').length, 10);
  assert.equal(reportMonths('year', { fromYear: '2025', toYear: '2026' }, '2026-10-06').length, 22);
  assert.throws(() => reportMonths('day', { month: '2026-11' }, '2026-10-06'));
  assert.throws(() => reportMonths('year', { fromYear: '2020', toYear: '2026' }, '2026-10-06'));
  assert.throws(() => reportMonths('month', { year: 'NaN' }, '2026-10-06'));
});
