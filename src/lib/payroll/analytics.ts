import { DailyResult, EmployeeMonthResult } from './engine';
import { monthKey } from './dates';
import { requireCondition } from './money';

export type ReportPeriod = 'day' | 'month' | 'year';
export interface ReportTotals {
  full: number; half: number; absent: number; holiday: number;
  workedDays: number; paidDayUnits: number;
  baseSatang: number; extraSatang: number; advanceSatang: number;
  deductionSatang: number; grossSatang: number; totalSatang: number;
}
export interface ReportBucket extends ReportTotals { key: string; dailyRateSatang?: number }
export interface ReportAdjustment {
  month: string; extraId: string; label: string; type: 'BONUS' | 'DEDUCTION'; amountSatang: number;
}
export interface AnalyticsEmployee {
  employeeId: string; name: string; nickname?: string; position: string;
  totals: ReportTotals; buckets: ReportBucket[]; adjustments: ReportAdjustment[];
}
export interface AnalyticsReport {
  period: ReportPeriod; today: string; months: string[]; closedMonths: string[];
  totals: ReportTotals; buckets: ReportBucket[]; employees: AnalyticsEmployee[];
}
export type AnalyticsMonth = EmployeeMonthResult & { name: string; nickname?: string; position: string; isClosed?: boolean };

export function emptyTotals(): ReportTotals {
  return { full: 0, half: 0, absent: 0, holiday: 0, workedDays: 0, paidDayUnits: 0,
    baseSatang: 0, extraSatang: 0, advanceSatang: 0, deductionSatang: 0, grossSatang: 0, totalSatang: 0 };
}
export function addTotals(target: ReportTotals, source: ReportTotals): void {
  for (const key of Object.keys(target) as (keyof ReportTotals)[]) {
    target[key] += source[key];
    requireCondition(Number.isFinite(target[key]) && (key === 'paidDayUnits' || Number.isSafeInteger(target[key])), 'MONEY_OVERFLOW');
  }
}
export function monthTotals(result: AnalyticsMonth): ReportTotals {
  return { full: result.full, half: result.half, absent: result.absent,
    holiday: result.days.filter(day => day.status === 'HOLIDAY').length,
    workedDays: result.workedDays, paidDayUnits: result.paidDayUnits,
    baseSatang: result.baseSatang, extraSatang: result.extraSatang,
    advanceSatang: result.advanceSatang || 0, deductionSatang: result.deductionSatang || 0,
    grossSatang: result.grossSatang ?? result.baseSatang + result.extraSatang, totalSatang: result.totalSatang };
}
function dayTotals(day: DailyResult): ReportTotals {
  const full = Number(day.status === 'FULL');
  const half = Number(day.status === 'HALF');
  const baseSatang = day.amountSatang ?? 0;
  const advanceSatang = day.advanceSatang || 0;
  const deductionSatang = day.deductionSatang || 0;
  return { ...emptyTotals(), full, half, absent: Number(day.status === 'ABSENT'),
    holiday: Number(day.status === 'HOLIDAY'), workedDays: full + half, paidDayUnits: full + half / 2,
    baseSatang, grossSatang: baseSatang, advanceSatang, deductionSatang,
    totalSatang: baseSatang - advanceSatang - deductionSatang };
}

/** Aggregate existing payroll results in integer satang; monthly extras have no invented payment date. */
export function buildAnalytics(results: AnalyticsMonth[], period: ReportPeriod, today: string, months: string[], closedMonths: string[]): AnalyticsReport {
  const people = new Map<string, AnalyticsEmployee>();
  const globalBuckets = new Map<string, ReportTotals>();
  const individualBuckets = new Map<string, Map<string, ReportTotals>>();
  const dailyRates = new Map<string, number>();
  const totals = emptyTotals();
  const seen = new Set<string>();
  for (const result of results) {
    const key = `${result.month}|${result.employeeId}`;
    requireCondition(!seen.has(key), 'DUPLICATE_REPORT');
    seen.add(key);
    let employee = people.get(result.employeeId);
    if (!employee) {
      employee = { employeeId: result.employeeId, name: result.name, nickname: result.nickname, position: result.position,
        totals: emptyTotals(), buckets: [], adjustments: [] };
      people.set(result.employeeId, employee);
      individualBuckets.set(result.employeeId, new Map());
    }
    const monthly = monthTotals(result);
    addTotals(totals, monthly);
    addTotals(employee.totals, monthly);
    for (const extra of result.extras) employee.adjustments.push({ ...extra, month: result.month, type: extra.type === 'DEDUCTION' ? 'DEDUCTION' : 'BONUS' });
    if (period === 'day') for (const day of result.days) {
      if (day.dailySatang !== undefined) dailyRates.set(`${result.employeeId}|${day.dateKey}`, day.dailySatang);
    }
    const rows = period === 'day'
      ? result.days.map(day => ({ key: day.dateKey, values: dayTotals(day) }))
      : [{ key: period === 'month' ? result.month : result.month.slice(0, 4), values: monthly }];
    for (const row of rows) {
      const personal = individualBuckets.get(result.employeeId)!;
      if (!personal.has(row.key)) personal.set(row.key, emptyTotals());
      if (!globalBuckets.has(row.key)) globalBuckets.set(row.key, emptyTotals());
      addTotals(personal.get(row.key)!, row.values);
      addTotals(globalBuckets.get(row.key)!, row.values);
    }
  }
  const buckets = (map: Map<string, ReportTotals>) => [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, ...value }));
  // Include empty completed periods in charts, even before the first employee started.
  if (period !== 'day') for (const month of months) {
    const key = period === 'month' ? month : month.slice(0, 4);
    if (!globalBuckets.has(key)) globalBuckets.set(key, emptyTotals());
  }
  for (const employee of people.values()) employee.buckets = buckets(individualBuckets.get(employee.employeeId)!).map(bucket => {
    const rate = dailyRates.get(`${employee.employeeId}|${bucket.key}`);
    return rate === undefined ? bucket : { ...bucket, dailyRateSatang: rate };
  });
  return { period, today, months, closedMonths, totals, buckets: buckets(globalBuckets),
    employees: [...people.values()].sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name, 'th')) };
}

export function reportMonths(period: ReportPeriod, input: { month?: string | null; year?: string | null; fromYear?: string | null; toYear?: string | null }, today: string): string[] {
  requireCondition(['day', 'month', 'year'].includes(period), 'INVALID_INPUT');
  if (period === 'day') {
    const month = monthKey(input.month || today.slice(0, 7));
    requireCondition(month <= today.slice(0, 7), 'INVALID_MONTH');
    return [month];
  }
  const yearValue = (value: string | null | undefined) => {
    requireCondition(typeof value === 'string' && /^20\d{2}$/.test(value), 'INVALID_INPUT');
    return Number(value);
  };
  const from = yearValue(period === 'month' ? input.year : input.fromYear);
  const to = period === 'month' ? from : yearValue(input.toYear);
  requireCondition(from <= to && to - from < 5 && to <= Number(today.slice(0, 4)), 'INVALID_INPUT');
  const months: string[] = [];
  for (let year = from; year <= to; year++) for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key <= today.slice(0, 7)) months.push(key);
  }
  return months;
}
