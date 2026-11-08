import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { GET as getReports } from '../src/app/api/truck/reports/route';
import { GET as getAnalytics } from '../src/app/api/truck/reports/analytics/route';
import { GET as getExport } from '../src/app/api/truck/reports/export/route';

interface MockDbSetup {
  docs: Map<string, any>;
  reads: string[];
}

function setupMockDatabase(): MockDbSetup {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const docs = new Map<string, any>();
  const reads: string[] = [];

  const createRef = (docPath: string): any => ({
    path: docPath,
    id: docPath.split('/').pop() || '',
    collection: (subName: string) => createRef(`${docPath}/${subName}`),
    doc: (subId?: string) => createRef(subId ? `${docPath}/${subId}` : `${docPath}/auto-${Math.random().toString(36).slice(2, 8)}`),
    get: async () => {
      reads.push(docPath);
      const isCollection = !docs.has(docPath) && Array.from(docs.keys()).some(k => k.startsWith(`${docPath}/`));
      if (isCollection) {
        const prefix = `${docPath}/`;
        const matched = Array.from(docs.entries())
          .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
          .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v, exists: true }));
        return {
          docs: matched,
          size: matched.length,
          empty: matched.length === 0
        };
      }
      return {
        exists: docs.has(docPath),
        id: docPath.split('/').pop()!,
        data: () => docs.get(docPath)
      };
    }
  });

  globals.adminDb = {
    collection: (name: string) => createRef(name),
    doc: (name: string) => createRef(name)
  };

  return { docs, reads };
}

test('Saved sheet history includes open and unpriced trips while accounting totals count completed trips only', async () => {
  const { docs } = setupMockDatabase();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const recordId = '2026-11-08_truck-1';
  docs.set(`${shop}/trucks/truck-1`, { plateNumber: '89-1924', status: 'ACTIVE' });
  const trips = [
    { tripId: 'open', tripIndex: 1, status: 'OPEN', departureDate: '2026-11-08', arrivalDate: null, driverPaySatang: 20000 },
    { tripId: 'pending', tripIndex: 2, status: 'OPEN', departureDate: '2026-11-08', arrivalDate: null, driverPaySatang: null },
    { tripId: 'completed', tripIndex: 3, status: 'COMPLETED', departureDate: '2026-11-08', arrivalDate: '2026-11-08', driverPaySatang: 20000 }
  ];
  docs.set(`${shop}/truckMonths/2026-11`, { monthKey: '2026-11' });
  docs.set(`${shop}/truckMonths/2026-11/records/${recordId}`, { recordId, dateKey: '2026-11-08', monthKey: '2026-11', truckId: 'truck-1', plateNumberSnapshot: '89-1924', trips, photos: [], revision: 7, fuelCostSatang: 0, totalDriverPaySatang: 40000, tripCount: 3 });
  for (const trip of trips) docs.set(`${shop}/truckTrips/${trip.tripId}`, { ...trip, recordId, truckId: 'truck-1' });
  const response = await getReports(new NextRequest('http://localhost/api/truck/reports?month=2026-11'));
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.savedRecords.length, 1);
  assert.equal(data.savedRecords[0].revision, 7);
  assert.equal(data.savedRecords[0].trips.length, 3);
  assert.equal(data.savedRecords[0].trips[1].driverPaySatang, null);
  assert.equal(data.totals.totalTrips, 1);
  assert.equal(data.totals.totalDriverPaySatang, 20000);
  const filtered = await getReports(new NextRequest('http://localhost/api/truck/reports?month=2026-11&truckId=other'));
  assert.equal((await filtered.json()).data.savedRecords.length, 0);
  const otherMonth = await getReports(new NextRequest('http://localhost/api/truck/reports?month=2026-10'));
  assert.equal((await otherMonth.json()).data.savedRecords.length, 0);
});

test('GET /api/truck/reports?month=YYYY-MM returns monthly totals, perTruck metrics, and sorted records', async () => {
  const { docs } = setupMockDatabase();
  const shopId = process.env.SHOP_ID || 'main';

  // Seed trucks
  docs.set(`shops/${shopId}/trucks/truck-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });
  docs.set(`shops/${shopId}/trucks/truck-2`, {
    plateNumber: '70-2222',
    driverName: 'วิชัย มั่นคง',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });

  // Seed truck records for 2026-10
  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-02_truck-1`, {
    recordId: '2026-10-02_truck-1',
    dateKey: '2026-10-02',
    monthKey: '2026-10',
    truckId: 'truck-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 120000, // 1,200.00 THB
    totalDriverPaySatang: 50000, // 500.00 THB
    tripCount: 1,
    trips: [
      {
        tripIndex: 1,
        pricingVersion: 3,
        billingPricingMode: 'PER_TRIP',
        fromLocation: 'โรงโม่หินสระบุรี',
        destinationMode: 'DEST_1',
        destinationId: 'dest-1',
        destinationName: 'ไซต์งานบางนา',
        driverPaySatang: 50000,
        note: 'เที่ยวเช้า'
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-02T08:00:00.000Z',
    updatedAt: '2026-10-02T17:00:00.000Z',
    updatedBy: 'tester'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-15_truck-2`, {
    recordId: '2026-10-15_truck-2',
    dateKey: '2026-10-15',
    monthKey: '2026-10',
    truckId: 'truck-2',
    plateNumberSnapshot: '70-2222',
    driverNameSnapshot: 'วิชัย มั่นคง',
    fuelCostSatang: 80000, // 800.00 THB
    totalDriverPaySatang: 140000, // 1,400.00 THB
    tripCount: 2,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'บ่อทรายอยุธยา',
        destinationMode: 'DEST_2',
        destinationId: 'dest-2',
        destinationName: 'แพลนท์ปูนพระราม 2',
        driverPaySatang: 70000,
        note: 'เที่ยว 1'
      },
      {
        tripIndex: 2,
        fromLocation: 'แพลนท์ปูนพระราม 2',
        destinationMode: 'DEST_2',
        destinationId: 'dest-2',
        destinationName: 'แพลนท์ปูนพระราม 2',
        driverPaySatang: 70000,
        note: 'เที่ยว 2'
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-15T08:00:00.000Z',
    updatedAt: '2026-10-15T17:00:00.000Z',
    updatedBy: 'tester'
  });

  // Execute GET /api/truck/reports?month=2026-10
  const req = new NextRequest('http://localhost/api/truck/reports?month=2026-10');
  const res = await getReports(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.data.monthKey, '2026-10');

  // Verify monthly totals
  assert.equal(json.data.totals.totalTrips, 3);
  assert.equal(json.data.totals.totalDriverPaySatang, 190000); // 50000 + 140000
  assert.equal(json.data.totals.totalFuelCostSatang, 0);
  assert.equal(json.data.totals.totalCostSatang, 190000);
  assert.equal(json.data.totals.activeTruckCount, 2);

  // Verify perTruck metrics
  assert.equal(json.data.perTruck.length, 2);
  const row1 = json.data.perTruck.find((r: any) => r.truckId === 'truck-1');
  assert.ok(row1);
  assert.equal(row1.tripCount, 1);
  assert.equal(row1.totalDriverPaySatang, 50000);
  assert.equal(row1.totalFuelCostSatang, 0);

  const row2 = json.data.perTruck.find((r: any) => r.truckId === 'truck-2');
  assert.ok(row2);
  assert.equal(row2.tripCount, 2);
  assert.equal(row2.totalDriverPaySatang, 140000);
  assert.equal(row2.totalFuelCostSatang, 0);

  // Verify records sorted descending by dateKey
  assert.equal(json.data.records.length, 2);
  assert.equal(json.data.records[0].dateKey, '2026-10-15');
  assert.equal(json.data.records[1].dateKey, '2026-10-02');
});

test('GET /api/truck/reports rejects missing or invalid month', async () => {
  setupMockDatabase();

  const missingReq = new NextRequest('http://localhost/api/truck/reports');
  const missingRes = await getReports(missingReq);
  assert.equal(missingRes.status, 400);
  const missingJson = await missingRes.json();
  assert.equal(missingJson.ok, false);
  assert.equal(missingJson.error.code, 'INVALID_MONTH');

  const invalidReq = new NextRequest('http://localhost/api/truck/reports?month=2026-999');
  const invalidRes = await getReports(invalidReq);
  assert.equal(invalidRes.status, 400);
  const invalidJson = await invalidRes.json();
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.error.code, 'INVALID_MONTH');
});

test('GET /api/truck/reports/analytics returns time series buckets for period=day, month, year', async () => {
  const { docs } = setupMockDatabase();
  const shopId = process.env.SHOP_ID || 'main';

  // Seed trucks
  docs.set(`shops/${shopId}/trucks/truck-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });

  // Seed records across months
  docs.set(`shops/${shopId}/truckMonths/2026-09/records/2026-09-10_truck-1`, {
    recordId: '2026-09-10_truck-1',
    dateKey: '2026-09-10',
    monthKey: '2026-09',
    truckId: 'truck-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 100000,
    totalDriverPaySatang: 60000,
    tripCount: 1,
    trips: [{ tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 60000, note: '' }],
    photos: [],
    revision: 1,
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T17:00:00.000Z',
    updatedBy: 'tester'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-05_truck-1`, {
    recordId: '2026-10-05_truck-1',
    dateKey: '2026-10-05',
    monthKey: '2026-10',
    truckId: 'truck-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 150000,
    totalDriverPaySatang: 90000,
    tripCount: 2,
    trips: [
      { tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 45000, note: '' },
      { tripIndex: 2, fromLocation: 'B', destinationMode: 'DEST_2', destinationName: 'C', driverPaySatang: 45000, note: '' }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-05T08:00:00.000Z',
    updatedAt: '2026-10-05T17:00:00.000Z',
    updatedBy: 'tester'
  });

  // 1. Period = day
  const dayReq = new NextRequest('http://localhost/api/truck/reports/analytics?period=day&month=2026-10');
  const dayRes = await getAnalytics(dayReq);
  assert.equal(dayRes.status, 200);
  const dayJson = await dayRes.json();
  assert.equal(dayJson.ok, true);
  assert.equal(dayJson.data.period, 'day');
  assert.equal(dayJson.data.totals.tripCount, 2);
  assert.equal(dayJson.data.totals.driverPaySatang, 90000);
  assert.equal(dayJson.data.totals.fuelCostSatang, 0);
  assert.equal(dayJson.data.totals.totalCostSatang, 90000);
  const dayBucket = dayJson.data.buckets.find((b: any) => b.key === '2026-10-05');
  assert.ok(dayBucket);
  assert.equal(dayBucket.tripCount, 2);

  // 2. Period = month
  const monthReq = new NextRequest('http://localhost/api/truck/reports/analytics?period=month&year=2026');
  const monthRes = await getAnalytics(monthReq);
  assert.equal(monthRes.status, 200);
  const monthJson = await monthRes.json();
  assert.equal(monthJson.ok, true);
  assert.equal(monthJson.data.period, 'month');
  assert.equal(monthJson.data.totals.tripCount, 3);
  assert.equal(monthJson.data.totals.driverPaySatang, 150000);
  assert.equal(monthJson.data.totals.fuelCostSatang, 0);
  assert.equal(monthJson.data.totals.totalCostSatang, 150000);
  const bucketSep = monthJson.data.buckets.find((b: any) => b.key === '2026-09');
  assert.ok(bucketSep);
  assert.equal(bucketSep.tripCount, 1);
  const bucketOct = monthJson.data.buckets.find((b: any) => b.key === '2026-10');
  assert.ok(bucketOct);
  assert.equal(bucketOct.tripCount, 2);

  // 3. Period = year
  const yearReq = new NextRequest('http://localhost/api/truck/reports/analytics?period=year&fromYear=2025&toYear=2026');
  const yearRes = await getAnalytics(yearReq);
  assert.equal(yearRes.status, 200);
  const yearJson = await yearRes.json();
  assert.equal(yearJson.ok, true);
  assert.equal(yearJson.data.period, 'year');
  const yearBucket2026 = yearJson.data.buckets.find((b: any) => b.key === '2026');
  assert.ok(yearBucket2026);
  assert.equal(yearBucket2026.tripCount, 3);
  assert.equal(yearBucket2026.totalCostSatang, 150000);
});

test('GET /api/truck/reports/export?month=YYYY-MM&format=pdf returns valid binary with %PDF header', async () => {
  const { docs } = setupMockDatabase();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/profile/truck`, {
    companyName: 'หจก. พี.พิชญา ทรานสปอร์ต'
  });

  docs.set(`shops/${shopId}/trucks/truck-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-02_truck-1`, {
    recordId: '2026-10-02_truck-1',
    dateKey: '2026-10-02',
    monthKey: '2026-10',
    truckId: 'truck-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 120000,
    totalDriverPaySatang: 50000,
    tripCount: 1,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'โรงโม่หินสระบุรี',
        destinationMode: 'DEST_1',
        destinationId: 'dest-1',
        destinationName: 'ไซต์งานบางนา',
        driverPaySatang: 50000,
        note: 'เที่ยวเช้า'
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-02T08:00:00.000Z',
    updatedAt: '2026-10-02T17:00:00.000Z',
    updatedBy: 'tester'
  });

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-10&format=pdf');
  const res = await getExport(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');
  assert.match(res.headers.get('Content-Disposition') || '', /truck-report-2026-10\.pdf/);

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  assert.ok(buffer.length > 500);
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
});

test('GET /api/truck/reports/export?month=YYYY-MM&format=csv returns UTF-8 BOM CSV with Thai headers and Baht amounts', async () => {
  const { docs } = setupMockDatabase();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-02_truck-1`, {
    recordId: '2026-10-02_truck-1',
    dateKey: '2026-10-02',
    monthKey: '2026-10',
    truckId: 'truck-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 125050, // 1,250.50 THB
    totalDriverPaySatang: 65050, // 650.50 THB
    tripCount: 1,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'โรงโม่หินสระบุรี',
        destinationMode: 'DEST_1',
        destinationId: 'dest-1',
        destinationName: 'ไซต์งานบางนา',
        driverPaySatang: 65050,
        billingSatang: 120000,
        weightKg: 12500,
        billable: true,
        note: 'เที่ยวเช้า หินคลุก'
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-02T08:00:00.000Z',
    updatedAt: '2026-10-02T17:00:00.000Z',
    updatedBy: 'tester'
  });

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-10&format=csv');
  const res = await getExport(req);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type') || '', /text\/csv/);
  assert.match(res.headers.get('Content-Disposition') || '', /truck-report-2026-10\.csv/);

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  // Verify UTF-8 BOM bytes (EF BB BF)
  assert.equal(buffer.subarray(0, 3).toString('hex'), 'efbbbf', 'CSV must start with UTF-8 BOM bytes (EF BB BF)');

  const text = buffer.toString('utf-8');
  assert.ok(text.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM character');

  // Verify Thai column headers
  assert.ok(text.includes('วันที่'));
  assert.ok(text.includes('ทะเบียนรถ'));
  assert.ok(text.includes('คนขับ'));
  assert.ok(text.includes('เที่ยวที่'));
  assert.ok(text.includes('ต้นทาง'));
  assert.ok(text.includes('ปลายทาง'));
  assert.ok(text.includes('ค่าเที่ยว (บาท)'));
  assert.ok(!text.includes('ค่าน้ำมัน (บาท)'));
  assert.ok(text.includes('หมายเหตุ'));
  assert.ok(text.includes('น้ำหนัก (ตัน)'));
  assert.ok(text.includes('ยอดเรียกเก็บ (บาท)'));

  // Verify satang converted to formatted Baht (65050 satang -> "650.50", 125050 satang -> "1,250.50")
  assert.ok(text.includes('650.50'), 'Satang 65050 must be converted to 650.50 Baht');
  assert.ok(text.includes('12.500'), 'weight is exported as tons');
  assert.ok(text.includes('1,200.00'), 'the customer CSV charge equals the single flat rate');
  assert.ok(!text.includes('1,250.50'), 'Fuel is excluded');
  assert.ok(!text.includes('65050'), 'Raw satang 65050 must not appear in exported CSV');
  assert.ok(!text.includes('125050'), 'Raw satang 125050 must not appear in exported CSV');

  // Verify record content
  assert.ok(text.includes('2026-10-02'));
  assert.ok(text.includes('70-1111'));
  assert.ok(text.includes('สมชาย ใจดี'));
  assert.ok(text.includes('โรงโม่หินสระบุรี'));
  assert.ok(text.includes('ไซต์งานบางนา'));
  assert.ok(text.includes('เที่ยวเช้า หินคลุก'));
});

test('GET /api/truck/reports/export rejects invalid format or missing month', async () => {
  setupMockDatabase();

  const missingReq = new NextRequest('http://localhost/api/truck/reports/export');
  const missingRes = await getExport(missingReq);
  assert.equal(missingRes.status, 400);

  const invalidFormatReq = new NextRequest('http://localhost/api/truck/reports/export?month=2026-10&format=xlsx');
  const invalidFormatRes = await getExport(invalidFormatReq);
  assert.equal(invalidFormatRes.status, 400);
});

test('GET /api/truck/reports?month=YYYY-MM&truckId=xxx filters report to specific truck', async () => {
  const { docs } = setupMockDatabase();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });
  docs.set(`shops/${shopId}/trucks/truck-2`, {
    plateNumber: '70-2222',
    driverName: 'วิชัย มั่นคง',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-02_truck-1`, {
    recordId: '2026-10-02_truck-1',
    dateKey: '2026-10-02',
    monthKey: '2026-10',
    truckId: 'truck-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 120000,
    totalDriverPaySatang: 50000,
    tripCount: 1,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'โรงโม่หินสระบุรี',
        destinationMode: 'DEST_1',
        destinationId: 'dest-1',
        destinationName: 'ไซต์งานบางนา',
        driverPaySatang: 50000,
        note: 'เที่ยวเช้า'
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-02T08:00:00.000Z',
    updatedAt: '2026-10-02T17:00:00.000Z',
    updatedBy: 'tester'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-15_truck-2`, {
    recordId: '2026-10-15_truck-2',
    dateKey: '2026-10-15',
    monthKey: '2026-10',
    truckId: 'truck-2',
    plateNumberSnapshot: '70-2222',
    driverNameSnapshot: 'วิชัย มั่นคง',
    fuelCostSatang: 80000,
    totalDriverPaySatang: 140000,
    tripCount: 2,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'บ่อทรายอยุธยา',
        destinationMode: 'DEST_2',
        destinationId: 'dest-2',
        destinationName: 'แพลนท์ปูนพระราม 2',
        driverPaySatang: 70000,
        note: 'เที่ยว 1'
      },
      {
        tripIndex: 2,
        fromLocation: 'แพลนท์ปูนพระราม 2',
        destinationMode: 'DEST_2',
        destinationId: 'dest-2',
        destinationName: 'แพลนท์ปูนพระราม 2',
        driverPaySatang: 70000,
        note: 'เที่ยว 2'
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-15T08:00:00.000Z',
    updatedAt: '2026-10-15T17:00:00.000Z',
    updatedBy: 'tester'
  });

  const req = new NextRequest('http://localhost/api/truck/reports?month=2026-10&truckId=truck-1');
  const res = await getReports(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.data.perTruck.length, 1);
  assert.equal(json.data.perTruck[0].truckId, 'truck-1');
  assert.equal(json.data.records.length, 1);
  assert.equal(json.data.records[0].truckId, 'truck-1');
  assert.equal(json.data.totals.totalTrips, 1);
  assert.equal(json.data.totals.totalDriverPaySatang, 50000);
  assert.equal(json.data.totals.totalFuelCostSatang, 0);
});

test('GET /api/truck/reports?months=YYYY-MM,YYYY-MM reads multiple months concurrently', async () => {
  const { docs } = setupMockDatabase();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-09/records/2026-09-20_truck-1`, {
    recordId: '2026-09-20_truck-1',
    dateKey: '2026-09-20',
    monthKey: '2026-09',
    truckId: 'truck-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 100000,
    totalDriverPaySatang: 40000,
    tripCount: 1,
    trips: [{ tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 40000, note: '' }],
    photos: [],
    revision: 1,
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T17:00:00.000Z',
    updatedBy: 'tester'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-02_truck-1`, {
    recordId: '2026-10-02_truck-1',
    dateKey: '2026-10-02',
    monthKey: '2026-10',
    truckId: 'truck-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 120000,
    totalDriverPaySatang: 50000,
    tripCount: 1,
    trips: [{ tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 50000, note: '' }],
    photos: [],
    revision: 1,
    createdAt: '2026-10-02T08:00:00.000Z',
    updatedAt: '2026-10-02T17:00:00.000Z',
    updatedBy: 'tester'
  });

  const req = new NextRequest('http://localhost/api/truck/reports?months=2026-09,2026-10');
  const res = await getReports(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.data.records.length, 2);
  assert.equal(json.data.records[0].dateKey, '2026-10-02');
  assert.equal(json.data.records[1].dateKey, '2026-09-20');
  assert.equal(json.data.totals.totalTrips, 2);
  assert.equal(json.data.totals.totalDriverPaySatang, 90000);
});

test('GET /api/truck/reports/analytics rejects invalid period or malformed parameters', async () => {
  setupMockDatabase();

  const invalidPeriodReq = new NextRequest('http://localhost/api/truck/reports/analytics?period=quarter');
  const invalidPeriodRes = await getAnalytics(invalidPeriodReq);
  assert.equal(invalidPeriodRes.status, 400);
  const pJson = await invalidPeriodRes.json();
  assert.equal(pJson.error.code, 'INVALID_PERIOD');

  const invalidYearReq = new NextRequest('http://localhost/api/truck/reports/analytics?period=month&year=abcd');
  const invalidYearRes = await getAnalytics(invalidYearReq);
  assert.equal(invalidYearRes.status, 400);
  const yJson = await invalidYearRes.json();
  assert.equal(yJson.error.code, 'INVALID_YEAR');

  const rangeTooLargeReq = new NextRequest('http://localhost/api/truck/reports/analytics?period=year&fromYear=2015&toYear=2026');
  const rangeTooLargeRes = await getAnalytics(rangeTooLargeReq);
  assert.equal(rangeTooLargeRes.status, 400);
  const rJson = await rangeTooLargeRes.json();
  assert.equal(rJson.error.code, 'INVALID_YEAR');
});

test('GET /api/truck/reports/export?month=YYYY-MM&format=csv handles zero-trip fuel-only records and truckId filter', async () => {
  const { docs } = setupMockDatabase();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });
  docs.set(`shops/${shopId}/trucks/truck-2`, {
    plateNumber: '70-2222',
    driverName: 'วิชัย มั่นคง',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  });

  // truck-1 has 1 trip
  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-02_truck-1`, {
    recordId: '2026-10-02_truck-1',
    dateKey: '2026-10-02',
    monthKey: '2026-10',
    truckId: 'truck-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 120000,
    totalDriverPaySatang: 50000,
    tripCount: 1,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'โรงโม่หิน',
        destinationMode: 'DEST_1',
        destinationId: 'dest-1',
        destinationName: 'ไซต์งาน',
        driverPaySatang: 50000,
        note: ''
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-02T08:00:00.000Z',
    updatedAt: '2026-10-02T17:00:00.000Z',
    updatedBy: 'tester'
  });

  // truck-2 has 0 trips (only fuel cost)
  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-03_truck-2`, {
    recordId: '2026-10-03_truck-2',
    dateKey: '2026-10-03',
    monthKey: '2026-10',
    truckId: 'truck-2',
    plateNumberSnapshot: '70-2222',
    driverNameSnapshot: 'วิชัย มั่นคง',
    fuelCostSatang: 50000, // 500.00 THB
    totalDriverPaySatang: 0,
    tripCount: 0,
    trips: [],
    photos: [],
    revision: 1,
    createdAt: '2026-10-03T08:00:00.000Z',
    updatedAt: '2026-10-03T17:00:00.000Z',
    updatedBy: 'tester'
  });

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-10&format=csv&truckId=truck-2');
  const res = await getExport(req);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Disposition') || '', /truck-report-2026-10-truck-2\.csv/);

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  assert.equal(buffer.subarray(0, 3).toString('hex'), 'efbbbf');

  const text = buffer.toString('utf-8');
  assert.ok(!text.includes('70-2222'));
  assert.ok(!text.includes('วิชัย มั่นคง'));
  assert.ok(!text.includes('500.00'));
  assert.ok(!text.includes('70-1111'));
  assert.ok(!text.includes('สมชาย ใจดี'));
});
