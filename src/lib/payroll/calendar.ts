import { requireCondition } from './money';
import { dateKey } from './dates';

export interface CalendarVersion {
  versionId: string;
  effectiveFrom: string; // YYYY-MM-DD
  weekdays: number[];    // e.g. [1, 2, 3, 4, 5, 6] (Mon-Sat), Sunday=0
  revision: number;
}

export interface CalendarOverride {
  dateKey: string;
  kind: 'WORKDAY' | 'HOLIDAY';
  note?: string;
  revision: number;
}

/**
 * Validates weekdays array (each day 0..6, unique).
 */
export function validateWeekdays(weekdays: number[]): number[] {
  requireCondition(
    Array.isArray(weekdays) &&
      weekdays.every(d => Number.isInteger(d) && d >= 0 && d <= 6) &&
      new Set(weekdays).size === weekdays.length,
    'INVALID_CALENDAR'
  );
  return weekdays;
}

/**
 * Resolves the effective weekdays array for a given date from sorted CalendarVersion array.
 */
export function resolveWeekdaysForDate(
  dateStr: string,
  calendarVersions: CalendarVersion[],
  fallbackWeekdays: number[] = [1, 2, 3, 4, 5, 6]
): number[] {
  dateKey(dateStr);
  if (!calendarVersions || calendarVersions.length === 0) {
    return validateWeekdays(fallbackWeekdays);
  }

  // Sort by effectiveFrom ascending
  const sorted = [...calendarVersions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let chosen: CalendarVersion | null = null;
  for (const v of sorted) {
    if (v.effectiveFrom <= dateStr) {
      chosen = v;
    }
  }

  if (!chosen) {
    return validateWeekdays(sorted[0].weekdays);
  }
  return validateWeekdays(chosen.weekdays);
}

/**
 * Determines whether a date is a workday, checking date overrides first, then weekdays.
 */
export function isWorkday(
  dateStr: string,
  weekdays: number[],
  overrides?: Record<string, 'WORKDAY' | 'HOLIDAY'> | null
): boolean {
  dateKey(dateStr);
  validateWeekdays(weekdays);

  if (overrides && overrides[dateStr]) {
    const kind = overrides[dateStr];
    requireCondition(kind === 'WORKDAY' || kind === 'HOLIDAY', 'INVALID_CALENDAR');
    return kind === 'WORKDAY';
  }

  // getUTCDay() for ISO date string YYYY-MM-DDT00:00:00Z
  const dayOfWeek = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  return weekdays.includes(dayOfWeek);
}
