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
import { GET as getTripsForReview, PATCH as reviewTrip } from '../src/app/api/truck/trips/route';
import { GET as getPayroll, POST as postPayroll } from '../src/app/api/truck/payroll/route';
import { POST as postWorkday } from '../src/app/api/truck/workdays/route';
import { GET as getBilling, POST as postBilling } from '../src/app/api/truck/billing/route';
import { GET as payrollPdf } from '../src/app/api/truck/payroll/pdf/route';
import { GET as billingPdf } from '../src/app/api/truck/billing/[id]/pdf/route';
import { GET as truckReports } from '../src/app/api/truck/reports/route';
import { GET as truckAnalytics } from '../src/app/api/truck/reports/analytics/route';
import { fetchTruckDailySummary } from '../src/lib/line/daily-summary';

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
      isCol,
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
        get: async (r: any) => { if (r.queryField) { const prefix = r.path + '/'; const matched = [...docs.entries()].filter(([k,v]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/') && v?.[r.queryField] === r.queryValue).map(([k,v]) => ({id:k.split('/').pop(),data:()=>v})); return {empty: matched.length === 0,docs:matched}; } if (r.isCol) { assert.equal(stagedWrites.length, 0, `Strict Read-Before-Write violated: attempted to read collection "${r.path}" after write operations were staged`); const prefix = r.path + '/'; const matched = [...docs.entries()].filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map(([k,v]) => ({id:k.split('/').pop(),data:()=>v})); return {empty:matched.length===0,docs:matched}; } return read(r); },
        getAll: async (...refs: any[]) => refs.map(read),
        set: (r: any, value: any, options?: any) => {
          stagedWrites.push({
            type: 'set',
            path: r.path,
            data: options?.merge && docs.has(r.path) ? { ...docs.get(r.path), ...value } : value
          });
        },
        create: (r: any, value: any) => {
          assert.equal(docs.has(r.path), false);
          stagedWrites.push({ type: 'set', path: r.path, data: value });
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

test('Truck sheets save, reload by day, edit and renumber retained trips with shop destinations', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  store.docs.set(`${shop}/trucks/t`, { plateNumber: 'TEST', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckDrivers/d`, { name: 'Driver', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckLocations/a`, { code: '1', name: 'Origin', status: 'ACTIVE' });
  const locationRes = await postSettings(new NextRequest('http://localhost/api/truck/settings', {
    method: 'POST', body: JSON.stringify({ action: 'UPSERT_LOCATION', location: { code: '2', name: 'Shop', isShop: true }, expectedRevision: 0, requestId: 'create-shop-location' })
  }));
  assert.equal(locationRes.status, 200);
  const location = (await locationRes.json()).data;
  const destinationId = location.locationId;
  assert.equal(location.isShop, true);
  store.docs.set(`${shop}/truckTariffs/route`, { originId: 'a', destinationId, customerId: null, driverPaySatang: 10000, status: 'ACTIVE' });
  const trip = { pricingVersion: 3, billingPricingMode: 'PER_TRIP', originId: 'a', destinationId, destinationMode: `LOC_${destinationId}`, departureDate: '2026-11-08', arrivalDate: '2026-11-08', billable: true, customerId: 'ignored-for-shop', weightKg: 100, billingSatang: 50000, fromLocation: 'Origin', destinationName: 'Shop', note: '' };
  const save = async (trips: any[], revision: number) => postRecords(new NextRequest('http://localhost/api/truck/records', { method: 'POST', body: JSON.stringify({ dateKey: '2026-11-08', truckId: 't', driverId: 'd', trips, expectedRevision: revision, requestId: `save-shop-sheet-${revision}` }) }));
  const created = await save([{ ...trip, tripIndex: 1 }, { ...trip, tripIndex: 2 }], 0);
  assert.equal(created.status, 200);
  const saved = (await created.json()).data;
  assert.equal(saved.trips[0].billable, false);
  assert.equal(saved.trips[0].customerId, null);
  assert.equal(saved.trips[0].weightKg, null);
  const loaded = await getRecords(new NextRequest('http://localhost/api/truck/records?date=2026-11-08&truckId=t'));
  assert.equal((await loaded.json()).data.records[0].revision, 1);
  const updated = await save([{ ...trip, tripId: saved.trips[1].tripId, tripIndex: 1, note: 'Moved up' }], 1);
  assert.equal(updated.status, 200);
  const edited = (await updated.json()).data;
  assert.equal(edited.revision, 2);
  assert.equal(edited.trips[0].tripId, saved.trips[1].tripId);
  assert.equal(edited.trips[0].tripIndex, 1);
  assert.equal(store.docs.has(`${shop}/truckTrips/${saved.trips[0].tripId}`), false);
});

test('One-off destinations require a name and explicit driver pay, persist edits and keep standard routes protected', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  store.docs.set(`${shop}/trucks/t`, { plateNumber: 'TEST', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckDrivers/d`, { name: 'Driver', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckLocations/a`, { code: '1', name: 'Origin', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckLocations/b`, { code: '2', name: 'Regular destination', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckTariffs/route`, { originId: 'a', destinationId: 'b', customerId: null, driverPaySatang: 10000, status: 'ACTIVE' });
  const trip = { tripIndex: 1, pricingVersion: 3, billingPricingMode: 'PER_TRIP', originId: 'a', destinationId: null, destinationMode: '__OTHER__', destinationName: ' งานนอกสถานที่ ', manualDriverPaySatang: 12345, departureDate: '2026-11-08', arrivalDate: '2026-11-08', billable: false, weightKg: null, billingSatang: null, note: '' };
  let sequence = 0;
  const save = (changes: object, revision: number) => postRecords(new NextRequest('http://localhost/api/truck/records', { method: 'POST', body: JSON.stringify({ dateKey: '2026-11-08', truckId: 't', driverId: 'd', trips: [{ ...trip, ...changes }], expectedRevision: revision, requestId: `one-off-${++sequence}` }) }));
  for (const invalid of [{ destinationName: ' ' }, { manualDriverPaySatang: undefined }, { manualDriverPaySatang: -1 }, { manualDriverPaySatang: 1.5 }, { manualDriverPaySatang: '100' }]) {
    assert.equal((await save(invalid, 0)).status, 422);
  }
  const created = await save({}, 0);
  assert.equal(created.status, 200);
  const saved = (await created.json()).data;
  const id = saved.trips[0].tripId;
  assert.equal(saved.trips[0].destinationName, 'งานนอกสถานที่');
  assert.equal(saved.trips[0].destinationId, null);
  assert.equal(saved.trips[0].driverPaySatang, 12345);
  assert.equal(saved.trips[0].driverRateSource, 'OVERRIDE');
  assert.equal(saved.totalDriverPaySatang, 12345);
  const loaded = await getRecords(new NextRequest('http://localhost/api/truck/records?date=2026-11-08&truckId=t'));
  assert.equal((await loaded.json()).data.records[0].trips[0].manualDriverPaySatang, 12345);
  const edited = await save({ tripId: id, destinationName: 'สถานที่ใหม่', manualDriverPaySatang: 25000 }, 1);
  assert.equal(edited.status, 200);
  const updated = (await edited.json()).data;
  assert.equal(updated.trips[0].destinationName, 'สถานที่ใหม่');
  assert.equal(updated.totalDriverPaySatang, 25000);
  assert.equal(store.docs.get(`${shop}/truckTrips/${id}`).driverPaySatang, 25000);
  assert.equal((await save({ tripId: id, destinationMode: 'LOC_b', destinationId: 'b' }, 2)).status, 422);
  const standard = await save({ tripId: id, destinationMode: 'LOC_b', destinationId: 'b', manualDriverPaySatang: undefined }, 2);
  assert.equal(standard.status, 200);
  assert.equal((await standard.json()).data.trips[0].driverPaySatang, 10000);
  assert.equal(store.docs.get(`${shop}/truckTrips/${id}`).manualDriverPaySatang, undefined);
});

test('Settings automatically lists missing routes and saves driver and customer prices independently', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  for (const id of ['a', 'b']) store.docs.set(`${shop}/truckLocations/${id}`, { code: id, name: id, status: 'ACTIVE' });
  store.docs.set(`${shop}/truckCustomers/c`, { name: 'Customer', status: 'ACTIVE' });
  const read = async () => (await (await getSettings(new NextRequest('http://localhost/api/truck/settings'))).json()).data;
  const initial = await read();
  assert.equal(initial.truckTariffs.length, 4);
  assert.ok(initial.truckTariffs.every((row: any) => row.generated && row.driverPaySatang === null && row.customerRateSatang === null));
  const savePrice = async (customerId: string | null, requestId: string) => postSettings(new NextRequest('http://localhost/api/truck/settings', { method: 'POST', body: JSON.stringify({ action: 'UPSERT_TARIFF', tariff: { originId: 'a', destinationId: 'b', customerId, ...(customerId ? { customerRateSatang: 45000 } : { driverPaySatang: 20000 }) }, expectedRevision: 0, requestId }) }));
  assert.equal((await savePrice(null, 'auto-driver-price')).status, 200);
  assert.equal((await savePrice('c', 'auto-customer-price')).status, 200);
  const priced = await read();
  assert.equal(priced.truckTariffs.length, 4);
  assert.equal(priced.truckTariffs.filter((row: any) => row.generated === false).length, 2);
  const created = await postSettings(new NextRequest('http://localhost/api/truck/settings', { method: 'POST', body: JSON.stringify({ action: 'UPSERT_LOCATION', location: { code: '3', name: 'New location' }, expectedRevision: 0, requestId: 'auto-new-location' }) }));
  assert.equal(created.status, 200);
  const expanded = await read();
  assert.equal(expanded.truckTariffs.length, 12);
  assert.equal(expanded.truckTariffs.find((row: any) => row.customerId === null && row.originId === 'a' && row.destinationId === 'b').driverPaySatang, 20000);
  assert.equal(expanded.truckTariffs.find((row: any) => row.customerId === 'c' && row.originId === 'a' && row.destinationId === 'b').customerRateSatang, 45000);
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
  assert.equal(Boolean(truckBody.data.driverId), true);
  assert.equal(store.docs.has(`${shop}/truckDrivers/${truckBody.data.driverId}`), true);
  assert.equal(store.docs.get(`${shop}/truckDrivers/${truckBody.data.driverId}`).name, 'มานพ สมบูรณ์');

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
  store.docs.set(`${shop}/truckDrivers/driver_88`, { driverId: 'driver_88', name: 'สมบูรณ์ บุญส่ง', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckLocations/a`, { locationId: 'a', code: 'A', name: 'โรงโม่สระบุรี', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckLocations/b`, { locationId: 'b', code: 'B', name: 'แพลนท์พระราม 2', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckLocations/c`, { locationId: 'c', code: 'C', name: 'ไซต์งานพิเศษบางนา', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckTariffs/a-b`, { originId: 'a', destinationId: 'b', customerId: null, driverPaySatang: 75000, status: 'ACTIVE', revision: 1 });
  store.docs.set(`${shop}/truckTariffs/b-c`, { originId: 'b', destinationId: 'c', customerId: null, driverPaySatang: 80000, status: 'ACTIVE', revision: 1 });

  const initialPayload = {
    dateKey,
    truckId,
    driverId: 'driver_88',
    trips: [
      {
        tripIndex: 1,
        pricingVersion: 3,
        billingPricingMode: 'PER_TRIP',
        originId: 'a',
        destinationId: 'b',
        fromLocation: 'โรงโม่สระบุรี',
        destinationMode: 'LOC_b',
        destinationName: 'แพลนท์พระราม 2',
        departureDate: dateKey,
        arrivalDate: null,
        weightKg: null,
        billable: false,
        billingSatang: 0,
        note: 'เที่ยวเช้า'
      }
    ],
    fuelCostSatang: 150000,
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
  assert.equal(createBody.data.fuelCostSatang, 0, 'modern truck entries do not add fuel costs');
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
    driverId: 'driver_88',
    trips: [
      {
        tripIndex: 1,
        tripId: createBody.data.trips[0].tripId,
        pricingVersion: 3,
        billingPricingMode: 'PER_TRIP',
        originId: 'a',
        destinationId: 'b',
        destinationMode: 'LOC_b',
        fromLocation: 'โรงโม่สระบุรี',
        destinationName: 'แพลนท์พระราม 2',
        departureDate: dateKey,
        arrivalDate: null,
        weightKg: null,
        billable: false,
        billingSatang: null,
        note: 'เที่ยวเช้า'
      },
      {
        tripIndex: 2,
        pricingVersion: 3,
        billingPricingMode: 'PER_TRIP',
        originId: 'b',
        destinationId: 'c',
        destinationMode: 'LOC_c',
        fromLocation: 'แพลนท์พระราม 2',
        destinationName: 'ไซต์งานพิเศษบางนา',
        departureDate: dateKey,
        arrivalDate: null,
        weightKg: null,
        billable: false,
        billingSatang: null,
        note: 'เที่ยวบ่าย'
      }
    ],
    fuelCostSatang: 220000,
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
  assert.equal(updateBody.data.fuelCostSatang, 0, 'fuel cost remains excluded for modern records');

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
  store.docs.set(`${shop}/requests/req-1`, { requestId: 'req-1', entityKey: 'trip-1' });
  store.docs.set(`${shop}/audit/audit-1`, { action: 'CREATE_TRUCK_TRIP', entityId: 'trip-1' });

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
  assert.ok(body.data.extraDocuments.some((d: any) => d.path === 'requests/req-1'));
  assert.ok(body.data.extraDocuments.some((d: any) => d.path === 'audit/audit-1'));

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

test('Truck review requires explicit fee confirmation and atomically preserves legacy amounts', async () => {
  const store = setupMockDb();
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const recordId = '2026-10-10_t1';
  const tripId = 'legacy-trip-1';
  const recordPath = `${shop}/truckMonths/2026-10/records/${recordId}`;
  const tripPath = `${shop}/truckTrips/${tripId}`;
  store.docs.set(`${shop}/truckDrivers/d1`, { driverId: 'd1', name: 'คนขับเก่า', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckCustomers/c1`, { customerId: 'c1', name: 'ลูกค้าเก่า', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckLocations/a`, { locationId: 'a', code: 'A', name: 'อู่เก่า', status: 'ACTIVE' });
  store.docs.set(`${shop}/truckLocations/b`, { locationId: 'b', code: 'B', name: 'โรงงานเก่า', status: 'ACTIVE' });
  const oldTrip = { tripId, recordId, revision: 1, pricingVersion: 2, driverId: 'd1', driverNameSnapshot: 'คนขับเก่า', originId: 'a', destinationId: 'b', fromLocation: 'A — อู่เก่า', destinationName: 'B — โรงงานเก่า', customerId: 'c1', customerName: 'ลูกค้าเก่า', billable: true, departureDate: '2026-10-10', arrivalDate: '2026-10-10', accountingMonth: '2026-10', status: 'COMPLETED', weightKg: 12500, driverPaySatang: 15000, driverExtraSatang: 2000, driverExtraNote: 'เงินเพิ่มคนขับเดิม', billingSatang: 100000, billingExtraSatang: 10000, billingExtraNote: 'ค่าบริการเดิม' };
  store.docs.set(tripPath, oldTrip);
  store.docs.set(recordPath, { recordId, dateKey: '2026-10-10', monthKey: '2026-10', truckId: 't1', revision: 4, trips: [{ ...oldTrip, tripIndex: 1 }], photos: [] });

  const list = await getTripsForReview(new NextRequest('http://localhost/api/truck/trips'));
  const listed = (await list.json()).data.trips[0];
  assert.equal(list.status, 200);
  assert.equal(listed.legacyFeesPresent, true);
  assert.equal(listed.recordRevision, 4);
  const patch = (body: any) => reviewTrip(new NextRequest('http://localhost/api/truck/trips', { method: 'PATCH', body: JSON.stringify(body) }));
  const body: any = { tripId, expectedRevision: 1, expectedRecordRevision: 4, pricingVersion: 3, billingPricingMode: 'PER_TRIP', driverId: 'd1', originId: 'a', destinationId: 'b', customerId: 'c1', departureDate: '2026-10-10', arrivalDate: '2026-10-10', billable: true, weightKg: 12500, billingSatang: 110000, reason: 'ยืนยันราคาเหมาใหม่', requestId: 'legacy-review-confirm' };
  assert.equal((await patch(body)).status, 422, 'fee-bearing legacy data cannot upgrade without confirmation');
  const reviewed = await patch({ ...body, confirmLegacyPricing: true });
  assert.equal(reviewed.status, 200, JSON.stringify(await reviewed.clone().json()));
  const result = (await reviewed.json()).data;
  assert.equal(result.pricingVersion, 3);
  assert.equal(result.billingSatang, 110000);
  assert.equal(result.legacyDriverExtraSatang, 2000);
  assert.equal(result.legacyPricingSnapshot.billingExtraSatang, 10000);
  assert.equal('billingExtraSatang' in result, false);
  const parent = store.docs.get(recordPath);
  assert.equal(parent.revision, 5);
  assert.equal(parent.trips[0].pricingVersion, 3);
  assert.equal(parent.trips[0].billingSatang, 110000);
  assert.equal(parent.trips[0].legacyDriverExtraSatang, 2000);
  assert.equal(store.docs.get(tripPath).legacyPricingSnapshot.driverExtraSatang, 2000);
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



test('Custom payroll spans months, freezes its exact dates, rejects overlapping periods and preserves payment history', async () => {
  const store = setupMockDb(), shop = `shops/${process.env.SHOP_ID || 'main'}`;
  store.docs.set(`${shop}/truckDrivers/d`, { name: 'คนขับทดสอบ', status: 'ACTIVE', baseWageSatang: 30000 });
  for (const [date, wage] of [['2026-11-28',30000],['2026-11-30',30000],['2026-12-01',40000],['2026-12-03',40000]] as const) store.docs.set(`${shop}/truckMonths/${date.slice(0,7)}/workDays/${date}`, {dateKey:date, drivers:[{driverId:'d',name:'คนขับทดสอบ',baseWageSatang:wage}],revision:1});
  for (const [id,date,pay] of [['t1','2026-11-29',15000],['t2','2026-12-02',20000],['outside','2026-11-20',99000]] as const) store.docs.set(`${shop}/truckTrips/${id}`, {driverId:'d',driverNameSnapshot:'คนขับทดสอบ',departureDate:date,arrivalDate:date,accountingMonth:date.slice(0,7),pricingVersion:3,status:'COMPLETED',driverPaySatang:pay,fromLocation:'ต้นทาง',destinationName:'ปลายทาง',plateNumberSnapshot:'TEST'});
  store.docs.set(`${shop}/truckTrips/unrelated-legacy`,{status:'OPEN'});
  const range = {start:'2026-11-28',end:'2026-12-02'};
  const req = (path:string, body:any) => new NextRequest('http://localhost'+path,{method:'POST',body:JSON.stringify(body)});
  const preview = await getPayroll(new NextRequest('http://localhost/api/truck/payroll?'+new URLSearchParams(range)));
  assert.equal(preview.status,200);
  const open=(await preview.json()).data;
  assert.equal(open.preview.drivers[0].totalSatang,135000);
  assert.equal(open.preview.drivers[0].days.length,3);
  const payload={...range,action:'CLOSE',expectedRevision:0,requestId:'close-custom-range'};
  const closed=await postPayroll(req('/api/truck/payroll',payload)); assert.equal(closed.status,200);
  assert.equal((await closed.json()).data.snapshot.drivers[0].totalSatang,135000);
  assert.equal((await postPayroll(req('/api/truck/payroll',payload))).status,200,'Receipt replay cannot duplicate a closure');
  const overlap=await postPayroll(req('/api/truck/payroll',{start:'2026-12-02',end:'2026-12-05',action:'CLOSE',expectedRevision:0,requestId:'close-overlap'}));
  assert.equal((await overlap.json()).error.code,'PAYROLL_OVERLAP');
  assert.equal((await postPayroll(req('/api/truck/payroll',{month:'2026-11',action:'CLOSE',expectedRevision:0,requestId:'monthly-overlap'}))).status,422);
  assert.equal((await postWorkday(req('/api/truck/workdays',{dateKey:'2026-11-30',driverIds:['d'],expectedRevision:1,requestId:'edit-closed-day'}))).status,409);
  assert.equal((await postWorkday(req('/api/truck/workdays',{dateKey:'2026-12-03',driverIds:['d'],expectedRevision:1,requestId:'edit-open-day'}))).status,200,'Another day in the same month stays editable');
  const sourceId = '2026-11-29_t';
  store.docs.set(`${shop}/truckMonths/2026-11/records/${sourceId}`, { dateKey: '2026-11-29', revision: 1, trips: [{ tripId: 't1', departureDate: '2026-11-29', accountingMonth: '2026-11' }] });
  const deleted = await deleteRecordById(new NextRequest('http://localhost/api/truck/records/'+sourceId, { method:'DELETE', body:JSON.stringify({expectedRevision:1,requestId:'delete-period-record'}) }), {params:Promise.resolve({id:sourceId})});
  assert.equal(deleted.status,409);
  const lateRecord = await postRecords(req('/api/truck/records', {dateKey:'2026-12-05',truckId:'t',driverId:'d',expectedRevision:0,requestId:'late-closed-period-trip',trips:[{tripIndex:1,pricingVersion:3,billingPricingMode:'PER_TRIP',originId:'a',destinationId:'b',destinationMode:'LOC_b',departureDate:'2026-11-29',arrivalDate:null,billable:false,weightKg:null}]}));
  assert.equal(lateRecord.status,409,'A different sheet date cannot bypass the closed departure range');
  const pdf=await payrollPdf(new NextRequest('http://localhost/api/truck/payroll/pdf?'+new URLSearchParams({...range,driverId:'d'}))); assert.equal(pdf.status,200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString(),'%PDF');
  const pay=await postPayroll(req('/api/truck/payroll',{...range,action:'PAY',driverId:'d',paidDate:'2026-12-04',expectedRevision:1,requestId:'pay-custom-range'})); assert.equal(pay.status,200);
  const blocked=await postPayroll(req('/api/truck/payroll',{...range,action:'REOPEN',reason:'test',expectedRevision:2,requestId:'reopen-paid-range'})); assert.equal((await blocked.json()).error.code,'PAYROLL_PAID');
  assert.equal((await postPayroll(req('/api/truck/payroll',{...range,action:'VOID_PAYMENT',driverId:'d',reason:'test',expectedRevision:2,requestId:'void-range-pay'}))).status,200);
  assert.equal((await postPayroll(req('/api/truck/payroll',{...range,action:'REOPEN',reason:'test',expectedRevision:3,requestId:'reopen-custom-range'}))).status,200);
  assert.equal((await postWorkday(req('/api/truck/workdays',{dateKey:'2026-11-30',driverIds:['d'],expectedRevision:1,requestId:'edit-reopened-day'}))).status,200);
});

test('Billing searches and snapshots a date range across months and refuses trips outside it', async () => {
  const store=setupMockDb(),shop=`shops/${process.env.SHOP_ID || 'main'}`;
  for (const [id,date] of [['a','2026-11-30'],['b','2026-12-01'],['outside','2026-12-03']] as const) store.docs.set(`${shop}/truckTrips/${id}`,{departureDate:date,accountingMonth:date.slice(0,7),status:'COMPLETED',pricingVersion:3,customerId:'c',customerName:'ลูกค้าทดสอบ',weightKg:1000,billingSatang:100000,fromLocation:'ต้นทาง',destinationName:'ปลายทาง',plateNumberSnapshot:'TEST'});
  const range={start:'2026-11-30',end:'2026-12-01'};
  const listing=await getBilling(new NextRequest('http://localhost/api/truck/billing?'+new URLSearchParams(range)));
  assert.equal(listing.status,200); assert.equal((await listing.json()).data.trips.length,2);
  const create=(tripIds:string[],requestId:string)=>postBilling(new NextRequest('http://localhost/api/truck/billing',{method:'POST',body:JSON.stringify({...range,action:'INVOICE',tripIds,issueDate:'2026-12-05',dueDate:'2026-12-20',requestId})}));
  const bad=await create(['outside'],'outside-range-bill'); assert.equal((await bad.json()).error.code,'TRIP_OUTSIDE_RANGE');
  const result=await create(['a','b'],'cross-month-invoice'); assert.equal(result.status,200);
  const invoice=(await result.json()).data; assert.equal(invoice.start,range.start); assert.equal(invoice.end,range.end); assert.equal(invoice.totalSatang,200000);
  assert.equal((await create(['a'],'duplicate-range-invoice')).status,409);
  const pdf=await billingPdf(new NextRequest('http://localhost/api/truck/billing/'+invoice.invoiceId+'/pdf'),{params:Promise.resolve({id:invoice.invoiceId})}); assert.equal(pdf.status,200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString(),'%PDF');
});


test('A saved trip without arrival immediately enters reports, charts, LINE, payroll and invoicing', async () => {
  const store=setupMockDb(),shop=`shops/${process.env.SHOP_ID || 'main'}`;
  store.docs.set(`${shop}/trucks/t`,{plateNumber:'89-1924',driverId:'d',driverName:'Driver',status:'ACTIVE'});
  store.docs.set(`${shop}/truckDrivers/d`,{name:'Driver',status:'ACTIVE'});
  store.docs.set(`${shop}/truckCustomers/c`,{name:'Customer',status:'ACTIVE'});
  for(const id of ['a','b']) store.docs.set(`${shop}/truckLocations/${id}`,{code:'CODE_'+id,name:id==='a'?'โรงงานต้นทาง':'คลังปลายทาง',status:'ACTIVE'});
  store.docs.set(`${shop}/truckTariffs/driver`,{originId:'a',destinationId:'b',customerId:null,driverPaySatang:20000,status:'ACTIVE',revision:1});
  const request=(path:string,body:any)=>new NextRequest('http://localhost'+path,{method:'POST',body:JSON.stringify(body)});
  const saved=await postRecords(request('/api/truck/records',{dateKey:'2026-11-08',truckId:'t',driverId:'d',expectedRevision:0,requestId:'save-without-arrival',trips:[{tripIndex:1,pricingVersion:3,billingPricingMode:'PER_TRIP',originId:'a',destinationId:'b',destinationMode:'LOC_b',departureDate:'2026-11-08',arrivalDate:null,weightKg:1000,billable:true,customerId:'c',billingSatang:100000,note:''}]}));
  assert.equal(saved.status,200); const trip=(await saved.json()).data.trips[0]; assert.equal(trip.arrivalDate,null); assert.equal(trip.status,'OPEN');
  const report=await truckReports(new NextRequest('http://localhost/api/truck/reports?month=2026-11')); const reportData=(await report.json()).data;
  assert.equal(reportData.totals.totalTrips,1); assert.equal(reportData.totals.totalDriverPaySatang,20000);
  const chart=await truckAnalytics(new NextRequest('http://localhost/api/truck/reports/analytics?period=day&month=2026-11')); assert.equal((await chart.json()).data.totals.tripCount,1);
  const line=await fetchTruckDailySummary(process.env.SHOP_ID || 'main','2026-11-08'); assert.equal(line.totalTrips,1); assert.equal(line.totalDriverPaySatang,20000); assert.equal(line.trucks[0].routesSummary,'จาก โรงงานต้นทาง ไป คลังปลายทาง');
  const range={start:'2026-11-08',end:'2026-11-08'};
  const payroll=await getPayroll(new NextRequest('http://localhost/api/truck/payroll?'+new URLSearchParams(range))); const preview=(await payroll.json()).data.preview;
  assert.equal(preview.canClose,true); assert.deepEqual(preview.pending,[]); assert.equal(preview.drivers[0].totalSatang,20000); assert.equal(preview.drivers[0].trips[0].origin,'โรงงานต้นทาง'); assert.equal(preview.drivers[0].trips[0].destination,'คลังปลายทาง');
  const closed=await postPayroll(request('/api/truck/payroll',{...range,action:'CLOSE',expectedRevision:0,requestId:'close-without-arrival'})); assert.equal(closed.status,200);
  const wages=await payrollPdf(new NextRequest('http://localhost/api/truck/payroll/pdf?'+new URLSearchParams({...range,driverId:'d'}))); assert.equal(wages.status,200);
  const ready=await getBilling(new NextRequest('http://localhost/api/truck/billing?'+new URLSearchParams(range))); assert.equal((await ready.json()).data.trips[0].tripId,trip.tripId);
  const invoice=await postBilling(request('/api/truck/billing',{...range,action:'INVOICE',tripIds:[trip.tripId],issueDate:'2026-11-08',requestId:'invoice-without-arrival'})); assert.equal(invoice.status,200); const invoiceData=(await invoice.json()).data; assert.equal(invoiceData.totalSatang,100000); assert.equal(invoiceData.lines[0].fromLocation,'โรงงานต้นทาง'); assert.equal(invoiceData.lines[0].destinationName,'คลังปลายทาง');
});
