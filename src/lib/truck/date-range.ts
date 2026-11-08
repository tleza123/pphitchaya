import { dateKey, monthDates, monthKey } from '../payroll/dates';

export function truckDateRange(input: { start?: string | null; end?: string | null; month?: string | null }) {
  const custom = input.start != null || input.end != null;
  const month = custom ? '' : monthKey(input.month || '');
  const dates = custom ? [] : monthDates(month);
  const start = dateKey(custom ? input.start! : dates[0]);
  const end = dateKey(custom ? input.end! : dates[dates.length - 1]);
  if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 365) throw new Error('INVALID_DATE_RANGE');
  const months: string[] = [];
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 7) <= end.slice(0, 7)) {
    months.push(cursor.toISOString().slice(0, 7)); cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return { start, end, months, custom, id: custom ? `range_${start}_${end}` : month };
}

export function inTruckRange(date: string, range: { start: string; end: string }) { return date >= range.start && date <= range.end; }
