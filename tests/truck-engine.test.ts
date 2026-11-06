import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTruckRecordTotals, buildTruckMonthlyReport } from '../src/lib/truck/engine';
import { buildTruckAnalytics } from '../src/lib/truck/analytics';
import { createTruckReportPdf } from '../src/lib/server/truck-pdf';
import {
  TruckDoc,
  TruckTripItem,
  TruckDailyRecordDoc,
  TruckMonthlyReport
} from '../src/lib/truck/types';

function createMockTruck(truckId: string, plateNumber: string, driverName: string): TruckDoc {
  return {
    truckId,
    plateNumber,
    driverName,
    notes: '',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  };
}

function createMockRecord(
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

test('calculateTruckRecordTotals sums satang amounts precisely and counts trips', () => {
  const trips: TruckTripItem[] = [
    {
      tripIndex: 1,
      fromLocation: 'ท่าเรือคลองเตย',
      destinationMode: 'DEST_1',
      destinationId: 'dest1',
      destinationName: 'โรงงานบางพลี',
      driverPaySatang: 65050, // 650.50 THB
      note: 'เที่ยวเช้า'
    },
    {
      tripIndex: 2,
      fromLocation: 'โรงงานบางพลี',
      destinationMode: '__OTHER__',
      destinationId: null,
      destinationName: 'คลังสินค้าอยุธยา',
      driverPaySatang: 80025, // 800.25 THB
      note: 'เที่ยวบ่าย'
    }
  ];

  const fuelCostSatang = 150000; // 1,500.00 THB
  const result = calculateTruckRecordTotals(trips, fuelCostSatang);

  assert.equal(result.tripCount, 2);
  assert.equal(result.totalDriverPaySatang, 145075); // 650.50 + 800.25 = 1450.75 THB
});

test('calculateTruckRecordTotals validates integer satang boundaries and throws on negative or invalid numbers', () => {
  const invalidTrip: TruckTripItem = {
    tripIndex: 1,
    fromLocation: 'A',
    destinationMode: 'DEST_1',
    destinationName: 'B',
    driverPaySatang: -100,
    note: ''
  };

  assert.throws(
    () => calculateTruckRecordTotals([invalidTrip], 50000),
    /INVALID_MONEY/
  );

  const floatTrip: TruckTripItem = {
    tripIndex: 1,
    fromLocation: 'A',
    destinationMode: 'DEST_1',
    destinationName: 'B',
    driverPaySatang: 650.5, // Not integer satang!
    note: ''
  };

  assert.throws(
    () => calculateTruckRecordTotals([floatTrip], 50000),
    /INVALID_MONEY/
  );

  assert.throws(
    () => calculateTruckRecordTotals([], -1),
    /INVALID_MONEY/
  );
});

test('buildTruckMonthlyReport aggregates totals, per-truck metrics and sorts records descending by date', () => {
  const truck1 = createMockTruck('truck1', '70-1234', 'สมชาย');
  const truck2 = createMockTruck('truck2', '70-5678', 'วิชัย');
  const trucks = [truck1, truck2];

  const tripsDay1: TruckTripItem[] = [
    {
      tripIndex: 1,
      fromLocation: 'แพบางบอน',
      destinationMode: 'DEST_1',
      destinationId: 'dest1',
      destinationName: 'ตลาดไท',
      driverPaySatang: 50000,
      note: ''
    }
  ];

  const tripsDay2: TruckTripItem[] = [
    {
      tripIndex: 1,
      fromLocation: 'แพบางบอน',
      destinationMode: 'DEST_1',
      destinationId: 'dest1',
      destinationName: 'ตลาดไท',
      driverPaySatang: 50000,
      note: ''
    },
    {
      tripIndex: 2,
      fromLocation: 'ตลาดไท',
      destinationMode: 'DEST_2',
      destinationId: 'dest2',
      destinationName: 'สระบุรี',
      driverPaySatang: 70000,
      note: ''
    }
  ];

  const record1 = createMockRecord('2026-09-02', 'truck1', tripsDay1, 80000);
  const record2 = createMockRecord('2026-09-15', 'truck2', tripsDay2, 120000);
  const record3 = createMockRecord('2026-09-10', 'truck1', tripsDay1, 60000);

  const records = [record1, record2, record3];
  const originalRecordsJson = JSON.stringify(records);

  const report = buildTruckMonthlyReport(records, trucks, '2026-09');

  // Input immutability
  assert.equal(JSON.stringify(records), originalRecordsJson);

  // Month key
  assert.equal(report.monthKey, '2026-09');

  // Report totals
  assert.equal(report.totals.totalTrips, 4);
  assert.equal(report.totals.totalDriverPaySatang, 220000); // 50000 + 120000 + 50000 = 220000
  assert.equal(report.totals.totalFuelCostSatang, 260000); // 80000 + 120000 + 60000 = 260000
  assert.equal(report.totals.totalCostSatang, 480000); // 220000 + 260000 = 480000
  assert.equal(report.totals.activeTruckCount, 2);

  // Per truck metrics
  const rowTruck1 = report.perTruck.find(t => t.truckId === 'truck1');
  assert.ok(rowTruck1);
  assert.equal(rowTruck1.tripCount, 2);
  assert.equal(rowTruck1.totalDriverPaySatang, 100000);
  assert.equal(rowTruck1.totalFuelCostSatang, 140000);

  const rowTruck2 = report.perTruck.find(t => t.truckId === 'truck2');
  assert.ok(rowTruck2);
  assert.equal(rowTruck2.tripCount, 2);
  assert.equal(rowTruck2.totalDriverPaySatang, 120000);
  assert.equal(rowTruck2.totalFuelCostSatang, 120000);

  // Sorted records descending by date
  assert.equal(report.records[0].dateKey, '2026-09-15');
  assert.equal(report.records[1].dateKey, '2026-09-10');
  assert.equal(report.records[2].dateKey, '2026-09-02');
});

test('buildTruckAnalytics handles day, month, and year periods and keeps truck metrics separated', () => {
  const truck1 = createMockTruck('truck1', '70-1234', 'สมชาย');
  const truck2 = createMockTruck('truck2', '70-5678', 'วิชัย');
  const trucks = [truck1, truck2];

  const trips: TruckTripItem[] = [
    {
      tripIndex: 1,
      fromLocation: 'A',
      destinationMode: 'DEST_1',
      destinationName: 'B',
      driverPaySatang: 50000,
      note: ''
    }
  ];

  const record1 = createMockRecord('2026-09-02', 'truck1', trips, 60000);
  const record2 = createMockRecord('2026-09-05', 'truck2', trips, 40000);
  const record3 = createMockRecord('2026-10-01', 'truck1', trips, 50000);

  const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>([
    ['2026-09', [record1, record2]],
    ['2026-10', [record3]]
  ]);

  // Test 'day' period
  const dayAnalytics = buildTruckAnalytics(
    recordsByMonth,
    trucks,
    'day',
    '2026-10-05',
    ['2026-09', '2026-10']
  );

  assert.equal(dayAnalytics.period, 'day');
  assert.equal(dayAnalytics.totals.tripCount, 3);
  assert.equal(dayAnalytics.totals.driverPaySatang, 150000);
  assert.equal(dayAnalytics.totals.fuelCostSatang, 150000);
  assert.equal(dayAnalytics.totals.totalCostSatang, 300000);

  // Buckets for day
  const bucketSep02 = dayAnalytics.buckets.find(b => b.key === '2026-09-02');
  assert.ok(bucketSep02);
  assert.equal(bucketSep02.tripCount, 1);
  assert.equal(bucketSep02.driverPaySatang, 50000);
  assert.equal(bucketSep02.fuelCostSatang, 60000);

  // Test 'month' period with empty month zero-fill
  const monthAnalytics = buildTruckAnalytics(
    recordsByMonth,
    trucks,
    'month',
    '2026-10-05',
    ['2026-08', '2026-09', '2026-10']
  );

  assert.equal(monthAnalytics.period, 'month');
  assert.equal(monthAnalytics.buckets.length, 3);
  const bucketAug = monthAnalytics.buckets.find(b => b.key === '2026-08');
  assert.ok(bucketAug);
  assert.equal(bucketAug.tripCount, 0);
  assert.equal(bucketAug.driverPaySatang, 0);

  const bucketSep = monthAnalytics.buckets.find(b => b.key === '2026-09');
  assert.ok(bucketSep);
  assert.equal(bucketSep.tripCount, 2);
  assert.equal(bucketSep.driverPaySatang, 100000);
  assert.equal(bucketSep.fuelCostSatang, 100000);

  // Test 'year' period
  const yearAnalytics = buildTruckAnalytics(
    recordsByMonth,
    trucks,
    'year',
    '2026-10-05',
    ['2026-09', '2026-10']
  );

  assert.equal(yearAnalytics.period, 'year');
  const bucketYear = yearAnalytics.buckets.find(b => b.key === '2026');
  assert.ok(bucketYear);
  assert.equal(bucketYear.tripCount, 3);
  assert.equal(bucketYear.totalCostSatang, 300000);
});

test('createTruckReportPdf produces a valid PDF buffer with %PDF header and does not mutate report', async () => {
  const truck1 = createMockTruck('truck1', '70-1234', 'สมชาย');
  const trucks = [truck1];

  const trips: TruckTripItem[] = [
    {
      tripIndex: 1,
      fromLocation: 'ต้นทางบางบอน',
      destinationMode: 'DEST_1',
      destinationName: 'ปลายทางบางพลี',
      driverPaySatang: 65000,
      note: 'บิล #101'
    }
  ];

  const record = createMockRecord('2026-09-02', 'truck1', trips, 80000);
  const report = buildTruckMonthlyReport([record], trucks, '2026-09');
  const originalReportJson = JSON.stringify(report);

  const pdfBuffer = await createTruckReportPdf(report, 'หจก. พี.พิชญา ทรานสปอร์ต');

  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 500);
  assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
  assert.equal(JSON.stringify(report), originalReportJson, 'PDF generator must not mutate report object');

  // Test with truck filter
  const filteredPdf = await createTruckReportPdf(report, 'หจก. พี.พิชญา ทรานสปอร์ต', 'truck1');
  assert.ok(Buffer.isBuffer(filteredPdf));
  assert.equal(filteredPdf.subarray(0, 4).toString(), '%PDF');
});
