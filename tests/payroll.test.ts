import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEmployeeMonth,
  dailyPay
} from '../src/lib/payroll/engine';
import {
  buildEmployeeSnapshot,
  buildClosureManifest
} from '../src/lib/payroll/snapshots';
import {
  moneySatang,
  validateSatang,
  formatMoney
} from '../src/lib/payroll/money';
import {
  dateKey,
  monthKey,
  monthDates
} from '../src/lib/payroll/dates';

const fixture = () => ({
  month: '2026-09',
  today: '2026-09-30',
  systemStartDate: '2026-09-01',
  employee: {
    employeeId: 'e1',
    name: 'สมชาย',
    nickname: '' as string | undefined,
    position: 'ช่าง',
    startDate: '2026-09-01',
    endDate: null as string | null,
    revision: 1
  },
  rates: [
    {
      employeeId: 'e1',
      effectiveFrom: '2026-09-01',
      dailySatang: 50000 // 500 บาท
    }
  ],
  attendance: [] as any[],
  extras: [] as any[],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  calendar: {} as Record<string, 'WORKDAY' | 'HOLIDAY'>
});

const marks = (days: number, status: 'FULL' | 'HALF' | 'ABSENT', start = 1) =>
  Array.from({ length: days }, (_, i) => ({
    employeeId: 'e1',
    dateKey: `2026-09-${String(start + i).padStart(2, '0')}`,
    status,
    advanceSatang: 0
  }));

test('Test 1: 22 full + 4 half + 2 absent + monthly extras = 14,500 THB', () => {
  const f = fixture();
  f.employee.endDate = '2026-09-28';
  f.attendance = [
    ...marks(22, 'FULL'),
    ...marks(4, 'HALF', 23),
    ...marks(2, 'ABSENT', 27)
  ];
  f.extras = [
    {
      employeeId: 'e1',
      monthKey: f.month,
      extraId: 'x1',
      label: 'ค่าเดินทาง',
      amountSatang: 150000
    },
    {
      employeeId: 'e1',
      monthKey: f.month,
      extraId: 'x2',
      label: 'ค่าอาหาร',
      amountSatang: 100000
    }
  ];

  const r = calculateEmployeeMonth(f);
  assert.equal(r.totalSatang, 1450000); // 14,500.00 บาท
  assert.equal(r.paidDayUnits, 24);
  assert.equal(r.workedDays, 26);
  assert.equal(r.absent, 2);
  assert.equal(r.pending, 0);
  assert.equal(formatMoney(r.totalSatang), '14,500.00');
});

test('Test 2: Historical rates calculate each day, including half-days', () => {
  const f = fixture();
  f.rates.push({
    employeeId: 'e1',
    effectiveFrom: '2026-09-11',
    dailySatang: 55000 // 550 บาท
  });
  f.attendance = [...marks(20, 'FULL'), ...marks(2, 'HALF', 21)];
  const r = calculateEmployeeMonth(f);
  assert.equal(r.baseSatang, 1105000);
});

test('Test 3: Half satang rounds up per day', () => {
  assert.equal(dailyPay('HALF', 50001), 25001);
  assert.equal(dailyPay('HALF', 50000), 25000);
  assert.equal(dailyPay('FULL', 50000), 50000);
  assert.equal(dailyPay('ABSENT', 50000), 0);
});

test('Test 4: Strict money decimal conversion', () => {
  assert.equal(moneySatang('500.01'), 50001);
  assert.equal(moneySatang('0.1'), 10);
  assert.equal(moneySatang('500'), 50000);
  assert.equal(moneySatang('0'), 0);

  const badInputs = [
    '1e6',
    'NaN',
    '-1',
    '0.001',
    '1,000',
    ' 500',
    '01',
    'Infinity',
    '1000000.01'
  ];
  for (const bad of badInputs) {
    assert.throws(() => moneySatang(bad));
  }
});

test('Test 5: Leap year and invalid date', () => {
  assert.equal(monthDates('2024-02').length, 29);
  assert.equal(monthDates('2026-02').length, 28);
  assert.throws(() => dateKey('2026-02-29'));
  assert.throws(() => dateKey('2026-09-31'));
  assert.throws(() => monthKey('2026-13'));
});

test('Test 6: Unmarked days are pending, holidays and future days are excluded', () => {
  const f = fixture();
  f.today = '2026-09-03';
  f.calendar = { '2026-09-02': 'HOLIDAY' };
  const r = calculateEmployeeMonth(f);
  assert.equal(r.pending, 2);
  assert.equal(r.absent, 0);
  const holidayDay = r.days.find((x) => x.dateKey === '2026-09-02');
  assert.equal(holidayDay?.amountSatang, null);
  assert.equal(holidayDay?.status, 'HOLIDAY');
});

test('Test 7: Employment dates and system start bound pending days', () => {
  const f = fixture();
  f.employee.startDate = '2026-09-10';
  f.employee.endDate = '2026-09-12';
  assert.equal(calculateEmployeeMonth(f).pending, 3);
  f.systemStartDate = '2026-09-11';
  assert.equal(calculateEmployeeMonth(f).pending, 2);
});

test('Test 8: Duplicate attendance, rates and extras fail closed', () => {
  let f = fixture();
  f.attendance = [...marks(1, 'FULL'), ...marks(1, 'HALF')];
  assert.throws(() => calculateEmployeeMonth(f), /DUPLICATE_ATTENDANCE/);

  f = fixture();
  f.rates.push({ ...f.rates[0] });
  assert.throws(() => calculateEmployeeMonth(f), /DUPLICATE_RATE/);

  f = fixture();
  const x = {
    extraId: 'x',
    employeeId: 'e1',
    monthKey: f.month,
    label: 'ค่ารถ',
    amountSatang: 100
  };
  f.extras = [x, x];
  assert.throws(() => calculateEmployeeMonth(f), /DUPLICATE_EXTRA/);
});

test('Test 9: Missing rate never silently becomes zero', () => {
  const f = fixture();
  f.attendance = marks(1, 'FULL');
  f.rates = [];
  assert.throws(() => calculateEmployeeMonth(f), /MISSING_RATE/);
});

test('Test 10: Holiday and future attendance are rejected', () => {
  const f = fixture();
  f.attendance = marks(1, 'FULL');
  f.calendar = { '2026-09-01': 'HOLIDAY' };
  assert.throws(() => calculateEmployeeMonth(f), /ATTENDANCE_ON_HOLIDAY/);

  f.calendar = {};
  f.today = '2026-08-31';
  assert.throws(() => calculateEmployeeMonth(f), /FUTURE_ATTENDANCE/);
});

test('Test 11: Monthly bonus remains whole for partial-month employment', () => {
  const f = fixture();
  f.employee.startDate = '2026-09-30';
  f.extras = [
    {
      employeeId: 'e1',
      monthKey: f.month,
      extraId: 'x',
      label: 'ค่าอาหาร',
      amountSatang: 100000
    }
  ];
  assert.equal(calculateEmployeeMonth(f).extraSatang, 100000);
});

test('Test 12: Salary advance deduction reduces net pay correctly (Gross - Advance = Net)', () => {
  const f = fixture();
  f.employee.endDate = '2026-09-10';
  // 10 days FULL @ 500 = 5,000 THB (500,000 satang)
  const att = marks(10, 'FULL');
  // Day 2 advance 500 THB (50,000 satang)
  att[1].advanceSatang = 50000;
  // Day 5 advance 1,000 THB (100,000 satang)
  att[4].advanceSatang = 100000;
  f.attendance = att;

  f.extras = [
    {
      employeeId: 'e1',
      monthKey: f.month,
      extraId: 'x1',
      label: 'เบี้ยขยัน',
      amountSatang: 100000 // 1,000 THB
    }
  ];

  const r = calculateEmployeeMonth(f);
  assert.equal(r.baseSatang, 500000); // 5,000 THB
  assert.equal(r.extraSatang, 100000); // 1,000 THB
  assert.equal(r.grossSatang, 600000); // 6,000 THB
  assert.equal(r.advanceSatang, 150000); // 1,500 THB
  assert.equal(r.totalSatang, 450000); // Net 4,500 THB
  assert.equal(formatMoney(r.totalSatang), '4,500.00');

  // Verify daily result mapping has advance recorded
  const day2 = r.days.find((d) => d.dateKey === '2026-09-02');
  assert.equal(day2?.advanceSatang, 50000);
  const day5 = r.days.find((d) => d.dateKey === '2026-09-05');
  assert.equal(day5?.advanceSatang, 100000);
});

test('Test 13: Closure manifest and employee snapshot properly persist and sum advanceSatang', () => {
  const f = fixture();
  f.employee.endDate = '2026-09-02';
  const att = marks(2, 'FULL');
  att[0].advanceSatang = 30000; // 300 THB
  f.attendance = att;

  const r = calculateEmployeeMonth(f);
  assert.equal(r.grossSatang, 100000); // 1,000 THB
  assert.equal(r.advanceSatang, 30000); // 300 THB
  assert.equal(r.totalSatang, 70000); // 700 THB

  const snapshot = buildEmployeeSnapshot(f.employee.name, f.employee.position, r);
  assert.equal(snapshot.baseSatang, 100000);
  assert.equal(snapshot.advanceSatang, 30000);
  assert.equal(snapshot.totalSatang, 70000);

  const manifest = buildClosureManifest('closure_1', '2026-09', 1, [snapshot], 'owner_test');

  assert.equal(manifest.totalsSatang.base, 100000);
  assert.equal(manifest.totalsSatang.advance, 30000);
  assert.equal(manifest.totalsSatang.total, 70000);
});

test('Test 14: Employee with nickname-only is valid and calculated correctly', () => {
  const f = fixture();
  f.employee.name = 'บอย'; // Only nickname used as name
  f.employee.nickname = 'บอย';
  f.attendance = marks(5, 'FULL');

  const r = calculateEmployeeMonth(f);
  assert.equal(r.workedDays, 5);
  assert.equal(r.totalSatang, 250000);

  const snapshot = buildEmployeeSnapshot(f.employee.nickname || f.employee.name, f.employee.position, r);
  assert.equal(snapshot.name, 'บอย');
  assert.equal(snapshot.totalSatang, 250000);
});

test('Test 15: Deduction system correctly calculates daily and monthly deductions, updating snapshots and manifest', () => {
  const f = fixture();
  f.attendance = marks(5, 'FULL');
  // Day 2 has advance 300 THB
  f.attendance[1].advanceSatang = 30000;
  // Day 3 has daily deduction 100 THB (e.g. fine / tardiness)
  f.attendance[2].deductionSatang = 10000;

  // Monthly extras: 1 bonus (500 THB) + 1 deduction (200 THB)
  f.extras = [
    { extraId: 'ex1', employeeId: f.employee.employeeId, monthKey: f.month, label: 'เบี้ยขยัน', amountSatang: 50000, type: 'BONUS' },
    { extraId: 'ex2', employeeId: f.employee.employeeId, monthKey: f.month, label: 'หักค่าของเสียหาย', amountSatang: 20000, type: 'DEDUCTION' }
  ];

  const r = calculateEmployeeMonth(f);
  assert.equal(r.baseSatang, 250000); // 5 * 500 THB = 2,500 THB
  assert.equal(r.extraSatang, 50000); // 500 THB
  assert.equal(r.grossSatang, 300000); // 3,000 THB
  assert.equal(r.advanceSatang, 30000); // 300 THB
  assert.equal(r.deductionSatang, 30000); // 100 THB daily + 200 THB monthly = 300 THB
  assert.equal(r.totalSatang, 240000); // 300,000 - 30,000 - 30,000 = 240,000 Satang (2,400 THB)
  assert.equal(formatMoney(r.totalSatang), '2,400.00');

  // Verify daily deduction mapping
  const day3 = r.days.find((d) => d.dateKey === '2026-09-03');
  assert.equal(day3?.deductionSatang, 10000);

  // Snapshot verification
  const snapshot = buildEmployeeSnapshot(f.employee.name, f.employee.position, r);
  assert.equal(snapshot.baseSatang, 250000);
  assert.equal(snapshot.extraSatang, 50000);
  assert.equal(snapshot.advanceSatang, 30000);
  assert.equal(snapshot.deductionSatang, 30000);
  assert.equal(snapshot.totalSatang, 240000);

  // Closure manifest verification
  const manifest = buildClosureManifest('closure_deduct', '2026-09', 1, [snapshot], 'owner_test');
  assert.equal(manifest.totalsSatang.base, 250000);
  assert.equal(manifest.totalsSatang.extra, 50000);
  assert.equal(manifest.totalsSatang.advance, 30000);
  assert.equal(manifest.totalsSatang.deduction, 30000);
  assert.equal(manifest.totalsSatang.total, 240000);
});



