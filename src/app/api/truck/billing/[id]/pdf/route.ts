import { NextRequest } from 'next/server';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { verifyOwner } from '@/lib/server/auth';
import { createErrorResponse } from '@/lib/server/errors';
import { getTruckInvoicesCol } from '@/lib/server/repository';
import { formatMoney } from '@/lib/payroll/money';
import { formatWeightTons } from '@/lib/truck/weight';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await verifyOwner(req); const { id } = await context.params;
    if (!id || id.includes('/')) return createErrorResponse('INVALID_INPUT', undefined, 422);
    const snap = await getTruckInvoicesCol().doc(id).get(); const invoice = snap.data();
    if (!snap.exists || !invoice) return createErrorResponse('NOT_FOUND', undefined, 404);
    const regular = path.join(process.cwd(), 'src/assets/fonts/THSarabunNew.ttf');
    const bold = path.join(process.cwd(), 'src/assets/fonts/THSarabunNew-Bold.ttf');
    const doc = new PDFDocument({ size:'A4', margin:40, bufferPages:true, font:regular });
    doc.registerFont('Regular', regular); doc.registerFont('Bold', bold);
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve,reject) => { doc.on('data', c=>chunks.push(c)); doc.on('end',()=>resolve(Buffer.concat(chunks))); doc.on('error',reject); });
    const hasLegacyFeeLines = (invoice.lines || []).some((line: any) => Object.prototype.hasOwnProperty.call(line, 'billingExtraSatang') || Object.prototype.hasOwnProperty.call(line, 'billingExtraNote'));
    const header = () => {
      doc.font('Bold').fontSize(23).text('ใบวางบิล');
      const company = invoice.company || {};
      doc.font('Regular').fontSize(15).text(String(company.companyName || ''));
      if (company.address) doc.text(`ที่อยู่ ${company.address}`);
      if (company.phone) doc.text(`โทรศัพท์ ${company.phone}`);
      if (company.taxId) doc.text(`เลขประจำตัวผู้เสียภาษี ${company.taxId}`);
      doc.text(`เลขที่ ${invoice.documentNo}  วันที่ ${invoice.issueDate}  ครบกำหนด ${invoice.dueDate}`);
      doc.text(`ลูกค้า ${invoice.customerName}`).moveDown(.5);
      const version = Number(invoice.snapshotVersion);
      const columns = version >= 3
        ? 'วันที่รถออก | ทะเบียน | เส้นทาง | น้ำหนักตัน | จำนวนเที่ยว | ราคาเหมา/เที่ยว | จำนวนเงิน'
        : version === 2 || hasLegacyFeeLines
          ? 'วันที่รถออก | ทะเบียน | เส้นทาง | น้ำหนัก | จำนวนเที่ยว | ราคา/เที่ยว | เงินเพิ่ม | รวม'
          : 'วันที่รถออก | ทะเบียน | เส้นทาง | รายละเอียดตามเอกสารเดิม';
      doc.font('Bold').text(columns, { width:510 });
      doc.moveTo(40,doc.y).lineTo(555,doc.y).stroke(); doc.moveDown(.4);
    };
    header();
    for (const line of invoice.lines || []) {
      const route = `${line.departureDate || line.dateKey || '-'}  |  ${line.plateNumberSnapshot || '-'}  |  ${line.fromLocation || '-'} ไป ${line.destinationName || '-'}`;
      const version = Number(invoice.snapshotVersion);
      const description = version >= 3
        ? `${route}\nน้ำหนัก ${formatWeightTons(line.weightKg)} ตัน  |  ${line.quantity ?? 1} เที่ยว  |  ราคาเหมา ${formatMoney(line.billingSatang)} บาท  |  จำนวนเงิน ${formatMoney(line.billingSatang)} บาท`
        : version === 2 || line.billingPricingMode === 'PER_TRIP' || Object.prototype.hasOwnProperty.call(line, 'billingExtraSatang') || Object.prototype.hasOwnProperty.call(line, 'billingExtraNote')
          ? `${route}\nน้ำหนัก ${formatWeightTons(line.weightKg)} ตัน  |  ${line.quantity ?? 1} เที่ยว  |  ราคา ${formatMoney(line.billingSatang)} บาท  |  เพิ่ม ${formatMoney(line.billingExtraSatang ?? 0)} บาท  |  รวม ${formatMoney(line.billingSatang + (line.billingExtraSatang ?? 0))} บาท${line.billingExtraNote ? ` (${line.billingExtraNote})` : ''}`
          : `${route}\n${Number.isSafeInteger(line.totalSatang ?? line.amountSatang ?? line.billingSatang) ? `ยอดตามเอกสารเดิม ${formatMoney(line.totalSatang ?? line.amountSatang ?? line.billingSatang)} บาท` : 'ยอดตามเอกสารเดิม'}${line.note ? ` (${line.note})` : ''}`;
      const height = doc.font('Regular').fontSize(14).heightOfString(description,{width:510});
      if (doc.y + height > 760) { doc.addPage(); header(); }
      doc.font('Regular').fontSize(14).text(description,{width:510}).moveDown(.3);
    }
    if (doc.y > 720) { doc.addPage(); header(); }
    doc.moveDown(.5).font('Bold').fontSize(18).text(`ยอดรวม ${Number.isSafeInteger(invoice.totalSatang) ? `${formatMoney(invoice.totalSatang)} บาท` : 'ตาม snapshot เดิม'}`,{align:'right'});
    if (invoice.note) doc.font('Regular').fontSize(14).text(`หมายเหตุ: ${invoice.note}`);
    const pages=doc.bufferedPageRange(); for(let i=0;i<pages.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.font('Regular').fontSize(11).text(`หน้า ${i+1} / ${pages.count}`,40,810,{width:515,align:'right',lineBreak:false});}
    doc.end(); const buffer=await done;
    return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="invoice-${id}.pdf"`}});
  } catch(e:any) { return createErrorResponse(e.code || 'INTERNAL_ERROR',e.message,e.statusCode||500); }
}
