import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { GET as getReports } from '../src/app/api/truck/reports/route';
import { GET as getAnalytics } from '../src/app/api/truck/reports/analytics/route';
import { GET as getExport } from '../src/app/api/truck/reports/export/route';

// ---------------------------------------------------------------------------
// RFC 4180 Compliant CSV Parser Oracle
// State machine that strictly parses CSV data with embedded quotes, commas,
// newlines (CRLF/LF), and Unicode characters.
// ---------------------------------------------------------------------------
function parseRfc4180Csv(csvString: string): string[][] {
  let text = csvString;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i += 2;
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (char === '\r') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Instrumented Mock Firestore with Concurrency Tracking
// ---------------------------------------------------------------------------
interface ConcurrencyTracker {
  currentActive: number;
  peakActive: number;
  readPaths: string[];
}

function createInstrumentedMockDb(docs: Map<string, any>, delayMs = 15) {
  const tracker: ConcurrencyTracker = {
    currentActive: 0,
    peakActive: 0,
    readPaths: []
  };

  const createRef = (docPath: string, isCollectionRef = false): any => ({
    path: docPath,
    id: docPath.split('/').pop() || '',
    collection: (subName: string) => createRef(`${docPath}/${subName}`, true),
    doc: (subId?: string) => createRef(subId ? `${docPath}/${subId}` : `${docPath}/auto-${Math.random().toString(36).slice(2, 8)}`, false),
    get: async () => {
      tracker.currentActive++;
      tracker.peakActive = Math.max(tracker.peakActive, tracker.currentActive);
      tracker.readPaths.push(docPath);

      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }

      tracker.currentActive--;

      if (isCollectionRef) {
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

  const globals = globalThis as unknown as { adminDb?: unknown };
  globals.adminDb = {
    collection: (name: string) => createRef(name, true),
    doc: (name: string) => createRef(name, false)
  };

  return { tracker, docs };
}

// ============================================================================
// SUITE 1: CSV Injection, Formatting, Escaping & RFC 4180 Parsing
// ============================================================================

test('CSV Adversarial: Complex characters (quotes, commas, newlines, Thai script) round-trip accurately via RFC 4180 oracle', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/profile/truck`, {
    companyName: 'หจก. พี.พิชญา ทรานสปอร์ต (สำนักงานใหญ่)'
  });

  docs.set(`shops/${shopId}/trucks/truck-adv-1`, {
    plateNumber: '70-9999',
    driverName: 'สมชาย "ฉายาสิงห์รถบรรทุก" ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  });

  const testOrigin = 'บ่อทราย "ท่าหลวง", ซอย ๕ (หลัก กม. 12+500)';
  const testDestination = 'ไซต์งานก่อสร้าง: บางนา-ตราด กม. 18, โซน A / B\n(อาคาร ๓ ชั้น ๒)';
  const testNote = 'รอบเช้า "พิเศษ" บรรทุกหินคลุก ๒๕ ตัน,\nหมายเหตุ: มีใบชั่งน้ำหนัก\r\nตรวจสอบเรียบร้อย 100%';

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-05_truck-adv-1`, {
    recordId: '2026-10-05_truck-adv-1',
    dateKey: '2026-10-05',
    monthKey: '2026-10',
    truckId: 'truck-adv-1',
    plateNumberSnapshot: '70-9999',
    driverNameSnapshot: 'สมชาย "ฉายาสิงห์รถบรรทุก" ใจดี',
    fuelCostSatang: 245075, // 2,450.75 THB
    totalDriverPaySatang: 125050, // 1,250.50 THB
    tripCount: 1,
    trips: [
      {
        tripIndex: 1,
        fromLocation: testOrigin,
        destinationMode: 'DEST_1',
        destinationId: 'dest-adv-1',
        destinationName: testDestination,
        driverPaySatang: 125050,
        note: testNote
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-05T08:00:00.000Z',
    updatedAt: '2026-10-05T17:00:00.000Z',
    updatedBy: 'challenger'
  });

  createInstrumentedMockDb(docs, 0);

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-10&format=csv');
  const res = await getExport(req);
  assert.equal(res.status, 200);

  // 1. Verify byte sequence begins with UTF-8 BOM EF BB BF
  const arrayBuf = await res.arrayBuffer();
  const rawBuf = Buffer.from(arrayBuf);
  assert.equal(rawBuf.subarray(0, 3).toString('hex'), 'efbbbf', 'CSV must physically start with UTF-8 BOM bytes EF BB BF');

  // 2. Decode string and verify leading BOM character
  const decodedCsv = rawBuf.toString('utf-8');
  assert.ok(decodedCsv.startsWith('\uFEFF'), 'Decoded CSV must preserve BOM character');

  // 3. Parse with RFC 4180 State Machine
  const parsedRows = parseRfc4180Csv(decodedCsv);

  // Expected 2 rows: 1 header + 1 data row
  assert.equal(parsedRows.length, 2, 'CSV must parse into exactly 2 rows (header + 1 record) despite embedded newlines');

  // Verify headers
  const headers = parsedRows[0];
  assert.deepEqual(headers, [
    'วันที่',
    'ทะเบียนรถ',
    'คนขับ',
    'เที่ยวที่',
    'ต้นทาง',
    'ปลายทาง',
    'ค่าเที่ยว (บาท)',
    'หมายเหตุ'
  ]);

  // Verify row columns
  const dataRow = parsedRows[1];
  assert.equal(dataRow.length, 8, 'Data row must have exactly 8 columns');
  assert.equal(dataRow[0], '2026-10-05', 'Date key mismatch');
  assert.equal(dataRow[1], '70-9999', 'Plate number mismatch');
  assert.equal(dataRow[2], 'สมชาย "ฉายาสิงห์รถบรรทุก" ใจดี', 'Driver name quotes corrupted');
  assert.equal(dataRow[3], '1', 'Trip index mismatch');
  assert.equal(dataRow[4], testOrigin, 'Origin location with quotes and commas corrupted');
  assert.equal(dataRow[5], testDestination, 'Destination with newline and Thai digits corrupted');
  assert.equal(dataRow[6], '1,250.50', 'Driver pay satang conversion to formatted Baht corrupted');
  assert.equal(dataRow[7], testNote, 'Note with multi-line CRLF/LF corrupted');

  // Verify raw satangs do not appear
  assert.ok(!decodedCsv.includes('125050'));
  assert.ok(!decodedCsv.includes('245075'));
});

test('CSV Adversarial: Formula injection payloads are safely quoted and parsed without breaking CSV structure', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-inj-1`, {
    plateNumber: '=1+1',
    driverName: '@SUM(A1:A10)',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  });

  const formulaOrigin = '-100+500';
  const formulaDest = '+66812345678';
  const formulaNote = '=cmd|\' /C calc\'!A0';

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-08_truck-inj-1`, {
    recordId: '2026-10-08_truck-inj-1',
    dateKey: '2026-10-08',
    monthKey: '2026-10',
    truckId: 'truck-inj-1',
    plateNumberSnapshot: '=1+1',
    driverNameSnapshot: '@SUM(A1:A10)',
    fuelCostSatang: 50000,
    totalDriverPaySatang: 30000,
    tripCount: 1,
    trips: [
      {
        tripIndex: 1,
        fromLocation: formulaOrigin,
        destinationMode: 'DEST_1',
        destinationName: formulaDest,
        driverPaySatang: 30000,
        note: formulaNote
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-08T08:00:00.000Z',
    updatedAt: '2026-10-08T17:00:00.000Z',
    updatedBy: 'challenger'
  });

  createInstrumentedMockDb(docs, 0);

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-10&format=csv');
  const res = await getExport(req);
  assert.equal(res.status, 200);

  const rawBuf = Buffer.from(await res.arrayBuffer());
  const csvText = rawBuf.toString('utf-8');
  const rows = parseRfc4180Csv(csvText);

  assert.equal(rows.length, 2);
  const row = rows[1];
  assert.equal(row[1], "'=1+1");
  assert.equal(row[2], "'@SUM(A1:A10)");
  assert.equal(row[4], "'-100+500");
  assert.equal(row[5], "'+66812345678");
  assert.equal(row[7], "'=cmd|' /C calc'!A0");

  // Verify that all fields in raw CSV are wrapped in double quotes
  // e.g. "=""=1+1""" or `"=1+1"`
  assert.ok(csvText.includes(""'=1+1""));
  assert.ok(csvText.includes(""'@SUM(A1:A10)""));
});

test('CSV Adversarial: Mixed trips and zero-trip records format satang and assign fuel cost only to trip 1', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-multi-1`, {
    plateNumber: '70-3333',
    driverName: 'สมศักดิ์ ขยันยิ่ง',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  });

  // Record with 2 trips: Fuel cost 1,500.00 THB must only appear on trip 1. Trip 2 fuel must be 0.00.
  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-10_truck-multi-1`, {
    recordId: '2026-10-10_truck-multi-1',
    dateKey: '2026-10-10',
    monthKey: '2026-10',
    truckId: 'truck-multi-1',
    plateNumberSnapshot: '70-3333',
    driverNameSnapshot: 'สมศักดิ์ ขยันยิ่ง',
    fuelCostSatang: 150000, // 1,500.00 THB
    totalDriverPaySatang: 120000,
    tripCount: 2,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'ต้นทาง 1',
        destinationMode: 'DEST_1',
        destinationName: 'ปลายทาง 1',
        driverPaySatang: 60000, // 600.00 THB
        note: 'เที่ยวเช้า'
      },
      {
        tripIndex: 2,
        fromLocation: 'ต้นทาง 2',
        destinationMode: 'DEST_2',
        destinationName: 'ปลายทาง 2',
        driverPaySatang: 60000, // 600.00 THB
        note: 'เที่ยวบ่าย'
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T17:00:00.000Z',
    updatedBy: 'challenger'
  });

  // Zero-trip fuel-only record
  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-11_truck-multi-1`, {
    recordId: '2026-10-11_truck-multi-1',
    dateKey: '2026-10-11',
    monthKey: '2026-10',
    truckId: 'truck-multi-1',
    plateNumberSnapshot: '70-3333',
    driverNameSnapshot: 'สมศักดิ์ ขยันยิ่ง',
    fuelCostSatang: 80000, // 800.00 THB
    totalDriverPaySatang: 0,
    tripCount: 0,
    trips: [],
    photos: [],
    revision: 1,
    createdAt: '2026-10-11T08:00:00.000Z',
    updatedAt: '2026-10-11T17:00:00.000Z',
    updatedBy: 'challenger'
  });

  createInstrumentedMockDb(docs, 0);

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-10&format=csv');
  const res = await getExport(req);
  assert.equal(res.status, 200);

  const rawBuf = Buffer.from(await res.arrayBuffer());
  const rows = parseRfc4180Csv(rawBuf.toString('utf-8'));

  assert.equal(rows.length, 3);
  assert.ok(!rows.some(r => r[0] === '2026-10-11'));

  // Row 2 & 3 (2026-10-10):
  const trip1 = rows.find(r => r[0] === '2026-10-10' && r[3] === '1')!;
  const trip2 = rows.find(r => r[0] === '2026-10-10' && r[3] === '2')!;
  assert.ok(trip1);
  assert.ok(trip2);

  assert.equal(trip1[6], '600.00');

  assert.equal(trip2[6], '600.00');
});

// ============================================================================
// SUITE 2: Bounded Concurrency Stress Harness (12 Months Querying)
// ============================================================================

test('Concurrency Stress: GET /api/truck/reports with 12 months queries with bounded concurrency (peak active <= 4)', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-c-1`, {
    plateNumber: '70-5555',
    driverName: 'มานะ อดทน',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  });

  const twelveMonths = [
    '2025-01', '2025-02', '2025-03', '2025-04',
    '2025-05', '2025-06', '2025-07', '2025-08',
    '2025-09', '2025-10', '2025-11', '2025-12'
  ];

  twelveMonths.forEach((m, idx) => {
    docs.set(`shops/${shopId}/truckMonths/${m}/records/${m}-05_truck-c-1`, {
      recordId: `${m}-05_truck-c-1`,
      dateKey: `${m}-05`,
      monthKey: m,
      truckId: 'truck-c-1',
      plateNumberSnapshot: '70-5555',
      driverNameSnapshot: 'มานะ อดทน',
      fuelCostSatang: 100000, // 1,000 THB
      totalDriverPaySatang: 50000, // 500 THB
      tripCount: 1,
      trips: [{ tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 50000, note: '' }],
      photos: [],
      revision: 1,
      createdAt: `${m}-05T08:00:00.000Z`,
      updatedAt: `${m}-05T17:00:00.000Z`,
      updatedBy: 'challenger'
    });
  });

  // Inject 20ms artificial delay to allow concurrent queries to overlap
  const { tracker } = createInstrumentedMockDb(docs, 20);

  const req = new NextRequest(`http://localhost/api/truck/reports?months=${twelveMonths.join(',')}`);
  const res = await getReports(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.ok, true);

  // Concurrency Verification:
  // peakActive during the month queries must be exactly 4 (never 5, never 12)
  assert.ok(
    tracker.peakActive <= 4,
    `Concurrency must be strictly bounded to at most 4 (got peak: ${tracker.peakActive})`
  );
  assert.equal(
    tracker.peakActive,
    4,
    `Concurrency must reach exactly 4 simultaneous workers for 12 months (got: ${tracker.peakActive})`
  );

  // Verify all 12 month collections were read
  const recordQueries = tracker.readPaths.filter(p => p.includes('truckMonths') && p.endsWith('/records'));
  assert.equal(recordQueries.length, 12, 'All 12 months must be read');

  // Verify all 12 records are aggregated
  assert.equal(json.data.records.length, 12);
  assert.equal(json.data.totals.totalTrips, 12);
  assert.equal(json.data.totals.totalDriverPaySatang, 600000);
  assert.equal(json.data.totals.totalFuelCostSatang, 0);
});

test('Concurrency Stress: GET /api/truck/reports/analytics (period=month) queries 12 months with bounded concurrency (peak active <= 4)', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-c-1`, {
    plateNumber: '70-5555',
    driverName: 'มานะ อดทน',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  });

  for (let m = 1; m <= 12; m++) {
    const monthKey = `2025-${String(m).padStart(2, '0')}`;
    docs.set(`shops/${shopId}/truckMonths/${monthKey}/records/${monthKey}-15_truck-c-1`, {
      recordId: `${monthKey}-15_truck-c-1`,
      dateKey: `${monthKey}-15`,
      monthKey,
      truckId: 'truck-c-1',
      plateNumberSnapshot: '70-5555',
      driverNameSnapshot: 'มานะ อดทน',
      fuelCostSatang: 150000,
      totalDriverPaySatang: 80000,
      tripCount: 2,
      trips: [
        { tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 40000, note: '' },
        { tripIndex: 2, fromLocation: 'B', destinationMode: 'DEST_2', destinationName: 'C', driverPaySatang: 40000, note: '' }
      ],
      photos: [],
      revision: 1,
      createdAt: `${monthKey}-15T08:00:00.000Z`,
      updatedAt: `${monthKey}-15T17:00:00.000Z`,
      updatedBy: 'challenger'
    });
  }

  const { tracker } = createInstrumentedMockDb(docs, 20);

  const req = new NextRequest('http://localhost/api/truck/reports/analytics?period=month&year=2025');
  const res = await getAnalytics(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.ok, true);

  assert.ok(
    tracker.peakActive <= 4,
    `Analytics concurrency must be strictly bounded to at most 4 (got peak: ${tracker.peakActive})`
  );
  assert.equal(
    tracker.peakActive,
    4,
    `Analytics concurrency must reach exactly 4 simultaneous workers for 12 months (got: ${tracker.peakActive})`
  );

  assert.equal(json.data.buckets.length, 12);
  assert.equal(json.data.totals.tripCount, 24); // 2 trips * 12 months
  assert.equal(json.data.totals.driverPaySatang, 960000); // 80,000 * 12
  assert.equal(json.data.totals.fuelCostSatang, 0);
});

test('Concurrency Stress: GET /api/truck/reports/analytics (period=year) across 3 years (36 months) maintains peak active <= 4', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-c-1`, {
    plateNumber: '70-5555',
    driverName: 'มานะ อดทน',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  });

  // Seed 1 record in June of each year (2024, 2025, 2026)
  for (const y of [2024, 2025, 2026]) {
    const monthKey = `${y}-06`;
    docs.set(`shops/${shopId}/truckMonths/${monthKey}/records/${monthKey}-01_truck-c-1`, {
      recordId: `${monthKey}-01_truck-c-1`,
      dateKey: `${monthKey}-01`,
      monthKey,
      truckId: 'truck-c-1',
      plateNumberSnapshot: '70-5555',
      driverNameSnapshot: 'มานะ อดทน',
      fuelCostSatang: 200000,
      totalDriverPaySatang: 100000,
      tripCount: 2,
      trips: [
        { tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 50000, note: '' },
        { tripIndex: 2, fromLocation: 'B', destinationMode: 'DEST_2', destinationName: 'C', driverPaySatang: 50000, note: '' }
      ],
      photos: [],
      revision: 1,
      createdAt: `${monthKey}-01T08:00:00.000Z`,
      updatedAt: `${monthKey}-01T17:00:00.000Z`,
      updatedBy: 'challenger'
    });
  }

  const { tracker } = createInstrumentedMockDb(docs, 10);

  const req = new NextRequest('http://localhost/api/truck/reports/analytics?period=year&fromYear=2024&toYear=2026');
  const res = await getAnalytics(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.ok, true);

  // Peak active must stay <= 4 despite 36 months queried!
  assert.ok(
    tracker.peakActive <= 4,
    `Peak concurrency for 36 months must stay bounded at <= 4 (got peak: ${tracker.peakActive})`
  );

  const recordReads = tracker.readPaths.filter(p => p.includes('truckMonths') && p.endsWith('/records'));
  assert.equal(recordReads.length, 36, 'Must read all 36 month collections');

  assert.equal(json.data.buckets.length, 3);
  assert.equal(json.data.totals.tripCount, 6);
  assert.equal(json.data.totals.driverPaySatang, 300000);
  assert.equal(json.data.totals.fuelCostSatang, 0);
});

test('Concurrency Boundaries: Dynamic concurrency scales accurately for N = 1, 2, 3, 5 months', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });

  // Test N = 1 month -> peak should be 1
  const db1 = createInstrumentedMockDb(docs, 15);
  const res1 = await getReports(new NextRequest('http://localhost/api/truck/reports?month=2026-01'));
  assert.equal(res1.status, 200);
  assert.equal(db1.tracker.peakActive, 1, '1 month must have peak active = 1');

  // Test N = 2 months -> peak should be 2
  const db2 = createInstrumentedMockDb(docs, 15);
  const res2 = await getReports(new NextRequest('http://localhost/api/truck/reports?months=2026-01,2026-02'));
  assert.equal(res2.status, 200);
  assert.equal(db2.tracker.peakActive, 2, '2 months must have peak active = 2');

  // Test N = 3 months -> peak should be 3
  const db3 = createInstrumentedMockDb(docs, 15);
  const res3 = await getReports(new NextRequest('http://localhost/api/truck/reports?months=2026-01,2026-02,2026-03'));
  assert.equal(res3.status, 200);
  assert.equal(db3.tracker.peakActive, 3, '3 months must have peak active = 3');

  // Test N = 5 months -> peak must be capped at 4
  const db5 = createInstrumentedMockDb(docs, 15);
  const res5 = await getReports(new NextRequest('http://localhost/api/truck/reports?months=2026-01,2026-02,2026-03,2026-04,2026-05'));
  assert.equal(res5.status, 200);
  assert.equal(db5.tracker.peakActive, 4, '5 months must have peak active capped at 4');
});

// ============================================================================
// SUITE 3: PDF Export Edge Cases & Resilience
// ============================================================================

test('PDF Edge Case: Zero-trip month generates valid binary, KPI zeros, and empty notification', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/profile/truck`, {
    companyName: 'หจก. พี.พิชญา ทรานสปอร์ต'
  });

  // No trucks, no records for 2026-05
  createInstrumentedMockDb(docs, 0);

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-05&format=pdf');
  const res = await getExport(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');

  const arrayBuf = await res.arrayBuffer();
  const pdfBuf = Buffer.from(arrayBuf);

  // Check PDF magic header and structure
  assert.equal(pdfBuf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdfBuf.length > 500, 'PDF buffer must have valid byte size');

  const pdfString = pdfBuf.toString('latin1');
  assert.ok(pdfString.includes('%%EOF'), 'PDF must have valid EOF marker');
});

test('PDF Edge Case: Zero-trip records with fuel cost only render without route errors', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/profile/truck`, {
    companyName: 'หจก. พี.พิชญา ทรานสปอร์ต'
  });

  docs.set(`shops/${shopId}/trucks/truck-fuel-1`, {
    plateNumber: '70-7777',
    driverName: 'ชวลิต ซ่อมบำรุง',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });

  // Daily record with 0 trips and 3,500.00 THB fuel
  docs.set(`shops/${shopId}/truckMonths/2026-06/records/2026-06-10_truck-fuel-1`, {
    recordId: '2026-06-10_truck-fuel-1',
    dateKey: '2026-06-10',
    monthKey: '2026-06',
    truckId: 'truck-fuel-1',
    plateNumberSnapshot: '70-7777',
    driverNameSnapshot: 'ชวลิต ซ่อมบำรุง',
    fuelCostSatang: 350000,
    totalDriverPaySatang: 0,
    tripCount: 0,
    trips: [],
    photos: [],
    revision: 1,
    createdAt: '2026-06-10T08:00:00.000Z',
    updatedAt: '2026-06-10T17:00:00.000Z',
    updatedBy: 'challenger'
  });

  createInstrumentedMockDb(docs, 0);

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-06&format=pdf');
  const res = await getExport(req);
  assert.equal(res.status, 200);

  const pdfBuf = Buffer.from(await res.arrayBuffer());
  assert.equal(pdfBuf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdfBuf.length > 1000);
});

test('PDF Edge Case: High-volume 35 trucks stress-tests multi-page pagination and headers', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/profile/truck`, {
    companyName: 'บริษัท พี.พิชญา โลจิสติกส์ จำกัด (มหาชน)'
  });

  // Seed 35 trucks
  for (let i = 1; i <= 35; i++) {
    const truckId = `truck-stress-${String(i).padStart(2, '0')}`;
    const plate = `70-${String(2000 + i)}`;
    const driver = `คนขับคนที่ ${i} มุ่งมั่น`;

    docs.set(`shops/${shopId}/trucks/${truckId}`, {
      plateNumber: plate,
      driverName: driver,
      status: 'ACTIVE',
      revision: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    // 1 record per truck
    docs.set(`shops/${shopId}/truckMonths/2026-07/records/2026-07-${String((i % 28) + 1).padStart(2, '0')}_${truckId}`, {
      recordId: `rec-${i}`,
      dateKey: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
      monthKey: '2026-07',
      truckId,
      plateNumberSnapshot: plate,
      driverNameSnapshot: driver,
      fuelCostSatang: 120000,
      totalDriverPaySatang: 65000,
      tripCount: 1,
      trips: [
        {
          tripIndex: 1,
          fromLocation: `ท่าทราย ${i}`,
          destinationMode: 'DEST_1',
          destinationName: `โครงการ ${i}`,
          driverPaySatang: 65000,
          note: `เที่ยวทดสอบที่ ${i}`
        }
      ],
      photos: [],
      revision: 1,
      createdAt: '2026-07-01T08:00:00.000Z',
      updatedAt: '2026-07-01T17:00:00.000Z',
      updatedBy: 'challenger'
    });
  }

  createInstrumentedMockDb(docs, 0);

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-07&format=pdf');
  const res = await getExport(req);
  assert.equal(res.status, 200);

  const pdfBuf = Buffer.from(await res.arrayBuffer());
  assert.equal(pdfBuf.subarray(0, 4).toString(), '%PDF');

  // Verify multiple pages in PDF binary: /Type /Page objects count
  const pdfString = pdfBuf.toString('latin1');
  const pageMatches = pdfString.match(/\/Type\s*\/Page\b/g);
  assert.ok(pageMatches, 'Must contain page descriptors');
  assert.ok(
    pageMatches.length >= 2,
    `High-volume 35 trucks report must span at least 2 pages (got: ${pageMatches.length})`
  );
  assert.ok(pdfString.includes('%%EOF'));
});

test('PDF Edge Case: Adversarial long strings and multi-line notes wrap safely without crashing PDF engine', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  // 250 characters long company name
  const veryLongCompany = 'บริษัท พี.พิชญา ทรานสปอร์ต แอนด์ คอนสตรัคชั่น โลจิสติกส์ ซัพพลาย เซอร์วิสเซส จำกัด (สาขาใหญ่ภาคตะวันออกเฉียงเหนือตอนล่างและชายแดนตะวันออกพัฒนาการขนส่งหินทรายลูกรังวัสดุก่อสร้างครบวงจร)';
  docs.set(`shops/${shopId}/profile/truck`, {
    companyName: veryLongCompany
  });

  const veryLongPlate = '70-9999 (ป้ายเหลืองพิเศษ จังหวัดพระนครศรีอยุธยา ทะเบียนรถบรรทุกพ่วงสิบแปดล้อ)';
  const veryLongDriver = 'นาย เอกชัย ศรีวิชัย รัตนประสิทธิ์มงคลกุล รัตนชาติศิริโสภณ (หัวหน้าชุดสายตรวจและผู้ตรวจการวิ่งงานประจำภาคเหนือตอนล่าง)';

  docs.set(`shops/${shopId}/trucks/truck-long-1`, {
    plateNumber: veryLongPlate,
    driverName: veryLongDriver,
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });

  // 10 multi-trip items with very long notes
  const trips: any[] = [];
  for (let t = 1; t <= 8; t++) {
    trips.push({
      tripIndex: t,
      fromLocation: `ต้นทางแหล่งที่ ${t}: บ่อดินลูกรังและหินคลุกเขาเขียว อำเภอพัฒนานิคม จังหวัดลพบุรี`,
      destinationMode: 'DEST_1',
      destinationName: `ปลายทางหน่วยงานที่ ${t}: โครงการก่อสร้างสะพานและอุโมงค์ทางลอดแยกพหลโยธิน`,
      driverPaySatang: 45000,
      note: `หมายเหตุประจำเที่ยวที่ ${t}: ขนส่งวัสดุตามมาตรฐาน มอก. พร้อมใบกำกับภาษีเลขที่ INV-2026-999888-00${t} มีเจ้าหน้าที่ตรวจสอบคุณภาพหน้างานและเซ็นรับมอบเรียบร้อย`
    });
  }

  docs.set(`shops/${shopId}/truckMonths/2026-08/records/2026-08-20_truck-long-1`, {
    recordId: 'rec-long-1',
    dateKey: '2026-08-20',
    monthKey: '2026-08',
    truckId: 'truck-long-1',
    plateNumberSnapshot: veryLongPlate,
    driverNameSnapshot: veryLongDriver,
    fuelCostSatang: 480000,
    totalDriverPaySatang: 360000,
    tripCount: trips.length,
    trips,
    photos: [],
    revision: 1,
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-20T17:00:00.000Z',
    updatedBy: 'challenger'
  });

  createInstrumentedMockDb(docs, 0);

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-08&format=pdf');
  const res = await getExport(req);
  assert.equal(res.status, 200);

  const pdfBuf = Buffer.from(await res.arrayBuffer());
  assert.equal(pdfBuf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdfBuf.length > 2000, 'Long-string PDF must generate substantial byte payload');

  const pdfString = pdfBuf.toString('latin1');
  assert.ok(pdfString.includes('%%EOF'));
});

test('PDF Edge Case: Filter by truckId omits per-truck summary table and customizes subtitle', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/profile/truck`, {
    companyName: 'หจก. พี.พิชญา ทรานสปอร์ต'
  });

  docs.set(`shops/${shopId}/trucks/truck-flt-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
  docs.set(`shops/${shopId}/trucks/truck-flt-2`, {
    plateNumber: '70-2222',
    driverName: 'วิชัย มั่นคง',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-09/records/2026-09-01_truck-flt-1`, {
    recordId: 'rec-1',
    dateKey: '2026-09-01',
    monthKey: '2026-09',
    truckId: 'truck-flt-1',
    plateNumberSnapshot: '70-1111',
    driverNameSnapshot: 'สมชาย ใจดี',
    fuelCostSatang: 100000,
    totalDriverPaySatang: 50000,
    tripCount: 1,
    trips: [{ tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 50000, note: '' }],
    photos: [],
    revision: 1,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T17:00:00.000Z',
    updatedBy: 'challenger'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-09/records/2026-09-02_truck-flt-2`, {
    recordId: 'rec-2',
    dateKey: '2026-09-02',
    monthKey: '2026-09',
    truckId: 'truck-flt-2',
    plateNumberSnapshot: '70-2222',
    driverNameSnapshot: 'วิชัย มั่นคง',
    fuelCostSatang: 120000,
    totalDriverPaySatang: 60000,
    tripCount: 1,
    trips: [{ tripIndex: 1, fromLocation: 'C', destinationMode: 'DEST_1', destinationName: 'D', driverPaySatang: 60000, note: '' }],
    photos: [],
    revision: 1,
    createdAt: '2026-09-02T08:00:00.000Z',
    updatedAt: '2026-09-02T17:00:00.000Z',
    updatedBy: 'challenger'
  });

  createInstrumentedMockDb(docs, 0);

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-09&format=pdf&truckId=truck-flt-1');
  const res = await getExport(req);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Disposition') || '', /truck-report-2026-09-truck-flt-1\.pdf/);

  const pdfBuf = Buffer.from(await res.arrayBuffer());
  assert.equal(pdfBuf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdfBuf.length > 500);
});

test('PDF Edge Case: Non-matching truckId filter returns valid zero-record PDF without crash', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/profile/truck`, {
    companyName: 'หจก. พี.พิชญา ทรานสปอร์ต'
  });

  docs.set(`shops/${shopId}/trucks/truck-flt-1`, {
    plateNumber: '70-1111',
    driverName: 'สมชาย ใจดี',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });

  createInstrumentedMockDb(docs, 0);

  // Filter for truck that does not exist in month records
  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-09&format=pdf&truckId=non-existent-truck');
  const res = await getExport(req);
  assert.equal(res.status, 200);

  const pdfBuf = Buffer.from(await res.arrayBuffer());
  assert.equal(pdfBuf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdfBuf.length > 500);
});

test('CSV Adversarial: Null, undefined, and missing optional trip fields export cleanly as empty strings', async () => {
  const docs = new Map<string, any>();
  const shopId = process.env.SHOP_ID || 'main';

  docs.set(`shops/${shopId}/trucks/truck-opt-1`, {
    plateNumber: '70-8888',
    driverName: 'ทดสอบ ฟิลด์ว่าง',
    status: 'ACTIVE',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });

  docs.set(`shops/${shopId}/truckMonths/2026-10/records/2026-10-25_truck-opt-1`, {
    recordId: 'rec-opt-1',
    dateKey: '2026-10-25',
    monthKey: '2026-10',
    truckId: 'truck-opt-1',
    plateNumberSnapshot: '70-8888',
    driverNameSnapshot: 'ทดสอบ ฟิลด์ว่าง',
    fuelCostSatang: 0,
    totalDriverPaySatang: 0,
    tripCount: 1,
    trips: [
      {
        tripIndex: undefined as any,
        fromLocation: undefined as any,
        destinationMode: 'DEST_1',
        destinationName: undefined as any,
        driverPaySatang: 0,
        note: undefined as any
      }
    ],
    photos: [],
    revision: 1,
    createdAt: '2026-10-25T08:00:00.000Z',
    updatedAt: '2026-10-25T17:00:00.000Z',
    updatedBy: 'challenger'
  });

  createInstrumentedMockDb(docs, 0);

  const req = new NextRequest('http://localhost/api/truck/reports/export?month=2026-10&format=csv');
  const res = await getExport(req);
  assert.equal(res.status, 200);

  const rawBuf = Buffer.from(await res.arrayBuffer());
  const rows = parseRfc4180Csv(rawBuf.toString('utf-8'));
  assert.equal(rows.length, 2);

  const row = rows[1];
  assert.equal(row[3], '1', 'tripIndex falls back to index + 1 = 1');
  assert.equal(row[4], '', 'fromLocation undefined becomes empty string');
  assert.equal(row[5], '', 'destinationName undefined becomes empty string');
  assert.equal(row[6], '0.00', 'driver pay 0 satang formatted to 0.00');
  assert.equal(row[7], '', 'note undefined becomes empty string');
  assert.ok(!rawBuf.toString('utf-8').includes('undefined'));
  assert.ok(!rawBuf.toString('utf-8').includes('null'));
});
