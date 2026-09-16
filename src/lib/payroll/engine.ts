import { requireCondition, validateSatang } from './money';
import { dateKey, monthKey, monthDates } from './dates';
import { isWorkday, resolveWeekdaysForDate, CalendarVersion } from './calendar';

export { validateSatang };

export type AttendanceStatus = 'FULL' | 'HALF' | 'ABSENT' | 'UNMARKED' | 'HOLIDAY';

export interface EmployeeRecord {
  employeeId: string;
  name: string;
  nickname?: string;
  position: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD or empty/null
  notes?: string;
  revision: number;
}

export interface RateRecord {
  rateId?: string;
  employeeId: string;
  effectiveFrom: string; // YYYY-MM-DD
  dailySatang: number;
  revision?: number;
}

export interface AttendanceRecord {
  dateKey: string;
  employeeId: string;
  status: AttendanceStatus;
  advanceSatang?: number;
  deductionSatang?: number;
  revision?: number;
}

export interface MonthlyExtraRecord {
  extraId: string;
  employeeId: string;
  monthKey: string;
  label: string;
  amountSatang: number;
  type?: 'BONUS' | 'DEDUCTION';
  sourceTemplateId?: string | null;
  sourceTemplateVersion?: number;
  revision?: number;
}

export interface DailyResult {
  dateKey: string;
  status: AttendanceStatus;
  dailySatang?: number;
  amountSatang: number | null;
  advanceSatang?: number;
  deductionSatang?: number;
}

export interface EmployeeMonthResult {
  employeeId: string;
  month: string;
  full: number;
  half: number;
  absent: number;
  pending: number;
  workedDays: number;
  paidDayUnits: number;
  baseSatang: number;
  extraSatang: number;
  advanceSatang: number;
  deductionSatang: number;
  grossSatang: number;
  totalSatang: number;
  days: DailyResult[];
  extras: { extraId: string; label: string; amountSatang: number; type?: 'BONUS' | 'DEDUCTION' }[];
  ratePeriods: { effectiveFrom: string; dailySatang: number }[];
}


export interface CalculateInput {
  month: string;
  today: string;
  systemStartDate: string;
  employee: EmployeeRecord;
  rates: RateRecord[];
  attendance: AttendanceRecord[];
  extras: MonthlyExtraRecord[];
  weekdays?: number[]; // fallback if calendarVersions not provided
  calendarVersions?: CalendarVersion[];
  calendar?: Record<string, 'WORKDAY' | 'HOLIDAY'>;
}

export function employedOn(employee: EmployeeRecord, dateStr: string): boolean {
  return (
    dateStr >= employee.startDate &&
    (!employee.endDate || employee.endDate.trim() === '' || dateStr <= employee.endDate)
  );
}

export function validateEmployeeDates(employee: EmployeeRecord): void {
  requireCondition(
    Boolean(employee && typeof employee.employeeId === 'string' && employee.employeeId.length > 0),
    'INVALID_EMPLOYEE'
  );
  dateKey(employee.startDate);
  if (employee.endDate && employee.endDate.trim().length > 0) {
    requireCondition(dateKey(employee.endDate) >= employee.startDate, 'INVALID_EMPLOYMENT_DATES');
  }
}

export function ratesFor(rates: RateRecord[], employeeId: string): RateRecord[] {
  const seen = new Set<string>();
  return rates
    .filter(r => r.employeeId === employeeId)
    .map(r => {
      dateKey(r.effectiveFrom);
      validateSatang(r.dailySatang);
      requireCondition(!seen.has(r.effectiveFrom), 'DUPLICATE_RATE');
      seen.add(r.effectiveFrom);
      return r;
    })
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

export function rateOn(sortedRates: RateRecord[], dateStr: string): number {
  let selected: RateRecord | null = null;
  for (const r of sortedRates) {
    if (r.effectiveFrom <= dateStr) {
      selected = r;
    }
  }
  requireCondition(selected !== null, 'MISSING_RATE');
  return selected.dailySatang;
}

export function dailyPay(status: AttendanceStatus, rate: number): number {
  validateSatang(rate);
  requireCondition(['FULL', 'HALF', 'ABSENT'].includes(status), 'INVALID_STATUS');
  if (status === 'FULL') return rate;
  if (status === 'HALF') return Math.floor((rate + 1) / 2);
  return 0;
}

/**
 * Calculates payroll for a single employee in a given month.
 */
export function calculateEmployeeMonth(input: CalculateInput): EmployeeMonthResult {
  monthKey(input.month);
  dateKey(input.today);
  dateKey(input.systemStartDate);
  validateEmployeeDates(input.employee);

  const employee = input.employee;
  const rates = ratesFor(input.rates, employee.employeeId);
  const attendanceMap = new Map<string, AttendanceRecord>();

  // Filter and validate attendance records
  input.attendance
    .filter(r => r.employeeId === employee.employeeId && r.dateKey.slice(0, 7) === input.month)
    .forEach(r => {
      dateKey(r.dateKey);
      requireCondition(
        ['FULL', 'HALF', 'ABSENT', 'UNMARKED'].includes(r.status),
        'INVALID_STATUS'
      );
      requireCondition(!attendanceMap.has(r.dateKey), 'DUPLICATE_ATTENDANCE');
      requireCondition(employedOn(employee, r.dateKey), 'OUTSIDE_EMPLOYMENT');
      requireCondition(r.dateKey >= input.systemStartDate, 'BEFORE_SYSTEM_START');
      requireCondition(r.status === 'UNMARKED' || r.dateKey <= input.today, 'FUTURE_ATTENDANCE');

      // Check if workday for this specific date
      const activeWeekdays = input.calendarVersions
        ? resolveWeekdaysForDate(r.dateKey, input.calendarVersions, input.weekdays)
        : input.weekdays || [1, 2, 3, 4, 5, 6];

      requireCondition(
        r.status === 'UNMARKED' || isWorkday(r.dateKey, activeWeekdays, input.calendar),
        'ATTENDANCE_ON_HOLIDAY'
      );
      attendanceMap.set(r.dateKey, r);
    });

  let advanceSum = 0;
  let dailyDeductionSum = 0;
  attendanceMap.forEach(att => {
    if (att.advanceSatang && att.advanceSatang > 0) {
      advanceSum += validateSatang(att.advanceSatang);
    }
    if (att.deductionSatang && att.deductionSatang > 0) {
      dailyDeductionSum += validateSatang(att.deductionSatang);
    }
  });

  const result: EmployeeMonthResult = {
    employeeId: employee.employeeId,
    month: input.month,
    full: 0,
    half: 0,
    absent: 0,
    pending: 0,
    workedDays: 0,
    paidDayUnits: 0,
    baseSatang: 0,
    extraSatang: 0,
    advanceSatang: advanceSum,
    deductionSatang: dailyDeductionSum,
    grossSatang: 0,
    totalSatang: 0,
    days: [],
    extras: [],
    ratePeriods: rates.map(r => ({ effectiveFrom: r.effectiveFrom, dailySatang: r.dailySatang }))
  };

  monthDates(input.month).forEach(date => {
    if (!employedOn(employee, date) || date < input.systemStartDate || date > input.today) {
      return;
    }

    const activeWeekdays = input.calendarVersions
      ? resolveWeekdaysForDate(date, input.calendarVersions, input.weekdays)
      : input.weekdays || [1, 2, 3, 4, 5, 6];

    const workday = isWorkday(date, activeWeekdays, input.calendar);
    const row = attendanceMap.get(date);
    const status: AttendanceStatus = row ? row.status : 'UNMARKED';
    const dayAdvance = row?.advanceSatang ? validateSatang(row.advanceSatang) : 0;
    const dayDeduction = row?.deductionSatang ? validateSatang(row.deductionSatang) : 0;

    if (!workday) {
      result.days.push({
        dateKey: date,
        status: 'HOLIDAY',
        amountSatang: null,
        advanceSatang: dayAdvance,
        deductionSatang: dayDeduction
      });
      return;
    }

    if (status === 'UNMARKED') {
      result.pending += 1;
      result.days.push({
        dateKey: date,
        status: 'UNMARKED',
        amountSatang: null,
        advanceSatang: dayAdvance,
        deductionSatang: dayDeduction
      });
      return;
    }

    const rate = rateOn(rates, date);
    const amount = dailyPay(status, rate);
    if (status === 'FULL') result.full += 1;
    if (status === 'HALF') result.half += 1;
    if (status === 'ABSENT') result.absent += 1;

    result.baseSatang += amount;
    result.days.push({
      dateKey: date,
      status,
      dailySatang: rate,
      amountSatang: amount,
      advanceSatang: dayAdvance,
      deductionSatang: dayDeduction
    });
  });

  let monthlyDeductionSum = 0;
  const extraIds = new Set<string>();
  input.extras
    .filter(x => x.employeeId === employee.employeeId && (!x.monthKey || x.monthKey === input.month))
    .forEach(x => {
      requireCondition(
        typeof x.extraId === 'string' && x.extraId.length > 0 && !extraIds.has(x.extraId),
        'DUPLICATE_EXTRA'
      );
      requireCondition(
        typeof x.label === 'string' && x.label.trim().length > 0 && x.label.length <= 80,
        'INVALID_EXTRA'
      );
      extraIds.add(x.extraId);
      const isDeduction = x.type === 'DEDUCTION';
      if (isDeduction) {
        monthlyDeductionSum += validateSatang(x.amountSatang);
      } else {
        result.extraSatang += validateSatang(x.amountSatang);
      }
      result.extras.push({
        extraId: x.extraId,
        label: x.label.trim(),
        amountSatang: x.amountSatang,
        type: isDeduction ? 'DEDUCTION' : 'BONUS'
      });
    });

  result.workedDays = result.full + result.half;
  result.paidDayUnits = result.full + result.half / 2;
  result.deductionSatang = dailyDeductionSum + monthlyDeductionSum;
  result.grossSatang = result.baseSatang + result.extraSatang;
  result.totalSatang = result.grossSatang - result.advanceSatang - result.deductionSatang;
  requireCondition(Number.isSafeInteger(result.totalSatang), 'MONEY_OVERFLOW');

  return result;
}
