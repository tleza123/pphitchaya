import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTripCustomerChargeSatang, getTripDriverChargeSatang, hasLegacyTripFees } from '../src/lib/truck/pricing';
import type { TruckTripItem } from '../src/lib/truck/types';

const trip = (values: Partial<TruckTripItem> = {}): TruckTripItem => ({
  tripIndex: 1,
  fromLocation: 'A',
  destinationMode: 'LOC_b',
  destinationName: 'B',
  driverPaySatang: 15000,
  note: '',
  ...values
});

test('v3 customer charge is the flat rate, independent of weight and old fee fields', () => {
  const first = trip({ pricingVersion: 3, billingSatang: 120000, weightKg: 12500, billingExtraSatang: 10000 });
  const heavier = { ...first, weightKg: 20000 };
  assert.equal(getTripCustomerChargeSatang(first), 120000);
  assert.equal(getTripCustomerChargeSatang(heavier), 120000);
});

test('legacy customer and driver extras remain included while v3 legacy driver rights remain explicit', () => {
  const old = trip({ billingSatang: 100000, billingExtraSatang: 10000, driverExtraSatang: 2000 });
  assert.equal(getTripCustomerChargeSatang(old), 110000);
  assert.equal(getTripDriverChargeSatang(old), 17000);
  assert.equal(hasLegacyTripFees(old), true);
  const reviewed = trip({ pricingVersion: 3, billingSatang: 110000, legacyDriverExtraSatang: 2000 });
  assert.equal(getTripCustomerChargeSatang(reviewed), 110000);
  assert.equal(getTripDriverChargeSatang(reviewed), 17000);
  assert.equal(hasLegacyTripFees(reviewed), false);
});

test('null and zero customer prices remain distinct', () => {
  assert.equal(getTripCustomerChargeSatang(trip({ pricingVersion: 3, billingSatang: null })), null);
  assert.equal(getTripCustomerChargeSatang(trip({ pricingVersion: 3, billingSatang: 0 })), 0);
});

test('legacy fee detection reads archived migration snapshots', () => {
  assert.equal(hasLegacyTripFees({ pricingVersion: 2, legacyTripSnapshot: { billingExtraSatang: 500 } }), true);
});