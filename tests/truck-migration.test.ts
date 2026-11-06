import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewLegacyTruckMigration } from '../src/lib/truck/legacy-migration';
import type { TruckDailyRecordDoc } from '../src/lib/truck/types';

test('legacy migration keeps money and photos without inventing driver or delivery', () => {
  const r = {recordId:'2026-11-30_t1',dateKey:'2026-11-30',truckId:'t1',plateNumberSnapshot:'กข',driverNameSnapshot:'สมชาย',totalDriverPaySatang:15000,trips:[{fromLocation:'A',destinationName:'B',driverPaySatang:15000,note:''}],photos:[{photoId:'p1'}]} as TruckDailyRecordDoc;
  const a = previewLegacyTruckMigration([r]); const b = previewLegacyTruckMigration([r]);
  assert.equal(a.totalDriverPaySatang,15000); assert.equal(a.trips[0].accountingMonth,'2026-11');
  assert.equal(a.trips[0].tripId,b.trips[0].tripId); assert.equal(a.trips[0].driverId,null);
  assert.equal(a.trips[0].arrivalDate,null); assert.equal(a.trips[0].billingSatang,null);
  assert.deepEqual(a.trips[0].photos,r.photos); assert.throws(()=>previewLegacyTruckMigration([r,r]),/DUPLICATE_RECORD/);
});

test('legacy migration detects mismatched source totals without inferring missing values', () => {
  const r = {recordId:'r',dateKey:'2026-01-02',truckId:'t',totalDriverPaySatang:1,trips:[{driverPaySatang:0}],photos:[]} as unknown as TruckDailyRecordDoc;
  const preview = previewLegacyTruckMigration([r]);
  assert.deepEqual(preview.totalMismatchRecordIds, ['r']);
  assert.equal(preview.trips[0].driverPaySatang, 0);
  assert.equal(preview.trips[0].departureTimeKnown, false);
});
