import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

import { POST as postSettings } from '../src/app/api/truck/settings/route';
import { POST as postRecords } from '../src/app/api/truck/records/route';
import { DELETE as deleteRecordById } from '../src/app/api/truck/records/[id]/route';
import { POST as postPhotos } from '../src/app/api/truck/photos/route';
import { TruckPhotoMeta } from '../src/lib/truck/types';

interface MockStore {
  docs: Map<string, any>;
  docVersions: Map<string, number>;
  reset: () => void;
}

function setupMockDb(): MockStore {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const docs = new Map<string, any>();
  const docVersions = new Map<string, number>();

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
      const stagedWrites: Array<{ type: 'set' | 'update' | 'delete'; path: string; data?: any }> = [];
      const read = (r: any) => {
        assert.equal(stagedWrites.length, 0, 'Strict Read-Before-Write VIOLATION');
        return {
          exists: docs.has(r.path),
          id: r.path.split('/').pop()!,
          data: () => docs.get(r.path)
        };
      };

      const result = await run({
        get: async (r: any) => read(r),
        getAll: async (...refs: any[]) => refs.map(read),
        set: (r: any, value: any, options?: any) => {
          stagedWrites.push({
            type: 'set',
            path: r.path,
            data: options?.merge && docs.has(r.path) ? { ...docs.get(r.path), ...value } : value
          });
        },
        update: (r: any, value: any) => {
          stagedWrites.push({
            type: 'update',
            path: r.path,
            data: { ...(docs.get(r.path) || {}), ...value }
          });
        },
        delete: (r: any) => {
          stagedWrites.push({ type: 'delete', path: r.path });
        }
      });

      for (const w of stagedWrites) {
        if (w.type === 'delete') {
          docs.delete(w.path);
        } else {
          docs.set(w.path, w.data);
        }
      }
      return result;
    }
  };

  return {
    docs,
    docVersions,
    reset: () => {
      docs.clear();
      docVersions.clear();
    }
  };
}

// ----------------------------------------------------------------------------
// MISSION RE-VERIFICATION 1: 5-Photo Cap Boundary and Type Tests
// ----------------------------------------------------------------------------
test('Re-verify 1: 5-Photo Cap Boundary & Type Validation', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const truckId = 't_cap_check';
  store.docs.set(`${shop}/trucks/${truckId}`, { truckId, plateNumber: '70-9999', status: 'ACTIVE' });

  const makePhoto = (i: number): TruckPhotoMeta => ({
    photoId: `tp_${i}`,
    sizeKb: 20,
    width: 640,
    height: 480,
    contentType: 'image/webp',
    createdAt: new Date().toISOString()
  });

  // Test 1: 6 photos -> MUST return 422 INVALID_INPUT
  const res6 = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-11-01',
        truckId,
        trips: [],
        fuelCostSatang: 0,
        photos: [1, 2, 3, 4, 5, 6].map(makePhoto),
        expectedRevision: 0,
        requestId: 'req_photo_cap_6'
      })
    })
  );
  assert.equal(res6.status, 422, '6 photos must return 422');
  const body6 = await res6.json();
  assert.equal(body6.ok, false);
  assert.equal(body6.error.code, 'INVALID_INPUT');
  assert.equal(body6.error.message, 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป');

  // Test 2: 10 photos -> MUST return 422 INVALID_INPUT
  const res10 = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-11-01',
        truckId,
        trips: [],
        fuelCostSatang: 0,
        photos: Array.from({ length: 10 }, (_, i) => makePhoto(i + 1)),
        expectedRevision: 0,
        requestId: 'req_photo_cap_10'
      })
    })
  );
  assert.equal(res10.status, 422, '10 photos must return 422');
  const body10 = await res10.json();
  assert.equal(body10.error.code, 'INVALID_INPUT');
  assert.equal(body10.error.message, 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป');

  // Test 3: Exactly 5 photos -> MUST succeed (200 OK)
  const res5 = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-11-01',
        truckId,
        trips: [],
        fuelCostSatang: 0,
        photos: [1, 2, 3, 4, 5].map(makePhoto),
        expectedRevision: 0,
        requestId: 'req_photo_cap_5'
      })
    })
  );
  assert.equal(res5.status, 200, '5 photos must succeed with 200');
  const body5 = await res5.json();
  assert.equal(body5.ok, true);
  assert.equal(body5.data.photos.length, 5);

  // Test 4: Malformed non-array photos string -> MUST return 422 INVALID_INPUT
  const resStr = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-11-02',
        truckId,
        trips: [],
        photos: 'not-an-array',
        expectedRevision: 0,
        requestId: 'req_photo_malformed_str'
      })
    })
  );
  assert.equal(resStr.status, 422);
  const bodyStr = await resStr.json();
  assert.equal(bodyStr.error.code, 'INVALID_INPUT');
  assert.equal(bodyStr.error.message, 'ข้อมูลรูปภาพไม่ถูกต้อง');

  // Test 5: Malformed non-array photos object -> MUST return 422 INVALID_INPUT
  const resObj = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-11-02',
        truckId,
        trips: [],
        photos: { length: 6 },
        expectedRevision: 0,
        requestId: 'req_photo_malformed_obj'
      })
    })
  );
  assert.equal(resObj.status, 422);
  const bodyObj = await resObj.json();
  assert.equal(bodyObj.error.code, 'INVALID_INPUT');
  assert.equal(bodyObj.error.message, 'ข้อมูลรูปภาพไม่ถูกต้อง');
});

// ----------------------------------------------------------------------------
// MISSION RE-VERIFICATION 2: Corrupted Image Buffers to /api/truck/photos
// ----------------------------------------------------------------------------
test('Re-verify 2: Corrupted / Malformed Buffers in /api/truck/photos', async () => {
  setupMockDb();

  // Test 1: Plain text buffer
  const textBuffer = Buffer.from('THIS_IS_DEFINITELY_NOT_AN_IMAGE_FILE_BUFFER');
  const resText = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: `data:image/jpeg;base64,${textBuffer.toString('base64')}`,
        requestId: 'req_corrupt_text'
      })
    })
  );
  assert.equal(resText.status, 422, 'Text buffer must return 422');
  const bodyText = await resText.json();
  assert.equal(bodyText.ok, false);
  assert.equal(bodyText.error.code, 'INVALID_INPUT');
  assert.equal(bodyText.error.message, 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ');

  // Test 2: Random binary bytes
  const randBytes = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb]);
  const resRand = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: `data:image/png;base64,${randBytes.toString('base64')}`,
        requestId: 'req_corrupt_rand'
      })
    })
  );
  assert.equal(resRand.status, 422, 'Random binary bytes must return 422');
  const bodyRand = await resRand.json();
  assert.equal(bodyRand.error.code, 'INVALID_INPUT');
  assert.equal(bodyRand.error.message, 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ');

  // Test 3: Truncated PNG header (8 bytes of PNG signature with no chunks)
  const truncPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const resTrunc = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: `data:image/png;base64,${truncPng.toString('base64')}`,
        requestId: 'req_corrupt_trunc'
      })
    })
  );
  assert.equal(resTrunc.status, 422, 'Truncated PNG must return 422');
  const bodyTrunc = await resTrunc.json();
  assert.equal(bodyTrunc.error.code, 'INVALID_INPUT');
  assert.equal(bodyTrunc.error.message, 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ');

  // Test 4: Truncated JPEG SOI (4 bytes FF D8 FF E0 with no data)
  const truncJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
  const resJpeg = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: `data:image/jpeg;base64,${truncJpeg.toString('base64')}`,
        requestId: 'req_corrupt_jpeg'
      })
    })
  );
  assert.equal(resJpeg.status, 422, 'Truncated JPEG must return 422');
  const bodyJpeg = await resJpeg.json();
  assert.equal(bodyJpeg.error.code, 'INVALID_INPUT');
  assert.equal(bodyJpeg.error.message, 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ');

  // Test 5: Valid tiny image succeeds with 200
  const validSmallPng = await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: { r: 0, g: 120, b: 255 }
    }
  }).png().toBuffer();

  const resValid = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: `data:image/png;base64,${validSmallPng.toString('base64')}`,
        requestId: 'req_valid_small'
      })
    })
  );
  assert.equal(resValid.status, 200, 'Valid small PNG must succeed with 200');
  const bodyValid = await resValid.json();
  assert.equal(bodyValid.ok, true);
  assert.equal(bodyValid.data.contentType, 'image/webp');
});

// ----------------------------------------------------------------------------
// MISSION RE-VERIFICATION 3: RequestId Tampering Across All Endpoints
// ----------------------------------------------------------------------------
test('Re-verify 3: RequestId Tampering Replay Across Records, Records[id], and Settings', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const truckId = 't_tamper_test';
  store.docs.set(`${shop}/trucks/${truckId}`, { truckId, plateNumber: '70-5555', status: 'ACTIVE' });
  store.docs.set(`${shop}/profile/truck`, { companyName: 'บริษัท ก ข ค', revision: 1 });

  // 1. Records route POST tampering
  const recordReqId = 'req_tamper_records_suite';
  const legitRecord = {
    dateKey: '2026-11-03',
    truckId,
    trips: [],
    fuelCostSatang: 25000,
    expectedRevision: 0,
    requestId: recordReqId
  };

  const resRec1 = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legitRecord)
    })
  );
  assert.equal(resRec1.status, 200, 'Legitimate initial record post succeeds');

  // Exact duplicate replay -> 200 cached
  const resRecReplay = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legitRecord)
    })
  );
  assert.equal(resRecReplay.status, 200, 'Exact replay returns 200 cached response');

  // Tampered payload with altered fuelCostSatang -> MUST return 422 REQUEST_ID_REUSED
  const tamperedRecord = { ...legitRecord, fuelCostSatang: 999999 };
  const resRecTamper = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tamperedRecord)
    })
  );
  assert.equal(resRecTamper.status, 422, 'Tampered record must return 422');
  const bodyRecTamper = await resRecTamper.json();
  assert.equal(bodyRecTamper.ok, false);
  assert.equal(bodyRecTamper.error.code, 'REQUEST_ID_REUSED');
  assert.equal(bodyRecTamper.error.message, 'requestId นี้เคยถูกใช้กับข้อมูลชุดอื่นแล้ว');

  // 2. Settings route UPDATE_PROFILE tampering
  const setReqId = 'req_tamper_settings_suite';
  const legitProfile = {
    action: 'UPDATE_PROFILE',
    companyName: 'ชื่อทางการ 1',
    expectedRevision: 1,
    requestId: setReqId
  };

  const resSet1 = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legitProfile)
    })
  );
  assert.equal(resSet1.status, 200, 'Legitimate profile update succeeds');

  // Exact duplicate replay -> 200 cached
  const resSetReplay = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legitProfile)
    })
  );
  assert.equal(resSetReplay.status, 200, 'Exact profile replay returns 200 cached');

  // Tampered payload with altered companyName -> MUST return 422 REQUEST_ID_REUSED
  const tamperedProfile = { ...legitProfile, companyName: 'ชื่อแอบเปลี่ยน' };
  const resSetTamper = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tamperedProfile)
    })
  );
  assert.equal(resSetTamper.status, 422, 'Tampered profile must return 422');
  const bodySetTamper = await resSetTamper.json();
  assert.equal(bodySetTamper.ok, false);
  assert.equal(bodySetTamper.error.code, 'REQUEST_ID_REUSED');
  assert.equal(bodySetTamper.error.message, 'requestId นี้เคยถูกใช้กับข้อมูลชุดอื่นแล้ว');

  // 3. Records[id] route DELETE tampering
  const delRecordDocId = '2026-11-03_t_tamper_test';
  const delReqId = 'req_tamper_delete_suite';

  const legitDel = {
    expectedRevision: 1,
    requestId: delReqId
  };

  const resDel1 = await deleteRecordById(
    new NextRequest(`http://localhost/api/truck/records/${delRecordDocId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legitDel)
    }),
    { params: Promise.resolve({ id: delRecordDocId }) }
  );
  assert.equal(resDel1.status, 200, 'Legitimate delete succeeds');

  // Exact replay of DELETE -> 200 cached
  const resDelReplay = await deleteRecordById(
    new NextRequest(`http://localhost/api/truck/records/${delRecordDocId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legitDel)
    }),
    { params: Promise.resolve({ id: delRecordDocId }) }
  );
  assert.equal(resDelReplay.status, 200, 'Exact delete replay returns 200 cached');

  // Tampered DELETE with altered expectedRevision -> MUST return 422 REQUEST_ID_REUSED
  const tamperedDel = { ...legitDel, expectedRevision: 99 };
  const resDelTamper = await deleteRecordById(
    new NextRequest(`http://localhost/api/truck/records/${delRecordDocId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tamperedDel)
    }),
    { params: Promise.resolve({ id: delRecordDocId }) }
  );
  assert.equal(resDelTamper.status, 422, 'Tampered delete must return 422');
  const bodyDelTamper = await resDelTamper.json();
  assert.equal(bodyDelTamper.ok, false);
  assert.equal(bodyDelTamper.error.code, 'REQUEST_ID_REUSED');
  assert.equal(bodyDelTamper.error.message, 'requestId นี้เคยถูกใช้กับข้อมูลชุดอื่นแล้ว');
});
