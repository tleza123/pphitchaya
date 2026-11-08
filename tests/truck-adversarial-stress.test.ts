import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTruckRecordTotals, buildTruckMonthlyReport } from '../src/lib/truck/engine';
import { buildTruckAnalytics } from '../src/lib/truck/analytics';
import {
  TruckDoc,
  TruckTripItem,
  TruckDailyRecordDoc,
  TruckReportPeriod
} from '../src/lib/truck/types';

function createMockTruck(truckId: string, plateNumber: string, driverName: string): TruckDoc {
  return {
    truckId,
    plateNumber,
    driverName,
    notes: '',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

function createMockTrip(index: number, driverPaySatang: number, destination = 'ปลายทาง'): TruckTripItem {
  return {
    tripIndex: index,
    fromLocation: 'ต้นทาง',
    destinationMode: 'DEST_1',
    destinationId: 'dest1',
    destinationName: destination,
    driverPaySatang,
    note: `เที่ยวที่ ${index}`
  };
}

function createMockDailyRecord(
  dateKey: string,
  truckId: string,
  trips: TruckTripItem[],
  fuelCostSatang = 0
): TruckDailyRecordDoc {
  const monthKey = dateKey.slice(0, 7);
  const totals = calculateTruckRecordTotals(trips, fuelCostSatang);
  return {
    recordId: `${dateKey}_${truckId}`,
    dateKey,
    monthKey,
    truckId,
    plateNumberSnapshot: `ทะเบียน-${truckId}`,
    driverNameSnapshot: `คนขับ-${truckId}`,
    fuelCostSatang,
    totalDriverPaySatang: totals.totalDriverPaySatang,
    tripCount: totals.tripCount,
    trips,
    photos: [],
    revision: 1,
    createdAt: `${dateKey}T08:00:00.000Z`,
    updatedAt: `${dateKey}T17:00:00.000Z`,
    updatedBy: 'tester'
  };
}

// ============================================================================
// SUITE 1: calculateTruckRecordTotals Boundary & Stress Testing
// ============================================================================

test('calculateTruckRecordTotals: boundary - zero trips and zero fuel cost', () => {
  const result = calculateTruckRecordTotals([], 0);
  assert.equal(result.tripCount, 0);
  assert.equal(result.totalDriverPaySatang, 0);
});

test('calculateTruckRecordTotals: boundary - single trip with zero and high fuel cost', () => {
  const singleTrip = [createMockTrip(1, 55000)]; // 550.00 THB

  const withZeroFuel = calculateTruckRecordTotals(singleTrip, 0);
  assert.equal(withZeroFuel.tripCount, 1);
  assert.equal(withZeroFuel.totalDriverPaySatang, 55000);

  const withMaxFuel = calculateTruckRecordTotals(singleTrip, 100000000); // 1,000,000.00 THB
  assert.equal(withMaxFuel.tripCount, 1);
  assert.equal(withMaxFuel.totalDriverPaySatang, 55000);
});

test('calculateTruckRecordTotals: boundary - 100 trips with varied satang amounts', () => {
  const trips: TruckTripItem[] = [];
  let expectedSum = 0;
  for (let i = 1; i <= 100; i++) {
    // Each trip has varying satang: e.g. 350.25 THB, 450.75 THB, 600.00 THB, 12.34 THB
    const pay = (i * 1234 + 5678) % 100000; // between 0 and 1000.00 THB
    trips.push(createMockTrip(i, pay));
    expectedSum += pay;
  }

  const result = calculateTruckRecordTotals(trips, 250000);
  assert.equal(result.tripCount, 100);
  assert.equal(result.totalDriverPaySatang, expectedSum);
});

test('calculateTruckRecordTotals: boundary - 100 trips at exactly 100,000,000 satang total limit (1M THB)', () => {
  const trips: TruckTripItem[] = [];
  for (let i = 1; i <= 100; i++) {
    // 100 trips * 1,000,000 satang (10,000 THB) = 100,000,000 satang (1,000,000 THB)
    trips.push(createMockTrip(i, 1000000));
  }

  const result = calculateTruckRecordTotals(trips, 0);
  assert.equal(result.tripCount, 100);
  assert.equal(result.totalDriverPaySatang, 100000000);
});

test('calculateTruckRecordTotals: boundary - 100 trips exceeding 100,000,000 satang total limit', () => {
  const trips: TruckTripItem[] = [];
  for (let i = 1; i <= 100; i++) {
    // 100 trips * 1,000,001 satang = 100,000,100 satang (> 1,000,000 THB)
    trips.push(createMockTrip(i, 1000001));
  }

  assert.throws(
    () => calculateTruckRecordTotals(trips, 0),
    /INVALID_MONEY/
  );
});

test('calculateTruckRecordTotals: fuel cost boundaries - rejects negative, non-integer, and > 1M THB', () => {
  // Fuel cost: exactly 100,000,000 satang succeeds
  assert.equal(calculateTruckRecordTotals([], 100000000).totalDriverPaySatang, 0);

  // Fuel cost: 100,000,001 satang throws
  assert.throws(() => calculateTruckRecordTotals([], 100000001), /INVALID_MONEY/);

  // Fuel cost: negative numbers throw
  assert.throws(() => calculateTruckRecordTotals([], -1), /INVALID_MONEY/);
  assert.throws(() => calculateTruckRecordTotals([], -10000), /INVALID_MONEY/);

  // Fuel cost: non-integers (floats) throw
  assert.throws(() => calculateTruckRecordTotals([], 1500.5), /INVALID_MONEY/);
  assert.throws(() => calculateTruckRecordTotals([], 0.01), /INVALID_MONEY/);
  assert.throws(() => calculateTruckRecordTotals([], 100.0000001), /INVALID_MONEY/);

  // Fuel cost: NaN, Infinity, -Infinity throw
  assert.throws(() => calculateTruckRecordTotals([], Number.NaN), /INVALID_MONEY/);
  assert.throws(() => calculateTruckRecordTotals([], Number.POSITIVE_INFINITY), /INVALID_MONEY/);
  assert.throws(() => calculateTruckRecordTotals([], Number.NEGATIVE_INFINITY), /INVALID_MONEY/);

  // Fuel cost: wrong types throw
  assert.throws(() => calculateTruckRecordTotals([], '15000' as any), /INVALID_MONEY/);
  assert.throws(() => calculateTruckRecordTotals([], null as any), /INVALID_MONEY/);
  assert.throws(() => calculateTruckRecordTotals([], undefined as any), /INVALID_MONEY/);
});

test('calculateTruckRecordTotals: trip driverPaySatang boundaries - rejects negative, non-integer, and > 1M THB', () => {
  // Negative driver pay
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, -1)], 0),
    /INVALID_MONEY/
  );
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, -50000)], 0),
    /INVALID_MONEY/
  );

  // Non-integer driver pay (floating point Baht or satang)
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, 650.5)], 0),
    /INVALID_MONEY/
  );
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, 100.0001)], 0),
    /INVALID_MONEY/
  );
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, 0.99)], 0),
    /INVALID_MONEY/
  );

  // Over limit for single trip (> 100,000,000 satang)
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, 100000001)], 0),
    /INVALID_MONEY/
  );

  // Valid at upper boundary for single trip (100,000,000 satang)
  const maxSingle = calculateTruckRecordTotals([createMockTrip(1, 100000000)], 0);
  assert.equal(maxSingle.totalDriverPaySatang, 100000000);

  // Non-number values for driverPaySatang
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, Number.NaN)], 0),
    /INVALID_MONEY/
  );
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, Number.POSITIVE_INFINITY)], 0),
    /INVALID_MONEY/
  );
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, '50000' as any)], 0),
    /INVALID_MONEY/
  );
  assert.deepEqual(calculateTruckRecordTotals([createMockTrip(1, null as any)], 0), {totalDriverPaySatang:0,tripCount:1}, 'An unpriced saved trip counts without inventing a price');
  assert.throws(
    () => calculateTruckRecordTotals([createMockTrip(1, undefined as any)], 0),
    /INVALID_MONEY/
  );
});

test('calculateTruckRecordTotals: malformed input validation', () => {
  // trips is not array
  assert.throws(() => calculateTruckRecordTotals(null as any, 0), /INVALID_TRIPS/);
  assert.throws(() => calculateTruckRecordTotals(undefined as any, 0), /INVALID_TRIPS/);
  assert.throws(() => calculateTruckRecordTotals('trips' as any, 0), /INVALID_TRIPS/);
  assert.throws(() => calculateTruckRecordTotals({} as any, 0), /INVALID_TRIPS/);

  // trip item is null or not object
  assert.throws(() => calculateTruckRecordTotals([null as any], 0), /INVALID_TRIP/);
  assert.throws(() => calculateTruckRecordTotals([undefined as any], 0), /INVALID_TRIP/);
  assert.throws(() => calculateTruckRecordTotals(['trip' as any], 0), /INVALID_TRIP/);
});

// ============================================================================
// SUITE 2: Sum Precision & Integer Arithmetic Stress Harness
// ============================================================================

test('Sum Precision: 1,000 randomized trips verified against BigInt ground truth oracle', () => {
  // BigInt arithmetic has mathematical exactness (zero IEEE-754 floating-point drift)
  const trips: TruckTripItem[] = [];
  let bigIntExpected = 0n;

  // Generate 1,000 micro-trips with diverse satang values (1 satang to 99,999 satang)
  // Total sum will be around ~50,000,000 satang (500,000 THB), well within safe 100M limit
  for (let i = 1; i <= 1000; i++) {
    // Deterministic pseudo-random sequence
    const pay = ((i * 7919 + 104729) % 99999) + 1; // 1 to 100,000 satang
    trips.push(createMockTrip(i, pay));
    bigIntExpected += BigInt(pay);
  }

  const result = calculateTruckRecordTotals(trips, 0);

  assert.equal(result.tripCount, 1000);
  assert.equal(BigInt(result.totalDriverPaySatang), bigIntExpected);
  assert.equal(result.totalDriverPaySatang, Number(bigIntExpected));
  assert.ok(Number.isSafeInteger(result.totalDriverPaySatang));
});

test('Sum Precision: contrast against IEEE-754 floating point drift', () => {
  // In standard floating-point THB: 0.10 + 0.20 !== 0.30
  const floatSum = 0.1 + 0.2;
  assert.notEqual(floatSum, 0.3, 'IEEE-754 float arithmetic exhibits classic float drift');

  // In integer satang: 10 + 20 === 30 exactly
  const satangTrips: TruckTripItem[] = [
    createMockTrip(1, 10), // 0.10 THB
    createMockTrip(2, 20)  // 0.20 THB
  ];
  const satangResult = calculateTruckRecordTotals(satangTrips, 0);
  assert.equal(satangResult.totalDriverPaySatang, 30); // 0.30 THB exactly

  // 100 trips of 33 satang (0.33 THB):
  // Float addition: 0.33 * 100 = 33.00, but repeated addition 0.33 + 0.33 + ... loses bits
  let repeatedFloat = 0;
  for (let i = 0; i < 100; i++) {
    repeatedFloat += 0.33;
  }
  // Repeated float addition differs from 33.00
  assert.notEqual(repeatedFloat, 33.0);

  // Satang addition: exactly 3,300 satang
  const thirtyThreeSatangTrips = Array.from({ length: 100 }, (_, i) => createMockTrip(i + 1, 33));
  const exactResult = calculateTruckRecordTotals(thirtyThreeSatangTrips, 0);
  assert.equal(exactResult.totalDriverPaySatang, 3300);
});

// ============================================================================
// SUITE 3: buildTruckMonthlyReport Boundary & Edge Case Testing
// ============================================================================

test('buildTruckMonthlyReport: zero records with registered trucks', () => {
  const truck1 = createMockTruck('truck1', '70-1111', 'สมชาย');
  const truck2 = createMockTruck('truck2', '70-2222', 'สมหญิง');

  const report = buildTruckMonthlyReport([], [truck1, truck2], '2026-09');

  assert.equal(report.monthKey, '2026-09');
  assert.equal(report.totals.totalTrips, 0);
  assert.equal(report.totals.totalDriverPaySatang, 0);
  assert.equal(report.totals.totalFuelCostSatang, 0);
  assert.equal(report.totals.totalCostSatang, 0);
  assert.equal(report.totals.activeTruckCount, 0);

  assert.equal(report.perTruck.length, 2);
  assert.equal(report.perTruck[0].tripCount, 0);
  assert.equal(report.perTruck[0].totalDriverPaySatang, 0);
  assert.equal(report.perTruck[0].totalFuelCostSatang, 0);
  assert.equal(report.records.length, 0);
});

test('buildTruckMonthlyReport: zero records and empty trucks list', () => {
  const report = buildTruckMonthlyReport([], [], '2026-09');
  assert.equal(report.totals.totalTrips, 0);
  assert.equal(report.totals.totalCostSatang, 0);
  assert.equal(report.perTruck.length, 0);
  assert.equal(report.records.length, 0);
});

test('buildTruckMonthlyReport: high fuel cost (100,000,000 satang) and high driver pay without overflow', () => {
  const truck1 = createMockTruck('truck1', '70-1111', 'สมชาย');
  const record1 = createMockDailyRecord('2026-09-01', 'truck1', [createMockTrip(1, 80000000)], 100000000);
  const record2 = createMockDailyRecord('2026-09-02', 'truck1', [createMockTrip(1, 70000000)], 100000000);

  const report = buildTruckMonthlyReport([record1, record2], [truck1], '2026-09');

  // Total pay = 80M + 70M = 150M satang (1.5M THB)
  // Total fuel = 100M + 100M = 200M satang (2.0M THB)
  // Total cost = 350M satang (3.5M THB)
  assert.equal(report.totals.totalDriverPaySatang, 150000000);
  assert.equal(report.totals.totalFuelCostSatang, 200000000);
  assert.equal(report.totals.totalCostSatang, 350000000);
  assert.equal(report.totals.totalTrips, 2);
  assert.equal(report.totals.activeTruckCount, 1);
});

test('buildTruckMonthlyReport: sum of perTruck totals exactly matches overall totals', () => {
  const trucks = [
    createMockTruck('t1', '70-1111', 'A'),
    createMockTruck('t2', '70-2222', 'B'),
    createMockTruck('t3', '70-3333', 'C')
  ];

  const records: TruckDailyRecordDoc[] = [
    createMockDailyRecord('2026-09-01', 't1', [createMockTrip(1, 45050), createMockTrip(2, 55050)], 120000),
    createMockDailyRecord('2026-09-02', 't2', [createMockTrip(1, 75000)], 85000),
    createMockDailyRecord('2026-09-03', 't3', [createMockTrip(1, 100000), createMockTrip(2, 200000)], 300000),
    createMockDailyRecord('2026-09-04', 't1', [createMockTrip(1, 60000)], 90000)
  ];

  const report = buildTruckMonthlyReport(records, trucks, '2026-09');

  const sumPerTruckTrips = report.perTruck.reduce((acc, r) => acc + r.tripCount, 0);
  const sumPerTruckDriverPay = report.perTruck.reduce((acc, r) => acc + r.totalDriverPaySatang, 0);
  const sumPerTruckFuel = report.perTruck.reduce((acc, r) => acc + r.totalFuelCostSatang, 0);

  assert.equal(sumPerTruckTrips, report.totals.totalTrips);
  assert.equal(sumPerTruckDriverPay, report.totals.totalDriverPaySatang);
  assert.equal(sumPerTruckFuel, report.totals.totalFuelCostSatang);
  assert.equal(
    report.totals.totalCostSatang,
    report.totals.totalDriverPaySatang + report.totals.totalFuelCostSatang
  );
});

test('buildTruckMonthlyReport: auto-registers unknown trucks from daily record snapshots', () => {
  const knownTruck = createMockTruck('t1', '70-1111', 'สมชาย');
  // Record has 't2' which is not in trucks list
  const recordT2 = createMockDailyRecord('2026-09-05', 't2', [createMockTrip(1, 50000)], 60000);

  const report = buildTruckMonthlyReport([recordT2], [knownTruck], '2026-09');

  assert.equal(report.perTruck.length, 2);
  const t2Row = report.perTruck.find(r => r.truckId === 't2');
  assert.ok(t2Row);
  assert.equal(t2Row.plateNumber, 'ทะเบียน-t2');
  assert.equal(t2Row.driverName, 'คนขับ-t2');
  assert.equal(t2Row.tripCount, 1);
});

test('buildTruckMonthlyReport: sorts records descending by dateKey, then truckId', () => {
  const truck1 = createMockTruck('t1', '70-1111', 'A');
  const truck2 = createMockTruck('t2', '70-2222', 'B');

  const r1 = createMockDailyRecord('2026-09-02', 't2', [createMockTrip(1, 10000)]);
  const r2 = createMockDailyRecord('2026-09-15', 't1', [createMockTrip(1, 10000)]);
  const r3 = createMockDailyRecord('2026-09-02', 't1', [createMockTrip(1, 10000)]);
  const r4 = createMockDailyRecord('2026-09-30', 't2', [createMockTrip(1, 10000)]);

  const report = buildTruckMonthlyReport([r1, r2, r3, r4], [truck1, truck2], '2026-09');

  assert.equal(report.records[0].dateKey, '2026-09-30');
  assert.equal(report.records[1].dateKey, '2026-09-15');
  assert.equal(report.records[2].dateKey, '2026-09-02');
  assert.equal(report.records[2].truckId, 't1'); // t1 before t2 on same date
  assert.equal(report.records[3].dateKey, '2026-09-02');
  assert.equal(report.records[3].truckId, 't2');
});

test('buildTruckMonthlyReport: input immutability', () => {
  const truck = createMockTruck('t1', '70-1111', 'A');
  const record = createMockDailyRecord('2026-09-01', 't1', [createMockTrip(1, 50000)], 40000);
  const records = [record];
  const trucks = [truck];

  const recordsJsonBefore = JSON.stringify(records);
  const trucksJsonBefore = JSON.stringify(trucks);

  buildTruckMonthlyReport(records, trucks, '2026-09');

  assert.equal(JSON.stringify(records), recordsJsonBefore, 'records must not be mutated');
  assert.equal(JSON.stringify(trucks), trucksJsonBefore, 'trucks must not be mutated');
});

test('buildTruckMonthlyReport: validates monthKey and rejects malformed values', () => {
  const truck = createMockTruck('t1', '70-1111', 'A');
  assert.throws(() => buildTruckMonthlyReport([], [truck], '2026-9'), /INVALID_MONTH/);
  assert.throws(() => buildTruckMonthlyReport([], [truck], '2026-009'), /INVALID_MONTH/);
  assert.throws(() => buildTruckMonthlyReport([], [truck], '2026/09'), /INVALID_MONTH/);
  assert.throws(() => buildTruckMonthlyReport([], [truck], '2026'), /INVALID_MONTH/);
  assert.throws(() => buildTruckMonthlyReport([], [truck], '' as any), /INVALID_MONTH/);
  assert.throws(() => buildTruckMonthlyReport([], [truck], null as any), /INVALID_MONTH/);
});

// ============================================================================
// SUITE 4: buildTruckAnalytics Boundary, Gaps, Month Boundaries & Leap Year Stress Testing
// ============================================================================

test('buildTruckAnalytics: empty gaps across 6 months in month view pre-populates zero-filled buckets', () => {
  const truck1 = createMockTruck('t1', '70-1111', 'สมชาย');
  const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];

  // Records only in 2025-10 and 2026-03 (4-month gap between them)
  const rOct = createMockDailyRecord('2025-10-15', 't1', [createMockTrip(1, 50000)], 30000);
  const rMar = createMockDailyRecord('2026-03-20', 't1', [createMockTrip(1, 70000)], 40000);

  const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>([
    ['2025-10', [rOct]],
    ['2026-03', [rMar]]
  ]);

  const result = buildTruckAnalytics(
    recordsByMonth,
    [truck1],
    'month',
    '2026-03-25',
    months
  );

  // Assert all 6 months are present in chronological order
  assert.equal(result.buckets.length, 6);
  assert.deepEqual(
    result.buckets.map(b => b.key),
    months
  );

  // Check gap months have zero metrics
  for (const gapMonth of ['2025-11', '2025-12', '2026-01', '2026-02']) {
    const bucket = result.buckets.find(b => b.key === gapMonth);
    assert.ok(bucket);
    assert.equal(bucket.tripCount, 0);
    assert.equal(bucket.driverPaySatang, 0);
    assert.equal(bucket.fuelCostSatang, 0);
    assert.equal(bucket.totalCostSatang, 0);
  }

  // Check populated months
  const octBucket = result.buckets.find(b => b.key === '2025-10');
  assert.ok(octBucket);
  assert.equal(octBucket.tripCount, 1);
  assert.equal(octBucket.driverPaySatang, 50000);
  assert.equal(octBucket.fuelCostSatang, 30000);
  assert.equal(octBucket.totalCostSatang, 80000);

  const marBucket = result.buckets.find(b => b.key === '2026-03');
  assert.ok(marBucket);
  assert.equal(marBucket.tripCount, 1);
  assert.equal(marBucket.driverPaySatang, 70000);
  assert.equal(marBucket.fuelCostSatang, 40000);
  assert.equal(marBucket.totalCostSatang, 110000);

  // Totals must match sum of active months
  assert.equal(result.totals.tripCount, 2);
  assert.equal(result.totals.driverPaySatang, 120000);
  assert.equal(result.totals.fuelCostSatang, 70000);
  assert.equal(result.totals.totalCostSatang, 190000);

  // Per-truck buckets must also have all 6 months
  const truckAnalytics = result.trucks.find(t => t.truckId === 't1');
  assert.ok(truckAnalytics);
  assert.equal(truckAnalytics.buckets.length, 6);
  assert.deepEqual(
    truckAnalytics.buckets.map(b => b.key),
    months
  );
});

test('buildTruckAnalytics: date ranges across month boundaries in day, month, and year views', () => {
  const truck1 = createMockTruck('t1', '70-1111', 'สมชาย');

  // Three consecutive days crossing month boundary: 2026-08-31, 2026-09-01, 2026-09-02
  const rAug31 = createMockDailyRecord('2026-08-31', 't1', [createMockTrip(1, 40000)], 25000);
  const rSep01 = createMockDailyRecord('2026-09-01', 't1', [createMockTrip(1, 50000)], 30000);
  const rSep02 = createMockDailyRecord('2026-09-02', 't1', [createMockTrip(1, 60000)], 35000);

  const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>([
    ['2026-08', [rAug31]],
    ['2026-09', [rSep01, rSep02]]
  ]);

  const months = ['2026-08', '2026-09'];

  // Test 'day' period across month boundary
  const dayResult = buildTruckAnalytics(recordsByMonth, [truck1], 'day', '2026-09-05', months);
  assert.equal(dayResult.buckets.length, 3);
  assert.deepEqual(
    dayResult.buckets.map(b => b.key),
    ['2026-08-31', '2026-09-01', '2026-09-02']
  );
  assert.equal(dayResult.totals.tripCount, 3);
  assert.equal(dayResult.totals.driverPaySatang, 150000);
  assert.equal(dayResult.totals.fuelCostSatang, 90000);
  assert.equal(dayResult.totals.totalCostSatang, 240000);

  // Test 'month' period across month boundary
  const monthResult = buildTruckAnalytics(recordsByMonth, [truck1], 'month', '2026-09-05', months);
  assert.equal(monthResult.buckets.length, 2);
  const bAug = monthResult.buckets.find(b => b.key === '2026-08');
  assert.ok(bAug);
  assert.equal(bAug.tripCount, 1);
  assert.equal(bAug.driverPaySatang, 40000);

  const bSep = monthResult.buckets.find(b => b.key === '2026-09');
  assert.ok(bSep);
  assert.equal(bSep.tripCount, 2);
  assert.equal(bSep.driverPaySatang, 110000); // 50000 + 60000

  // Test 'year' period across month boundary
  const yearResult = buildTruckAnalytics(recordsByMonth, [truck1], 'year', '2026-09-05', months);
  assert.equal(yearResult.buckets.length, 1);
  const bYear = yearResult.buckets[0];
  assert.equal(bYear.key, '2026');
  assert.equal(bYear.tripCount, 3);
  assert.equal(bYear.driverPaySatang, 150000);
  assert.equal(bYear.fuelCostSatang, 90000);
  assert.equal(bYear.totalCostSatang, 240000);
});

test('buildTruckAnalytics: leap year handling (2024-02-29 leap day)', () => {
  const truck1 = createMockTruck('t1', '70-1111', 'สมชาย');

  // Leap day 2024-02-29 and adjacent days
  const rFeb28 = createMockDailyRecord('2024-02-28', 't1', [createMockTrip(1, 30000)], 20000);
  const rFeb29 = createMockDailyRecord('2024-02-29', 't1', [createMockTrip(1, 45000)], 25000); // Leap Day!
  const rMar01 = createMockDailyRecord('2024-03-01', 't1', [createMockTrip(1, 55000)], 35000);

  const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>([
    ['2024-02', [rFeb28, rFeb29]],
    ['2024-03', [rMar01]]
  ]);

  const months = ['2024-02', '2024-03'];

  // Day period with leap day
  const dayResult = buildTruckAnalytics(recordsByMonth, [truck1], 'day', '2024-03-05', months);
  assert.equal(dayResult.buckets.length, 3);
  assert.deepEqual(
    dayResult.buckets.map(b => b.key),
    ['2024-02-28', '2024-02-29', '2024-03-01']
  );
  const leapDayBucket = dayResult.buckets.find(b => b.key === '2024-02-29');
  assert.ok(leapDayBucket);
  assert.equal(leapDayBucket.tripCount, 1);
  assert.equal(leapDayBucket.driverPaySatang, 45000);

  // Month period with leap day included in 2024-02
  const monthResult = buildTruckAnalytics(recordsByMonth, [truck1], 'month', '2024-03-05', months);
  const febBucket = monthResult.buckets.find(b => b.key === '2024-02');
  assert.ok(febBucket);
  assert.equal(febBucket.tripCount, 2);
  assert.equal(febBucket.driverPaySatang, 75000); // 30000 + 45000
  assert.equal(febBucket.fuelCostSatang, 45000); // 20000 + 25000

  // Year period with leap year
  const yearResult = buildTruckAnalytics(recordsByMonth, [truck1], 'year', '2024-03-05', months);
  assert.equal(yearResult.buckets.length, 1);
  assert.equal(yearResult.buckets[0].key, '2024');
  assert.equal(yearResult.buckets[0].tripCount, 3);
  assert.equal(yearResult.buckets[0].totalCostSatang, 210000);
});

test('buildTruckAnalytics: multi-year period across leap and non-leap years (2023, 2024 leap, 2025)', () => {
  const truck1 = createMockTruck('t1', '70-1111', 'สมชาย');

  const r2023 = createMockDailyRecord('2023-02-28', 't1', [createMockTrip(1, 20000)], 10000);
  const r2024 = createMockDailyRecord('2024-02-29', 't1', [createMockTrip(1, 30000)], 15000); // leap day
  const r2025 = createMockDailyRecord('2025-02-28', 't1', [createMockTrip(1, 40000)], 20000);

  const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>([
    ['2023-02', [r2023]],
    ['2024-02', [r2024]],
    ['2025-02', [r2025]]
  ]);

  const months = ['2023-02', '2024-02', '2025-02'];

  const yearResult = buildTruckAnalytics(recordsByMonth, [truck1], 'year', '2025-03-01', months);

  assert.equal(yearResult.buckets.length, 3);
  assert.deepEqual(
    yearResult.buckets.map(b => b.key),
    ['2023', '2024', '2025']
  );

  const b2024 = yearResult.buckets.find(b => b.key === '2024');
  assert.ok(b2024);
  assert.equal(b2024.tripCount, 1);
  assert.equal(b2024.driverPaySatang, 30000);
  assert.equal(b2024.fuelCostSatang, 15000);

  assert.equal(yearResult.totals.tripCount, 3);
  assert.equal(yearResult.totals.driverPaySatang, 90000);
  assert.equal(yearResult.totals.fuelCostSatang, 45000);
  assert.equal(yearResult.totals.totalCostSatang, 135000);
});

test('buildTruckAnalytics: multiple trucks on the same day aggregate globally but stay separated per truck', () => {
  const truck1 = createMockTruck('t1', '70-1111', 'สมชาย');
  const truck2 = createMockTruck('t2', '70-2222', 'สมหญิง');

  const rT1 = createMockDailyRecord('2026-09-10', 't1', [createMockTrip(1, 50000), createMockTrip(2, 60000)], 40000);
  const rT2 = createMockDailyRecord('2026-09-10', 't2', [createMockTrip(1, 80000)], 50000);

  const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>([
    ['2026-09', [rT1, rT2]]
  ]);

  const dayResult = buildTruckAnalytics(
    recordsByMonth,
    [truck1, truck2],
    'day',
    '2026-09-15',
    ['2026-09']
  );

  // Global bucket for 2026-09-10 combines both trucks
  assert.equal(dayResult.buckets.length, 1);
  const gBucket = dayResult.buckets[0];
  assert.equal(gBucket.key, '2026-09-10');
  assert.equal(gBucket.tripCount, 3); // 2 + 1
  assert.equal(gBucket.driverPaySatang, 190000); // 110000 + 80000
  assert.equal(gBucket.fuelCostSatang, 90000); // 40000 + 50000
  assert.equal(gBucket.totalCostSatang, 280000);

  // Per-truck analytics keep them strictly separated
  const t1Data = dayResult.trucks.find(t => t.truckId === 't1');
  assert.ok(t1Data);
  assert.equal(t1Data.totals.tripCount, 2);
  assert.equal(t1Data.totals.driverPaySatang, 110000);
  assert.equal(t1Data.totals.fuelCostSatang, 40000);
  assert.equal(t1Data.buckets[0].tripCount, 2);

  const t2Data = dayResult.trucks.find(t => t.truckId === 't2');
  assert.ok(t2Data);
  assert.equal(t2Data.totals.tripCount, 1);
  assert.equal(t2Data.totals.driverPaySatang, 80000);
  assert.equal(t2Data.totals.fuelCostSatang, 50000);
  assert.equal(t2Data.buckets[0].tripCount, 1);
});

test('buildTruckAnalytics: truck with zero activity during analytics period receives zero-filled buckets', () => {
  const activeTruck = createMockTruck('t1', '70-1111', 'สมชาย');
  const inactiveTruck = createMockTruck('t2', '70-2222', 'สมหญิง');

  const rT1 = createMockDailyRecord('2026-09-10', 't1', [createMockTrip(1, 50000)], 40000);
  const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>([
    ['2026-09', [rT1]]
  ]);

  const monthResult = buildTruckAnalytics(
    recordsByMonth,
    [activeTruck, inactiveTruck],
    'month',
    '2026-09-15',
    ['2026-09']
  );

  const inactiveData = monthResult.trucks.find(t => t.truckId === 't2');
  assert.ok(inactiveData);
  assert.equal(inactiveData.totals.tripCount, 0);
  assert.equal(inactiveData.totals.driverPaySatang, 0);
  assert.equal(inactiveData.totals.fuelCostSatang, 0);
  assert.equal(inactiveData.totals.totalCostSatang, 0);
  assert.equal(inactiveData.buckets.length, 1);
  assert.equal(inactiveData.buckets[0].tripCount, 0);
});

test('buildTruckAnalytics: validation rejects invalid period, today, and months parameters', () => {
  const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>();

  // Invalid periods
  assert.throws(
    () => buildTruckAnalytics(recordsByMonth, [], 'week' as any, '2026-09-15', ['2026-09']),
    /INVALID_PERIOD/
  );
  assert.throws(
    () => buildTruckAnalytics(recordsByMonth, [], '' as any, '2026-09-15', ['2026-09']),
    /INVALID_PERIOD/
  );
  assert.throws(
    () => buildTruckAnalytics(recordsByMonth, [], null as any, '2026-09-15', ['2026-09']),
    /INVALID_PERIOD/
  );

  // Invalid today format
  assert.throws(
    () => buildTruckAnalytics(recordsByMonth, [], 'month', '2026-9-15', ['2026-09']),
    /INVALID_TODAY/
  );
  assert.throws(
    () => buildTruckAnalytics(recordsByMonth, [], 'month', '2026/09/15', ['2026-09']),
    /INVALID_TODAY/
  );
  assert.throws(
    () => buildTruckAnalytics(recordsByMonth, [], 'month', '' as any, ['2026-09']),
    /INVALID_TODAY/
  );
  assert.throws(
    () => buildTruckAnalytics(recordsByMonth, [], 'month', null as any, ['2026-09']),
    /INVALID_TODAY/
  );

  // Invalid months
  assert.throws(
    () => buildTruckAnalytics(recordsByMonth, [], 'month', '2026-09-15', null as any),
    /INVALID_MONTHS/
  );
  assert.throws(
    () => buildTruckAnalytics(recordsByMonth, [], 'month', '2026-09-15', '2026-09' as any),
    /INVALID_MONTHS/
  );
});

test('buildTruckAnalytics: input immutability', () => {
  const truck = createMockTruck('t1', '70-1111', 'สมชาย');
  const record = createMockDailyRecord('2026-09-10', 't1', [createMockTrip(1, 50000)], 40000);
  const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>([
    ['2026-09', [record]]
  ]);
  const trucks = [truck];
  const months = ['2026-09'];

  const trucksJsonBefore = JSON.stringify(trucks);
  const recordJsonBefore = JSON.stringify(record);

  buildTruckAnalytics(recordsByMonth, trucks, 'month', '2026-09-15', months);

  assert.equal(JSON.stringify(trucks), trucksJsonBefore, 'trucks must not be mutated');
  assert.equal(JSON.stringify(record), recordJsonBefore, 'records must not be mutated');
  assert.equal(recordsByMonth.size, 1, 'recordsByMonth map size must not change');
});
