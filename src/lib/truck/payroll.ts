import { dateKey, monthKey } from '../payroll/dates';
import { validateSatang } from '../payroll/money';

export interface PayrollDay { date: string; driverId: string; driverName: string; baseSatang: number }
export interface PayrollTrip { tripId: string; pricingVersion?: 3; driverId: string | null; driverName: string; departureDate: string; arrivalDate: string | null; status: 'OPEN' | 'COMPLETED' | 'CANCELLED'; driverPaySatang: number | null; driverExtraSatang?: number; legacyDriverExtraSatang?: number; origin: string; destination: string; plate: string }

/** Prepare a reviewable payroll; callers must lock the underlying records atomically before closing. */
export function calculateTruckPayroll(month: string, days: PayrollDay[], trips: PayrollTrip[]) {
  monthKey(month);
  const byDriver = new Map<string, { driverId: string; driverName: string; days: PayrollDay[]; trips: PayrollTrip[]; baseSatang: number; tripSatang: number; extraSatang: number; totalSatang: number }>();
  const seen = new Set<string>();
  const pending: PayrollTrip[] = [];
  const errors: string[] = [];
  const driver = (id: string, name: string) => {
    let row = byDriver.get(id);
    if (!row) { row = {driverId:id,driverName:name,days:[],trips:[],baseSatang:0,tripSatang:0,extraSatang:0,totalSatang:0}; byDriver.set(id,row); }
    return row;
  };
  for (const day of days) {
    dateKey(day.date); if (!day.date.startsWith(month)) continue;
    if (!day.driverId) throw new Error('MISSING_DRIVER');
    validateSatang(day.baseSatang);
    const key = `${day.driverId}:${day.date}`; if (seen.has(key)) throw new Error('DUPLICATE_WORKDAY'); seen.add(key);
    const row = driver(day.driverId,day.driverName); row.days.push(day); row.baseSatang += day.baseSatang;
  }
  const tripIds = new Set<string>();
  for (const trip of trips) {
    dateKey(trip.departureDate); if (!trip.departureDate.startsWith(month)) continue;
    if (!trip.tripId || tripIds.has(trip.tripId)) throw new Error('DUPLICATE_TRIP'); tripIds.add(trip.tripId);
    if (trip.status === 'CANCELLED') continue;
    if (trip.status !== 'COMPLETED' || !trip.arrivalDate) { pending.push(trip); continue; }
    dateKey(trip.arrivalDate); if (trip.arrivalDate < trip.departureDate) throw new Error('INVALID_ARRIVAL');
    if (!trip.driverId || trip.driverPaySatang == null) { errors.push(trip.tripId); continue; }
    validateSatang(trip.driverPaySatang);
    if (trip.pricingVersion === 3 && (trip.driverExtraSatang ?? 0) > 0) throw new Error('UNSUPPORTED_PRICING_FIELDS');
    const legacyExtra = trip.pricingVersion === 3 ? trip.legacyDriverExtraSatang ?? 0 : trip.driverExtraSatang ?? 0;
    validateSatang(legacyExtra);
    const row = driver(trip.driverId,trip.driverName); row.trips.push(trip); row.tripSatang += trip.driverPaySatang; row.extraSatang += legacyExtra;
  }
  for (const row of byDriver.values()) { row.totalSatang = row.baseSatang + row.tripSatang + row.extraSatang; if (!Number.isSafeInteger(row.totalSatang)) throw new Error('MONEY_OVERFLOW'); }
  return { pricingVersion: 3, month, drivers:[...byDriver.values()], pending, errors, canClose:pending.length===0 && errors.length===0 };
}
