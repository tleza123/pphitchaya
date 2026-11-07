import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

import { GET as getBootstrap } from '../src/app/api/truck/bootstrap/route';
import { GET as getSettings, POST as postSettings } from '../src/app/api/truck/settings/route';
import { GET as getRecords, POST as postRecords } from '../src/app/api/truck/records/route';
import { GET as getRecordById, DELETE as deleteRecordById } from '../src/app/api/truck/records/[id]/route';
import { POST as postPhotos } from '../src/app/api/truck/photos/route';
import { GET as getPhotoById, DELETE as deletePhotoById } from '../src/app/api/truck/photos/[id]/route';
import { GET as getBackup, POST as postBackup } from '../src/app/api/truck/backup/route';

interface MockStore {
  docs: Map<string, any>;
  reset: () => void;
}

function setupMockDb(): MockStore {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const docs = new Map<string, any>();

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
      },
      delete: async () => {
        docs.delete(path);
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
        assert.equal(
          stagedWrites.length,
          0,
          `Strict Read-Before-Write violated: attempted to read "${r.path}" after write operations were staged`
        );
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
    reset: () => docs.clear()
  };
}

test('Truck Routes: Bootstrap returns fleet, origins, destinations, profile, and lineSettings', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;

  // Seed baseline data
  store.docs.set(`${shop}/profile/truck`, { companyName: 'สมใจ ทรานสปอร์ต', revision: 2 });
  store.docs.set(`${shop}/profile/line`, {
    channelAccessToken: 'line_token_secret_12345',
    defaultTargetId: 'U11112222',
    dailySummaryEnabled: true,
    dailySummaryHour: 19,
    revision: 1
  });
  store.docs.set(`${shop}/trucks/t1`, {
    truckId: 't1',
    plateNumber: '70-1111',
    driverName: 'สมหมาย',
    status: 'ACTIVE',
    revision: 1
  });
  store.docs.set(`${shop}/truckOrigins/o1`, {
    originId: 'o1',
    name: 'ท่าเรือคลองเตย',
    revision: 1
  });
  store.docs.set(`${shop}/truckDestinations/d1`, {
    destinationId: 'd1',
    name: 'โรงงานบางพลี',
    driverPaySatang: 65000,
    revision: 1
  });

  const res = await getBootstrap(new NextRequest('http://localhost/api/truck/bootstrap'));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.truckProfile.companyName, 'สมใจ ทรานสปอร์ต');
  assert.equal(body.data.truckProfile.revision, 2);
  assert.equal(body.data.lineSettings.defaultTargetId, 'U11112222');
  assert.equal(body.data.lineSettings.channelAccessTokenMasked.includes('2345'), true);
  assert.equal(body.data.trucks.length, 1);
  assert.equal(body.data.trucks[0].plateNumber, '70-1111');
  assert.equal(body.data.truckOrigins.length, 1);
  assert.equal(body.data.truckOrigins[0].name, 'ท่าเรือคลองเตย');
  assert.equal(body.data.truckDestinations.length, 1);
  assert.equal(body.data.truckDestinations[0].driverPaySatang, 65000);
});

test('Truck Routes: Settings manages fleet, origins, destinations, and companyName', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;

  // 1. Update companyName in truckProfile
  const profRes = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPDATE_PROFILE',
        companyName: 'บริษัท พีพีพิชญา ทรานสปอร์ต จำกัด',
        expectedRevision: 1,
        requestId: 'req_update_profile_01'
      })
    })
  );
  const profBody = await profRes.json();
  assert.equal(profRes.status, 200);
  assert.equal(profBody.ok, true);
  assert.equal(profBody.data.companyName, 'บริษัท พีพีพิชญา ทรานสปอร์ต จำกัด');
  assert.equal(store.docs.get(`${shop}/profile/truck`)?.companyName, 'บริษัท พีพีพิชญา ทรานสปอร์ต จำกัด');

  // 2. Add a new truck
  const truckRes = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPSERT_TRUCK',
        truck: {
          truckId: 'truck_101',
          plateNumber: '83-9999',
          driverName: 'มานพ สมบูรณ์',
          status: 'ACTIVE'
        },
        requestId: 'req_add_truck_01'
      })
    })
  );
  const truckBody = await truckRes.json();
  assert.equal(truckRes.status, 200);
  assert.equal(truckBody.ok, true);
  assert.equal(truckBody.data.plateNumber, '83-9999');
  assert.equal(store.docs.has(`${shop}/trucks/truck_101`), true);

  // 3. Add origin and destination with satang validation
  const destRes = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPSERT_DESTINATION',
        destination: {
          destinationId: 'dest_501',
          name: 'แหลมฉบัง ประตู 3',
          driverPaySatang: 120000 // 1,200.00 Baht
        },
        requestId: 'req_add_dest_01'
      })
    })
  );
  const destBody = await destRes.json();
  assert.equal(destRes.status, 200);
  assert.equal(destBody.ok, true);
  assert.equal(destBody.data.driverPaySatang, 120000);

  // Re-read settings via GET
  const getRes = await getSettings(new NextRequest('http://localhost/api/truck/settings'));
  const getBody = await getRes.json();
  assert.equal(getBody.data.truckProfile.companyName, 'บริษัท พีพีพิชญา ทรานสปอร์ต จำกัด');
  assert.equal(getBody.data.trucks.length, 1);
  assert.equal(getBody.data.truckDestinations.length, 1);

  // Delete truck
  const delTruckRes = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'DELETE_TRUCK',
        truckId: 'truck_101',
        requestId: 'req_del_truck_01'
      })
    })
  );
  assert.equal((await delTruckRes.json()).ok, true);
  assert.equal(store.docs.has(`${shop}/trucks/truck_101`), true, 'historical master records are retained');
  assert.equal(store.docs.get(`${shop}/trucks/truck_101`).status, 'SUSPENDED');
});

test('Truck Routes: POST /api/truck/records creates, updates in-place, and enforces Read-Before-Write and Idempotency', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const dateKey = '2026-09-15';
  const truckId = 'truck_88';
  const monthKey = '2026-09';
  const recordDocId = `${dateKey}_${truckId}`;
  const recordPath = `${shop}/truckMonths/${monthKey}/records/${recordDocId}`;

  // Seed truck
  store.docs.set(`${shop}/trucks/${truckId}`, {
    truckId,
    plateNumber: '82-5555',
    driverName: 'สมบูรณ์ บุญส่ง',
    status: 'ACTIVE',
    revision: 1
  });

  const initialPayload = {
    dateKey,
    truckId,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'โรงโม่สระบุรี',
        destinationMode: 'DEST_1',
        destinationId: 'd1',
        destinationName: 'แพลนท์พระราม 2',
        driverPaySatang: 75000,
        note: 'เที่ยวเช้า'
      }
    ],
    fuelCostSatang: 150000, // 1,500.00 Baht
    expectedRevision: 0,
    requestId: 'req_create_daily_record_01'
  };

  // 1. Initial Creation
  const createRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initialPayload)
    })
  );
  const createBody = await createRes.json();

  assert.equal(createRes.status, 200);
  assert.equal(createBody.ok, true);
  assert.equal(createBody.data.recordId, recordDocId);
  assert.equal(createBody.data.revision, 1);
  assert.equal(createBody.data.tripCount, 1);
  assert.equal(createBody.data.totalDriverPaySatang, 75000);
  assert.equal(createBody.data.fuelCostSatang, 150000);
  assert.equal(createBody.data.plateNumberSnapshot, '82-5555');
  assert.equal(store.docs.has(recordPath), true);

  // 2. Idempotency Replay (same requestId returns exact cached payload without modifying state)
  const replayRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initialPayload)
    })
  );
  const replayBody = await replayRes.json();
  assert.equal(replayRes.status, 200);
  assert.equal(replayBody.data.revision, 1);

  // 3. In-place Edit / Update of the SAME {dateKey}_{truckId} record
  const updatePayload = {
    dateKey,
    truckId,
    trips: [
      {
        tripIndex: 1,
        fromLocation: 'โรงโม่สระบุรี',
        destinationMode: 'DEST_1',
        destinationId: 'd1',
        destinationName: 'แพลนท์พระราม 2',
        driverPaySatang: 75000,
        note: 'เที่ยวเช้า'
      },
      {
        tripIndex: 2,
        fromLocation: 'แพลนท์พระราม 2',
        destinationMode: '__OTHER__',
        destinationName: 'ไซต์งานพิเศษบางนา',
        driverPaySatang: 80000,
        note: 'เที่ยวบ่าย'
      }
    ],
    fuelCostSatang: 220000, // 2,200.00 Baht
    expectedRevision: 1,
    requestId: 'req_edit_daily_record_02'
  };

  const updateRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    })
  );
  const updateBody = await updateRes.json();

  assert.equal(updateRes.status, 200);
  assert.equal(updateBody.ok, true);
  assert.equal(updateBody.data.recordId, recordDocId);
  assert.equal(updateBody.data.revision, 2);
  assert.equal(updateBody.data.tripCount, 2);
  assert.equal(updateBody.data.totalDriverPaySatang, 155000);
  assert.equal(updateBody.data.fuelCostSatang, 220000);

  // Confirm document in store has revision 2 and updated values
  const storedDoc = store.docs.get(recordPath);
  assert.equal(storedDoc.revision, 2);
  assert.equal(storedDoc.trips.length, 2);
  assert.equal(storedDoc.totalDriverPaySatang, 155000);

  // 4. Concurrency Conflict (expectedRevision mismatch returns 409)
  const conflictRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...updatePayload,
        expectedRevision: 1, // Stale revision
        requestId: 'req_conflict_03'
      })
    })
  );
  assert.equal(conflictRes.status, 409);

  // 5. Query records via GET
  const queryRes = await getRecords(new NextRequest(`http://localhost/api/truck/records?date=${dateKey}`));
  const queryBody = await queryRes.json();
  assert.equal(queryBody.ok, true);
  assert.equal(queryBody.data.records.length, 1);
  assert.equal(queryBody.data.records[0].recordId, recordDocId);

  // 6. Get single record by ID
  const singleRes = await getRecordById(new NextRequest(`http://localhost/api/truck/records/${recordDocId}`), {
    params: Promise.resolve({ id: recordDocId })
  });
  const singleBody = await singleRes.json();
  assert.equal(singleRes.status, 200);
  assert.equal(singleBody.data.recordId, recordDocId);

  // 7. Delete record by ID
  const delRes = await deleteRecordById(
    new NextRequest(`http://localhost/api/truck/records/${recordDocId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, requestId: 'req_del_record_04' })
    }),
    { params: Promise.resolve({ id: recordDocId }) }
  );
  const delBody = await delRes.json();
  assert.equal(delRes.status, 200);
  assert.equal(delBody.ok, true);
  assert.equal(store.docs.has(recordPath), false);
});

test('Truck Routes: Photo upload processes WebP with sharp, enforces limit, and stores in truckPhotos', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;

  // Create a genuine small test image buffer using sharp
  const testImgBuffer = await sharp({
    create: {
      width: 200,
      height: 150,
      channels: 3,
      background: { r: 10, g: 150, b: 200 }
    }
  })
    .png()
    .toBuffer();

  const base64Input = testImgBuffer.toString('base64');

  // Upload photo
  const photoRes = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: `data:image/png;base64,${base64Input}`,
        requestId: 'req_upload_photo_01'
      })
    })
  );
  const photoBody = await photoRes.json();

  assert.equal(photoRes.status, 200);
  assert.equal(photoBody.ok, true);
  assert.equal(photoBody.data.contentType, 'image/webp');
  assert.equal(typeof photoBody.data.photoId, 'string');
  assert.equal(photoBody.data.width > 0, true);
  assert.equal(photoBody.data.height > 0, true);
  assert.equal(photoBody.data.sizeKb <= 250, true);

  const photoId = photoBody.data.photoId;
  const photoDocPath = `${shop}/truckPhotos/${photoId}`;
  assert.equal(store.docs.has(photoDocPath), true);
  const storedPhoto = store.docs.get(photoDocPath);
  assert.equal(storedPhoto.contentType, 'image/webp');

  // Fetch photo by ID via GET
  const getPhotoRes = await getPhotoById(new NextRequest(`http://localhost/api/truck/photos/${photoId}`), {
    params: Promise.resolve({ id: photoId })
  });
  assert.equal(getPhotoRes.status, 200);
  assert.equal(getPhotoRes.headers.get('content-type'), 'image/webp');

  const downloadedBuffer = Buffer.from(await getPhotoRes.arrayBuffer());
  const decodedMeta = await sharp(downloadedBuffer).metadata();
  assert.equal(decodedMeta.format, 'webp');

  // Delete photo by ID via DELETE
  const delPhotoRes = await deletePhotoById(new NextRequest(`http://localhost/api/truck/photos/${photoId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id: photoId })
  });
  assert.equal(delPhotoRes.status, 200);
  assert.equal(store.docs.has(photoDocPath), false);
});

test('Truck Routes: Backup exports truck data and keeps web restore disabled', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;

  store.docs.set(`${shop}/profile/truck`, { companyName: 'ทดสอบ แบคอัพ', revision: 1 });
  store.docs.set(`${shop}/trucks/t1`, { plateNumber: '70-9999', driverName: 'คนขับ ก' });
  store.docs.set(`${shop}/truckOrigins/o1`, { name: 'ต้นทาง 1' });
  store.docs.set(`${shop}/truckDestinations/d1`, { name: 'ปลายทาง 1', driverPaySatang: 50000 });
  store.docs.set(`${shop}/truckMonths/2026-09`, { monthKey: '2026-09' });
  store.docs.set(`${shop}/truckMonths/2026-09/records/2026-09-10_t1`, {
    recordId: '2026-09-10_t1',
    dateKey: '2026-09-10',
    truckId: 't1',
    trips: [],
    fuelCostSatang: 100000,
    totalDriverPaySatang: 0
  });

  const res = await getBackup(new NextRequest('http://localhost/api/truck/backup'));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.truckProfile.companyName, 'ทดสอบ แบคอัพ');
  assert.equal(body.data.trucks.length, 1);
  assert.equal(body.data.truckOrigins.length, 1);
  assert.equal(body.data.truckDestinations.length, 1);
  assert.equal(body.data.records.length, 1);
  assert.equal(body.data.records[0].recordId, '2026-09-10_t1');

  // Restore is restricted to the maintenance-gated CLI command.
  const restoreRes = await postBackup(
    new NextRequest('http://localhost/api/truck/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body.data,
        requestId: 'req_restore_backup_01'
      })
    })
  );
  const restoreBody = await restoreRes.json();
  assert.equal(restoreRes.status, 409);
  assert.equal(restoreBody.error.code, 'RESTORE_OFFLINE_ONLY');
});

test('Truck Routes: Input validation and error handling', async () => {
  const store = setupMockDb();

  // 1. Invalid dateKey in records
  const badDateRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-9-1',
        truckId: 't1',
        trips: [],
        fuelCostSatang: 0,
        expectedRevision: 0,
        requestId: 'req_val_01'
      })
    })
  );
  assert.equal(badDateRes.status, 422);
  const badDateBody = await badDateRes.json();
  assert.equal(badDateBody.error.code, 'INVALID_DATE');

  // 2. Negative fuel cost
  const badFuelRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-09-15',
        truckId: 't1',
        trips: [],
        fuelCostSatang: -50000,
        expectedRevision: 0,
        requestId: 'req_val_02'
      })
    })
  );
  assert.equal(badFuelRes.status, 422);
  const badFuelBody = await badFuelRes.json();
  assert.equal(badFuelBody.error.code, 'INVALID_MONEY');

  // 3. Missing requestId
  const badReqIdRes = await postRecords(
    new NextRequest('http://localhost/api/truck/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: '2026-09-15',
        truckId: 't1',
        trips: [],
        fuelCostSatang: 0,
        expectedRevision: 0
      })
    })
  );
  assert.equal(badReqIdRes.status, 422);

  // 4. Invalid recordId on GET /api/truck/records/[id]
  const badGetRecordRes = await getRecordById(
    new NextRequest('http://localhost/api/truck/records/bad_id'),
    { params: Promise.resolve({ id: 'bad_id' }) }
  );
  assert.equal(badGetRecordRes.status, 400);

  // 5. Non-existent record on GET /api/truck/records/[id]
  const missingRecordRes = await getRecordById(
    new NextRequest('http://localhost/api/truck/records/2026-09-99_t99'),
    { params: Promise.resolve({ id: '2026-09-99_t99' }) }
  );
  assert.equal(missingRecordRes.status, 404);

  // 6. Invalid money in settings destination
  const badDestRes = await postSettings(
    new NextRequest('http://localhost/api/truck/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPSERT_DESTINATION',
        destination: {
          destinationId: 'd_invalid',
          name: 'ที่ไหนสักแห่ง',
          driverPaySatang: -100
        },
        requestId: 'req_val_03'
      })
    })
  );
  assert.equal(badDestRes.status, 422);

  // 7. Non-existent photo on GET /api/truck/photos/[id]
  const missingPhotoRes = await getPhotoById(
    new NextRequest('http://localhost/api/truck/photos/photo_non_existent'),
    { params: Promise.resolve({ id: 'photo_non_existent' }) }
  );
  assert.equal(missingPhotoRes.status, 404);

  // 8. Empty photo upload
  const emptyPhotoRes = await postPhotos(
    new NextRequest('http://localhost/api/truck/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: '',
        requestId: 'req_val_04'
      })
    })
  );
  assert.equal(emptyPhotoRes.status, 422);
});

