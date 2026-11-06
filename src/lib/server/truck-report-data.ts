import { getTruckMonthsCol, getTruckRecordsCol, getTruckTripsCol } from './repository';
import { mergeReportTrips, recordsForAccountingMonths } from '../truck/report-records';
import type { TruckDailyRecordDoc } from '../truck/types';

export async function loadTruckReportRecords(shopId: string, months: string[]): Promise<TruckDailyRecordDoc[]> {
  const [monthSnap, tripSnap] = await Promise.all([getTruckMonthsCol(shopId).get(), getTruckTripsCol(shopId).get()]);
  const storageMonths = [...new Set([...months, ...(monthSnap.docs || []).map(d => d.id).filter(m => /^\d{4}-\d{2}$/.test(m))])];
  const records: TruckDailyRecordDoc[] = [];
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(4, storageMonths.length)}, async () => {
    while (cursor < storageMonths.length) {
      const snap = await getTruckRecordsCol(storageMonths[cursor++], shopId).get();
      records.push(...(snap.docs || []).map(d => ({...d.data(), recordId: d.id} as TruckDailyRecordDoc)));
    }
  }));
  return recordsForAccountingMonths(mergeReportTrips(records, (tripSnap.docs || []).map(d => ({...d.data(), tripId: d.id}))), months);
}
