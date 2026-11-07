import {mkdirSync,writeFileSync} from 'node:fs';
import {NextRequest} from 'next/server';
import {GET as invoicePdf} from '../src/app/api/truck/billing/[id]/pdf/route';
import {GET as payrollPdf} from '../src/app/api/truck/payroll/pdf/route';

async function main(){
  const out='output/truck-qa';mkdirSync(out,{recursive:true});
  const docs=new Map<string,any>();
  const ref=(path:string):any=>({path,id:path.split('/').pop(),collection:(n:string)=>ref(`${path}/${n}`),doc:(id:string)=>ref(`${path}/${id}`),get:async()=>({exists:docs.has(path),data:()=>docs.get(path)})});
  (globalThis as any).adminDb={collection:(n:string)=>ref(n)};
  const base=`shops/${process.env.SHOP_ID||'main'}`;
  const lines=Array.from({length:100},(_,i)=>({departureDate:i===0?'2026-11-30':`2026-11-${String(i%28+1).padStart(2,'0')}`,arrivalDate:'2026-12-02',fromLocation:`A — โรงงานต้นทางบางนา ถนนเทพรัตน กม. ${i+1}`,destinationName:`B — จุดส่งสินค้าคลังสินค้าท่าเรือแหลมฉบัง ลานรับสินค้าพิเศษ ${i+1}`,plateNumberSnapshot:'70-1234',weightKg:12500,quantity:1,billingPricingMode:'PER_TRIP',billingSatang:120000}));
  const invoice={snapshotVersion:3,pricingVersion:3,documentNo:'QA-INV-001',issueDate:'2026-12-03',dueDate:'2026-12-20',customerName:'บริษัท ลูกค้าทดสอบภาษาไทย จำกัด',company:{companyName:'บริษัท พี.พิชญา ขนส่งทดสอบ จำกัด',address:'123 ถนนสุขุมวิท ตำบลบางนา กรุงเทพมหานคร',phone:'02-123-4567'},lines,totalSatang:12000000,note:'เอกสารทดสอบเท่านั้น ไม่ใช่เอกสารเรียกเก็บเงินจริง'};
  docs.set(`${base}/truckInvoices/qa-v3`,invoice);
  docs.set(`${base}/truckInvoices/qa-legacy`,{...invoice,snapshotVersion:2,lines:lines.map(l=>({...l,billingExtraSatang:10000,billingExtraNote:'ค่ารอเดิมตามประวัติ'})),totalSatang:13000000});
  const trips=lines.map((l,i)=>({pricingVersion:3,departureDate:l.departureDate,arrivalDate:l.arrivalDate,plate:l.plateNumberSnapshot,origin:l.fromLocation,destination:l.destinationName,driverPaySatang:15000}));
  const days=Array.from({length:30},(_,i)=>({date:`2026-11-${String(i+1).padStart(2,'0')}`,baseSatang:30000}));
  docs.set(`${base}/truckPayrollMonths/2026-11`,{state:'CLOSED',payments:{d1:{status:'PAID',paidDate:'2026-12-05'}},snapshot:{pricingVersion:3,drivers:[{driverId:'d1',driverName:'นายสมชาย ทดสอบสระและวรรณยุกต์',days,trips,baseSatang:900000,tripSatang:1500000,extraSatang:0,totalSatang:2400000}]}});
  for(const id of ['qa-v3','qa-legacy']){const r=await invoicePdf(new NextRequest(`http://qa/api/truck/billing/${id}/pdf`),{params:Promise.resolve({id})});if(r.status!==200)throw new Error(await r.text());writeFileSync(`${out}/${id}.pdf`,Buffer.from(await r.arrayBuffer()));}
  const r=await payrollPdf(new NextRequest('http://qa/api/truck/payroll/pdf?month=2026-11&driverId=d1'));if(r.status!==200)throw new Error(await r.text());writeFileSync(`${out}/qa-payroll.pdf`,Buffer.from(await r.arrayBuffer()));
  console.log('Created three synthetic PDFs; no live database was used.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
