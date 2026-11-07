import { NextRequest } from 'next/server';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { verifyOwner } from '@/lib/server/auth';
import { createErrorResponse } from '@/lib/server/errors';
import { getTruckInvoicesCol } from '@/lib/server/repository';
import { formatMoney } from '@/lib/payroll/money';

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
    const header = () => {
      doc.font('Bold').fontSize(23).text('ใบวางบิล');
      const company = invoice.company || {};
      doc.font('Regular').fontSize(15).text(String(company.companyName || ''));
      if (company.address) doc.text(`ที่อยู่ ${company.address}`);
      if (company.phone) doc.text(`โทรศัพท์ ${company.phone}`);
      if (company.taxId) doc.text(`เลขประจำตัวผู้เสียภาษี ${company.taxId}`);
      doc.text(`เลขที่ ${invoice.documentNo}  วันที่ ${invoice.issueDate}  ครบกำหนด ${invoice.dueDate}`);
      doc.text(`ลูกค้า ${invoice.customerName}`).moveDown(.5);
      doc.font('Bold').text('วันที่ออก – ถึง | ทะเบียน | เส้นทาง | ค่าขนส่ง + เพิ่มเติม', { width:510 });
      doc.moveTo(40,doc.y).lineTo(555,doc.y).stroke(); doc.moveDown(.4);
    };
    header();
    for (const line of invoice.lines || []) {
      const description = `${line.departureDate || '-'} – ${line.arrivalDate || '-'}  |  ${line.plateNumberSnapshot || '-'}  |  ${line.fromLocation || '-'} → ${line.destinationName || '-'}\nค่าขนส่ง ${formatMoney(line.billingSatang)} บาท  เพิ่มเติม ${formatMoney(line.billingExtraSatang || 0)} บาท${line.billingExtraNote ? ` (${line.billingExtraNote})` : ''}`;
      const height = doc.font('Regular').fontSize(14).heightOfString(description,{width:510});
      if (doc.y + height > 760) { doc.addPage(); header(); }
      doc.font('Regular').fontSize(14).text(description,{width:510}).moveDown(.3);
    }
    if (doc.y > 720) { doc.addPage(); header(); }
    doc.moveDown(.5).font('Bold').fontSize(18).text(`ยอดรวม ${formatMoney(invoice.totalSatang)} บาท`,{align:'right'});
    if (invoice.note) doc.font('Regular').fontSize(14).text(`หมายเหตุ: ${invoice.note}`);
    const pages=doc.bufferedPageRange(); for(let i=0;i<pages.count;i++){doc.switchToPage(i);doc.font('Regular').fontSize(11).text(`หน้า ${i+1} / ${pages.count}`,40,810,{width:515,align:'right',lineBreak:false});}
    doc.end(); const buffer=await done;
    return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="invoice-${id}.pdf"`}});
  } catch(e:any) { return createErrorResponse(e.code || 'INTERNAL_ERROR',e.message,e.statusCode||500); }
}
