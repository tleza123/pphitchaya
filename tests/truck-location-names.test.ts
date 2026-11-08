import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeName, tripLocationNames } from '../src/lib/truck/location-names';

test('Route output strips stored location codes while preserving plain and one-off names', () => {
  assert.equal(placeName(' 1 — โรงงานต้นทาง '), 'โรงงานต้นทาง');
  assert.equal(placeName('ID-A – คลังสินค้า'), 'คลังสินค้า');
  assert.equal(placeName('A1 - ท่าเรือ'), 'ท่าเรือ');
  assert.equal(placeName('โรงงาน 101'), 'โรงงาน 101');
  assert.equal(placeName('ท่าเรือ - คลังฝั่งตะวันออก'), 'ท่าเรือ - คลังฝั่งตะวันออก');
  assert.deepEqual(tripLocationNames({fromLocation:'1 — โรงงาน',destinationName:'2 — ร้านค้า'}), {origin:'โรงงาน',destination:'ร้านค้า'});
  assert.equal(tripLocationNames({destinationMode:'__OTHER__',destinationName:'9 — ชื่อที่กรอกเอง'}).destination, '9 — ชื่อที่กรอกเอง');
  assert.equal(tripLocationNames({locationNamesOnly:true,origin:'โรงงาน — ด้านหลัง'}).origin, 'โรงงาน — ด้านหลัง');
  assert.deepEqual(tripLocationNames({}), {origin:'ไม่ระบุต้นทาง',destination:'ไม่ระบุปลายทาง'});
});
