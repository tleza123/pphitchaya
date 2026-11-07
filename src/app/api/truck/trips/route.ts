import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { getShopDocRef,getShopId,getTruckTripsCol,getTruckRecordRef,getTruckDriversCol,getTruckCustomersCol,getTruckLocationsCol,getTruckTariffsCol,getRequestsCol,recordAudit } from '@/lib/server/repository';
import { assertTruckWritable } from '@/lib/server/truck-control';
import { checkRequestReceipt,computePayloadHash,recordRequestReceipt } from '@/lib/server/idempotency';
import { createErrorResponse,createSuccessResponse } from '@/lib/server/errors';
import { dateKey } from '@/lib/payroll/dates';
import { validateSatang } from '@/lib/payroll/money';
import { validateWeightKg } from '@/lib/truck/weight';
import { hasLegacyTripFees, legacyFeeSnapshot, needsLegacyPricingReview } from '@/lib/truck/pricing';

export const dynamic='force-dynamic';
const id=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<200&&!x.includes('/');
export async function GET(req:NextRequest){try{
  await verifyOwner(req);const snap=await getTruckTripsCol().get();
  const all=snap.docs.map((d:any)=>({...d.data(),tripId:d.id}));
  const recordIds=[...new Set(all.filter((t:any)=>t.recordId&&/^\d{4}-\d{2}/.test(t.recordId)).map((t:any)=>t.recordId))];
  const parents=await Promise.all(recordIds.map((recordId:string)=>getTruckRecordRef(recordId.slice(0,7),recordId).get()));
  const revisions=new Map(parents.filter((p:any)=>p.exists).map((p:any)=>[p.id,p.data()?.revision||0]));
  const trips=all.filter(needsLegacyPricingReview).map((t:any)=>({...t,recordRevision:t.recordId?revisions.get(t.recordId):undefined,legacyFeesPresent:hasLegacyTripFees(t)}));
  return createSuccessResponse({trips});
}catch(e:any){return createErrorResponse(e.message,undefined,500);}}
/** Review historic trips with explicit v3 pricing confirmation before normal billing/payroll use. */
export async function PATCH(req:NextRequest){try{
  const owner=await verifyOwner(req),body=await req.json();
  const forbidden=['driverPaySatang','driverRateSource','driverTariffId','driverTariffRevision','driverExtraSatang','driverExtraNote','billingTariffId','billingTariffRevision','billingExtraSatang','billingExtraNote','billingRateSource','overrideReason','legacyDriverExtraSatang','legacyPricingSnapshot','legacyTripSnapshot','legacyRecordId','legacyTripIndex','invoiceId'];
  if(forbidden.some(key=>Object.prototype.hasOwnProperty.call(body,key)))throw new Error('UNSUPPORTED_PRICING_FIELDS');
  if(body.pricingVersion!==3||body.billingPricingMode!=='PER_TRIP'||!id(body.tripId)||!id(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||!id(body.driverId)||!id(body.originId)||!id(body.destinationId)||body.originId===body.destinationId||typeof body.reason!=='string'||!body.reason.trim())throw new Error('INVALID_INPUT');
  const departureDate=dateKey(body.departureDate),arrivalDate=body.arrivalDate?dateKey(body.arrivalDate):null;
  if(arrivalDate&&arrivalDate<departureDate)throw new Error('INVALID_DATE');
  const weightKg=validateWeightKg(body.weightKg);const billing=body.billable===false?null:body.billingSatang==null?null:validateSatang(body.billingSatang);
  const shop=getShopId(),ref=getTruckTripsCol(shop).doc(body.tripId),receipt=getRequestsCol(shop).doc(body.requestId),hash=computePayloadHash(owner.uid,'PATCH',body.tripId,body);
  const result=await getAdminFirestore().runTransaction(async tx=>{
    const cached=await checkRequestReceipt(tx,receipt,hash);if(cached)return cached;await assertTruckWritable(tx,shop);
    const snap=await tx.get(ref);const current=snap.data();if(!current||!needsLegacyPricingReview(current)||(!current.legacyRecordId&&!current.recordId))throw new Error('NOT_REVIEWABLE');
    const linkedRecord=current.recordId?getTruckRecordRef(current.recordId.slice(0,7),current.recordId,shop):null;
    const linkedSnap=linkedRecord?await tx.get(linkedRecord):null;const linked=linkedSnap?.data();
    if(linkedRecord&&(!linkedSnap?.exists||linked?.revision!==body.expectedRecordRevision))throw new Error('CONFLICT');
    const legacyFees=hasLegacyTripFees(current);
    if(legacyFees&&body.confirmLegacyPricing!==true)throw new Error('LEGACY_PRICING_CONFIRMATION_REQUIRED');
    if((current.revision||0)!==body.expectedRevision)throw new Error('CONFLICT');if(current.invoiceId)throw new Error('TRIP_BILLED');
    const months=[...new Set([current.accountingMonth||current.departureDate?.slice(0,7),departureDate.slice(0,7),...(linkedRecord?[current.recordId.slice(0,7)]:[])])].filter((m:any)=>typeof m==='string');
    const locks=await tx.getAll(...months.map(m=>getShopDocRef(shop).collection('truckPayrollMonths').doc(m)));if(locks.some(l=>l.data()?.state==='CLOSED'))throw new Error('MONTH_CLOSED');
    if(body.customerId&&!id(body.customerId))throw new Error('INVALID_INPUT');
    const [driver,origin,destination,...customers]=await tx.getAll(getTruckDriversCol(shop).doc(body.driverId),getTruckLocationsCol(shop).doc(body.originId),getTruckLocationsCol(shop).doc(body.destinationId),...(body.customerId?[getTruckCustomersCol(shop).doc(body.customerId)]:[]));
    if([driver,origin,destination,...customers].some(s=>!s.exists||s.data()?.status!=='ACTIVE'))throw new Error('INVALID_REFERENCE');
    const tariffs=await tx.get(getTruckTariffsCol(shop));const sameRoute=current.originId===body.originId&&current.destinationId===body.destinationId;
    const oldAmount=current.driverPaySatang==null?null:validateSatang(current.driverPaySatang);
    const driverRates=tariffs.docs.filter((d:any)=>d.data()?.status==='ACTIVE'&&d.data()?.originId===body.originId&&d.data()?.destinationId===body.destinationId&&d.data()?.customerId==null);
    if(driverRates.length>1)throw new Error('AMBIGUOUS_TARIFF');
    const driverTariff=driverRates[0];const amount=sameRoute?oldAmount:driverTariff?.data()?.driverPaySatang??null;
    if(amount!=null)validateSatang(amount);
    if(arrivalDate&&(amount==null||(body.billable!==false&&(!id(body.customerId)||billing==null||weightKg==null))))throw new Error('PRICE_REQUIRED');
    const now=new Date().toISOString();
    const {driverExtraSatang,driverExtraNote,billingExtraSatang,billingExtraNote,...currentWithoutFees}=current;
    const oldPricing=legacyFeeSnapshot(current);
    const legacyPricingSnapshot={...(current.legacyPricingSnapshot||{}),pricingVersion:current.pricingVersion??oldPricing.pricingVersion??2,billingSatang:current.billingSatang??oldPricing.billingSatang??null,...(Object.prototype.hasOwnProperty.call(current,'billingExtraSatang')?{billingExtraSatang}:oldPricing.billingExtraSatang==null?{}:{billingExtraSatang:oldPricing.billingExtraSatang}),...(billingExtraNote!=null?{billingExtraNote}:oldPricing.billingExtraNote==null?{}:{billingExtraNote:oldPricing.billingExtraNote}),driverPaySatang:current.driverPaySatang??oldPricing.driverPaySatang??null,...(Object.prototype.hasOwnProperty.call(current,'driverExtraSatang')?{driverExtraSatang}:oldPricing.driverExtraSatang==null?{}:{driverExtraSatang:oldPricing.driverExtraSatang}),...(driverExtraNote!=null?{driverExtraNote}:oldPricing.driverExtraNote==null?{}:{driverExtraNote:oldPricing.driverExtraNote})};
    const legacyDriverExtraSatang=current.legacyDriverExtraSatang??driverExtraSatang??oldPricing.driverExtraSatang??0;
    const value:any={...currentWithoutFees,pricingVersion:3,billingPricingMode:'PER_TRIP',driverId:body.driverId,driverNameSnapshot:driver.data()!.name,originId:body.originId,destinationId:body.destinationId,fromLocation:`${origin.data()!.code} — ${origin.data()!.name}`,destinationName:`${destination.data()!.code} — ${destination.data()!.name}`,customerId:body.customerId||null,customerName:customers[0]?.data()?.name||'',billable:body.billable!==false,departureDate,arrivalDate,weightKg,accountingDate:departureDate,accountingMonth:departureDate.slice(0,7),driverPaySatang:amount,driverTariffId:sameRoute?current.driverTariffId??null:driverTariff?.id??null,driverTariffRevision:sameRoute?current.driverTariffRevision??null:driverTariff?.data()?.revision??null,driverRateSource:amount==null?'PENDING':sameRoute?current.driverRateSource||'STANDARD':'STANDARD',billingSatang:billing,billingRateSource:body.billable===false?'NON_BILLABLE':billing==null?'PENDING':'MANUAL',billingTariffId:null,billingTariffRevision:null,...(legacyDriverExtraSatang>0?{legacyDriverExtraSatang}:{}),legacyPricingSnapshot,status:body.cancelled?'CANCELLED':arrivalDate?'COMPLETED':'OPEN',revision:(current.revision||0)+1,reviewReason:body.reason.trim(),reviewedAt:now,reviewedBy:owner.uid};
    tx.set(ref,value);recordAudit(tx,shop,owner.uid,'REVIEW_TRUCK_PRICING_V3',ref.id,current,value,body.requestId,body.reason.trim());
    if(linkedRecord&&linked){
      const index=(linked.trips||[]).findIndex((t:any)=>t.tripId===ref.id||(!t.tripId&&t.tripIndex===current.legacyTripIndex));if(index<0)throw new Error('TRIP_NOT_FOUND');
      const trips=[...linked.trips];const {tripId:linkedId,recordId:linkedRecordId,...embeddedValue}=value;trips[index]={...embeddedValue,tripId:linkedId||trips[index].tripId};
      const updatedRecord={...linked,trips,revision:(linked.revision||0)+1,updatedAt:now,updatedBy:owner.uid};tx.set(linkedRecord,updatedRecord);recordAudit(tx,shop,owner.uid,'REVIEW_TRUCK_RECORD_PRICING_V3',current.recordId,linked,updatedRecord,body.requestId,body.reason.trim());
    }
    recordRequestReceipt(tx,receipt,{requestId:body.requestId,actorUid:owner.uid,method:'PATCH',entityKey:ref.id,payloadHash:hash,response:value,createdAt:now});return value;
  });return createSuccessResponse(result,body.requestId);
}catch(e:any){return createErrorResponse(e.message,undefined,['CONFLICT','TRIP_BILLED','MONTH_CLOSED'].includes(e.message)?409:e.message==='TRUCK_MAINTENANCE'?503:422);}}
