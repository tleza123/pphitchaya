import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/server/errors';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { getShopId, getTruckTripsCol, getTruckInvoicesCol, getTruckProfileRef, getRequestsCol, recordAudit } from '@/lib/server/repository';
import { assertTruckWritable } from '@/lib/server/truck-control';
import { validateSatang } from '@/lib/payroll/money';
import { dateKey, getBangkokToday, monthKey } from '@/lib/payroll/dates';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { hasLegacyFeeFields, needsLegacyPricingReview } from '@/lib/truck/pricing';

export const dynamic = 'force-dynamic';
const validId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 150 && !x.includes('/');
export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const month = monthKey(req.nextUrl.searchParams.get('month') || getBangkokToday().slice(0, 7));
    const shop = getShopId();
    const [tripSnap, invoiceSnap] = await Promise.all([getTruckTripsCol(shop).where('accountingMonth', '==', month).get(), getTruckInvoicesCol(shop).get()]);
    const allTrips = tripSnap.docs.map(d => ({ ...d.data(), tripId: d.id }));
    const trips = allTrips.filter((t: any) => t.pricingVersion === 3 && !Object.prototype.hasOwnProperty.call(t, 'billingExtraSatang') && !Object.prototype.hasOwnProperty.call(t, 'billingExtraNote') && t.status === 'COMPLETED' && t.billingSatang != null && Number.isSafeInteger(t.weightKg) && t.weightKg >= 0 && t.customerId && !t.invoiceId && t.billable !== false);
    const legacyPricingReview = allTrips.filter((t: any) => needsLegacyPricingReview(t) && t.status === 'COMPLETED' && !t.invoiceId && t.billable !== false);
    const invoices = await Promise.all(invoiceSnap.docs.map(async d => { const value = d.data(); const payments = await d.ref.collection('payments').get(); return { ...value, invoiceId: d.id, balanceSatang: value.totalSatang - (value.paidSatang || 0), payments:payments.docs.map(p=>({...p.data(),paymentId:p.id})) }; }));
    return createSuccessResponse({ trips, legacyPricingReview, invoices });
  } catch (e: any) { return createErrorResponse(e.code || 'INTERNAL_ERROR', e.message, e.statusCode || 500); }
}

export async function POST(req: NextRequest) {
  try {
    const owner = await verifyOwner(req); const body = await req.json();
    if (!validId(body.requestId) || body.requestId.length < 5) return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId', 422);
    const shop = getShopId(), db = getAdminFirestore(), receipt = getRequestsCol(shop).doc(body.requestId);
    const hash = computePayloadHash(owner.uid, 'POST', 'truckBilling', body);
    const result = await db.runTransaction(async tx => {
      const cached = await checkRequestReceipt(tx, receipt, hash); if (cached) return cached;
      await assertTruckWritable(tx,shop);
      const now = new Date().toISOString(); let result: any;
      if (body.action === 'INVOICE') {
        if (!Array.isArray(body.tripIds) || !body.tripIds.length || body.tripIds.length > 150 || !body.tripIds.every(validId) || new Set(body.tripIds).size !== body.tripIds.length) throw new Error('INVALID_TRIPS');
        const issueDate = dateKey(body.issueDate || getBangkokToday()); const dueDate = dateKey(body.dueDate || issueDate);
        if (dueDate < issueDate) throw new Error('INVALID_DUE_DATE');
        const refs = body.tripIds.map((id: string) => getTruckTripsCol(shop).doc(id));
        const [profile, ...snaps] = await tx.getAll(getTruckProfileRef(shop), ...refs);
        const trips = snaps.map((snap, i) => {
          const t = snap.data();
          if (!snap.exists || !t || t.status !== 'COMPLETED' || t.invoiceId || t.billable === false || !validId(t.customerId) || typeof t.customerName !== 'string' || !t.customerName.trim() || t.billingSatang == null || !Number.isSafeInteger(t.weightKg) || t.weightKg < 0) throw new Error('TRIP_NOT_READY');
          if (t.pricingVersion !== 3 || hasLegacyFeeFields(t)) throw new Error('LEGACY_PRICING_REVIEW_REQUIRED');
          const base = validateSatang(t.billingSatang);
          return { tripId: refs[i].id, pricingVersion: 3, customerId: t.customerId, customerName: t.customerName, departureDate: dateKey(t.departureDate), fromLocation: t.fromLocation || '', destinationName: t.destinationName || '', plateNumberSnapshot: t.plateNumberSnapshot || '', weightKg:t.weightKg, quantity:1, billingPricingMode:'PER_TRIP', billingSatang: base, note: t.note || '' };
        });
        if (trips.some(t => t.customerId !== trips[0].customerId)) throw new Error('MIXED_CUSTOMERS');
        const totalSatang = trips.reduce((sum,t) => sum + t.billingSatang, 0); if (!Number.isSafeInteger(totalSatang)) throw new Error('MONEY_OVERFLOW');
        const ref = getTruckInvoicesCol(shop).doc();
        result = { invoiceId: ref.id, documentNo: `INV-${issueDate.replaceAll('-', '')}-${ref.id.toUpperCase()}`, snapshotVersion:3, pricingVersion:3, billingPricingMode:'PER_TRIP', customerId: trips[0].customerId, customerName: trips[0].customerName, company: profile.data() || {}, lines: trips, tripIds: body.tripIds, totalSatang, paidSatang: 0, issueDate, dueDate, note: String(body.note || '').slice(0,1000), status: 'OPEN', revision: 1, createdAt: now };
        tx.create(ref, result); for (const tripRef of refs) tx.update(tripRef, { invoiceId: result.invoiceId });
        recordAudit(tx, shop, owner.uid, 'CREATE_TRUCK_INVOICE', ref.id, null, result, body.requestId);
      } else if (body.action === 'VOID_INVOICE') {
        if (!validId(body.invoiceId) || typeof body.reason !== 'string' || !body.reason.trim()) throw new Error('INVALID_INPUT');
        const ref=getTruckInvoicesCol(shop).doc(body.invoiceId), snap=await tx.get(ref), invoice=snap.data();
        if (!invoice || invoice.status !== 'OPEN' || invoice.revision !== body.expectedRevision) throw new Error('CONFLICT');
        if (invoice.paidSatang !== 0) throw new Error('INVOICE_HAS_PAYMENTS');
        const refs=(invoice.tripIds || []).map((id:string)=>getTruckTripsCol(shop).doc(id));
        const trips=await tx.getAll(...refs);
        if (trips.some(t=>!t.exists || (t.data() as {invoiceId?:string} | undefined)?.invoiceId !== ref.id)) throw new Error('CONFLICT');
        result={...invoice,status:'VOID',voidReason:body.reason.trim(),voidedAt:now,voidedBy:owner.uid,revision:invoice.revision+1};
        tx.set(ref,result); for (const trip of refs) tx.update(trip,{invoiceId:null});
        recordAudit(tx,shop,owner.uid,'VOID_TRUCK_INVOICE',ref.id,invoice,result,body.requestId,body.reason.trim());
      } else if (body.action === 'PAYMENT') {
        if (!validId(body.invoiceId)) throw new Error('INVALID_INPUT');
        const amount = validateSatang(body.amountSatang); if (!amount) throw new Error('INVALID_MONEY');
        const paidDate = dateKey(body.paidDate || getBangkokToday());
        const ref = getTruckInvoicesCol(shop).doc(body.invoiceId); const snap = await tx.get(ref); const invoice = snap.data();
        if (!snap.exists || !invoice || invoice.status !== 'OPEN') throw new Error('INVOICE_NOT_FOUND');
        if (invoice.revision !== body.expectedRevision) throw new Error('CONFLICT');
        if (amount > invoice.totalSatang - (invoice.paidSatang || 0)) throw new Error('OVERPAYMENT');
        const payment = ref.collection('payments').doc();
        result = { paymentId: payment.id, invoiceId: ref.id, amountSatang: amount, paidDate, channel: String(body.channel || '').slice(0,100), reference: String(body.reference || '').slice(0,200), note: String(body.note || '').slice(0,1000), status: 'ACTIVE', createdAt: now };
        tx.create(payment, result); tx.update(ref, { paidSatang: (invoice.paidSatang || 0) + amount, revision: invoice.revision + 1, updatedAt: now });
        recordAudit(tx, shop, owner.uid, 'RECEIVE_TRUCK_PAYMENT', payment.id, null, result, body.requestId);
      } else if (body.action === 'VOID_PAYMENT') {
        if (!validId(body.invoiceId) || !validId(body.paymentId) || typeof body.reason !== 'string' || !body.reason.trim()) throw new Error('INVALID_INPUT');
        const ref = getTruckInvoicesCol(shop).doc(body.invoiceId), payment = ref.collection('payments').doc(body.paymentId);
        const [snap, paymentSnap] = await tx.getAll(ref, payment); const invoice = snap.data(), before = paymentSnap.data();
        if (!invoice || !before || before.status !== 'ACTIVE' || invoice.revision !== body.expectedRevision) throw new Error('CONFLICT');
        if ((invoice.paidSatang || 0) < before.amountSatang) throw new Error('INVALID_BALANCE');
        result = { ...before, status:'VOID', voidReason:body.reason.trim(), voidedAt:now };
        tx.set(payment,result); tx.update(ref,{paidSatang:invoice.paidSatang-before.amountSatang,revision:invoice.revision+1,updatedAt:now});
        recordAudit(tx,shop,owner.uid,'VOID_TRUCK_PAYMENT',payment.id,before,result,body.requestId,body.reason.trim());
      } else throw new Error('INVALID_ACTION');
      recordRequestReceipt(tx, receipt, { requestId:body.requestId, actorUid:owner.uid, method:'POST', entityKey:result.invoiceId, payloadHash:hash, response:result, createdAt:now });
      return result;
    });
    return createSuccessResponse(result, body.requestId);
  } catch (e: any) { return createErrorResponse(e.message || 'INTERNAL_ERROR', e.message, e.message === 'CONFLICT' || e.message === 'TRIP_NOT_READY' ? 409 : e.statusCode || 422); }
}
