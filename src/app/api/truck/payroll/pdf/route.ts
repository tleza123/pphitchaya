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
    if(data?.state!=='CLOSED') return createErrorResponse('PAYROLL_NOT_CLOSED','รอบค่าแรงยังไม่ปิด',409);
    const row=data?.snapshot?.drivers?.find((r:{driverId:string})=>r.driverId===driverId); if(!row) throw new Error('NOT_FOUND');
    const doc=new PDFDocument({size:'A4',margin:45,bufferPages:true}); const chunks:Buffer[]=[];
    const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(c:Buffer)=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    doc.registerFont('thai',path.join(process.cwd(),'src/assets/fonts/THSarabunNew.ttf')); doc.font('thai').fontSize(18);
    let section='วันทำงานและค่าแรงฐาน';
    const header=()=>{
      doc.font('thai').fontSize(18).text('ใบสรุปค่าแรงคนขับ',{align:'center'}).text(`รอบ ${month}   คนขับ ${row.driverName}`);
      const payment=data?.payments?.[driverId]; if(payment?.status==='PAID') doc.text(`วันที่จ่าย ${payment.paidDate}`);
      doc.fontSize(14).text('ค่าเที่ยวอยู่รอบเดือนตามวันที่ออกเดินทาง').moveDown(.3).text(section).moveDown(.3);
    };
    const line=(text:string)=>{
      doc.fontSize(15);
      const height=doc.heightOfString(text,{width:505});
      if(doc.y+height>770){doc.addPage();header();doc.fontSize(15);}
      doc.text(text,{width:505}).moveDown(.2);
    };
    const startSection=(title:string)=>{section=title;if(doc.y+75>770){doc.addPage();header();}else doc.moveDown(.4).fontSize(15).text(title).moveDown(.3);};
    header();
    for(const day of row.days) line(`${day.date}   ${formatMoney(day.baseSatang)} บาท`);
    startSection('รายละเอียดเที่ยว — วันออก / วันถึง / ทะเบียน / เส้นทาง / ค่าเที่ยว');
    const routeCounts=new Map<string,number>();
    for(const trip of row.trips) { const route=`${trip.origin} ไป ${trip.destination}`; const isV3=trip.pricingVersion===3; const oldExtra=isV3?(trip.legacyDriverExtraSatang??0):(trip.driverExtraSatang??0); routeCounts.set(route,(routeCounts.get(route)||0)+1); line(`${trip.departureDate} ถึง ${trip.arrivalDate}  ${trip.plate}  ${route}  ${formatMoney(trip.driverPaySatang)}${oldExtra>0?` + ${formatMoney(oldExtra)} เงินเพิ่มเดิม`:' บาท'}`); }
    startSection('จำนวนเที่ยวตามเส้นทาง');
    for(const [route,count] of routeCounts) line(`${route}: ${count} เที่ยว`);
    startSection('สรุปค่าแรง');
    line(`จำนวนเที่ยว ${row.trips.length} เที่ยว`);line(`ฐาน ${formatMoney(row.baseSatang)} บาท`);line(`ค่าเที่ยว ${formatMoney(row.tripSatang)} บาท`);
    if(row.extraSatang>0) line(`เงินเพิ่มเดิมจากข้อมูลก่อนรุ่น 3 ${formatMoney(row.extraSatang)} บาท`);
    line(`ยอดรวม ${formatMoney(row.totalSatang)} บาท`);
    const pages=doc.bufferedPageRange(); for(let p=0;p<pages.count;p++){doc.switchToPage(p);doc.page.margins.bottom=0;doc.fontSize(12).text(`หน้า ${p+1} / ${pages.count}`,45,doc.page.height-35,{width:505,align:'center',lineBreak:false});}
    doc.end(); const pdf=await done; return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="truck-payroll-${month}.pdf"`}});
  } catch(e:unknown){return createErrorResponse((e as Error).message||'INTERNAL_ERROR',undefined,422);}
}
