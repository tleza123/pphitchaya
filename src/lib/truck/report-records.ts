import type { TruckDailyRecordDoc, TruckTripItem } from './types';

/** Project completed legs by departure day and retain the source record date. */
export function recordsForAccountingMonths(records: TruckDailyRecordDoc[], months: string[]): TruckDailyRecordDoc[] {
  const selected = new Set(months);
  return records.flatMap(record => {
    const groups = new Map<string, TruckTripItem[]>();
    for (const trip of record.trips || []) {
      const day = trip.departureDate || record.dateKey;
      if (!selected.has(day.slice(0, 7)) || trip.driverPaySatang == null || (trip.status && trip.status !== 'COMPLETED')) continue;
      const group = groups.get(day) || []; group.push(trip); groups.set(day, group);
    }
    return [...groups.entries()].map(([day, trips]) => ({
      ...record, sourceDateKey: record.sourceDateKey || record.dateKey, dateKey: day, monthKey: day.slice(0, 7), trips,
      tripCount: trips.length,
      totalDriverPaySatang: trips.reduce((sum, trip) => sum + (trip.driverPaySatang || 0) + (trip.driverExtraSatang || 0), 0),
      fuelCostSatang: 0
    }));
  });
}

/** Prefer standalone documents over their embedded or migrated copies. */
export function mergeReportTrips(records: TruckDailyRecordDoc[], standalone: any[]): TruckDailyRecordDoc[] {
  const ids = new Set(standalone.map(t => t.tripId));
  const legacy = new Set(standalone.filter(t => t.legacyRecordId != null && t.legacyTripIndex != null).map(t => t.legacyRecordId + ':' + t.legacyTripIndex));
  const embedded = records.map(r => ({ ...r, trips: (r.trips || []).filter((t, i) => !(t.tripId && ids.has(t.tripId)) && !legacy.has(r.recordId + ':' + i)) }));
  const separate = standalone.filter(t => t.status === 'COMPLETED' && t.departureDate && t.driverPaySatang != null).map(t => ({
    recordId: t.recordId || t.legacyRecordId || t.tripId, dateKey: t.departureDate, monthKey: t.departureDate.slice(0, 7),
    sourceDateKey: records.find(r => r.recordId === (t.recordId || t.legacyRecordId))?.dateKey || t.departureDate,
    truckId: t.truckId, plateNumberSnapshot: t.plateNumberSnapshot || '', driverNameSnapshot: t.driverNameSnapshot || t.legacyDriverName || '',
    trips: [{ ...t, fromLocation: t.fromLocation || t.originNameSnapshot || '', destinationName: t.destinationName || t.destinationNameSnapshot || '', tripIndex: t.tripIndex || 1 }],
    tripCount: 1, totalDriverPaySatang: t.driverPaySatang || 0, fuelCostSatang: 0, photos: t.photos || [], revision: 1, createdAt: t.createdAt || '', updatedAt: t.updatedAt || '', updatedBy: t.updatedBy || ''
  } as TruckDailyRecordDoc));
  return [...embedded, ...separate];
}
