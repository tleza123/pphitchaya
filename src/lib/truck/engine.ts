import { validateSatang, requireCondition } from '../payroll/money';
import {
  TruckDoc,
  TruckTripItem,
  TruckDailyRecordDoc,
  TruckMonthlyReport,
  TruckMonthlyRow,
  TruckMonthlyTotals
} from './types';

/**
 * Calculates and validates daily record totals in integer satang.
 */
export function calculateTruckRecordTotals(
  trips: TruckTripItem[],
  fuelCostSatang: number
): {
  totalDriverPaySatang: number;
  tripCount: number;
} {
  validateSatang(fuelCostSatang);
  requireCondition(Array.isArray(trips), 'INVALID_TRIPS');

  let totalDriverPaySatang = 0;
  for (const trip of trips) {
    requireCondition(trip && typeof trip === 'object', 'INVALID_TRIP');
    if (trip.driverPaySatang === null && (trip.status === 'OPEN' || trip.status === 'CANCELLED')) continue;
    if (trip.driverPaySatang === null) throw new Error('MISSING_PRICE');
    if (trip.driverPaySatang === undefined) throw new Error('INVALID_MONEY');
    validateSatang(trip.driverPaySatang);
    totalDriverPaySatang += trip.driverPaySatang ?? 0;
    requireCondition(Number.isSafeInteger(totalDriverPaySatang), 'MONEY_OVERFLOW');
  }

  validateSatang(totalDriverPaySatang);

  return {
    totalDriverPaySatang,
    tripCount: trips.length
  };
}

/**
 * Aggregates all daily records for a given month into a monthly report.
 */
export function buildTruckMonthlyReport(
  records: TruckDailyRecordDoc[],
  trucks: TruckDoc[],
  monthKey: string
): TruckMonthlyReport {
  requireCondition(Array.isArray(records), 'INVALID_RECORDS');
  requireCondition(Array.isArray(trucks), 'INVALID_TRUCKS');
  requireCondition(typeof monthKey === 'string' && /^\d{4}-\d{2}$/.test(monthKey), 'INVALID_MONTH');

  let totalTrips = 0;
  let totalDriverPaySatang = 0;
  let totalFuelCostSatang = 0;
  const activeTruckSet = new Set<string>();

  for (const record of records) {
    validateSatang(record.totalDriverPaySatang);
    validateSatang(record.fuelCostSatang);

    totalTrips += record.tripCount;
    totalDriverPaySatang += record.totalDriverPaySatang;
    totalFuelCostSatang += record.fuelCostSatang;

    requireCondition(Number.isSafeInteger(totalTrips), 'TRIP_COUNT_OVERFLOW');
    requireCondition(Number.isSafeInteger(totalDriverPaySatang), 'MONEY_OVERFLOW');
    requireCondition(Number.isSafeInteger(totalFuelCostSatang), 'MONEY_OVERFLOW');

    if (record.tripCount > 0 || record.fuelCostSatang > 0) {
      activeTruckSet.add(record.truckId);
    }
  }

  const totalCostSatang = totalDriverPaySatang + totalFuelCostSatang;
  requireCondition(Number.isSafeInteger(totalCostSatang), 'MONEY_OVERFLOW');

  const totals: TruckMonthlyTotals = {
    totalTrips,
    totalDriverPaySatang,
    totalFuelCostSatang,
    totalCostSatang,
    activeTruckCount: activeTruckSet.size
  };

  // Build per-truck summary
  const truckMap = new Map<string, TruckDoc>();
  for (const t of trucks) {
    truckMap.set(t.truckId, t);
  }

  // Also include any truckId from records not in trucks list
  for (const r of records) {
    if (!truckMap.has(r.truckId)) {
      truckMap.set(r.truckId, {
        truckId: r.truckId,
        plateNumber: r.plateNumberSnapshot || r.truckId,
        driverName: r.driverNameSnapshot || '',
        status: 'ACTIVE',
        revision: 1,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      });
    }
  }

  const perTruck: TruckMonthlyRow[] = [];
  for (const truck of truckMap.values()) {
    const truckRecords = records.filter(r => r.truckId === truck.truckId);
    const truckTripCount = truckRecords.reduce((sum, r) => sum + r.tripCount, 0);
    const truckDriverPay = truckRecords.reduce((sum, r) => sum + r.totalDriverPaySatang, 0);
    const truckFuelCost = truckRecords.reduce((sum, r) => sum + r.fuelCostSatang, 0);

    perTruck.push({
      truckId: truck.truckId,
      plateNumber: truck.plateNumber,
      driverName: truck.driverName,
      tripCount: truckTripCount,
      totalDriverPaySatang: truckDriverPay,
      totalFuelCostSatang: truckFuelCost
    });
  }

  // Sort perTruck by plateNumber
  perTruck.sort((a, b) => a.plateNumber.localeCompare(b.plateNumber, 'th'));

  // Sort records descending by dateKey, then plateNumber/truckId
  const sortedRecords = [...records].sort((a, b) => {
    const cmp = b.dateKey.localeCompare(a.dateKey);
    if (cmp !== 0) return cmp;
    return a.truckId.localeCompare(b.truckId);
  });

  return {
    monthKey,
    totals,
    perTruck,
    records: sortedRecords
  };
}
