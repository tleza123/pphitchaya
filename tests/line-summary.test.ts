import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import {
  resolveLineConfig,
  resolveTargetId,
  sendLinePush,
  sendLineReply,
  type LineConfig
} from '../src/lib/line/client';
import {
  buildAttendanceDailyFlex,
  buildTruckDailyFlex,
  type AttendanceDailySummaryData,
  type TruckDailySummaryData
} from '../src/lib/line/flex-templates';
import { GET as getLineSettings, PATCH as patchLineSettings } from '../src/app/api/line/settings/route';
import { POST as postLineNotify } from '../src/app/api/line/notify/route';
import { POST as postLineWebhook } from '../src/app/api/line/webhook/route';
import { GET as getCronDailySummary } from '../src/app/api/cron/daily-summary/route';

// Helper to mock Firestore adminDb in tests
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
          assert.equal(staged.length, 0, 'All transaction reads must precede writes (Read-Before-Write)');
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

test('resolveLineConfig prioritizes Firestore and falls back to environment variables', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const prevDb = globals.adminDb;
  const prevEnv = { ...process.env };

  try {
    const shopId = 'test_shop';
    const linePath = `shops/${shopId}/profile/line`;

    // 1. Fallback to process.env when Firestore document is absent
    const emptyMock = createMockDb(new Map());
    globals.adminDb = emptyMock.db;

    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'env_token_123';
    process.env.LINE_DEFAULT_TARGET_ID = 'env_default_target';
    process.env.LINE_ATTENDANCE_TARGET_ID = 'env_attendance_target';
    process.env.LINE_TRUCK_TARGET_ID = 'env_truck_target';

    const fallbackConfig = await resolveLineConfig(shopId);
    assert.equal(fallbackConfig.channelAccessToken, 'env_token_123');
    assert.equal(fallbackConfig.defaultTargetId, 'env_default_target');
    assert.equal(fallbackConfig.attendanceTargetId, 'env_attendance_target');
    assert.equal(fallbackConfig.truckTargetId, 'env_truck_target');
    assert.equal(resolveTargetId(fallbackConfig, 'attendance'), 'env_attendance_target');
    assert.equal(resolveTargetId(fallbackConfig, 'truck'), 'env_truck_target');

    // 2. Firestore doc overrides environment variables
    const docMock = createMockDb(
      new Map([
        [
          linePath,
          {
            channelAccessToken: 'firestore_token_456',
            defaultTargetId: 'firestore_default',
            attendanceTargetId: 'firestore_attendance',
            truckTargetId: 'firestore_truck',
            dailySummaryEnabled: true,
            dailySummaryHour: 19,
            revision: 3
          }
        ]
      ])
    );
    globals.adminDb = docMock.db;

    const firestoreConfig = await resolveLineConfig(shopId);
    assert.equal(firestoreConfig.channelAccessToken, 'firestore_token_456');
    assert.equal(firestoreConfig.defaultTargetId, 'firestore_default');
    assert.equal(firestoreConfig.attendanceTargetId, 'firestore_attendance');
    assert.equal(firestoreConfig.truckTargetId, 'firestore_truck');
    assert.equal(firestoreConfig.dailySummaryEnabled, true);
    assert.equal(firestoreConfig.revision, 3);
    assert.equal(resolveTargetId(firestoreConfig, 'attendance'), 'firestore_attendance');
    assert.equal(resolveTargetId(firestoreConfig, 'truck'), 'firestore_truck');

    // 3. Target resolution fallback to defaultTargetId if specific target is missing
    const sharedTargetConfig: LineConfig = {
      channelAccessToken: 'token',
      defaultTargetId: 'shared_group_id'
    };
    assert.equal(resolveTargetId(sharedTargetConfig, 'attendance'), 'shared_group_id');
    assert.equal(resolveTargetId(sharedTargetConfig, 'truck'), 'shared_group_id');
    assert.equal(resolveTargetId({ channelAccessToken: 'token' }, 'attendance'), undefined);
  } finally {
    globals.adminDb = prevDb;
    process.env = prevEnv;
  }
});

test('buildAttendanceDailyFlex generates compliant LINE Flex Bubble card', () => {
  const sampleData: AttendanceDailySummaryData = {
    dateKey: '2026-09-14',
    shopName: 'พชรพาณิชย์',
    totalStaff: 10,
    presentFull: 7,
    presentHalf: 1,
    absent: 2,
    specialStaff: [
      { name: 'สมชาย', status: 'ครึ่งวัน', advanceSatang: 20000 },
      { name: 'สมศักดิ์', status: 'ไม่มา', deductionSatang: 30000 }
    ],
    dailyWagesSatang: 245000, // 2,450.00 THB
    dailyAdvanceSatang: 20000, // 200.00 THB
    monthlyNetPayrollSatang: 5200000 // 52,000.00 THB
  };

  const flex = buildAttendanceDailyFlex(sampleData);
  assert.equal(flex.type, 'flex');
  assert.match(flex.altText, /สรุปการเช็คชื่อพนักงานประจำวัน/);
  assert.match(flex.altText, /2026-09-14|14/);

  const bubble = flex.contents;
  assert.equal(bubble.type, 'bubble');
  assert.equal(bubble.size, 'mega');

  // Verify Navy theme #003566
  assert.equal(bubble.header?.backgroundColor, '#003566');

  // Stringify to verify keywords and financial amounts
  const jsonStr = JSON.stringify(bubble);
  assert.match(jsonStr, /พชรพาณิชย์/);
  assert.match(jsonStr, /2,450\.00/); // daily wages formatted
  assert.match(jsonStr, /200\.00/); // advance formatted
  assert.match(jsonStr, /52,000\.00/); // monthly net formatted
  assert.match(jsonStr, /สมชาย/);
  assert.match(jsonStr, /สมศักดิ์/);

  // Test holiday mode
  const holidayData: AttendanceDailySummaryData = {
    dateKey: '2026-09-15',
    shopName: 'พชรพาณิชย์',
    isHoliday: true,
    holidayName: 'วันหยุดประจำสัปดาห์',
    totalStaff: 10,
    presentFull: 0,
    presentHalf: 0,
    absent: 0,
    dailyWagesSatang: 0,
    dailyAdvanceSatang: 0,
    monthlyNetPayrollSatang: 5200000
  };
  const holidayFlex = buildAttendanceDailyFlex(holidayData);
  const holidayJson = JSON.stringify(holidayFlex.contents);
  assert.match(holidayJson, /วันหยุดประจำสัปดาห์/);
});

test('buildTruckDailyFlex generates compliant LINE Flex Bubble card with Slate-Navy and Amber theme', () => {
  const sampleTruckData: TruckDailySummaryData = {
    dateKey: '2026-09-14',
    companyName: 'ระบบบันทึกงานรถสิบล้อ',
    activeTruckCount: 2,
    totalTrips: 5,
    totalDriverPaySatang: 325000, // 3,250.00 THB
    totalFuelCostSatang: 480000, // 4,800.00 THB
    trucks: [
      {
        plateNumber: '70-1234',
        driverName: 'สมปอง',
        tripCount: 3,
        routesSummary: 'ท่าทราย A -> ไซต์งาน B (3)',
        driverPaySatang: 195000,
        fuelCostSatang: 280000
      },
      {
        plateNumber: '70-5678',
        driverName: 'สมหมาย',
        tripCount: 2,
        routesSummary: 'บ่อดิน 1 -> โรงงาน C (2)',
        driverPaySatang: 130000,
        fuelCostSatang: 200000
      }
    ],
    monthTotalTrips: 45,
    monthDriverPaySatang: 2925000, // 29,250.00 THB
    monthFuelCostSatang: 4320000 // 43,200.00 THB
  };

  const flex = buildTruckDailyFlex(sampleTruckData);
  assert.equal(flex.type, 'flex');
  assert.match(flex.altText, /สรุปงานรถสิบล้อประจำวัน/);

  const bubble = flex.contents;
  assert.equal(bubble.type, 'bubble');
  assert.equal(bubble.size, 'mega');

  // Verify Slate-Navy theme #0F2942
  assert.equal(bubble.header?.backgroundColor, '#0F2942');

  const jsonStr = JSON.stringify(bubble);
  // Verify Signal Amber accent #D97706 is used
  assert.match(jsonStr, /#D97706|#d97706/);
  // Verify truck data
  assert.match(jsonStr, /70-1234/);
  assert.match(jsonStr, /สมปอง/);
  assert.match(jsonStr, /70-5678/);
  assert.match(jsonStr, /3,250\.00/);
  assert.match(jsonStr, /4,800\.00/);
  assert.match(jsonStr, /29,250\.00/);
  assert.match(jsonStr, /43,200\.00/);
});

test('sendLinePush calls native fetch for push and broadcast endpoints correctly', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; headers: any; body: any }> = [];

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({
        url,
        method: init?.method || 'GET',
        headers: init?.headers,
        body: init?.body ? JSON.parse(init.body as string) : undefined
      });
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const config: LineConfig = {
      channelAccessToken: 'line_secret_token_xyz',
      defaultTargetId: 'group_abc'
    };

    // 1. Push when targetId is provided
    const pushRes = await sendLinePush(config, [{ type: 'text', text: 'Hello Push' }], 'target_user_123');
    assert.equal(pushRes.ok, true);
    assert.equal(pushRes.mode, 'push');
    assert.equal(pushRes.targetId, 'target_user_123');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.line.me/v2/bot/message/push');
    assert.equal(calls[0].headers?.['Authorization'], 'Bearer line_secret_token_xyz');
    assert.equal(calls[0].body.to, 'target_user_123');
    assert.deepEqual(calls[0].body.messages, [{ type: 'text', text: 'Hello Push' }]);

    // 2. Broadcast when targetId is omitted
    calls.length = 0;
    const broadcastRes = await sendLinePush(config, [{ type: 'text', text: 'Hello Broadcast' }]);
    assert.equal(broadcastRes.ok, true);
    assert.equal(broadcastRes.mode, 'broadcast');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.line.me/v2/bot/message/broadcast');
    assert.equal(calls[0].headers?.['Authorization'], 'Bearer line_secret_token_xyz');
    assert.equal(calls[0].body.to, undefined);
    assert.deepEqual(calls[0].body.messages, [{ type: 'text', text: 'Hello Broadcast' }]);

    // 3. Reply helper
    calls.length = 0;
    const replyRes = await sendLineReply('line_secret_token_xyz', 'reply_token_999', [{ type: 'text', text: 'Reply Msg' }]);
    assert.equal(replyRes, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.line.me/v2/bot/message/reply');
    assert.equal(calls[0].body.replyToken, 'reply_token_999');

    // 4. Missing token error
    const noTokenConfig: LineConfig = {};
    await assert.rejects(
      async () => {
        await sendLinePush(noTokenConfig, [{ type: 'text', text: 'Fail' }]);
      },
      (err: any) => {
        return err.code === 'LINE_NOT_CONFIGURED';
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET and PATCH /api/line/settings manage Line configuration with Read-Before-Write integrity', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const prevDb = globals.adminDb;
  const shopId = process.env.SHOP_ID || 'main';
  const lineDocPath = `shops/${shopId}/profile/line`;

  const initialDocs = new Map<string, any>([
    [
      lineDocPath,
      {
        channelAccessToken: 'secret_token_12345678',
        defaultTargetId: 'group_test_default',
        attendanceTargetId: 'group_attendance',
        truckTargetId: 'group_truck',
        dailySummaryEnabled: true,
        dailySummaryHour: 19,
        revision: 2
      }
    ]
  ]);
  const mock = createMockDb(initialDocs);
  globals.adminDb = mock.db;

  try {
    // 1. GET returns masked token
    const getReq = new NextRequest('http://localhost/api/line/settings');
    const getRes = await getLineSettings(getReq);
    const getJson = await getRes.json();
    assert.equal(getJson.ok, true);
    assert.equal(getJson.data.profile.channelAccessTokenMasked, '••••5678');
    assert.equal(getJson.data.profile.defaultTargetId, 'group_test_default');
    assert.equal(getJson.data.profile.revision, 2);

    // 2. PATCH updates settings
    const patchBody = {
      channelAccessToken: 'new_secret_token_87654321',
      defaultTargetId: 'new_group_default',
      attendanceTargetId: 'new_group_att',
      truckTargetId: 'new_group_truck',
      dailySummaryEnabled: true,
      dailySummaryHour: 19,
      expectedRevision: 2,
      requestId: 'req_line_patch_1'
    };
    const patchReq = new NextRequest('http://localhost/api/line/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody)
    });
    const patchRes = await patchLineSettings(patchReq);
    const patchJson = await patchRes.json();
    assert.equal(patchJson.ok, true);
    assert.equal(patchJson.data.revision, 3);
    assert.equal(patchJson.data.defaultTargetId, 'new_group_default');

    // Confirm stored in Firestore
    const stored = mock.docs.get(lineDocPath);
    assert.equal(stored.channelAccessToken, 'new_secret_token_87654321');
    assert.equal(stored.revision, 3);

    // 3. Conflict on revision mismatch
    const conflictReq = new NextRequest('http://localhost/api/line/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patchBody, requestId: 'req_conflict', expectedRevision: 2 })
    });
    const conflictRes = await patchLineSettings(conflictReq);
    assert.equal(conflictRes.status, 409);
  } finally {
    globals.adminDb = prevDb;
  }
});

test('POST /api/line/notify returns 422 LINE_NOT_CONFIGURED when token missing, and 200 when configured', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const prevDb = globals.adminDb;
  const prevEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  try {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const emptyMock = createMockDb(new Map());
    globals.adminDb = emptyMock.db;

    // 1. Without token -> 422 LINE_NOT_CONFIGURED
    const reqNoToken = new NextRequest('http://localhost/api/line/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'attendance', isTest: true })
    });
    const resNoToken = await postLineNotify(reqNoToken);
    assert.equal(resNoToken.status, 422);
    const errJson = await resNoToken.json();
    assert.equal(errJson.ok, false);
    assert.equal(errJson.error.code, 'LINE_NOT_CONFIGURED');
    assert.match(errJson.error.message, /ยังไม่ได้ตั้งค่า LINE Channel Access Token/);

    // 2. With token -> 200 success
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'mock_token_abc';
    process.env.LINE_DEFAULT_TARGET_ID = 'target_xyz';

    let fetchCalled = false;
    let dispatchedBody: any = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalled = true;
      if (init?.body) {
        dispatchedBody = JSON.parse(init.body as string);
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const reqWithToken = new NextRequest('http://localhost/api/line/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'both', isTest: true })
    });
    const resWithToken = await postLineNotify(reqWithToken);
    assert.equal(resWithToken.status, 200);
    const okJson = await resWithToken.json();
    assert.equal(okJson.ok, true);
    assert.equal(fetchCalled, true);

    // Verify test notification payload matches pure Thai text with zero emojis
    assert.ok(dispatchedBody, 'Dispatched payload must exist');
    const testMsg = dispatchedBody.messages?.[0];
    assert.equal(testMsg?.type, 'text');
    const expectedText = 'ทดสอบการเชื่อมต่อ LINE Messaging API สำเร็จ\nระบบสามารถส่งข้อความแจ้งเตือนได้ตามปกติ';
    assert.equal(testMsg?.text, expectedText);
    const emojiRegex = /\p{Extended_Pictographic}/u;
    assert.equal(emojiRegex.test(testMsg?.text || ''), false, 'Dispatched test message must not contain emojis');
  } finally {
    globals.adminDb = prevDb;
    process.env = prevEnv;
    globalThis.fetch = originalFetch;
  }
});

test('POST /api/line/webhook replies with Target ID when message text is "id" or "/id"', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const prevDb = globals.adminDb;
  const originalFetch = globalThis.fetch;
  const replyCalls: Array<any> = [];

  try {
    const mock = createMockDb(new Map());
    globals.adminDb = mock.db;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      replyCalls.push({
        url,
        body: init?.body ? JSON.parse(init.body as string) : undefined
      });
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'webhook_token_test';

    // 1. Group ID request
    const groupWebhookReq = new NextRequest('http://localhost/api/line/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            type: 'message',
            replyToken: 'token_group_reply',
            source: { type: 'group', groupId: 'C1234567890abcdef' },
            message: { type: 'text', text: 'id' }
          }
        ]
      })
    });
    const groupRes = await postLineWebhook(groupWebhookReq);
    assert.equal(groupRes.status, 200);
    assert.equal(replyCalls.length, 1);
    assert.equal(replyCalls[0].url, 'https://api.line.me/v2/bot/message/reply');
    assert.equal(replyCalls[0].body.replyToken, 'token_group_reply');
    assert.match(replyCalls[0].body.messages[0].text, /C1234567890abcdef/);

    // 2. User ID request with '/id'
    replyCalls.length = 0;
    const userWebhookReq = new NextRequest('http://localhost/api/line/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            type: 'message',
            replyToken: 'token_user_reply',
            source: { type: 'user', userId: 'U9876543210fedcba' },
            message: { type: 'text', text: '/id' }
          }
        ]
      })
    });
    const userRes = await postLineWebhook(userWebhookReq);
    assert.equal(userRes.status, 200);
    assert.equal(replyCalls.length, 1);
    assert.match(replyCalls[0].body.messages[0].text, /U9876543210fedcba/);

    // 3. Other message is ignored gracefully
    replyCalls.length = 0;
    const otherReq = new NextRequest('http://localhost/api/line/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            type: 'message',
            replyToken: 'token_other',
            source: { type: 'user', userId: 'U9876543210' },
            message: { type: 'text', text: 'สวัสดี' }
          }
        ]
      })
    });
    const otherRes = await postLineWebhook(otherReq);
    assert.equal(otherRes.status, 200);
    assert.equal(replyCalls.length, 0);
  } finally {
    globals.adminDb = prevDb;
    globalThis.fetch = originalFetch;
  }
});

test('GET /api/cron/daily-summary enforces CRON_SECRET and dispatches summaries', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const prevDb = globals.adminDb;
  const prevEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  try {
    process.env.CRON_SECRET = 'super_secret_cron_key';
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'cron_line_token';

    const mock = createMockDb(new Map());
    globals.adminDb = mock.db;

    // 1. Missing or invalid secret -> 401
    const unauthReq = new NextRequest('http://localhost/api/cron/daily-summary', {
      headers: { Authorization: 'Bearer wrong_key' }
    });
    const unauthRes = await getCronDailySummary(unauthReq);
    assert.equal(unauthRes.status, 401);

    // 2. Valid secret -> dispatches summary
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount++;
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const authReq = new NextRequest('http://localhost/api/cron/daily-summary', {
      headers: { Authorization: 'Bearer super_secret_cron_key' }
    });
    const authRes = await getCronDailySummary(authReq);
    assert.equal(authRes.status, 200);
    const json = await authRes.json();
    assert.equal(json.ok, true);
    assert.equal(json.data.dispatched, true);
  } finally {
    globals.adminDb = prevDb;
    process.env = prevEnv;
    globalThis.fetch = originalFetch;
  }
});
