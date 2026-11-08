import { truckDateRange } from '@/lib/truck/date-range';
import { assertPayrollRangesOpen } from '@/lib/server/truck-payroll-lock';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { getShopDocRef, getShopId, getTruckTripsCol, getTruckWorkDaysCol, getTruckRecordsCol, getRequestsCol, recordAudit } from '@/lib/server/repository';
import { createErrorResponse, createSuccessResponse } from '@/lib/server/errors';
import { checkRequestReceipt, computePayloadHash, recordRequestReceipt } from '@/lib/server/idempotency';
import { monthKey } from '@/lib/payroll/dates';
import { assertTruckWritable } from '@/lib/server/truck-control';
import { calculateTruckPayroll, PayrollDay, PayrollTrip } from '@/lib/truck/payroll';

export const dynamic = 'force-dynamic';
function preparePayroll(month:string,legacy:any,tripSnap:any,daySnap:any,range?:{start:string;end:string}) {
  const legacyReviewRequired=legacy.docs.some((d:any)=>(d.data().trips||[]).some((t:any)=>!t.tripId && (!range || (t.departureDate || d.data().dateKey) >= range.start && (t.departureDate || d.data().dateKey) <= range.end)));
  const days:PayrollDay[]=daySnap.docs.flatMap((d:any)=>{const x=d.data();return (x.drivers||[]).map((v:{driverId:string;name:string;baseWageSatang?:number})=>({date:x.dateKey,driverId:v.driverId,driverName:v.name,baseSatang:v.baseWageSatang??x.baseWageSatang}));});
  const trips:PayrollTrip[]=tripSnap.docs.filter((d:any)=>!range || d.data().departureDate >= range.start && d.data().departureDate <= range.end).map((d:any)=>{const x=d.data();return {tripId:d.id,pricingVersion:x.pricingVersion===3?3:undefined,driverId:x.driverId??null,driverName:x.driverNameSnapshot||'',departureDate:x.departureDate,arrivalDate:x.arrivalDate??null,status:x.status,driverPaySatang:x.driverPaySatang??null,...(x.pricingVersion===3?{}:{driverExtraSatang:x.driverExtraSatang??0}),legacyDriverExtraSatang:x.legacyDriverExtraSatang??0,origin:x.originNameSnapshot||x.fromLocation||'',destination:x.destinationNameSnapshot||x.destinationName||'',plate:x.plateNumberSnapshot||''};});
  return {preview:calculateTruckPayroll(month,days,trips,range),legacyReviewRequired};
}
export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req); const range=truckDateRange({start:req.nextUrl.searchParams.get('start'),end:req.nextUrl.searchParams.get('end'),month:req.nextUrl.searchParams.get('month')}); const month=range.start.slice(0,7), shop=getShopId();
    const [periodSnap,snap,tripSnap,...sources]=await Promise.all([
      getShopDocRef(shop).collection('truckPayrollMonths').get(),
      getShopDocRef(shop).collection('truckPayrollMonths').doc(range.id).get(),
      range.custom ? getTruckTripsCol(shop).get() : getTruckTripsCol(shop).where('accountingMonth','==',month).get(),
      ...range.months.map(m=>getTruckRecordsCol(m,shop).get()), ...range.months.map(m=>getTruckWorkDaysCol(m,shop).get())
    ]);
    const legacy={docs:sources.slice(0,range.months.length).flatMap(s=>s.docs)}, daySnap={docs:sources.slice(range.months.length).flatMap(s=>s.docs)};
    const periods=(periodSnap.docs||[]).map(d=>{const v=d.data();const r=/^20\d{2}-\d{2}$/.test(d.id)?truckDateRange({month:d.id}):v;return {id:d.id,start:r.start,end:r.end,state:v.state};}).filter(v=>v.start&&v.end).sort((a,b)=>b.start.localeCompare(a.start));
    const current=snap.exists?snap.data()!:{month,start:range.start,end:range.end,periodId:range.id,state:'OPEN',revision:0};
    if(current.state==='CLOSED') return createSuccessResponse({...current,periods});
    return createSuccessResponse({...current,periods,...preparePayroll(month,legacy,tripSnap,daySnap,range)});
  } catch(e: unknown) { const x=e as Error; return createErrorResponse(x.message || 'INTERNAL_ERROR',undefined,400); }
}
export async function POST(req: NextRequest) {
  try {
    const owner=await verifyOwner(req); const body=await req.json(); const range=truckDateRange(body); const month=range.start.slice(0,7); const {action,requestId,expectedRevision}=body;
    if (typeof requestId !== 'string' || requestId.length < 5 || !Number.isSafeInteger(expectedRevision)) throw new Error('INVALID_INPUT');
    const shop=getShopId(), db=getAdminFirestore(), shopRef=getShopDocRef(shop), lock=shopRef.collection('truckPayrollMonths').doc(range.id), receipt=getRequestsCol(shop).doc(requestId);
    const hash=computePayloadHash(owner.uid,'POST',`truckPayroll:${range.id}`,body);
    const result=await db.runTransaction(async tx => {
      const cached=await checkRequestReceipt(tx,receipt,hash); if(cached) return cached;
      await assertTruckWritable(tx,shop);
      const snap=await tx.get(lock); const current=snap.exists ? snap.data()! : {month,state:'OPEN',revision:0};
      if(current.revision!==expectedRevision) throw new Error('CONFLICT');
      const now=new Date().toISOString(); let value: Record<string,unknown>;
      if(action==='CLOSE') {
        if(current.state==='CLOSED') throw new Error('MONTH_CLOSED');
        await assertPayrollRangesOpen(tx,shop,[range],range.id,'PAYROLL_OVERLAP');
        const [tripSnap,...sources]=await Promise.all([tx.get(range.custom?getTruckTripsCol(shop):getTruckTripsCol(shop).where('accountingMonth','==',month)),...range.months.map(m=>tx.get(getTruckRecordsCol(m,shop))),...range.months.map(m=>tx.get(getTruckWorkDaysCol(m,shop)))]);
        const legacy={docs:sources.slice(0,range.months.length).flatMap(s=>s.docs)},daySnap={docs:sources.slice(range.months.length).flatMap(s=>s.docs)};
        const {preview:payroll,legacyReviewRequired}=preparePayroll(month,legacy,tripSnap,daySnap,range);
        if(legacyReviewRequired) throw new Error('LEGACY_REVIEW_REQUIRED');
        if(!payroll.canClose) throw new Error('PAYROLL_INCOMPLETE');
        value={month,start:range.start,end:range.end,periodId:range.id,state:'CLOSED',revision:current.revision+1,version:(current.version||0)+1,snapshot:payroll,closedAt:now,closedBy:owner.uid,payments:{}};
        tx.set(lock.collection('versions').doc(String(value.version)),value);
      } else if(action==='REOPEN') {
        if(current.state!=='CLOSED' || typeof body.reason!=='string' || !body.reason.trim()) throw new Error('INVALID_INPUT');
        if(Object.values(current.payments||{}).some((p:unknown)=>(p as {status?:string}).status==='PAID')) throw new Error('PAYROLL_PAID');
        value={...current,state:'OPEN',revision:current.revision+1,reopenedAt:now,reopenedBy:owner.uid,reopenReason:body.reason.trim()};
      } else if(action==='PAY' || action==='VOID_PAYMENT') {
        if(current.state!=='CLOSED' || !current.snapshot || typeof body.driverId!=='string') throw new Error('INVALID_INPUT');
        const row=current.snapshot.drivers.find((d:{driverId:string})=>d.driverId===body.driverId); if(!row) throw new Error('NOT_FOUND');
        const payments={...(current.payments||{})}; const existing=payments[body.driverId];
        if(action==='PAY') { if(existing?.status==='PAID' || typeof body.paidDate!=='string') throw new Error('INVALID_INPUT'); const {dateKey}=await import('@/lib/payroll/dates'); dateKey(body.paidDate); payments[body.driverId]={status:'PAID',amountSatang:row.totalSatang,paidDate:body.paidDate,note:String(body.note||'').slice(0,1000),recordedAt:now,history:existing ? [...(existing.history || []), Object.fromEntries(Object.entries(existing).filter(([key])=>key!=='history'))] : []}; }
        else { if(existing?.status!=='PAID' || typeof body.reason!=='string' || !body.reason.trim()) throw new Error('INVALID_INPUT'); payments[body.driverId]={...existing,status:'VOID',voidReason:body.reason.trim(),voidedAt:now}; }
        value={...current,payments,revision:current.revision+1,updatedAt:now};
      } else throw new Error('INVALID_INPUT');
      tx.set(lock,value); recordAudit(tx,shop,owner.uid,`TRUCK_PAYROLL_${action}`,range.id,current,value,requestId,body.reason);
      recordRequestReceipt(tx,receipt,{requestId,actorUid:owner.uid,method:'POST',entityKey:`truckPayroll:${month}`,payloadHash:hash,response:value,createdAt:now}); return value;
    }); return createSuccessResponse(result,requestId);
  } catch(e:unknown) { const x=e as Error; const messages:Record<string,string>={INVALID_DATE_RANGE:'ช่วงวันที่ต้องเรียงจากน้อยไปมากและไม่เกิน 366 วัน',PAYROLL_OVERLAP:'ช่วงวันที่นี้ทับซ้อนกับรอบค่าแรงที่ปิดแล้ว กรุณาเลือกช่วงใหม่หรือเปิดรอบเดิมก่อน',PAYROLL_CLOSURE_NOT_READY:'ยังไม่สามารถปิดรอบได้ ระบบกำลังตรวจสอบการล็อกข้อมูล',LEGACY_REVIEW_REQUIRED:'มีใบงานเดิมที่ต้องตรวจและย้ายข้อมูลก่อนปิดรอบ',PAYROLL_INCOMPLETE:'ข้อมูลคนขับหรือค่าเที่ยวไม่ครบ กรุณาตรวจสอบก่อนปิดรอบ',PAYROLL_PAID:'ต้องยกเลิกการบันทึกจ่ายก่อนเปิดรอบ'}; return createErrorResponse(x.message||'INTERNAL_ERROR',messages[x.message],x.message==='CONFLICT'?409:422); }
}
