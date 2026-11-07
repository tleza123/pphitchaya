import type { TruckTripItem } from './types';

export const TRUCK_PRICING_VERSION = 3 as const;

export function legacyFeeSnapshot(trip: any) {
  if (trip.pricingVersion === TRUCK_PRICING_VERSION && hasLegacyFeeFields(trip)) return trip;
  return trip.legacyPricingSnapshot ?? trip.legacyTripSnapshot ?? trip;
}

export function hasLegacyFeeFields(trip: any): boolean {
  return ['driverExtraSatang', 'driverExtraNote', 'billingExtraSatang', 'billingExtraNote'].some(field => Object.prototype.hasOwnProperty.call(trip, field));
}

export function needsLegacyPricingReview(trip: any): boolean {
  return trip.pricingVersion !== TRUCK_PRICING_VERSION || hasLegacyFeeFields(trip);
}

export function hasLegacyTripFees(trip: any): boolean {
  const source = trip.pricingVersion === TRUCK_PRICING_VERSION ? trip : legacyFeeSnapshot(trip);
  return (source.driverExtraSatang ?? 0) > 0 || (source.billingExtraSatang ?? 0) > 0;
}

export function getTripDriverChargeSatang(trip: TruckTripItem): number {
  return (trip.driverPaySatang ?? 0) + (trip.pricingVersion === TRUCK_PRICING_VERSION ? trip.legacyDriverExtraSatang ?? 0 : trip.driverExtraSatang ?? 0);
}

export function getTripCustomerChargeSatang(trip: TruckTripItem): number | null {
  if (trip.billingSatang == null) return null;
  return trip.billingSatang + (trip.pricingVersion === TRUCK_PRICING_VERSION ? 0 : trip.billingExtraSatang ?? 0);
}