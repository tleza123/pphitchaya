import { TruckDocumentTable } from '@/lib/server/truck-document-table';
import { tripLocationNames } from '@/lib/truck/location-names';
import { truckDateRange } from '@/lib/truck/date-range';
import { NextRequest } from 'next/server';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { verifyOwner } from '@/lib/server/auth';
import { getShopDocRef } from '@/lib/server/repository';
import { monthKey } from '@/lib/payroll/dates';
import { formatMoney } from '@/lib/payroll/money';
import { createErrorResponse } from '@/lib/server/errors';

export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
  try {
    await verifyOwner(req); const range=truckDateRange({start:req.nextUrl.searchParams.get('start'),end:req.nextUrl.searchParams.get('end'),month:req.nextUrl.searchParams.get('month')}); const month=range.id; const driverId=req.nextUrl.searchParams.get('driverId');
    if(!driverId || driverId.includes('/')) throw new Error('INVALID_INPUT');
    const snap=await getShopDocRef().collection('truckPayrollMonths').doc(month).get(); const data=snap.data();
    if(data?.state!=='CLOSED') return createErrorResponse('PAYROLL_NOT_CLOSED','รอบค่าแรงยังไม่ปิด',409);
    const row=data?.snapshot?.drivers?.find((r:{driverId:string})=>r.driverId===driverId); if(!row) throw new Error('NOT_FOUND');
    const doc=new PDFDocument({size:'A4',margin:0,bufferPages:true}); const chunks:Buffer[]=[];
    const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(c:Buffer)=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    doc.registerFont('Regular',path.join(process.cwd(),'src/assets/fonts/THSarabunNew.ttf')); doc.registerFont('Bold',path.join(process.cwd(),'src/assets/fonts/THSarabunNew-Bold.ttf'));
    const layout = new TruckDocumentTable(doc, page => {
      page.headerText('ใบสรุปค่าแรงคนขับ', 22, true, 'center');
      page.headerText(`รอบ ${data.start || range.start} ถึง ${data.end || range.end}`, 16);
      page.headerText(`คนขับ ${row.driverName}`, 16, true);
      const payment=data?.payments?.[driverId]; if(payment?.status==='PAID') page.headerText(`วันที่จ่าย ${payment.paidDate}`);
      page.headerText('ค่าเที่ยวรวมตามวันที่ออกเดินทางในช่วงที่เลือก', 13); page.y += 6;
    });
    layout.section('วันทำงานและค่าแรงฐาน');
    layout.table([{title:'วันที่ทำงาน',width:425},{title:'ค่าแรง (บาท)',width:90,align:'right'}], (row.days || []).map((day:any)=>[day.date,formatMoney(day.baseSatang)]));
    layout.section('รายละเอียดค่าเที่ยวคนขับ');
    const routeCounts = new Map<string,number>();
    const rows = (row.trips || []).map((trip:any) => {
      const names=tripLocationNames(trip), route=`จาก ${names.origin} ไป ${names.destination}`;
      const extra=trip.pricingVersion===3 ? trip.legacyDriverExtraSatang ?? 0 : trip.driverExtraSatang ?? 0;
      routeCounts.set(route,(routeCounts.get(route)||0)+1);
      return [trip.departureDate || '-',trip.plate || '-',`จาก ${names.origin}\nไป ${names.destination}${extra>0?'\nรวมเงินเพิ่มเดิม '+formatMoney(extra)+' บาท':''}`,formatMoney((trip.driverPaySatang ?? 0)+extra)];
    });
    layout.table([{title:'วันที่ออก',width:75},{title:'ทะเบียนรถ',width:80},{title:'ต้นทาง - ปลายทาง',width:270},{title:'ค่าเที่ยว (บาท)',width:90,align:'right'}],rows);
    layout.section('จำนวนเที่ยวตามเส้นทาง');
    layout.table([{title:'เส้นทาง',width:425},{title:'จำนวนเที่ยว',width:90,align:'right'}],[...routeCounts].map(([route,count])=>[route,String(count)]));
    layout.section('สรุปค่าแรง');
    const totals = [[`ค่าแรงฐาน (${(row.days || []).length} วัน)`,formatMoney(row.baseSatang)],[`ค่าเที่ยว (${(row.trips || []).length} เที่ยว)`,formatMoney(row.tripSatang)]];
    if(row.extraSatang>0) totals.push(['เงินเพิ่มเดิมจากข้อมูลก่อนรุ่น 3',formatMoney(row.extraSatang)]);
    layout.table([{title:'รายการ',width:425},{title:'จำนวนเงิน (บาท)',width:90,align:'right'}],totals);
    layout.paragraph(`ยอดรวม ${formatMoney(row.totalSatang)} บาท`,18,true,'right');
    layout.footers();
    doc.end(); const pdf=await done; return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="truck-payroll-${month}.pdf"`}});
  } catch(e:unknown){return createErrorResponse((e as Error).message||'INTERNAL_ERROR',undefined,422);}
}
