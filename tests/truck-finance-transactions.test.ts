import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as payroll } from '../src/app/api/truck/payroll/route';
import { POST as workday } from '../src/app/api/truck/workdays/route';

test('close locks workdays, payment must be voided before reopening, and retry is idempotent', async () => {
  const docs=new Map<string,any>(); let queue=Promise.resolve();
  const ref=(path:string):any=>({path,id:path.split('/').pop(),collection:(name:string)=>col(`${path}/${name}`)});
  const col=(path:string, filter?:[string,string,unknown]):any=>({path,filter,doc:(id:string)=>ref(`${path}/${id}`),where:(field:string,op:string,value:unknown)=>col(path,[field,op,value])});
  const snap=(r:any):any=>r.filter || !r.id ? {docs:[...docs].filter(([p,v])=>p.startsWith(r.path+'/') && !p.slice(r.path.length+1).includes('/') && (!r.filter || v[r.filter[0]]===r.filter[2])).map(([p])=>snap(ref(p))),get empty(){return this.docs.length===0;}} : {id:r.id,exists:docs.has(r.path),data:()=>docs.get(r.path)};
  (globalThis as any).adminDb={collection:col,runTransaction:async(fn:any)=>{let release!:()=>void;const previous=queue;queue=new Promise<void>(r=>{release=r;});await previous;try {const writes:(()=>void)[]=[];const tx={get:async(r:any)=>snap(r),getAll:async(...refs:any[])=>refs.map(snap),set:(r:any,v:any)=>writes.push(()=>docs.set(r.path,v)),create:(r:any,v:any)=>writes.push(()=>docs.set(r.path,v)),update:(r:any,v:any)=>writes.push(()=>docs.set(r.path,{...docs.get(r.path),...v}))};const value=await fn(tx);writes.forEach(w=>w());return value;}finally{release();}}};
  const base=`shops/${process.env.SHOP_ID||'main'}`;
  docs.set(`${base}/truckDrivers/d1`,{name:'Driver',status:'ACTIVE',baseWageSatang:30000});
  docs.set(`${base}/truckTrips/t1`,{accountingMonth:'2026-11',departureDate:'2026-11-30',arrivalDate:'2026-12-02',driverId:'d1',driverNameSnapshot:'Driver',status:'COMPLETED',driverPaySatang:12000});
  const call=(handler:any,body:any)=>handler(new NextRequest('http://localhost/api/truck/payroll',{method:'POST',body:JSON.stringify(body)}));
  assert.equal((await call(workday,{dateKey:'2026-11-30',driverIds:['d1'],expectedRevision:0,requestId:'work-day-1'})).status,200);
  const close={action:'CLOSE',month:'2026-11',expectedRevision:0,requestId:'close-month-1'};
  const first=await call(payroll,close);if(first.status!==200) console.log(await first.clone().text());assert.equal(first.status,200);const closed=(await first.json()).data;assert.equal(closed.snapshot.drivers[0].totalSatang,42000);
  assert.equal((await call(payroll,close)).status,200);
  assert.equal((await call(workday,{dateKey:'2026-11-30',driverIds:[],expectedRevision:1,requestId:'work-day-2'})).status,409);
  assert.equal((await call(payroll,{action:'PAY',month:'2026-11',driverId:'d1',paidDate:'2026-12-05',expectedRevision:1,requestId:'pay-one'})).status,200);
  assert.equal((await call(payroll,{action:'REOPEN',month:'2026-11',reason:'edit',expectedRevision:2,requestId:'reopen-one'})).status,422);
  assert.equal((await call(payroll,{action:'VOID_PAYMENT',month:'2026-11',driverId:'d1',reason:'wrong',expectedRevision:2,requestId:'void-pay-one'})).status,200);
  assert.equal((await call(payroll,{action:'REOPEN',month:'2026-11',reason:'edit',expectedRevision:3,requestId:'reopen-two'})).status,200);
});

