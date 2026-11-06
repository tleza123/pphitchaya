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
    await verifyOwner(req); const month=monthKey(req.nextUrl.searchParams.get('month')||''); const driverId=req.nextUrl.searchParams.get('driverId');
    if(!driverId || driverId.includes('/')) throw new Error('INVALID_INPUT');
    const snap=await getShopDocRef().collection('truckPayrollMonths').doc(month).get(); const data=snap.data();
    const row=data?.snapshot?.drivers?.find((r:{driverId:string})=>r.driverId===driverId); if(!row) throw new Error('NOT_FOUND');
    const doc=new PDFDocument({size:'A4',margin:45,bufferPages:true}); const chunks:Buffer[]=[];
    const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(c:Buffer)=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    doc.registerFont('thai',path.join(process.cwd(),'src/assets/fonts/THSarabunNew.ttf')); doc.font('thai').fontSize(18);
    doc.text('ใบสรุปค่าแรงคนขับ',{align:'center'}).text(`รอบ ${month}   คนขับ ${row.driverName}`);
    const payment=data?.payments?.[driverId]; if(payment?.status==='PAID') doc.text(`วันที่จ่าย ${payment.paidDate}`);
    doc.moveDown().text('วันทำงานและค่าแรงฐาน');
    for(const day of row.days) doc.text(`${day.date}   ${formatMoney(day.baseSatang)} บาท`);
    doc.moveDown().text('รายละเอียดเที่ยว');
    const routeCounts=new Map<string,number>();
    for(const trip of row.trips) { const route=`${trip.origin} → ${trip.destination}`; routeCounts.set(route,(routeCounts.get(route)||0)+1); doc.text(`${trip.departureDate} ถึง ${trip.arrivalDate}  ${trip.plate}  ${route}  ${formatMoney(trip.driverPaySatang)} + ${formatMoney(trip.driverExtraSatang)} บาท`); }
    doc.moveDown().text('จำนวนเที่ยวตามเส้นทาง');
    for(const [route,count] of routeCounts) doc.text(`${route}: ${count} เที่ยว`);
    doc.moveDown().text(`จำนวนเที่ยว ${row.trips.length} เที่ยว`).text(`ฐาน ${formatMoney(row.baseSatang)} บาท`).text(`ค่าเที่ยว ${formatMoney(row.tripSatang)} บาท`).text(`เงินพิเศษ ${formatMoney(row.extraSatang)} บาท`).text(`ยอดรวม ${formatMoney(row.totalSatang)} บาท`);
    const pages=doc.bufferedPageRange(); for(let p=0;p<pages.count;p++){doc.switchToPage(p);doc.fontSize(12).text(`หน้า ${p+1} / ${pages.count}`,45,doc.page.height-35,{align:'center',lineBreak:false});}
    doc.end(); const pdf=await done; return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="truck-payroll-${month}.pdf"`}});
  } catch(e:unknown){return createErrorResponse((e as Error).message||'INTERNAL_ERROR',undefined,422);}
}
