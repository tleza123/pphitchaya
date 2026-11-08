import { assertTruckWritable } from '@/lib/server/truck-control';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getShopDocRef,
  getTruckTripsCol,
  getTruckDriversCol,
  getTruckCustomersCol,
  getTruckLocationsCol,
  getTruckTariffsCol,
  getTruckRef,
  getTruckRecordRef,
  getTruckRecordsCol,
  getTruckMonthRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { getBangkokToday, getBangkokMonth, dateKey as validateDate } from '@/lib/payroll/dates';
import { calculateTruckRecordTotals } from '@/lib/truck/engine';
import { validateSatang } from '@/lib/payroll/money';
import { TruckDailyRecordDoc } from '@/lib/truck/types';
import { randomUUID } from 'node:crypto';
import { validateWeightKg } from '@/lib/truck/weight';
import { needsLegacyPricingReview } from '@/lib/truck/pricing';

export const dynamic = 'force-dynamic';
const V3_UNSUPPORTED_FIELDS = ['driverPaySatang', 'driverRateSource', 'driverTariffId', 'driverTariffRevision', 'driverExtraSatang', 'driverExtraNote', 'billingTariffId', 'billingTariffRevision', 'billingExtraSatang', 'billingExtraNote', 'billingRateSource', 'overrideReason', 'legacyDriverExtraSatang', 'legacyPricingSnapshot', 'legacyTripSnapshot', 'legacyRecordId', 'legacyTripIndex', 'invoiceId'];

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const monthParam = searchParams.get('month');
    const truckIdParam = searchParams.get('truckId');

    const shopId = getShopId();
    const monthKey = monthParam
      ? monthParam
      : (dateParam ? dateParam.slice(0, 7) : getBangkokMonth());

    // A day's sheet has a deterministic ID; read it directly instead of a compound query.
    let query: any = getTruckRecordsCol(monthKey, shopId);
    if (dateParam && !truckIdParam) {
      query = query.where('dateKey', '==', dateParam);
    }
    if (truckIdParam && !dateParam) {
      query = query.where('truckId', '==', truckIdParam);
    }

    const direct = dateParam && truckIdParam ? await getTruckRecordRef(monthKey, `${dateParam}_${truckIdParam}`, shopId).get() : null;
    const snap = direct ? { docs: direct.exists ? [direct] : [] } : await query.get();
    const docs = snap?.docs || [];
    const records: TruckDailyRecordDoc[] = docs.map((doc: any) => {
      const d = doc.data();
      return {
        recordId: doc.id,
        dateKey: d.dateKey,
        monthKey: d.monthKey,
        truckId: d.truckId,
        plateNumberSnapshot: d.plateNumberSnapshot || '',
        driverNameSnapshot: d.driverNameSnapshot || '',
        driverId: d.driverId || null,
        fuelCostSatang: d.fuelCostSatang || 0,
        totalDriverPaySatang: d.totalDriverPaySatang || 0,
        tripCount: d.tripCount || 0,
        trips: d.trips || [],
        photos: d.photos || [],
        revision: d.revision || 1,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || '',
        updatedBy: d.updatedBy || ''
      };
    });

    return createSuccessResponse({
      monthKey,
      records
    });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'TRUCK_MAINTENANCE') return createErrorResponse('TRUCK_MAINTENANCE', 'ระบบกำลังบำรุงรักษา กรุณาลองใหม่ภายหลัง', 503);
    if (['INVALID_TRIP_ID','INVALID_LOCATION','INVALID_INPUT','INVALID_DATE','INVALID_TIME','BILLING_INCOMPLETE','DRIVER_REQUIRED','CUSTOMER_NOT_ACTIVE','DRIVER_NOT_ACTIVE','TRUCK_NOT_ACTIVE','MISSING_PRICE','UNSUPPORTED_PRICING_VERSION','UNSUPPORTED_PRICING_FIELDS','LEGACY_PRICING_REVIEW_REQUIRED'].includes(error.message || '')) return createErrorResponse(error.message!, undefined, 422);
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const owner = await verifyOwner(req);
    const body = await req.json();
    const {
      dateKey,
      truckId,
      driverId,
      trips,
      fuelCostSatang,
      photos,
      expectedRevision,
      requestId
    } = body;

    if (!requestId || typeof requestId !== 'string' || requestId.length < 5) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision ให้ถูกต้อง', 422);
    }
    if (!dateKey || typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return createErrorResponse('INVALID_DATE', 'รูปแบบวันที่ไม่ถูกต้อง', 422);
    }
    if (!truckId || typeof truckId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุเลือกรถสิบล้อ', 422);
    }
    if (!Array.isArray(trips) || trips.length > 100) {
      return createErrorResponse('INVALID_INPUT', 'รายการเที่ยววิ่งไม่ถูกต้อง', 422);
    }
    if (trips.some((trip: any) => trip?.pricingVersion !== 3 || trip?.billingPricingMode !== 'PER_TRIP')) {
      return createErrorResponse('UNSUPPORTED_PRICING_VERSION', 'เที่ยวใหม่ต้องใช้รูปแบบราคาเหมาต่อเที่ยวรุ่น 3', 422);
    }
    if (trips.some((trip: any) => V3_UNSUPPORTED_FIELDS.some(field => Object.prototype.hasOwnProperty.call(trip, field)))) {
      return createErrorResponse('UNSUPPORTED_PRICING_FIELDS', 'ข้อมูลเที่ยวมีฟิลด์การเงินที่ไม่รองรับในรุ่น 3', 422);
    }
    // Legacy rows must be reviewed through the dedicated migration workflow;
    // they must not bypass current trip pricing by omitting departureDate.
    if (trips.some((trip: any) => !trip || typeof trip.departureDate !== 'string' || !trip.departureDate)) {
      return createErrorResponse('INVALID_DATE', undefined, 422);
    }
    if (photos !== undefined && !Array.isArray(photos)) {
      return createErrorResponse('INVALID_INPUT', 'ข้อมูลรูปภาพไม่ถูกต้อง', 422);
    }
    if (Array.isArray(photos) && photos.length > 5) {
      return createErrorResponse('INVALID_INPUT', 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป', 422);
    }

    let totals: { totalDriverPaySatang: number; tripCount: number };
    try {
      totals = trips.some((t: any) => t.departureDate) ? { totalDriverPaySatang: 0, tripCount: trips.length } : calculateTruckRecordTotals(trips, Number(fuelCostSatang ?? 0));
    } catch {
      return createErrorResponse('INVALID_MONEY', 'ยอดเงินค่าน้ำมันหรือค่าเที่ยวคนขับไม่ถูกต้อง', 422);
    }

    const monthKey = dateKey.slice(0, 7);
    validateDate(dateKey);
    for (const trip of trips as any[]) {
      if (trip.destinationMode === '__OTHER__') {
        if (typeof trip.destinationName !== 'string' || !trip.destinationName.trim() || trip.destinationName.trim().length > 200) return createErrorResponse('INVALID_LOCATION', 'กรุณาระบุชื่อสถานที่อื่น ๆ ไม่เกิน 200 ตัวอักษร', 422);
        try { validateSatang(trip.manualDriverPaySatang); } catch { return createErrorResponse('INVALID_MONEY', 'กรุณาระบุค่าเที่ยวคนขับสำหรับสถานที่อื่น ๆ ให้ถูกต้อง', 422); }
        trip.destinationId = null;
        trip.destinationName = trip.destinationName.trim();
      } else if (trip.manualDriverPaySatang !== undefined) {
        return createErrorResponse('UNSUPPORTED_PRICING_FIELDS', 'ค่าเที่ยวที่กรอกเองใช้ได้เฉพาะปลายทางอื่น ๆ', 422);
      }
      if (trip.departureDate) {
        try { validateDate(trip.departureDate); if (trip.arrivalDate) validateDate(trip.arrivalDate); } catch { return createErrorResponse('INVALID_DATE', undefined, 422); }
        if (trip.arrivalDate && trip.arrivalDate < trip.departureDate) return createErrorResponse('INVALID_DATE', 'วันถึงต้องไม่ก่อนวันออก', 422);
        trip.accountingDate = trip.departureDate;
        trip.accountingMonth = trip.departureDate.slice(0, 7);
        trip.status = trip.status === 'CANCELLED' ? 'CANCELLED' : trip.arrivalDate ? 'COMPLETED' : 'OPEN';
        for (const time of [trip.departureTime, trip.arrivalTime]) if (time != null && time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return createErrorResponse('INVALID_TIME', undefined, 422);
        if (trip.arrivalTime && !trip.arrivalDate) return createErrorResponse('INVALID_TIME', undefined, 422);
        try { trip.weightKg = validateWeightKg(trip.weightKg); } catch { return createErrorResponse('INVALID_WEIGHT', undefined, 422); }
        if (trip.departedAt && trip.arrivedAt && trip.arrivedAt < trip.departedAt) return createErrorResponse('INVALID_TIME', 'เวลาถึงต้องไม่ก่อนเวลาออก', 422);
        if (trip.billingSatang != null) { try { validateSatang(trip.billingSatang); } catch { return createErrorResponse('INVALID_MONEY', undefined, 422); } }
        continue;
      }
      const start = typeof trip.departedAt === 'string' ? trip.departedAt : `${dateKey}T12:00:00+07:00`;
      const d = new Date(start);
      if (Number.isNaN(d.getTime())) return createErrorResponse('INVALID_DATE', undefined, 422);
      const accountingDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      trip.departedAt = d.toISOString();
      trip.accountingDate = accountingDate;
      trip.accountingMonth = accountingDate.slice(0, 7);
      trip.status = trip.arrivedAt ? 'COMPLETED' : (trip.status || 'COMPLETED');
      if (trip.arrivedAt) trip.arrivedAt = new Date(trip.arrivedAt).toISOString();
      if (trip.billingSatang !== undefined && trip.billingSatang !== null) {
        try { validateSatang(trip.billingSatang); } catch { return createErrorResponse('INVALID_MONEY', undefined, 422); }
      }
    }
    const recordId = `${dateKey}_${truckId}`;
    const shopId = getShopId();
    const db = getAdminFirestore();

    const payloadHash = computePayloadHash(owner.uid, 'POST', recordId, {
      dateKey,
      truckId,
      driverId: driverId || null,
      trips,
      fuelCostSatang: Number(fuelCostSatang ?? 0),
      expectedRevision,
      photos: photos || []
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const recordRef = getTruckRecordRef(monthKey, recordId, shopId);
    const truckRef = getTruckRef(truckId, shopId);
    const monthRef = getTruckMonthRef(monthKey, shopId);

    const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
      // 1. Strict Read phase (All reads must precede writes)
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      const [recSnap, truckSnap, monthSnap] = await tx.getAll(recordRef, truckRef, monthRef);

      const exists = recSnap.exists;
      const current = exists ? recSnap.data() : null;
      const currentRevision = exists ? (current?.revision || 0) : 0;

      if (currentRevision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      // A record can contain legs from different months. Lock every affected
      // month, including old values when a departure date is changed.
      const affectedMonths = [...new Set<string>([monthKey, ...trips.map((t: any) => t.accountingMonth), ...(current?.trips || []).map((t: any) => t.accountingMonth || current?.monthKey)])].filter(m => /^\d{4}-\d{2}$/.test(m));
      const lockRefs = affectedMonths.map(m => getShopDocRef(shopId).collection('truckPayrollMonths').doc(m));
      const locks = await tx.getAll(...lockRefs);
      if (locks.some(lock => lock.data()?.state === 'CLOSED')) throw new Error('MONTH_CLOSED');
      // Migrated trips are independent financial records. Prevent the legacy
      // editor from changing their source while they are being reviewed or billed.
      const migrated = await tx.get(getTruckTripsCol(shopId).where('legacyRecordId', '==', recordId));
      if (!migrated.empty) throw new Error('RECORD_MIGRATED');

      const oldTrips: any[] = current?.trips || [];
      if (oldTrips.some(t => !t.tripId)) throw new Error('LEGACY_REVIEW_REQUIRED');
      const oldIds = oldTrips.map(t => t.tripId as string);
      const suppliedIds = trips.map((t: any) => t.tripId).filter(Boolean);
      if (new Set(suppliedIds).size !== suppliedIds.length || suppliedIds.some((id: string) => !oldIds.includes(id))) throw new Error('INVALID_TRIP_ID');
      const oldRefs = oldIds.map(id => getTruckTripsCol(shopId).doc(id));
      const oldSnaps = oldRefs.length ? await tx.getAll(...oldRefs) : [];
      if (oldSnaps.some(s => !s.exists)) throw new Error('TRIP_NOT_FOUND');
      if (oldSnaps.some(s => s.data()?.invoiceId)) throw new Error('TRIP_BILLED');
      if (oldSnaps.some(s => s.data()?.recordId !== recordId)) throw new Error('INVALID_TRIP_ID');
      const existingTrips = new Map(oldSnaps.map(s => [s.id, s.data()]));
      const needsLegacyReview = oldTrips.some((t: any) => {
        const prior = t.tripId ? existingTrips.get(t.tripId) : null;
        return prior && needsLegacyPricingReview(prior);
      });
      if (needsLegacyReview) throw new Error('LEGACY_PRICING_REVIEW_REQUIRED');
      const modern = trips.some((t: any) => !!t.departureDate);
      if (modern && (!driverId || typeof driverId !== 'string')) throw new Error('DRIVER_REQUIRED');
      const locationIds = [...new Set<string>(trips.filter((t:any)=>t.departureDate).flatMap((t:any)=>t.destinationMode === '__OTHER__' ? [t.originId] : [t.originId,t.destinationId]))];
      if (locationIds.some(id=>typeof id !== 'string' || !id || id.includes('/'))) throw new Error('INVALID_LOCATION');
      const locationSnaps = locationIds.length ? await tx.getAll(...locationIds.map(id=>getTruckLocationsCol(shopId).doc(id))) : [];
      const locations = new Map(locationSnaps.map(s=>[s.id,s.data()]));
      if (locationSnaps.some(s=>!s.exists)) throw new Error('INVALID_LOCATION');
      for (const trip of trips) if (locations.get(trip.destinationId)?.isShop === true) {
        trip.billable = false;
        trip.customerId = null;
        trip.customerName = '';
        trip.billingSatang = null;
        trip.weightKg = null;
      }

      const customerIds = [...new Set<string>(trips.map((t: any) => t.customerId).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0))];
      if ((driverId && (typeof driverId !== 'string' || driverId.includes('/'))) || customerIds.some(id => id.includes('/'))) throw new Error('INVALID_INPUT');
      const masterRefs = [...(driverId ? [getTruckDriversCol(shopId).doc(driverId)] : []), ...customerIds.map(id => getTruckCustomersCol(shopId).doc(id))];
      const masterSnaps = masterRefs.length ? await tx.getAll(...masterRefs) : [];
      const driverSnap = driverId ? masterSnaps[0] : undefined;
      if (driverId && (!driverSnap?.exists || driverSnap.data()?.status !== 'ACTIVE')) throw new Error('DRIVER_NOT_ACTIVE');
      const customerSnaps = masterSnaps.slice(driverId ? 1 : 0);
      if (customerSnaps.some(s => !s.exists || s.data()?.status !== 'ACTIVE')) throw new Error('CUSTOMER_NOT_ACTIVE');
      const customers = new Map(customerSnaps.map(s => [s.id, s.data()?.name]));
      const tariffSnap = modern ? await tx.get(getTruckTariffsCol(shopId)) : null;
      const activeTariffs = (tariffSnap?.docs || []).filter((doc: any) => doc.data()?.status === 'ACTIVE').map((doc: any) => ({ tariffId: doc.id, ...doc.data() }));
      const rateSnapshots = trips.map((t: any) => {
        if (!t.departureDate) return {};
        if (t.destinationMode === '__OTHER__') {
          t.driverPaySatang = validateSatang(t.manualDriverPaySatang);
          return { driverTariffId: null, driverTariffRevision: null, driverRateSource: 'OVERRIDE', billingTariffId: null, billingTariffRevision: null, billingRateSource: t.billable === false ? 'NON_BILLABLE' : t.billingSatang == null ? 'PENDING' : 'MANUAL' };
        }
        const prior = t.tripId ? existingTrips.get(t.tripId) : null;
        const sameDriverRoute = prior && prior.originId === t.originId && prior.destinationId === t.destinationId;
        const sameRoute = sameDriverRoute && (prior.customerId || null) === (t.customerId || null);
        const driverTariffs = activeTariffs.filter((x: any) => x.originId === t.originId && x.destinationId === t.destinationId && x.customerId == null);
        const billingTariffs = activeTariffs.filter((x: any) => x.originId === t.originId && x.destinationId === t.destinationId && x.customerId === t.customerId);
        if (driverTariffs.length > 1 || billingTariffs.length > 1) throw new Error('AMBIGUOUS_TARIFF');
        const driverTariff = driverTariffs[0];
        const billingTariff = billingTariffs[0];
        const resolvedDriverPay = sameDriverRoute && prior.driverPaySatang != null ? prior.driverPaySatang : driverTariff?.driverPaySatang ?? null;
        t.driverPaySatang = resolvedDriverPay;
        if (t.status === 'COMPLETED' && resolvedDriverPay == null) throw new Error('MISSING_PRICE');
        const standardDriver = driverTariff && resolvedDriverPay === driverTariff.driverPaySatang;
        const standardBilling = t.billable !== false && billingTariff?.customerRateSatang != null && t.billingSatang === billingTariff.customerRateSatang;
        const priorDriver = sameDriverRoute && prior.driverPaySatang != null;
        const sameBillingSnapshot = sameRoute && prior.billingSatang === t.billingSatang;
        return {
          driverTariffId: priorDriver ? prior.driverTariffId ?? driverTariff?.tariffId ?? null : driverTariff?.tariffId ?? null,
          driverTariffRevision: priorDriver ? prior.driverTariffRevision ?? driverTariff?.revision ?? null : driverTariff?.revision ?? null,
          driverRateSource: t.driverPaySatang == null ? 'PENDING' : standardDriver ? 'STANDARD' : priorDriver ? prior.driverRateSource || 'STANDARD' : 'OVERRIDE',
          billingTariffId: sameBillingSnapshot ? prior.billingTariffId ?? billingTariff?.tariffId ?? null : standardBilling ? billingTariff?.tariffId ?? null : null,
          billingTariffRevision: sameBillingSnapshot ? prior.billingTariffRevision ?? billingTariff?.revision ?? null : standardBilling ? billingTariff?.revision ?? null : null,
          billingRateSource: t.billable === false ? 'NON_BILLABLE' : t.billingSatang == null ? 'PENDING' : sameBillingSnapshot ? prior.billingRateSource || (standardBilling ? 'STANDARD' : 'MANUAL') : standardBilling ? 'STANDARD' : 'MANUAL'
        };
      });

      const truckData = truckSnap.exists ? truckSnap.data() : null;
      if (modern && (!truckData || truckData.status !== 'ACTIVE')) throw new Error('TRUCK_NOT_ACTIVE');
      const plateNumberSnapshot = truckData?.plateNumber || current?.plateNumberSnapshot || truckId;
      const driverNameSnapshot = driverSnap?.data()?.name || truckData?.driverName || current?.driverNameSnapshot || '';

      // 2. Write phase
      const now = new Date().toISOString();
      const newRevision = currentRevision + 1;
      const finalPhotos = Array.isArray(photos) ? photos : (current?.photos || []);
      const finalTrips = trips.map((t: any, index: number) => {
        t.tripIndex = index + 1;
        const origin=locations.get(t.originId), destination=locations.get(t.destinationId);
        const prior = t.tripId ? existingTrips.get(t.tripId) : null;
        if (t.departureDate && (t.originId===t.destinationId || (origin?.status !== 'ACTIVE' && prior?.originId !== t.originId) || (t.destinationMode !== '__OTHER__' && destination?.status !== 'ACTIVE' && prior?.destinationId !== t.destinationId))) throw new Error('INVALID_LOCATION');
        if (t.billable !== false && t.status === 'COMPLETED' && t.departureDate && (!t.customerId || t.billingSatang == null || t.weightKg == null)) throw new Error('BILLING_INCOMPLETE');
        const legacyDriverExtraSatang = prior?.legacyDriverExtraSatang ?? (prior?.pricingVersion !== 3 ? prior?.driverExtraSatang : undefined);
        const legacyFeeFields = ['driverExtraSatang', 'driverExtraNote', 'billingExtraSatang', 'billingExtraNote'];
        const hadLegacyFeeFields = prior?.pricingVersion !== 3 && legacyFeeFields.some(field => Object.prototype.hasOwnProperty.call(prior || {}, field));
        const legacyPricingSnapshot = prior?.legacyPricingSnapshot ?? (hadLegacyFeeFields ? { pricingVersion: prior?.pricingVersion ?? 2, ...Object.fromEntries(legacyFeeFields.filter(field => Object.prototype.hasOwnProperty.call(prior || {}, field)).map(field => [field, prior?.[field]])) } : undefined);
        const hasLegacyDriverExtra = prior && (Object.prototype.hasOwnProperty.call(prior, 'legacyDriverExtraSatang') || (prior.pricingVersion !== 3 && Object.prototype.hasOwnProperty.call(prior, 'driverExtraSatang')));
        return { ...t, pricingVersion: 3, ...(prior ? { departureTime: prior.departureTime ?? null, arrivalTime: prior.arrivalTime ?? null, departedAt: prior.departedAt ?? null, arrivedAt: prior.arrivedAt ?? null } : { departureTime: null, arrivalTime: null, departedAt: null, arrivedAt: null }), billingPricingMode: 'PER_TRIP', ...rateSnapshots[index], ...(hasLegacyDriverExtra ? { legacyDriverExtraSatang: legacyDriverExtraSatang ?? 0 } : {}), ...(legacyPricingSnapshot ? { legacyPricingSnapshot } : {}), fromLocation: prior && prior.originId === t.originId ? prior.fromLocation : origin ? `${origin.code} — ${origin.name}` : t.fromLocation, destinationName: t.destinationMode === '__OTHER__' ? t.destinationName : prior && prior.destinationId === t.destinationId ? prior.destinationName : destination ? `${destination.code} — ${destination.name}` : t.destinationName, customerName: prior && prior.customerId === t.customerId ? prior.customerName : t.customerId ? customers.get(t.customerId) : '', tripId: t.tripId || randomUUID() };
      });

      const recordData: TruckDailyRecordDoc = {
        recordId,
        dateKey,
        monthKey,
        truckId,
        driverId: driverId || null,
        plateNumberSnapshot,
        driverNameSnapshot,
        fuelCostSatang: modern ? 0 : Number(fuelCostSatang ?? 0),
        totalDriverPaySatang: calculateTruckRecordTotals(finalTrips, modern ? 0 : Number(fuelCostSatang ?? 0)).totalDriverPaySatang,
        tripCount: totals.tripCount,
        trips: finalTrips,
        photos: finalPhotos,
        revision: newRevision,
        createdAt: current?.createdAt || now,
        updatedAt: now,
        updatedBy: owner.uid
      };

      tx.set(recordRef, recordData);
      tx.set(monthRef, { monthKey, updatedAt: now }, { merge: true });
      const retained = new Set(finalTrips.map((t: any) => t.tripId));
      for (const ref of oldRefs) if (!retained.has(ref.id)) tx.delete(ref);
      for (const trip of finalTrips) {
        const prior = existingTrips.get(trip.tripId);
        const tripData: any = { ...prior, ...trip, recordId, truckId, plateNumberSnapshot, driverNameSnapshot, driverId: driverId || null, invoiceId: null, photos: finalPhotos, updatedAt: now };
        if (trip.destinationMode !== '__OTHER__') delete tripData.manualDriverPaySatang;
        for (const field of ['driverExtraSatang', 'driverExtraNote', 'billingExtraSatang', 'billingExtraNote']) delete tripData[field];
        tx.set(getTruckTripsCol(shopId).doc(trip.tripId), tripData);
      }

      recordAudit(
        tx,
        shopId,
        owner.uid,
        exists ? 'UPDATE_TRUCK_RECORD' : 'CREATE_TRUCK_RECORD',
        recordId,
        current,
        recordData,
        requestId,
        undefined
      );

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: recordId,
        payloadHash,
        response: recordData,
        createdAt: now
      });

      return recordData;
    });

    return createSuccessResponse(result, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'TRUCK_MAINTENANCE') return createErrorResponse('TRUCK_MAINTENANCE', 'ระบบกำลังบำรุงรักษา กรุณาลองใหม่ภายหลัง', 503);
    if (['INVALID_TRIP_ID','INVALID_LOCATION','INVALID_INPUT','INVALID_DATE','INVALID_TIME','EXTRA_NOTE_REQUIRED','BILLING_INCOMPLETE','DRIVER_REQUIRED','CUSTOMER_NOT_ACTIVE','DRIVER_NOT_ACTIVE','TRUCK_NOT_ACTIVE','MISSING_PRICE','PRICE_OVERRIDE_REQUIRED','AMBIGUOUS_TARIFF'].includes(error.message || '')) return createErrorResponse(error.message!, undefined, 422);
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    if (error.message === 'MONTH_CLOSED') return createErrorResponse('MONTH_CLOSED', 'รอบค่าแรงปิดแล้ว กรุณาเปิดรอบก่อนแก้ไข', 409);
    if (error.message === 'RECORD_MIGRATED') return createErrorResponse('RECORD_MIGRATED', 'ใบงานนี้ย้ายเป็นเที่ยวแยกแล้ว ไม่สามารถแก้ไขผ่านใบงานเดิม', 409);
    if (error.message === 'TRIP_BILLED') return createErrorResponse('TRIP_BILLED', 'เที่ยวในใบงานนี้วางบิลแล้ว ไม่สามารถแก้ไขได้', 409);
    if (error.message === 'LEGACY_PRICING_REVIEW_REQUIRED') return createErrorResponse('LEGACY_PRICING_REVIEW_REQUIRED', 'ต้องตรวจราคาเดิมก่อนแก้ไขหรือลบเที่ยว', 409);
    if (error.message === 'REQUEST_ID_REUSED') {
      return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
    }
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}
