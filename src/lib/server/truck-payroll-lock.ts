import type { firestore } from 'firebase-admin';
import { getShopDocRef } from './repository';
import { monthDates } from '../payroll/dates';

/** Query inside the mutation transaction so closing a period and editing its source serialize. */
export async function assertPayrollRangesOpen(tx: firestore.Transaction, shop: string, ranges: { start: string; end: string }[], ignoreId?: string, error = 'MONTH_CLOSED') {
  const snapshot = await tx.get(getShopDocRef(shop).collection('truckPayrollMonths'));
  for (const doc of snapshot.docs || []) {
    const value = doc.data();
    if (doc.id === ignoreId || value.state !== 'CLOSED') continue;
    const dates = /^20\d{2}-\d{2}$/.test(doc.id) ? monthDates(doc.id) : [];
    const start = value.start || dates[0], end = value.end || dates[dates.length - 1];
    if (start && end && ranges.some(range => range.start <= end && range.end >= start)) throw new Error(error);
  }
}

export async function assertPayrollDatesOpen(tx: firestore.Transaction, shop: string, dates: string[]) {
  await assertPayrollRangesOpen(tx, shop, [...new Set(dates)].filter(Boolean).map(date => ({ start: date, end: date })));
}
