import { assertPayrollDatesOpen } from '@/lib/server/truck-payroll-lock';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/server/errors';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { getShopId, getShopDocRef, getTruckWorkDaysCol, getTruckDriversCol, getTruckTripsCol, getRequestsCol, recordAudit } from '@/lib/server/repository';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { dateKey as validateDate, monthKey as validateMonth, getBangkokMonth } from '@/lib/payroll/dates';
import { assertTruckWritable } from '@/lib/server/truck-control';
import { validateSatang } from '@/lib/payroll/money';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const month = validateMonth(req.nextUrl.searchParams.get('month') || getBangkokMonth());
    const snap = await getTruckWorkDaysCol(month).get();
    const dateParam=req.nextUrl.searchParams.get('date');
    const date=dateParam ? validateDate(dateParam) : null;
    const suggestions=date ? (await getTruckTripsCol().where('departureDate','<=',date).get()).docs.map(d=>d.data()).filter(t=>t.driverId && t.status!=='CANCELLED' && t.departureDate<=date && (t.arrivalDate || t.departureDate)>=date).map(t=>t.driverId as string) : [];
    return createSuccessResponse({ workDays: snap.docs.map(d => ({ workDayId:d.id, ...d.data() })), suggestedDriverIds:[...new Set(suggestions)] });
  } catch (e: unknown) { const x=e as Error; return createErrorResponse(x.message || 'INTERNAL_ERROR', undefined, 400); }
}
export async function POST(req: NextRequest) {
  try {
    const owner=await verifyOwner(req); const body=await req.json();
    const date=validateDate(body.dateKey); const ids=body.driverIds;
    if (!Array.isArray(ids) || ids.length > 150 || ids.some(id=>typeof id !== 'string' || !id || id.includes('/')) || new Set(ids).size !== ids.length || typeof body.requestId !== 'string' || body.requestId.length < 5 || !Number.isSafeInteger(body.expectedRevision)) throw new Error('INVALID_INPUT');
    const month=date.slice(0,7), shop=getShopId(), db=getAdminFirestore();
    const ref=getTruckWorkDaysCol(month,shop).doc(date), lock=getShopDocRef(shop).collection('truckPayrollMonths').doc(month), receipt=getRequestsCol(shop).doc(body.requestId);
    const hash=computePayloadHash(owner.uid,'POST',date,{ dateKey:date, driverIds:ids, expectedRevision:body.expectedRevision });
    const result=await db.runTransaction(async tx=>{
      const cached=await checkRequestReceipt(tx,receipt,hash); if(cached) return cached;
      await assertTruckWritable(tx,shop);
      const [snap, lockSnap, ...drivers]=await tx.getAll(ref,lock,...ids.map(id=>getTruckDriversCol(shop).doc(id)));
      await assertPayrollDatesOpen(tx, shop, [date]);
      const current=snap.exists ? snap.data() : null;
      if ((current?.revision||0)!==body.expectedRevision) throw new Error('CONFLICT');
      if (lockSnap.data()?.state==='CLOSED') throw new Error('MONTH_CLOSED');
      const prior=new Map<string,{driverId:string;name:string;baseWageSatang:number}>((current?.drivers||[]).map((d:{driverId:string;name:string;baseWageSatang:number})=>[d.driverId,d]));
      const names=drivers.map((d,i)=>{
        const data=d.data(); if(!d.exists || !data || data.status==='SUSPENDED') throw new Error('DRIVER_NOT_ACTIVE');
        const old=prior.get(ids[i]); const wage=old?.baseWageSatang ?? data.baseWageSatang ?? 30000; validateSatang(wage);
        return {driverId:ids[i],name:old?.name ?? data.name,baseWageSatang:wage};
      });
      const now=new Date().toISOString(); const value={dateKey:date,monthKey:month,drivers:names,revision:(current?.revision||0)+1,confirmedAt:now,updatedBy:owner.uid};
      tx.set(ref,value); recordAudit(tx,shop,owner.uid,'CONFIRM_TRUCK_WORKDAY',date,current,value,body.requestId);
      recordRequestReceipt(tx,receipt,{requestId:body.requestId,actorUid:owner.uid,method:'POST',entityKey:date,payloadHash:hash,response:value,createdAt:now}); return value;
    });
    return createSuccessResponse(result,body.requestId);
  } catch(e:unknown) { const x=e as Error; return createErrorResponse(x.message||'INTERNAL_ERROR',undefined,x.message==='CONFLICT'||x.message==='MONTH_CLOSED'?409:422); }
}
