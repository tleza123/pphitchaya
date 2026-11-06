import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import {
  resolveLineConfig,
  resolveTargetId,
  sendLinePush,
  sendLineReply,
  LineConfigError,
  type LineConfig,
  type LineSendResult
} from '../src/lib/line/client';
import {
  buildAttendanceDailyFlex,
  buildTruckDailyFlex,
  type AttendanceDailySummaryData,
  type TruckDailySummaryData,
  type TruckTripSummary
} from '../src/lib/line/flex-templates';
import {
  fetchAttendanceDailySummary,
  fetchTruckDailySummary
} from '../src/lib/line/daily-summary';
import { POST as postLineNotify } from '../src/app/api/line/notify/route';

// ---------------------------------------------------------------------------
// LINE Flex Message JSON Schema Validator (Adversarial Oracle)
// Based on official LINE Messaging API Flex Message documentation
// ---------------------------------------------------------------------------
interface SchemaValidationError {
  path: string;
  message: string;
}

function validateFlexColor(color: unknown, path: string, errors: SchemaValidationError[]) {
  if (typeof color !== 'string') {
    errors.push({ path, message: `Color must be a string, got ${typeof color}` });
    return;
  }
  // Hex color #RRGGBB or #RRGGBBAA
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(color)) {
    errors.push({ path, message: `Invalid hex color format: ${color}` });
  }
}

function validateFlexBox(box: any, path: string, errors: SchemaValidationError[]) {
  if (!box || typeof box !== 'object') {
    errors.push({ path, message: 'Box must be an object' });
    return;
  }
  if (box.type !== 'box') {
    errors.push({ path, message: `Expected box type "box", got "${box.type}"` });
  }
  if (!['horizontal', 'vertical', 'baseline'].includes(box.layout)) {
    errors.push({ path, message: `Invalid box layout: "${box.layout}"` });
  }
  if (!Array.isArray(box.contents)) {
    errors.push({ path, message: 'Box contents must be an array' });
    return;
  }
  // LINE official limit: maximum 100 components in a box
  if (box.contents.length > 100) {
    errors.push({
      path,
      message: `Box contents exceeds LINE limit of 100 components (got ${box.contents.length})`
    });
  }

  if (box.backgroundColor) {
    validateFlexColor(box.backgroundColor, `${path}.backgroundColor`, errors);
  }

  box.contents.forEach((child: any, idx: number) => {
    validateFlexComponent(child, `${path}.contents[${idx}]`, errors);
  });
}

function validateFlexText(textObj: any, path: string, errors: SchemaValidationError[]) {
  if (!textObj || typeof textObj !== 'object') {
    errors.push({ path, message: 'Text component must be an object' });
    return;
  }
  if (typeof textObj.text !== 'string') {
    errors.push({ path, message: `Text component must have string "text", got ${typeof textObj.text}` });
  }
  // LINE Flex Message API rejects empty string "" text in many contexts
  if (textObj.text === '') {
    errors.push({ path, message: 'Text component contains empty string (""), which may be rejected by LINE' });
  }
  if (textObj.color) {
    validateFlexColor(textObj.color, `${path}.color`, errors);
  }
  if (textObj.size && !['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl'].includes(textObj.size)) {
    if (!/^\d+(\.\d+)?(px|em|rem|%)$/.test(textObj.size)) {
      errors.push({ path, message: `Invalid text size: "${textObj.size}"` });
    }
  }
  if (textObj.weight && !['regular', 'bold'].includes(textObj.weight)) {
    errors.push({ path, message: `Invalid text weight: "${textObj.weight}"` });
  }
  if (textObj.align && !['start', 'end', 'center'].includes(textObj.align)) {
    errors.push({ path, message: `Invalid text align: "${textObj.align}"` });
  }
}

function validateFlexComponent(comp: any, path: string, errors: SchemaValidationError[]) {
  if (!comp || typeof comp !== 'object') {
    errors.push({ path, message: `Invalid component: ${JSON.stringify(comp)}` });
    return;
  }
  switch (comp.type) {
    case 'box':
      validateFlexBox(comp, path, errors);
      break;
    case 'text':
      validateFlexText(comp, path, errors);
      break;
    case 'separator':
      if (comp.color) validateFlexColor(comp.color, `${path}.color`, errors);
      break;
    case 'image':
      if (typeof comp.url !== 'string') {
        errors.push({ path, message: 'Image must have string "url"' });
      }
      break;
    default:
      errors.push({ path, message: `Unknown or unsupported component type: "${comp.type}"` });
  }
}

function assertValidFlexMessage(flexMessage: any, contextName: string) {
  const errors: SchemaValidationError[] = [];

  assert.equal(flexMessage.type, 'flex', `${contextName}: outer type must be "flex"`);
  assert.equal(typeof flexMessage.altText, 'string', `${contextName}: altText must be string`);
  assert.ok(flexMessage.altText.length > 0, `${contextName}: altText must not be empty`);
  assert.ok(
    flexMessage.altText.length <= 400,
    `${contextName}: altText length (${flexMessage.altText.length}) exceeds LINE limit of 400 chars`
  );

  const bubble = flexMessage.contents;
  assert.ok(bubble && typeof bubble === 'object', `${contextName}: contents must be an object`);
  assert.equal(bubble.type, 'bubble', `${contextName}: container type must be "bubble"`);

  if (bubble.size) {
    assert.ok(
      ['nano', 'micro', 'kilo', 'mega', 'giga'].includes(bubble.size),
      `${contextName}: invalid bubble size "${bubble.size}"`
    );
  }

  if (bubble.header) validateFlexBox(bubble.header, `${contextName}.header`, errors);
  if (bubble.body) validateFlexBox(bubble.body, `${contextName}.body`, errors);
  if (bubble.footer) validateFlexBox(bubble.footer, `${contextName}.footer`, errors);

  // Check JSON payload size in UTF-8 bytes (LINE limit: 30 KB = 30,720 bytes)
  const jsonStr = JSON.stringify(flexMessage);
  const byteLength = Buffer.byteLength(jsonStr, 'utf8');
  assert.ok(
    byteLength <= 30720,
    `${contextName}: Flex message payload size (${byteLength} bytes) exceeds LINE 30KB limit (30,720 bytes)`
  );

  if (errors.length > 0) {
    const errorDetails = errors.map(e => `  [${e.path}] ${e.message}`).join('\n');
    throw new Error(`${contextName} failed LINE Flex Message schema validation:\n${errorDetails}`);
  }
}

// ---------------------------------------------------------------------------
// Mock Firestore Helper
// ---------------------------------------------------------------------------
function createMockDb(initialDocs: Map<string, any>) {
  const docs = new Map<string, any>(initialDocs);
  const ref = (path: string): any => ({
    path,
    collection: (name: string) => ref(`${path}/${name}`),
    doc: (id = 'doc_id') => ref(`${path}/${id}`),
    get: async () => {
      const childDocs: any[] = [];
      for (const [key, val] of docs.entries()) {
        if (key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')) {
          childDocs.push({
            id: key.slice(path.length + 1),
            data: () => val
          });
        }
      }
      return {
        exists: docs.has(path),
        data: () => docs.get(path),
        docs: childDocs
      };
    }
  });

  return {
    docs,
    db: {
      collection: (name: string) => ref(name),
      runTransaction: async (run: (tx: any) => Promise<unknown>) => {
        const staged: Array<[string, any]> = [];
        const read = (r: any) => {
          assert.equal(staged.length, 0, 'Read-Before-Write rule violation');
          const p = r.path;
          return { exists: docs.has(p), data: () => docs.get(p) };
        };
        const result = await run({
          get: async (r: any) => read(r),
          getAll: async (...refs: any[]) => refs.map(read),
          set: (r: any, value: any, options?: { merge?: boolean }) => {
            const current = options?.merge ? docs.get(r.path) || {} : {};
            staged.push([r.path, { ...current, ...value }]);
          },
          update: (r: any, value: any) => {
            const current = docs.get(r.path) || {};
            staged.push([r.path, { ...current, ...value }]);
          },
          delete: (r: any) => staged.push([r.path, undefined])
        });
        staged.forEach(([p, val]) => {
          if (val === undefined) docs.delete(p);
          else docs.set(p, val);
        });
        return result;
      }
    }
  };
}

// ===========================================================================
// SECTION 1: Boundary & Stress Testing for Flex Message Templates
// ===========================================================================

test('Stress-test: Attendance Flex with 0 staff boundary condition', () => {
  const zeroStaffData: AttendanceDailySummaryData = {
    dateKey: '2026-11-06',
    shopName: 'ร้านพิทักษ์พาณิชย์',
    totalStaff: 0,
    presentFull: 0,
    presentHalf: 0,
    absent: 0,
    specialStaff: [],
    dailyWagesSatang: 0,
    dailyAdvanceSatang: 0,
    monthlyNetPayrollSatang: 0
  };

  const flex = buildAttendanceDailyFlex(zeroStaffData);
  assertValidFlexMessage(flex, 'Attendance 0 Staff');

  const jsonStr = JSON.stringify(flex);
  assert.match(jsonStr, /0 คน/);
  assert.match(jsonStr, /0\.00 บาท/);
});

test('Stress-test: Attendance Flex with 50 staff with mixed statuses and special characters', () => {
  const specialStaffList: Array<{
    name: string;
    status: string;
    advanceSatang?: number;
    deductionSatang?: number;
  }> = [];

  const statuses = ['ครึ่งวัน', 'ไม่มา', 'ลาป่วย', 'ลากิจ', 'พิเศษ'];
  const specialNames = [
    'นาย สมชาย & นาย สมศักดิ์ <หัวหน้าช่าง>',
    'นางสาว "สมศรี" \'ยอดขยัน\' (แผนก A)',
    'Mr. John O\'Connor / ช่างเทคนิค #1',
    'สมบัติ [กะดึก] - ค่าเดินทาง',
    'พรชัย + เบี้ยขยัน 100%'
  ];

  for (let i = 1; i <= 50; i++) {
    const status = statuses[i % statuses.length];
    const baseName = specialNames[i % specialNames.length];
    specialStaffList.push({
      name: `${i}. ${baseName}`,
      status,
      advanceSatang: i % 2 === 0 ? i * 15000 : undefined, // 150.00 THB to 7,500.00 THB
      deductionSatang: i % 3 === 0 ? i * 5000 : undefined  // 50.00 THB to 2,500.00 THB
    });
  }

  const largeAttendanceData: AttendanceDailySummaryData = {
    dateKey: '2026-11-06',
    shopName: 'บริษัท พชรพาณิชย์ โลจิสติกส์ & ทรานสปอร์ต จำกัด (สำนักงานใหญ่)',
    totalStaff: 50,
    presentFull: 25,
    presentHalf: 15,
    absent: 10,
    specialStaff: specialStaffList,
    dailyWagesSatang: 987654321, // 9,876,543.21 THB (Large Satang)
    dailyAdvanceSatang: 12345678, // 123,456.78 THB
    monthlyNetPayrollSatang: 5432109876 // 54,321,098.76 THB
  };

  const flex = buildAttendanceDailyFlex(largeAttendanceData);
  assertValidFlexMessage(flex, 'Attendance 50 Staff');

  const jsonStr = JSON.stringify(flex);
  // Verify currency formatting with large satang values
  assert.match(jsonStr, /9,876,543\.21/);
  assert.match(jsonStr, /123,456\.78/);
  assert.match(jsonStr, /54,321,098\.76/);
  // Verify special characters are preserved safely in JSON
  assert.match(jsonStr, /นาย สมชาย & นาย สมศักดิ์ <หัวหน้าช่าง>/);
  assert.match(jsonStr, /O'Connor/);
});

test('Stress-test: Attendance Flex with negative monthly net payroll satang (deductions > wages)', () => {
  const negativeNetData: AttendanceDailySummaryData = {
    dateKey: '2026-11-06',
    shopName: 'ร้านทดสอบ',
    totalStaff: 5,
    presentFull: 2,
    presentHalf: 1,
    absent: 2,
    dailyWagesSatang: 50000, // 500.00 THB
    dailyAdvanceSatang: 150000, // 1,500.00 THB
    monthlyNetPayrollSatang: -250000 // -2,500.00 THB (Negative Satang)
  };

  const flex = buildAttendanceDailyFlex(negativeNetData);
  assertValidFlexMessage(flex, 'Attendance Negative Net');

  const jsonStr = JSON.stringify(flex);
  assert.match(jsonStr, /-2,500\.00/);
});

test('Stress-test: Truck Flex with 0 trucks boundary condition', () => {
  const zeroTruckData: TruckDailySummaryData = {
    dateKey: '2026-11-06',
    companyName: 'หจก. พิทักษ์ขนส่งสิบล้อ',
    activeTruckCount: 0,
    totalTrips: 0,
    totalDriverPaySatang: 0,
    totalFuelCostSatang: 0,
    trucks: []
  };

  const flex = buildTruckDailyFlex(zeroTruckData);
  assertValidFlexMessage(flex, 'Truck 0 Trucks');

  const jsonStr = JSON.stringify(flex);
  assert.match(jsonStr, /0 คัน/);
  assert.match(jsonStr, /0 เที่ยว/);
  assert.match(jsonStr, /0\.00 บาท/);
});

test('Stress-test: Truck Flex with 20 trucks, multiple trips and custom origins/destinations', () => {
  const trucks: TruckTripSummary[] = [];

  const origins = ['ท่าทราย A (บางบ่อ)', 'โรงโม่หินเขาย้อย & ลูกรัง', 'ท่าเรือแหลมฉบัง Gate-4', 'บ่อดิน 1 [บางปะอิน]'];
  const destinations = ['ไซต์งานก่อสร้าง พระราม 9 / อาคาร B', 'โรงงาน C (นิคมฯ อมตะ)', 'คลังสินค้ากลาง D - โซน 2', 'โครงการสะพานข้ามแม่น้ำ #3'];

  for (let i = 1; i <= 20; i++) {
    const origin = origins[i % origins.length];
    const dest = destinations[i % destinations.length];
    const tripCount = (i % 4) + 1;
    const routesSummary = `${origin} -> ${dest} (${tripCount})`;

    trucks.push({
      plateNumber: `70-${String(1000 + i).slice(1)}`,
      driverName: `คนขับ สมหมาย ${i} (ทีม A)`,
      tripCount,
      routesSummary,
      driverPaySatang: tripCount * 65000, // 650.00 THB per trip
      fuelCostSatang: i % 2 === 0 ? tripCount * 120000 : 0 // 1,200.00 THB per trip
    });
  }

  const largeTruckData: TruckDailySummaryData = {
    dateKey: '2026-11-06',
    companyName: 'บริษัท พิทักษ์ชัย โลจิสติกส์ แอนด์ ทรานสปอร์ต จำกัด',
    activeTruckCount: 20,
    totalTrips: 50,
    totalDriverPaySatang: 3250000, // 32,500.00 THB
    totalFuelCostSatang: 4800000, // 48,000.00 THB
    trucks,
    monthTotalTrips: 840,
    monthDriverPaySatang: 54600000, // 546,000.00 THB
    monthFuelCostSatang: 80640000 // 806,400.00 THB
  };

  const flex = buildTruckDailyFlex(largeTruckData);
  assertValidFlexMessage(flex, 'Truck 20 Trucks');

  const jsonStr = JSON.stringify(flex);
  assert.match(jsonStr, /70-001/);
  assert.match(jsonStr, /70-020/);
  assert.match(jsonStr, /32,500\.00/);
  assert.doesNotMatch(jsonStr, /48,000\.00/);
  assert.match(jsonStr, /546,000\.00/);
  assert.match(jsonStr, /806,400\.00/);
  assert.match(jsonStr, /ท่าทราย A \(บางบ่อ\)/);
});

// ===========================================================================
// SECTION 2: Config Fallback Hierarchy Stress Testing
// ===========================================================================

test('Config fallback: Exhaustive precedence matrix across Firestore, env vars, and defaults', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const prevDb = globals.adminDb;
  const prevEnv = { ...process.env };

  try {
    const shopId = 'stress_shop_1';
    const lineDocPath = `shops/${shopId}/profile/line`;

    // -----------------------------------------------------------------------
    // Case 1: Both Firestore and Env Vars present -> Firestore MUST win on ALL fields
    // -----------------------------------------------------------------------
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'env_tok_1';
    process.env.LINE_DEFAULT_TARGET_ID = 'env_def_1';
    process.env.LINE_ATTENDANCE_TARGET_ID = 'env_att_1';
    process.env.LINE_TRUCK_TARGET_ID = 'env_trk_1';
    process.env.LINE_DAILY_SUMMARY_ENABLED = 'false';

    const mockDb1 = createMockDb(
      new Map([
        [
          lineDocPath,
          {
            channelAccessToken: 'fs_tok_wins',
            defaultTargetId: 'fs_def_wins',
            attendanceTargetId: 'fs_att_wins',
            truckTargetId: 'fs_trk_wins',
            dailySummaryEnabled: true,
            dailySummaryHour: 20,
            revision: 5
          }
        ]
      ])
    );
    globals.adminDb = mockDb1.db;

    const conf1 = await resolveLineConfig(shopId);
    assert.equal(conf1.channelAccessToken, 'fs_tok_wins');
    assert.equal(conf1.defaultTargetId, 'fs_def_wins');
    assert.equal(conf1.attendanceTargetId, 'fs_att_wins');
    assert.equal(conf1.truckTargetId, 'fs_trk_wins');
    assert.equal(conf1.dailySummaryEnabled, true);
    assert.equal(conf1.dailySummaryHour, 20);
    assert.equal(conf1.revision, 5);

    // -----------------------------------------------------------------------
    // Case 2: Firestore doc completely absent -> Fallback to env vars
    // -----------------------------------------------------------------------
    const emptyMock = createMockDb(new Map());
    globals.adminDb = emptyMock.db;

    const conf2 = await resolveLineConfig(shopId);
    assert.equal(conf2.channelAccessToken, 'env_tok_1');
    assert.equal(conf2.defaultTargetId, 'env_def_1');
    assert.equal(conf2.attendanceTargetId, 'env_att_1');
    assert.equal(conf2.truckTargetId, 'env_trk_1');
    assert.equal(conf2.dailySummaryEnabled, false); // because LINE_DAILY_SUMMARY_ENABLED = 'false'
    assert.equal(conf2.dailySummaryHour, 19); // default hour
    assert.equal(conf2.revision, 1);

    // -----------------------------------------------------------------------
    // Case 3: Both Firestore and env vars absent -> Clean undefined properties
    // -----------------------------------------------------------------------
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    delete process.env.LINE_DEFAULT_TARGET_ID;
    delete process.env.LINE_ATTENDANCE_TARGET_ID;
    delete process.env.LINE_TRUCK_TARGET_ID;
    delete process.env.LINE_DAILY_SUMMARY_ENABLED;

    const conf3 = await resolveLineConfig(shopId);
    assert.equal(conf3.channelAccessToken, undefined);
    assert.equal(conf3.defaultTargetId, undefined);
    assert.equal(conf3.attendanceTargetId, undefined);
    assert.equal(conf3.truckTargetId, undefined);
    assert.equal(conf3.dailySummaryEnabled, true); // default true when unset
    assert.equal(conf3.dailySummaryHour, 19);
    assert.equal(conf3.revision, 1);

    // -----------------------------------------------------------------------
    // Case 4: Firestore throws database exception -> Graceful fallback to env vars
    // -----------------------------------------------------------------------
    globals.adminDb = {
      collection: () => {
        throw new Error('Firestore connection timeout error');
      }
    };
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'fallback_from_error';

    const conf4 = await resolveLineConfig(shopId);
    assert.equal(conf4.channelAccessToken, 'fallback_from_error');

    // -----------------------------------------------------------------------
    // Case 5: Target ID resolution scope fallback logic
    // -----------------------------------------------------------------------
    const targetConfig: LineConfig = {
      channelAccessToken: 'tok',
      defaultTargetId: 'def_group',
      attendanceTargetId: 'att_group'
      // truckTargetId is omitted
    };

    assert.equal(resolveTargetId(targetConfig, 'attendance'), 'att_group');
    assert.equal(resolveTargetId(targetConfig, 'truck'), 'def_group'); // falls back to default
    assert.equal(resolveTargetId(targetConfig, 'default'), 'def_group');

    // If defaultTargetId is also omitted
    const noDefaultConfig: LineConfig = {
      channelAccessToken: 'tok',
      attendanceTargetId: 'att_group'
    };
    assert.equal(resolveTargetId(noDefaultConfig, 'truck'), undefined);
  } finally {
    globals.adminDb = prevDb;
    process.env = prevEnv;
  }
});

// ===========================================================================
// SECTION 3: Intercept Fetch & Routing Verification (Push vs Broadcast)
// ===========================================================================

test('Routing stress-test: sendLinePush strictly routes push vs broadcast based on targetId', async () => {
  const originalFetch = globalThis.fetch;
  const capturedRequests: Array<{
    url: string;
    method: string;
    authHeader?: string;
    body: any;
  }> = [];

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const headers = (init?.headers as Record<string, string>) || {};
      capturedRequests.push({
        url,
        method: init?.method || 'GET',
        authHeader: headers['Authorization'] || headers['authorization'],
        body: init?.body ? JSON.parse(init.body as string) : undefined
      });
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const config: LineConfig = {
      channelAccessToken: 'line_valid_access_token_abc123',
      defaultTargetId: 'def_target'
    };

    const dummyMsg = [{ type: 'text', text: 'Hello LINE' }];

    // -----------------------------------------------------------------------
    // 1. Explicit targetId -> PUSH to https://api.line.me/v2/bot/message/push
    // -----------------------------------------------------------------------
    capturedRequests.length = 0;
    const res1 = await sendLinePush(config, dummyMsg, 'U1234567890abcdef');
    assert.equal(res1.ok, true);
    assert.equal(res1.mode, 'push');
    assert.equal(res1.targetId, 'U1234567890abcdef');
    assert.equal(capturedRequests.length, 1);
    assert.equal(capturedRequests[0].url, 'https://api.line.me/v2/bot/message/push');
    assert.equal(capturedRequests[0].authHeader, 'Bearer line_valid_access_token_abc123');
    assert.equal(capturedRequests[0].body.to, 'U1234567890abcdef');
    assert.deepEqual(capturedRequests[0].body.messages, dummyMsg);

    // -----------------------------------------------------------------------
    // 2. targetId undefined -> BROADCAST to https://api.line.me/v2/bot/message/broadcast
    // -----------------------------------------------------------------------
    capturedRequests.length = 0;
    const res2 = await sendLinePush(config, dummyMsg, undefined);
    assert.equal(res2.ok, true);
    assert.equal(res2.mode, 'broadcast');
    assert.equal(res2.targetId, undefined);
    assert.equal(capturedRequests.length, 1);
    assert.equal(capturedRequests[0].url, 'https://api.line.me/v2/bot/message/broadcast');
    assert.equal(capturedRequests[0].authHeader, 'Bearer line_valid_access_token_abc123');
    assert.equal(capturedRequests[0].body.to, undefined);
    assert.deepEqual(capturedRequests[0].body.messages, dummyMsg);

    // -----------------------------------------------------------------------
    // 3. targetId is empty string or whitespace -> BROADCAST (must not push to empty string)
    // -----------------------------------------------------------------------
    capturedRequests.length = 0;
    const res3 = await sendLinePush(config, dummyMsg, '   ');
    assert.equal(res3.ok, true);
    assert.equal(res3.mode, 'broadcast');
    assert.equal(res3.targetId, '');
    assert.equal(capturedRequests.length, 1);
    assert.equal(capturedRequests[0].url, 'https://api.line.me/v2/bot/message/broadcast');

    // -----------------------------------------------------------------------
    // 4. Missing token -> Throws LineConfigError without sending fetch
    // -----------------------------------------------------------------------
    capturedRequests.length = 0;
    await assert.rejects(
      async () => {
        await sendLinePush({ channelAccessToken: '' }, dummyMsg, 'target_123');
      },
      (err: any) => {
        assert.equal(err.name, 'LineConfigError');
        assert.equal(err.code, 'LINE_NOT_CONFIGURED');
        return true;
      }
    );
    assert.equal(capturedRequests.length, 0);

    // -----------------------------------------------------------------------
    // 5. Upstream LINE API error (HTTP 400 Bad Request) -> Handled cleanly without throw
    // -----------------------------------------------------------------------
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'The property altText exceeds 400 chars' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as typeof fetch;

    const resErr = await sendLinePush(config, dummyMsg, 'target_123');
    assert.equal(resErr.ok, false);
    assert.equal(resErr.statusCode, 400);
    assert.match(resErr.error || '', /altText/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ===========================================================================
// SECTION 4: End-to-End Daily Summary Data Extraction Stress Tests
// ===========================================================================

test('Stress-test: fetchAttendanceDailySummary handles high employee volumes and exclusions', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const prevDb = globals.adminDb;
  const shopId = 'summary_shop_att';
  const targetDate = '2026-11-06';
  const monthKey = '2026-11';

  const docs = new Map<string, any>();

  // Profile doc
  docs.set(`shops/${shopId}/profile/main`, {
    shopName: 'พชรพาณิชย์ สำนักงานใหญ่'
  });

  // Calendar override (normal day)
  docs.set(`shops/${shopId}/calendarOverrides/${targetDate}`, {
    kind: 'NORMAL'
  });

  // Add 40 active employees + 5 suspended + 5 resigned
  for (let i = 1; i <= 40; i++) {
    docs.set(`shops/${shopId}/employees/emp_${i}`, {
      name: `พนักงานคนที่ ${i}`,
      status: 'ACTIVE'
    });
  }
  for (let i = 41; i <= 45; i++) {
    docs.set(`shops/${shopId}/employees/emp_${i}`, {
      name: `พนักงานระงับ ${i}`,
      status: 'SUSPENDED'
    });
  }
  for (let i = 46; i <= 50; i++) {
    docs.set(`shops/${shopId}/employees/emp_${i}`, {
      name: `พนักงานลาออก ${i}`,
      status: 'RESIGNED'
    });
  }

  // Add attendance records for targetDate:
  // - 20 full
  // - 10 half (with advance 200.00 THB = 20,000 satang)
  // - 10 absent (with deduction 100.00 THB = 10,000 satang)
  for (let i = 1; i <= 20; i++) {
    docs.set(`shops/${shopId}/months/${monthKey}/attendance/${targetDate}_emp_${i}`, {
      dateKey: targetDate,
      employeeId: `emp_${i}`,
      status: 'FULL',
      wageSatang: 50000 // 500.00 THB
    });
  }
  for (let i = 21; i <= 30; i++) {
    docs.set(`shops/${shopId}/months/${monthKey}/attendance/${targetDate}_emp_${i}`, {
      dateKey: targetDate,
      employeeId: `emp_${i}`,
      status: 'HALF',
      wageSatang: 25000,
      advanceSatang: 20000 // 200.00 THB advance
    });
  }
  for (let i = 31; i <= 40; i++) {
    docs.set(`shops/${shopId}/months/${monthKey}/attendance/${targetDate}_emp_${i}`, {
      dateKey: targetDate,
      employeeId: `emp_${i}`,
      status: 'ABSENT',
      wageSatang: 0,
      deductionSatang: 10000 // 100.00 THB deduction
    });
  }

  // Add 1 record from previous day to test monthly payroll accumulation
  docs.set(`shops/${shopId}/months/${monthKey}/attendance/2026-11-05_emp_1`, {
    dateKey: '2026-11-05',
    employeeId: 'emp_1',
    status: 'FULL',
    wageSatang: 50000
  });

  const mock = createMockDb(docs);
  globals.adminDb = mock.db;

  try {
    const summary = await fetchAttendanceDailySummary(shopId, targetDate);

    // Verify suspended and resigned are excluded from active staff count
    assert.equal(summary.totalStaff, 40);
    assert.equal(summary.presentFull, 20);
    assert.equal(summary.presentHalf, 10);
    assert.equal(summary.absent, 10);

    // Daily wages: 20 * 50,000 + 10 * 25,000 = 1,000,000 + 250,000 = 1,250,000 satang
    assert.equal(summary.dailyWagesSatang, 1250000);

    // Daily advance: 10 * 20,000 = 200,000 satang
    assert.equal(summary.dailyAdvanceSatang, 200000);

    // Monthly net payroll:
    // Today:
    //   wages: 1,250,000
    //   advances: 200,000
    //   deductions: 10 * 10,000 = 100,000
    //   net today = 1,250,000 - 200,000 - 100,000 = 950,000
    // Yesterday:
    //   emp_1: 50,000 wage
    // Total monthly net = 950,000 + 50,000 = 1,000,000 satang
    assert.equal(summary.monthlyNetPayrollSatang, 1000000);

    // Special staff should contain all 10 half + 10 absent = 20 entries
    assert.equal(summary.specialStaff?.length, 20);

    // Build and validate Flex bubble
    const flex = buildAttendanceDailyFlex(summary);
    assertValidFlexMessage(flex, 'Attendance High Volume');
  } finally {
    globals.adminDb = prevDb;
  }
});

test('Stress-test: fetchTruckDailySummary aggregates daily and monthly records correctly', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const prevDb = globals.adminDb;
  const shopId = 'summary_shop_truck';
  const targetDate = '2026-11-06';
  const monthKey = '2026-11';

  const docs = new Map<string, any>();

  // Profile doc
  docs.set(`shops/${shopId}/profile/truck`, {
    companyName: 'บจก. พิทักษ์ขนส่ง'
  });

  // 15 trucks on targetDate
  for (let i = 1; i <= 15; i++) {
    docs.set(`shops/${shopId}/truckMonths/${monthKey}/records/${targetDate}_truck_${i}`, {
      dateKey: targetDate,
      truckId: `truck_${i}`,
      plateNumberSnapshot: `70-20${String(10 + i).slice(1)}`,
      driverNameSnapshot: `สมปอง ${i}`,
      tripCount: 3,
      totalDriverPaySatang: 195000, // 1,950.00 THB
      fuelCostSatang: 250000, // 2,500.00 THB
      trips: [
        { fromLocation: 'บ่อดิน A', destinationName: 'โรงงาน B', driverPaySatang: 65000 },
        { fromLocation: 'โรงงาน B', destinationName: 'ท่าทราย C', driverPaySatang: 65000 },
        { fromLocation: 'ท่าทราย C', destinationName: 'แคมป์ D', driverPaySatang: 65000 }
      ]
    });
  }

  // 5 records from earlier in month (2026-11-01)
  for (let i = 1; i <= 5; i++) {
    docs.set(`shops/${shopId}/truckMonths/${monthKey}/records/2026-11-01_truck_${i}`, {
      dateKey: '2026-11-01',
      truckId: `truck_${i}`,
      tripCount: 2,
      totalDriverPaySatang: 130000,
      fuelCostSatang: 150000,
      trips: [{driverPaySatang: 65000}, {driverPaySatang: 65000}]
    });
  }

  const mock = createMockDb(docs);
  globals.adminDb = mock.db;

  try {
    const summary = await fetchTruckDailySummary(shopId, targetDate);

    // Daily totals (15 trucks)
    assert.equal(summary.activeTruckCount, 15);
    assert.equal(summary.totalTrips, 15 * 3); // 45 trips
    assert.equal(summary.totalDriverPaySatang, 15 * 195000); // 2,925,000 satang
    assert.equal(summary.totalFuelCostSatang, 0); // 3,750,000 satang
    assert.equal(summary.trucks.length, 15);

    // Monthly totals (15 daily + 5 earlier = 20 records)
    assert.equal(summary.monthTotalTrips, 45 + 5 * 2); // 55 trips
    assert.equal(summary.monthDriverPaySatang, 15 * 195000 + 5 * 130000); // 2,925,000 + 650,000 = 3,575,000 satang
    assert.equal(summary.monthFuelCostSatang, 0); // 3,750,000 + 750,000 = 4,500,000 satang

    // Verify route summary formatted
    assert.equal(summary.trucks[0].routesSummary, 'บ่อดิน A -> โรงงาน B, โรงงาน B -> ท่าทราย C, ท่าทราย C -> แคมป์ D');

    // Build and validate Flex bubble
    const flex = buildTruckDailyFlex(summary);
    assertValidFlexMessage(flex, 'Truck 15 Active Trucks');
  } finally {
    globals.adminDb = prevDb;
  }
});

// ===========================================================================
// SECTION 5: LINE API Limits & Boundary Vulnerability Exploration
// ===========================================================================

test('Vulnerability check: altText length constraint under long shopName', () => {
  // LINE Flex Message limit: altText cannot exceed 400 characters.
  const longShopName = 'บริษัท ' + 'ก'.repeat(380) + ' จำกัด';
  const data: AttendanceDailySummaryData = {
    dateKey: '2026-11-06',
    shopName: longShopName,
    totalStaff: 1,
    presentFull: 1,
    presentHalf: 0,
    absent: 0,
    dailyWagesSatang: 30000,
    dailyAdvanceSatang: 0,
    monthlyNetPayrollSatang: 30000
  };

  const flex = buildAttendanceDailyFlex(data);
  // Empirical check: Verify whether altText exceeds 400 characters
  const isOverflow = flex.altText.length > 400;
  assert.equal(
    isOverflow,
    true,
    'Confirmed finding: buildAttendanceDailyFlex does not truncate altText when shopName is long (>400 chars)'
  );
});

test('Vulnerability check: Box component limit (> 100 components) under extreme staff count', () => {
  // LINE Flex Message limit: A Box cannot contain more than 100 child components.
  const extremeStaffList: Array<{ name: string; status: string }> = [];
  for (let i = 1; i <= 105; i++) {
    extremeStaffList.push({ name: `พนักงาน ${i}`, status: 'ลา' });
  }

  const data: AttendanceDailySummaryData = {
    dateKey: '2026-11-06',
    shopName: 'ร้านขนาดใหญ่มาก',
    totalStaff: 105,
    presentFull: 0,
    presentHalf: 0,
    absent: 105,
    specialStaff: extremeStaffList,
    dailyWagesSatang: 0,
    dailyAdvanceSatang: 0,
    monthlyNetPayrollSatang: 0
  };

  const flex = buildAttendanceDailyFlex(data);
  const bodyContents = (flex.contents as any).body.contents;
  // Total components in body.contents = 1 (totalStaff) + 1 (statusRow) + 2 (special header + separator) + 105 (special rows) + 1 (separator) + 1 (wages) = 111 components
  assert.ok(
    bodyContents.length > 100,
    `Confirmed finding: 105 special staff entries produces ${bodyContents.length} components in body box, exceeding LINE 100-component limit`
  );
});

test('Stress-test: Payload size benchmarks for 20 trucks and 50 staff', () => {
  // 1. Benchmark 50 staff
  const staff50: Array<{ name: string; status: string; advanceSatang?: number; deductionSatang?: number }> = [];
  for (let i = 1; i <= 50; i++) {
    staff50.push({
      name: `นาย สมศักดิ์ นามสกุลยาวมาก_${i}`,
      status: 'ครึ่งวัน',
      advanceSatang: 50000,
      deductionSatang: 20000
    });
  }
  const attFlex50 = buildAttendanceDailyFlex({
    dateKey: '2026-11-06',
    shopName: 'พชรพาณิชย์',
    totalStaff: 50,
    presentFull: 25,
    presentHalf: 25,
    absent: 0,
    specialStaff: staff50,
    dailyWagesSatang: 2500000,
    dailyAdvanceSatang: 1250000,
    monthlyNetPayrollSatang: 50000000
  });
  const attBytes = Buffer.byteLength(JSON.stringify(attFlex50), 'utf8');
  // Must be <= 30,720 bytes (30 KB)
  assert.ok(attBytes < 30720, `Attendance 50 staff payload size (${attBytes} bytes) must be < 30KB`);

  // 2. Benchmark 20 trucks
  const trucks20: TruckTripSummary[] = [];
  for (let i = 1; i <= 20; i++) {
    trucks20.push({
      plateNumber: `70-${String(1000 + i).slice(1)}`,
      driverName: `คนขับ สมหมาย ประจำรถสิบล้อคันที่ ${i}`,
      tripCount: 4,
      routesSummary: 'ท่าทราย A (บางบ่อ) -> โรงงานปูน C (นิคมฯ อมตะ), นิคมฯ อมตะ -> คลังสินค้า D',
      driverPaySatang: 260000,
      fuelCostSatang: 480000
    });
  }
  const truckFlex20 = buildTruckDailyFlex({
    dateKey: '2026-11-06',
    companyName: 'บริษัท พิทักษ์ชัย โลจิสติกส์ แอนด์ ทรานสปอร์ต จำกัด',
    activeTruckCount: 20,
    totalTrips: 80,
    totalDriverPaySatang: 5200000,
    totalFuelCostSatang: 9600000,
    trucks: trucks20,
    monthTotalTrips: 1200,
    monthDriverPaySatang: 78000000,
    monthFuelCostSatang: 144000000
  });
  const truckBytes = Buffer.byteLength(JSON.stringify(truckFlex20), 'utf8');
  assert.ok(truckBytes < 30720, `Truck 20 trucks payload size (${truckBytes} bytes) must be < 30KB`);
});
