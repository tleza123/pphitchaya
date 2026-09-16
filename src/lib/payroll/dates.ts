import { requireCondition } from './money';

/**
 * Validates ISO date-only format YYYY-MM-DD.
 */
export function dateKey(value: string): string {
  requireCondition(typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value), 'INVALID_DATE');
  const parsed = new Date(value + 'T00:00:00Z');
  requireCondition(
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value,
    'INVALID_DATE'
  );
  return value;
}

/**
 * Validates ISO month-only format YYYY-MM.
 */
export function monthKey(value: string): string {
  requireCondition(
    typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value),
    'INVALID_MONTH'
  );
  return value;
}

/**
 * Returns all date keys in a given month.
 */
export function monthDates(month: string): string[] {
  monthKey(month);
  const cursor = new Date(month + '-01T00:00:00Z');
  const result: string[] = [];
  while (cursor.toISOString().slice(0, 7) === month) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

/**
 * Gets current server date in Asia/Bangkok timezone as YYYY-MM-DD string.
 */
export function getBangkokToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Gets current server month in Asia/Bangkok timezone as YYYY-MM string.
 */
export function getBangkokMonth(): string {
  return getBangkokToday().slice(0, 7);
}

/**
 * Formats YYYY-MM-DD into Thai date string (e.g. "จันทร์ 14 ก.ย. 2569").
 */
export function formatThaiDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }
): string {
  dateKey(dateStr);
  const date = new Date(dateStr + 'T12:00:00+07:00');
  return new Intl.DateTimeFormat('th-TH', {
    ...options,
    timeZone: 'Asia/Bangkok'
  }).format(date);
}

/**
 * Formats YYYY-MM into Thai month string (e.g. "กันยายน 2569").
 */
export function formatThaiMonth(monthStr: string): string {
  monthKey(monthStr);
  const date = new Date(monthStr + '-01T12:00:00+07:00');
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok'
  }).format(date);
}
