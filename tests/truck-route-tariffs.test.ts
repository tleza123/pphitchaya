import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAutomaticRoutes } from '../src/lib/truck/route-tariffs';

const locations = ['1', '2', '3'].map(locationId => ({ locationId, status: 'ACTIVE' }));
const customers = ['c1', 'c2'].map(customerId => ({ customerId, status: 'ACTIVE' }));

test('Automatic routes cover every directed pair and every customer, with blank prices', () => {
  const rows = withAutomaticRoutes(locations, customers, []);
  assert.equal(rows.length, 3 * 2 * 3);
  const keys = rows.map(row => JSON.stringify([row.originId, row.destinationId, row.customerId]));
  assert.equal(new Set(keys).size, rows.length);
  for (const origin of locations) for (const destination of locations) {
    if (origin.locationId === destination.locationId) continue;
    for (const customer of [null, 'c1', 'c2']) assert.ok(keys.includes(JSON.stringify([origin.locationId, destination.locationId, customer])));
  }
  assert.ok(rows.every(row => row.originId !== row.destinationId && row.driverPaySatang === null && row.customerRateSatang === null && row.generated === true && row.revision === 0));
});

test('Existing prices, IDs, revisions and zero prices are preserved without mutating stored tariffs', () => {
  const tariffs = [
    { tariffId: 'driver', originId: '1', destinationId: '2', customerId: null, driverPaySatang: 0, revision: 4, status: 'ACTIVE' },
    { tariffId: 'customer', originId: '2', destinationId: '1', customerId: 'c1', customerRateSatang: 30000, revision: 7, status: 'ACTIVE' }
  ];
  const before = JSON.stringify(tariffs);
  const rows = withAutomaticRoutes(locations, customers, tariffs);
  assert.equal(rows.length, 18);
  assert.equal(JSON.stringify(tariffs), before);
  assert.equal(rows.find(row => row.tariffId === 'driver')?.driverPaySatang, 0);
  assert.equal(rows.find(row => row.tariffId === 'customer')?.revision, 7);
  assert.ok(rows.filter(row => ['driver', 'customer'].includes(row.tariffId)).every(row => row.generated === false));
});

test('New locations and new customers expand routes automatically; suspended masters generate no drafts', () => {
  const old = withAutomaticRoutes(locations.slice(0, 2), customers.slice(0, 1), []);
  assert.equal(old.length, 4);
  const expanded = withAutomaticRoutes([...locations, { locationId: 'inactive', status: 'SUSPENDED' }], [...customers, { customerId: 'inactive', status: 'SUSPENDED' }], []);
  assert.equal(expanded.length, 18);
  assert.ok(!expanded.some(row => row.originId === 'inactive' || row.destinationId === 'inactive' || row.customerId === 'inactive'));
  assert.equal(withAutomaticRoutes([], customers, []).length, 0);
  assert.equal(withAutomaticRoutes(locations.slice(0, 1), customers, []).length, 0);
});
