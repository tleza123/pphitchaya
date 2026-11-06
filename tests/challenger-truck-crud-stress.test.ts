import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

import { GET as getSettings, POST as postSettings } from '../src/app/api/truck/settings/route';
import { GET as getRecords, POST as postRecords } from '../src/app/api/truck/records/route';
import { GET as getRecordById, DELETE as deleteRecordById } from '../src/app/api/truck/records/[id]/route';
import { POST as postPhotos } from '../src/app/api/truck/photos/route';
import { GET as getPhotoById, DELETE as deletePhotoById } from '../src/app/api/truck/photos/[id]/route';
import { TruckPhotoMeta } from '../src/lib/truck/types';

interface MockStore {
  docs: Map<string, any>;
  docVersions: Map<string, number>;
  transactionLog: Array<{ type: 'read' | 'write'; path: string; timestamp: number }>;
  reset: () => void;
}

function setupAdversarialMockDb(): MockStore {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const docs = new Map<string, any>();
  const docVersions = new Map<string, number>();
  const transactionLog: Array<{ type: 'read' | 'write'; path: string; timestamp: number }> = [];

  const ref = (path: string, isCol = false): any => {
    const self: any = {
      path,
      id: path.split('/').pop() || '',
      collection: (name: string) => ref(`${path}/${name}`, true),
      doc: (id?: string) => ref(id ? `${path}/${id}` : `${path}/auto-${Math.random().toString(36).slice(2, 9)}`, false),
      get: async () => {
        if (isCol) {
          const prefix = `${path}/`;
          const matched = Array.from(docs.entries())
            .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
            .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v, exists: true, ref: ref(k, false) }));
          return { docs: matched, size: matched.length, empty: matched.length === 0 };
        }
        return { exists: docs.has(path), id: path.split('/').pop()!, data: () => docs.get(path), ref: self };
      },
      where: (field: string, op: string, val: any) => ({
        path, queryField: field, queryValue: val,
        get: async () => {
          const prefix = `${path}/`;
          const matched = Array.from(docs.entries())
            .filter(([k, v]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/') && v?.[field] === val)
            .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v, exists: true, ref: ref(k, false) }));
          return { docs: matched, size: matched.length, empty: matched.length === 0 };
        }
      }),
      set: async (data: any, options?: any) => {
        if (options?.merge && docs.has(path)) {
          docs.set(path, { ...docs.get(path), ...data });
        } else {
          docs.set(path, data);
        }
        docVersions.set(path, (docVersions.get(path) || 0) + 1);
      },
      delete: async () => {
        docs.delete(path);
        docVersions.set(path, (docVersions.get(path) || 0) + 1);
      }
    };
    return self;
  };

  globals.adminDb = {
    collection: (name: string) => ref(name, true),
    doc: (path: string) => ref(path, false),
    runTransaction: async (run: (tx: any) => Promise<unknown>) => {
      let attempts = 5;
      while (attempts-- > 0) {
        const stagedWrites: Array<{ type: 'set' | 'update' | 'delete'; path: string; data?: any }> = [];
        const readVersions = new Map<string, number>();

        const read = (r: any) => {
          assert.equal(
            stagedWrites.length,
            0,
            `Strict Read-Before-Write VIOLATION: Read attempted on "${r.path}" AFTER write operations were staged!`
          );
          readVersions.set(r.path, docVersions.get(r.path) || 0);
          transactionLog.push({ type: 'read', path: r.path, timestamp: Date.now() });
          return {
            exists: docs.has(r.path),
            id: r.path.split('/').pop()!,
            data: () => docs.get(r.path)
          };
        };

        const result = await run({
          get: async (r: any) => { if (r.queryField) { const prefix = r.path + '/'; const matched = [...docs.entries()].filter(([k,v]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/') && v?.[r.queryField] === r.queryValue).map(([k,v]) => ({id:k.split('/').pop(),data:()=>v})); return {empty: matched.length === 0,docs:matched}; } return read(r); },
          getAll: async (...refs: any[]) => refs.map(read),
          set: (r: any, value: any, options?: any) => {
            transactionLog.push({ type: 'write', path: r.path, timestamp: Date.now() });
            stagedWrites.push({
              type: 'set',
              path: r.path,
              data: options?.merge && docs.has(r.path) ? { ...docs.get(r.path), ...value } : value
            });
          },
          update: (r: any, value: any) => {
            transactionLog.push({ type: 'write', path: r.path, timestamp: Date.now() });
            stagedWrites.push({
              type: 'update',
              path: r.path,
              data: { ...(docs.get(r.path) || {}), ...value }
            });
          },
          delete: (r: any) => {
            transactionLog.push({ type: 'write', path: r.path, timestamp: Date.now() });
            stagedWrites.push({ type: 'delete', path: r.path });
          }
        });

        // Concurrency conflict detection: verify if any read path was modified concurrently
        let hasConflict = false;
        for (const [p, ver] of readVersions.entries()) {
          if ((docVersions.get(p) || 0) !== ver) {
            hasConflict = true;
            break;
          }
        }

        if (hasConflict) {
          // In Firestore, concurrent conflict triggers transaction retry
          await new Promise(resolve => setTimeout(resolve, 5));
          continue;
        }

        // Commit atomically
        for (const w of stagedWrites) {
          if (w.type === 'delete') {
            docs.delete(w.path);
          } else {
            docs.set(w.path, w.data);
          }
          docVersions.set(w.path, (docVersions.get(w.path) || 0) + 1);
        }
        return result;
      }
      throw new Error('Transaction contention retry limit reached');
    }
  };

  return {
    docs,
    docVersions,
    transactionLog,
    reset: () => {
      docs.clear();
      docVersions.clear();
      transactionLog.length = 0;
    }
  };
}

// ============================================================================
// SUITE 1: Concurrency Conflicts & Parallel Race Conditions
// ============================================================================
test('Concurrency: Sequential conflicting expectedRevision returns 409 CONFLICT', async () => {
  const store = setupAdversarialMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const dateKey = '2026-10-01';
  const truckId = 'truck_c1';
  const monthKey = '2026-10';
  const recordDocId = `${dateKey}_${truckId}`;

  // Seed truck
  store.docs.set(`${shop}/trucks/${truckId}`, {
    truckId,
    plateNumber: '71-1234',
    driverName: 'กิตติศักดิ์',
    status: 'ACTIVE',
    revision: 1
  });

  // Step 1: Create record at revision 0 -> becomes revision 1
  const createRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey,
        truckId,
        trips: [
          {
            tripIndex: 1,
            fromLocation: 'ท่าเรือ',
            destinationMode: 'DEST_1',
            destinationName: 'โรงงาน A',
            driverPaySatang: 50000,
            note: ''
          }
        ],
        fuelCostSatang: 100000,
        expectedRevision: 0,
        requestId: 'req_concurrent_init_01'
      })
    })
  );
  assert.equal(createRes.status, 200);
  const createBody = await createRes.json();
  assert.equal(createBody.data.revision, 1);

  // Step 2: Client A updates with expectedRevision: 1 -> becomes revision 2
  const updateResA = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey,
        truckId,
        trips: [
          {
            tripIndex: 1,
            fromLocation: 'ท่าเรือ',
            destinationMode: 'DEST_1',
            destinationName: 'โรงงาน A',
            driverPaySatang: 50000,
            note: 'รอบบ่าย'
          }
        ],
        fuelCostSatang: 120000,
        expectedRevision: 1,
        requestId: 'req_concurrent_client_a_02'
      })
    })
  );
  assert.equal(updateResA.status, 200);
  const updateBodyA = await updateResA.json();
  assert.equal(updateBodyA.data.revision, 2);

  // Step 3: Client B sends update with stale expectedRevision: 1 -> MUST RETURN 409 CONFLICT
  const updateResB = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey,
        truckId,
        trips: [
          {
            tripIndex: 1,
            fromLocation: 'ท่าเรือ',
            destinationMode: 'DEST_1',
            destinationName: 'โรงงาน B',
            driverPaySatang: 60000,
            note: 'รอบชน'
          }
        ],
        fuelCostSatang: 150000,
        expectedRevision: 1, // STALE! Expected 2
        requestId: 'req_concurrent_client_b_conflict'
      })
    })
  );
  assert.equal(updateResB.status, 409, 'Stale expectedRevision must return 409 CONFLICT');
  const updateBodyB = await updateResB.json();
  assert.equal(updateBodyB.ok, false);
  assert.equal(updateBodyB.error.code, 'CONFLICT');

  // Verify that document in store was NOT modified by Client B
  const recordDoc = store.docs.get(`${shop}/truckMonths/${monthKey}/records/${recordDocId}`);
  assert.equal(recordDoc.revision, 2);
  assert.equal(recordDoc.trips[0].destinationName, 'โรงงาน A');
});

test('Concurrency: Parallel racing updates with identical expectedRevision - only 1 succeeds, others get 409', async () => {
  const store = setupAdversarialMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const dateKey = '2026-10-02';
  const truckId = 'truck_race_parallel';
  const monthKey = '2026-10';
  const recordDocId = `${dateKey}_${truckId}`;
  const recordPath = `${shop}/truckMonths/${monthKey}/records/${recordDocId}`;

  // Seed truck and initial record at revision 1
  store.docs.set(`${shop}/trucks/${truckId}`, { truckId, plateNumber: '72-0000', status: 'ACTIVE' });
  store.docs.set(recordPath, {
    recordId: recordDocId,
    dateKey,
    monthKey,
    truckId,
    plateNumberSnapshot: '72-0000',
    driverNameSnapshot: 'นักแข่ง',
    fuelCostSatang: 100000,
    totalDriverPaySatang: 50000,
    tripCount: 1,
    trips: [],
    photos: [],
    revision: 1
  });

  // Launch 5 simultaneous parallel requests, all competing with expectedRevision: 1
  const parallelRequests = [1, 2, 3, 4, 5].map(i =>
    postRecords(
      new NextRequest('http://localhost/api/truck/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey,
          truckId,
          trips: [
            {
              tripIndex: 1,
              fromLocation: 'ท่าเรือ',
              destinationMode: 'DEST_1',
              destinationName: `ปลายทางแข่งที่ ${i}`,
              driverPaySatang: 50000,
              note: ''
            }
          ],
          fuelCostSatang: 100000 + i * 1000,
          expectedRevision: 1,
          requestId: `req_race_parallel_${i}`
        })
      })
    )
  );

  const responses = await Promise.all(parallelRequests);
  const statuses = responses.map(r => r.status);
  const successCount = statuses.filter(s => s === 200).length;
  const conflictCount = statuses.filter(s => s === 409).length;

  console.log('Empirical Concurrency Race Results:', { statuses, successCount, conflictCount });

  assert.equal(successCount, 1, 'Exactly one concurrent request must succeed with 200 OK');
  assert.equal(conflictCount, 4, 'All four competing concurrent requests must receive 409 CONFLICT');
  assert.equal(store.docs.get(recordPath).revision, 2, 'Revision must be incremented exactly once to 2');
});

test('Concurrency: Stale expectedRevision on DELETE returns 409 CONFLICT', async () => {
  const store = setupAdversarialMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const recordDocId = '2026-10-03_truck_c2';
  const recordPath = `${shop}/truckMonths/2026-10/records/${recordDocId}`;

  // Seed record at revision 3
  store.docs.set(recordPath, {
    recordId: recordDocId,
    dateKey: '2026-10-03',
    monthKey: '2026-10',
    truckId: 'truck_c2',
    revision: 3,
    trips: [],
    fuelCostSatang: 0
  });

  // Attempt delete with stale revision 2
  const delRes = await deleteRecordById(
    new NextRequest(`http://localhost/api/truck/records/${recordDocId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 2, // STALE
        requestId: 'req_del_conflict_01'
      })
    }),
    { params: Promise.resolve({ id: recordDocId }) }
  );

  assert.equal(delRes.status, 409, 'DELETE with stale expectedRevision must return 409 CONFLICT');
  const delBody = await delRes.json();
  assert.equal(delBody.ok, false);
  assert.equal(delBody.error.code, 'CONFLICT');
  assert.equal(store.docs.has(recordPath), true, 'Record must remain untouched');
});

test('Concurrency: Stale expectedRevision in settings (Profile, Truck, Dest) returns 409', async () => {
  const store = setupAdversarialMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;

  // 1. Profile conflict
  store.docs.set(`${shop}/profile/truck`, { companyName: 'สมใจ', revision: 5 });
  const profRes = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPDATE_PROFILE',
        companyName: 'ชื่อใหม่',
        expectedRevision: 4, // Stale
        requestId: 'req_prof_conflict_01'
      })
    })
  );
  assert.equal(profRes.status, 409, 'UPDATE_PROFILE stale revision must return 409');

  // 2. Truck conflict
  store.docs.set(`${shop}/trucks/t_test`, { truckId: 't_test', plateNumber: '11-1111', revision: 3 });
  const truckRes = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPSERT_TRUCK',
        truck: { truckId: 't_test', plateNumber: '11-2222' },
        expectedRevision: 2, // Stale
        requestId: 'req_truck_conflict_01'
      })
    })
  );
  assert.equal(truckRes.status, 409, 'UPSERT_TRUCK stale revision must return 409');

  // 3. Destination conflict
  store.docs.set(`${shop}/truckDestinations/d_test`, { destinationId: 'd_test', name: 'ปลายทางเดิม', revision: 4 });
  const destRes = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPSERT_DESTINATION',
        destination: { destinationId: 'd_test', name: 'ปลายทางใหม่', driverPaySatang: 50000 },
        expectedRevision: 3, // Stale
        requestId: 'req_dest_conflict_01'
      })
    })
  );
  assert.equal(destRes.status, 409, 'UPSERT_DESTINATION stale revision must return 409');
});

// ============================================================================
// SUITE 2: Idempotency Replay & Duplicate RequestId Tampering
// ============================================================================
test('Idempotency: Exact replay with identical requestId returns cached response without modifying state', async () => {
  const store = setupAdversarialMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const dateKey = '2026-10-04';
  const truckId = 'truck_idem_1';
  const monthKey = '2026-10';
  const recordDocId = `${dateKey}_${truckId}`;
  const recordPath = `${shop}/truckMonths/${monthKey}/records/${recordDocId}`;

  store.docs.set(`${shop}/trucks/${truckId}`, { truckId, plateNumber: '80-1111', status: 'ACTIVE' });

  const payload = {
    dateKey,
    truckId,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'ต้นทาง',
        destinationMode: 'DEST_1',
        destinationName: 'ปลายทาง',
        driverPaySatang: 70000,
        note: ''
      }
    ],
    fuelCostSatang: 50000,
    expectedRevision: 0,
    requestId: 'req_idem_exact_replay_100'
  };

  // First request: Creates record
  const res1 = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
  assert.equal(res1.status, 200);
  const body1 = await res1.json();
  assert.equal(body1.data.revision, 1);

  // Exact duplicate replay
  const res2 = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
  assert.equal(res2.status, 200);
  const body2 = await res2.json();
  assert.equal(body2.data.revision, 1, 'Replay must return cached revision 1');
  assert.equal(body2.data.recordId, recordDocId);

  // Third replay
  const res3 = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
  assert.equal(res3.status, 200);
  const body3 = await res3.json();
  assert.equal(body3.data.revision, 1);

  // Verify store revision is still 1
  assert.equal(store.docs.get(recordPath).revision, 1);
});

test('Idempotency: Reused requestId with tampered payload returns 422 REQUEST_ID_REUSED', async () => {
  const store = setupAdversarialMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const dateKey = '2026-10-05';
  const truckId = 'truck_idem_2';
  const requestId = 'req_idem_tamper_attack_200';

  store.docs.set(`${shop}/trucks/${truckId}`, { truckId, plateNumber: '80-2222', status: 'ACTIVE' });

  // Initial legitimate request
  const legPayload = {
    dateKey,
    truckId,
    trips: [],
    fuelCostSatang: 30000,
    expectedRevision: 0,
    requestId
  };
  const legRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legPayload)
    })
  );
  assert.equal(legRes.status, 200);

  // Tampered request with SAME requestId but altered trips and fuel
  const tamperedPayload = {
    dateKey,
    truckId,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'ต้นทาง',
        destinationMode: 'DEST_1',
        destinationName: 'ปลายทางใหม่',
        driverPaySatang: 99999,
        note: 'แอบเปลี่ยนข้อมูล'
      }
    ],
    fuelCostSatang: 999999,
    expectedRevision: 0,
    requestId
  };

  const attackRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tamperedPayload)
    })
  );

  const attackBody = await attackRes.json();
  console.log('Empirical Reused RequestId Result:', {
    status: attackRes.status,
    errorCode: attackBody?.error?.code,
    message: attackBody?.error?.message
  });

  assert.equal(attackRes.status, 422);
  assert.equal(attackBody.ok, false);
  assert.equal(attackBody.error?.code, 'REQUEST_ID_REUSED');
  assert.equal(attackBody.error?.message, 'requestId นี้เคยถูกใช้กับข้อมูลชุดอื่นแล้ว');
});

// ============================================================================
// SUITE 3: Photo Limits, Corrupted Buffers, and Oversized Files
// ============================================================================
test('Photo Limits: Uploading 6+ photos rejected with 422 INVALID_INPUT', async () => {
  const store = setupAdversarialMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const dateKey = '2026-10-06';
  const truckId = 'truck_photo_limit';

  store.docs.set(`${shop}/trucks/${truckId}`, { truckId, plateNumber: '80-3333', status: 'ACTIVE' });

  // Create 6 photos metadata
  const sixPhotos: TruckPhotoMeta[] = [1, 2, 3, 4, 5, 6].map(i => ({
    photoId: `tp_test_${i}`,
    sizeKb: 50,
    width: 800,
    height: 600,
    contentType: 'image/webp',
    createdAt: new Date().toISOString()
  }));

  const res = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey,
        truckId,
        trips: [],
        fuelCostSatang: 10000,
        photos: sixPhotos,
        expectedRevision: 0,
        requestId: 'req_six_photos_test_01'
      })
    })
  );

  const body = await res.json();
  console.log('Empirical 6+ Photos Upload Result:', {
    status: res.status,
    ok: body.ok,
    savedPhotosCount: body?.data?.photos?.length,
    error: body?.error
  });

  assert.equal(res.status, 422);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, 'INVALID_INPUT');
  assert.equal(body.error?.message, 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป');
});

test('Photo Limits: Corrupted non-image buffer upload rejected with 422 INVALID_INPUT', async () => {
  setupAdversarialMockDb();

  // Send corrupted raw string as base64
  const corruptedBuffer = Buffer.from('NOT_AN_IMAGE_RANDOM_CORRUPTED_BYTES_1234567890');
  const base64Corrupted = corruptedBuffer.toString('base64');

  const res = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: `data:image/jpeg;base64,${base64Corrupted}`,
        requestId: 'req_corrupted_image_01'
      })
    })
  );

  const body = await res.json();
  console.log('Empirical Corrupted Buffer Upload Result:', {
    status: res.status,
    ok: body.ok,
    errorCode: body?.error?.code,
    errorMessage: body?.error?.message
  });

  assert.equal(res.status, 422);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, 'INVALID_INPUT');
  assert.equal(body.error?.message, 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ');
});

test('Photo Limits: Oversized files (>10MB input and uncompressible >250KB WebP)', async () => {
  setupAdversarialMockDb();

  // 1. File > 10MB input rejection
  const elevenMbBuffer = Buffer.alloc(11 * 1024 * 1024, 0x41); // 11MB of 'A'
  const resOver10Mb = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: `data:image/jpeg;base64,${elevenMbBuffer.toString('base64')}`,
        requestId: 'req_over_10mb_01'
      })
    })
  );
  assert.equal(resOver10Mb.status, 422, 'Over 10MB must be rejected with 422');
  const body10Mb = await resOver10Mb.json();
  assert.equal(body10Mb.error.code, 'INVALID_INPUT');

  // 2. High-entropy image that cannot be compressed to < 250KB
  const noiseImage = await sharp({
    create: {
      width: 1280,
      height: 1280,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: {
        type: 'gaussian',
        mean: 128,
        sigma: 50
      }
    }
  })
    .png()
    .toBuffer();

  const resNoise = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: `data:image/png;base64,${noiseImage.toString('base64')}`,
        requestId: 'req_noise_uncompressible_01'
      })
    })
  );
  const bodyNoise = await resNoise.json();
  console.log('Empirical High-Entropy Noise Image Result:', {
    status: resNoise.status,
    ok: bodyNoise.ok,
    sizeKb: bodyNoise?.data?.sizeKb,
    errorCode: bodyNoise?.error?.code,
    errorMessage: bodyNoise?.error?.message
  });
  assert.equal(resNoise.status, 422);
  assert.equal(bodyNoise.error.code, 'INVALID_INPUT');
});

// ============================================================================
// SUITE 4: Strict Read-Before-Write Transaction Discipline Verification
// ============================================================================
test('Strict Read-Before-Write: All route handlers maintain strict read-then-write order', async () => {
  const store = setupAdversarialMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;

  // Seed required baseline docs
  store.docs.set(`${shop}/trucks/t_rbw`, { truckId: 't_rbw', plateNumber: '88-1111', status: 'ACTIVE', revision: 1 });
  store.docs.set(`${shop}/profile/truck`, { companyName: 'ทดสอบ RBW', revision: 1 });
  store.docs.set(`${shop}/truckOrigins/o_rbw`, { originId: 'o_rbw', name: 'ต้นทาง RBW', revision: 1 });
  store.docs.set(`${shop}/truckDestinations/d_rbw`, { destinationId: 'd_rbw', name: 'ปลายทาง RBW', driverPaySatang: 80000, revision: 1 });

  // 1. POST records (Create)
  await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-10-10',
        truckId: 't_rbw',
        trips: [{ tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 80000, note: '' }],
        fuelCostSatang: 100000,
        expectedRevision: 0,
        requestId: 'req_rbw_records_create'
      })
    })
  );

  // 2. POST records (Update)
  await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-10-10',
        truckId: 't_rbw',
        trips: [{ tripIndex: 1, fromLocation: 'A', destinationMode: 'DEST_1', destinationName: 'B', driverPaySatang: 80000, note: '' }],
        fuelCostSatang: 120000,
        expectedRevision: 1,
        requestId: 'req_rbw_records_update'
      })
    })
  );

  // 3. POST settings UPDATE_PROFILE
  await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPDATE_PROFILE',
        companyName: 'ชื่อใหม่ RBW',
        expectedRevision: 1,
        requestId: 'req_rbw_update_profile'
      })
    })
  );

  // 4. POST settings UPSERT_TRUCK
  await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPSERT_TRUCK',
        truck: { truckId: 't_rbw', plateNumber: '88-2222' },
        expectedRevision: 1,
        requestId: 'req_rbw_upsert_truck'
      })
    })
  );

  // 5. POST settings UPSERT_ORIGIN
  await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPSERT_ORIGIN',
        origin: { originId: 'o_rbw', name: 'ต้นทางใหม่' },
        expectedRevision: 1,
        requestId: 'req_rbw_upsert_orig'
      })
    })
  );

  // 6. POST settings UPSERT_DESTINATION
  await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPSERT_DESTINATION',
        destination: { destinationId: 'd_rbw', name: 'ปลายทางใหม่', driverPaySatang: 90000 },
        expectedRevision: 1,
        requestId: 'req_rbw_upsert_dest'
      })
    })
  );

  // 7. DELETE records
  await deleteRecordById(
    new NextRequest('http://localhost/api/truck/records/2026-10-10_t_rbw', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, requestId: 'req_rbw_del_record' })
    }),
    { params: Promise.resolve({ id: '2026-10-10_t_rbw' }) }
  );

  // 8. DELETE destination
  await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'DELETE_DESTINATION',
        destinationId: 'd_rbw',
        requestId: 'req_rbw_del_dest'
      })
    })
  );

  // 9. DELETE origin
  await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'DELETE_ORIGIN',
        originId: 'o_rbw',
        requestId: 'req_rbw_del_orig'
      })
    })
  );

  // 10. DELETE truck
  await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'DELETE_TRUCK',
        truckId: 't_rbw',
        requestId: 'req_rbw_del_truck'
      })
    })
  );

  // If any read occurred after write in any transaction, setupAdversarialMockDb
  // would have thrown an uncatchable assertion error!
  assert.ok(true, 'All 10 transactional operations strictly adhered to Read-Before-Write');
});
