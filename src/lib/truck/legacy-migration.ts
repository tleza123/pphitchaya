import { dateKey } from '../payroll/dates';
import { validateSatang } from '../payroll/money';
import type { TruckDailyRecordDoc } from './types';
import { createHash } from 'node:crypto';

/** Build reviewable migration candidates without changing the legacy documents. */
export function previewLegacyTruckMigration(records: TruckDailyRecordDoc[]) {
  const trips: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  const totalMismatchRecordIds: string[] = [];
  const ids = new Set<string>();
  for (const record of records) {
    dateKey(record.dateKey);
    if (!record.recordId || ids.has(record.recordId)) throw new Error('DUPLICATE_RECORD');
    ids.add(record.recordId);
    if (!Array.isArray(record.trips)) throw new Error('INVALID_TRIPS');
    let total = 0;
    record.trips.forEach((trip, index) => {
      if (typeof trip.driverPaySatang !== 'number') throw new Error('LEGACY_DRIVER_PAY_MISSING');
      validateSatang(trip.driverPaySatang);
      total += trip.driverPaySatang;
      if (!Number.isSafeInteger(total)) throw new Error('MONEY_OVERFLOW');
      // The record date is a reporting fallback only when the source has no trip date.
      const departureDate = trip.departureDate ?? record.dateKey;
      dateKey(departureDate);
      trips.push({
        tripId: createHash('sha256').update(JSON.stringify([record.recordId, index])).digest('hex'),
        legacyRecordId: record.recordId,
        legacyTripIndex: index,
        departureDate,
        accountingMonth: departureDate.slice(0, 7),
        departureTimeKnown: Boolean(trip.departureTime ?? trip.departedAt),
        departureTime: trip.departureTime ?? null,
        arrivalDate: trip.arrivalDate ?? null,
        arrivalTime: trip.arrivalTime ?? null,
        departedAt: trip.departedAt ?? null,
        arrivedAt: trip.arrivedAt ?? null,
        legacyRecordCreatedAt: record.createdAt ?? null,
        legacyRecordUpdatedAt: record.updatedAt ?? null,
        legacyTripSnapshot: trip,
        originNameSnapshot: trip.fromLocation || '',
        destinationNameSnapshot: trip.destinationName || '',
        truckId: record.truckId,
        plateNumberSnapshot: record.plateNumberSnapshot || '',
        legacyDriverName: record.driverNameSnapshot || '',
        driverId: null,
        customerId: null,
        driverPaySatang: trip.driverPaySatang,
        billingSatang: trip.billingSatang ?? null,
        weightKg: (trip as typeof trip & {weightKg?: number | null}).weightKg ?? null,
        note: trip.note || '',
        photos: record.photos || [],
        status: 'LEGACY_REVIEW_REQUIRED'
      });
    });
    if (total !== record.totalDriverPaySatang) totalMismatchRecordIds.push(record.recordId);
    if (total !== record.totalDriverPaySatang) warnings.push(`${record.recordId}: ค่าเที่ยวรวมไม่ตรงกับรายการเดิม`);
    if (record.trips.length) warnings.push(`${record.recordId}: ต้องตรวจคนขับ ลูกค้า ราคาลูกค้า และวันส่งเสร็จ`);
  }
  const totalDriverPaySatang = trips.reduce((sum, t) => { const next = sum + (t.driverPaySatang as number); if (!Number.isSafeInteger(next)) throw new Error('MONEY_OVERFLOW'); return next; }, 0);
  return { recordCount: records.length, tripCount: trips.length, totalDriverPaySatang, trips, warnings, totalMismatchRecordIds };
}
