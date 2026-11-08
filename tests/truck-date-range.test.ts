import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truckDateRange, inTruckRange } from '../src/lib/truck/date-range';

test('Date ranges include both boundaries, cross months and retain legacy month document IDs', () => {
  const range = truckDateRange({ start: '2026-11-28', end: '2026-12-03' });
  assert.deepEqual(range.months, ['2026-11', '2026-12']);
  assert.equal(range.id, 'range_2026-11-28_2026-12-03');
  assert.equal(inTruckRange('2026-11-28', range), true);
  assert.equal(inTruckRange('2026-12-03', range), true);
  assert.equal(inTruckRange('2026-12-04', range), false);
  assert.equal(truckDateRange({month:'2026-02'}).end, '2026-02-28');
  assert.equal(truckDateRange({month:'2026-02'}).id, '2026-02');
  for (const input of [{start:'2026-12-02',end:'2026-12-01'},{start:'2026-02-30',end:'2026-03-02'},{start:'2026-01-01'},{start:'2026-01-01',end:'2027-01-02'}]) assert.throws(() => truckDateRange(input));
});
