import { validateSatang, requireCondition } from '../payroll/money';
import {
  TruckDoc,
  TruckDailyRecordDoc,
  TruckReportPeriod,
  TruckAnalyticsBucket,
  TruckAnalyticsTotals,
  TruckAnalyticsTruck,
  TruckAnalyticsResult
} from './types';

function createEmptyBucket(key: string): TruckAnalyticsBucket {
  return {
    key,
    tripCount: 0,
    driverPaySatang: 0,
    fuelCostSatang: 0,
    totalCostSatang: 0
  };
}

function createEmptyTotals(): TruckAnalyticsTotals {
  return {
    tripCount: 0,
    driverPaySatang: 0,
    fuelCostSatang: 0,
    totalCostSatang: 0
  };
}

function addBucketMetrics(target: TruckAnalyticsBucket, source: {
  tripCount: number;
  driverPaySatang: number;
  fuelCostSatang: number;
}): void {
  target.tripCount += source.tripCount;
  target.driverPaySatang += source.driverPaySatang;
  target.fuelCostSatang += source.fuelCostSatang;
  target.totalCostSatang = target.driverPaySatang + target.fuelCostSatang;

  requireCondition(Number.isSafeInteger(target.tripCount), 'TRIP_COUNT_OVERFLOW');
  requireCondition(Number.isSafeInteger(target.driverPaySatang), 'MONEY_OVERFLOW');
  requireCondition(Number.isSafeInteger(target.fuelCostSatang), 'MONEY_OVERFLOW');
  requireCondition(Number.isSafeInteger(target.totalCostSatang), 'MONEY_OVERFLOW');
}

/**
 * Builds analytics buckets for truck operations over 'day', 'month', or 'year' periods.
 */
export function buildTruckAnalytics(
  recordsByMonth: Map<string, TruckDailyRecordDoc[]>,
  trucks: TruckDoc[],
  period: TruckReportPeriod,
  today: string,
  months: string[]
): TruckAnalyticsResult {
  requireCondition(
    period === 'day' || period === 'month' || period === 'year',
    'INVALID_PERIOD'
  );
  requireCondition(typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today), 'INVALID_TODAY');
  requireCondition(Array.isArray(months), 'INVALID_MONTHS');

  const globalBucketMap = new Map<string, TruckAnalyticsBucket>();
  const truckBucketMap = new Map<string, Map<string, TruckAnalyticsBucket>>();
  const truckTotalsMap = new Map<string, TruckAnalyticsTotals>();

  // Collect all trucks
  const allTrucksMap = new Map<string, TruckDoc>();
  for (const t of trucks) {
    allTrucksMap.set(t.truckId, t);
  }

  // Pre-populate period keys for non-day views to prevent missing empty intervals
  if (period !== 'day') {
    for (const m of months) {
      const key = period === 'month' ? m : m.slice(0, 4);
      if (!globalBucketMap.has(key)) {
        globalBucketMap.set(key, createEmptyBucket(key));
      }
    }
  }

  // Iterate through records for requested months
  for (const monthKey of months) {
    const records = recordsByMonth.get(monthKey) || [];
    for (const record of records) {
      validateSatang(record.totalDriverPaySatang);
      validateSatang(record.fuelCostSatang);

      // Register truck if not present
      if (!allTrucksMap.has(record.truckId)) {
        allTrucksMap.set(record.truckId, {
          truckId: record.truckId,
          plateNumber: record.plateNumberSnapshot || record.truckId,
          driverName: record.driverNameSnapshot || '',
          status: 'ACTIVE',
          revision: 1,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt
        });
      }

      const key =
        period === 'day'
          ? record.dateKey
          : period === 'month'
          ? record.monthKey || record.dateKey.slice(0, 7)
          : record.dateKey.slice(0, 4);

      // Update global bucket
      let gBucket = globalBucketMap.get(key);
      if (!gBucket) {
        gBucket = createEmptyBucket(key);
        globalBucketMap.set(key, gBucket);
      }
      addBucketMetrics(gBucket, {
        tripCount: record.tripCount,
        driverPaySatang: record.totalDriverPaySatang,
        fuelCostSatang: record.fuelCostSatang
      });

      // Update truck-specific bucket
      let tMap = truckBucketMap.get(record.truckId);
      if (!tMap) {
        tMap = new Map<string, TruckAnalyticsBucket>();
        truckBucketMap.set(record.truckId, tMap);
      }
      let tBucket = tMap.get(key);
      if (!tBucket) {
        tBucket = createEmptyBucket(key);
        tMap.set(key, tBucket);
      }
      addBucketMetrics(tBucket, {
        tripCount: record.tripCount,
        driverPaySatang: record.totalDriverPaySatang,
        fuelCostSatang: record.fuelCostSatang
      });

      // Update truck totals
      let tTotals = truckTotalsMap.get(record.truckId);
      if (!tTotals) {
        tTotals = createEmptyTotals();
        truckTotalsMap.set(record.truckId, tTotals);
      }
      tTotals.tripCount += record.tripCount;
      tTotals.driverPaySatang += record.totalDriverPaySatang;
      tTotals.fuelCostSatang += record.fuelCostSatang;
      tTotals.totalCostSatang = tTotals.driverPaySatang + tTotals.fuelCostSatang;
    }
  }

  // Pre-populate truck buckets for non-day views
  if (period !== 'day') {
    for (const truckId of allTrucksMap.keys()) {
      let tMap = truckBucketMap.get(truckId);
      if (!tMap) {
        tMap = new Map<string, TruckAnalyticsBucket>();
        truckBucketMap.set(truckId, tMap);
      }
      for (const m of months) {
        const key = period === 'month' ? m : m.slice(0, 4);
        if (!tMap.has(key)) {
          tMap.set(key, createEmptyBucket(key));
        }
      }
    }
  }

  // Calculate global totals
  const totals = createEmptyTotals();
  for (const bucket of globalBucketMap.values()) {
    totals.tripCount += bucket.tripCount;
    totals.driverPaySatang += bucket.driverPaySatang;
    totals.fuelCostSatang += bucket.fuelCostSatang;
  }
  totals.totalCostSatang = totals.driverPaySatang + totals.fuelCostSatang;

  // Sort global buckets by key ascending
  const buckets = [...globalBucketMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  // Build per-truck analytics
  const truckAnalyticsList: TruckAnalyticsTruck[] = [];
  for (const truck of allTrucksMap.values()) {
    const tTotals = truckTotalsMap.get(truck.truckId) || createEmptyTotals();
    const tMap = truckBucketMap.get(truck.truckId) || new Map<string, TruckAnalyticsBucket>();
    const tBuckets = [...tMap.values()].sort((a, b) => a.key.localeCompare(b.key));

    truckAnalyticsList.push({
      truckId: truck.truckId,
      plateNumber: truck.plateNumber,
      driverName: truck.driverName,
      totals: tTotals,
      buckets: tBuckets
    });
  }

  // Sort trucks by plateNumber
  truckAnalyticsList.sort((a, b) => a.plateNumber.localeCompare(b.plateNumber, 'th'));

  return {
    period,
    today,
    months,
    totals,
    buckets,
    trucks: truckAnalyticsList
  };
}
