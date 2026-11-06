import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { getShopDocRef,getShopId,getTruckTripsCol,getTruckDriversCol,getTruckCustomersCol,getTruckLocationsCol,getRequestsCol,recordAudit } from '@/lib/server/repository';
import { assertTruckWritable } from '@/lib/server/truck-control';
import { checkRequestReceipt,computePayloadHash,recordRequestReceipt } from '@/lib/server/idempotency';
import { createErrorResponse,createSuccessResponse } from '@/lib/server/errors';
import { dateKey } from '@/lib/payroll/dates';
import { validateSatang } from '@/lib/payroll/money';

export const dynamic='force-dynamic';
const id=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<200&&!x.includes('/');
export async function GET(req:NextRequest){try{await verifyOwner(req);const snap=await getTruckTripsCol().get();return createSuccessResponse({trips:snap.docs.map(d=>({...d.data(),tripId:d.id})).filter((d:any)=>d.legacyRecordId)});}catch(e:any){return createErrorResponse(e.message,undefined,500);}}
/** Review imported history explicitly; linked current work is edited only through its parent record. */
export async function PATCH(req:NextRequest){try{
  const owner=await verifyOwner(req),body=await req.json();
  if(!id(body.tripId)||!id(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||!id(body.driverId)||!id(body.originId)||!id(body.destinationId)||body.originId===body.destinationId||typeof body.reason!=='string'||!body.reason.trim())throw new Error('INVALID_INPUT');
  const departureDate=dateKey(body.departureDate),arrivalDate=body.arrivalDate?dateKey(body.arrivalDate):null;
  if(arrivalDate&&arrivalDate<departureDate)throw new Error('INVALID_DATE');
  const amount=body.driverPaySatang==null?null:validateSatang(body.driverPaySatang);const billing=body.billable===false?0:body.billingSatang==null?null:validateSatang(body.billingSatang);
  if(arrivalDate&&(amount==null||(body.billable!==false&&(!id(body.customerId)||billing==null))))throw new Error('PRICE_REQUIRED');
  const shop=getShopId(),ref=getTruckTripsCol(shop).doc(body.tripId),receipt=getRequestsCol(shop).doc(body.requestId),hash=computePayloadHash(owner.uid,'PATCH',body.tripId,body);
  const result=await getAdminFirestore().runTransaction(async tx=>{
    const cached=await checkRequestReceipt(tx,receipt,hash);if(cached)return cached;await assertTruckWritable(tx,shop);
    const snap=await tx.get(ref);const current=snap.data();if(!current?.legacyRecordId||current.recordId)throw new Error('NOT_REVIEWABLE');
    if((current.revision||0)!==body.expectedRevision)throw new Error('CONFLICT');if(current.invoiceId)throw new Error('TRIP_BILLED');
    const months=[...new Set([current.accountingMonth,departureDate.slice(0,7)])];
    const locks=await tx.getAll(...months.map(m=>getShopDocRef(shop).collection('truckPayrollMonths').doc(m)));if(locks.some(l=>l.data()?.state==='CLOSED'))throw new Error('MONTH_CLOSED');
    if(body.customerId&&!id(body.customerId))throw new Error('INVALID_INPUT');
    const [driver,origin,destination,...customers]=await tx.getAll(getTruckDriversCol(shop).doc(body.driverId),getTruckLocationsCol(shop).doc(body.originId),getTruckLocationsCol(shop).doc(body.destinationId),...(body.customerId?[getTruckCustomersCol(shop).doc(body.customerId)]:[]));
    if([driver,origin,destination,...customers].some(s=>!s.exists||s.data()?.status!=='ACTIVE'))throw new Error('INVALID_REFERENCE');
    const now=new Date().toISOString();const value={...current,driverId:body.driverId,driverNameSnapshot:driver.data()!.name,originId:body.originId,destinationId:body.destinationId,fromLocation:`${origin.data()!.code} — ${origin.data()!.name}`,destinationName:`${destination.data()!.code} — ${destination.data()!.name}`,customerId:body.customerId||null,customerName:customers[0]?.data()?.name||'',billable:body.billable!==false,departureDate,arrivalDate,accountingDate:departureDate,accountingMonth:departureDate.slice(0,7),driverPaySatang:amount,billingSatang:billing,driverExtraSatang:current.driverExtraSatang||0,billingExtraSatang:current.billingExtraSatang||0,status:body.cancelled?'CANCELLED':arrivalDate?'COMPLETED':'OPEN',revision:(current.revision||0)+1,reviewReason:body.reason.trim(),reviewedAt:now,reviewedBy:owner.uid};
    tx.set(ref,value);recordAudit(tx,shop,owner.uid,'REVIEW_IMPORTED_TRIP',ref.id,current,value,body.requestId,body.reason);recordRequestReceipt(tx,receipt,{requestId:body.requestId,actorUid:owner.uid,method:'PATCH',entityKey:ref.id,payloadHash:hash,response:value,createdAt:now});return value;
  });return createSuccessResponse(result,body.requestId);
}catch(e:any){return createErrorResponse(e.message,undefined,['CONFLICT','TRIP_BILLED','MONTH_CLOSED'].includes(e.message)?409:e.message==='TRUCK_MAINTENANCE'?503:422);}}
