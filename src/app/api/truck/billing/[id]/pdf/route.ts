import { TruckDocumentTable } from '@/lib/server/truck-document-table';
import { tripLocationNames } from '@/lib/truck/location-names';
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
    const doc = new PDFDocument({ size:'A4', margin:0, bufferPages:true, font:regular });
    doc.registerFont('Regular', regular); doc.registerFont('Bold', bold);
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve,reject) => { doc.on('data', c=>chunks.push(c)); doc.on('end',()=>resolve(Buffer.concat(chunks))); doc.on('error',reject); });
    const layout = new TruckDocumentTable(doc, page => {
      page.headerText('ใบวางบิล', 23, true);
      const company = invoice.company || {};
      page.headerText(String(company.companyName || ''), 16, true);
      if (company.address) page.headerText(`ที่อยู่ ${company.address}`);
      if (company.phone) page.headerText(`โทรศัพท์ ${company.phone}`);
      if (company.taxId) page.headerText(`เลขประจำตัวผู้เสียภาษี ${company.taxId}`);
      page.headerText(`เลขที่ ${invoice.documentNo || '-'}   วันที่ ${invoice.issueDate || '-'}   ครบกำหนด ${invoice.dueDate || '-'}`);
      if (invoice.start && invoice.end) page.headerText(`ช่วงวันที่ ${invoice.start} ถึง ${invoice.end}`);
      page.headerText(`ลูกค้า ${invoice.customerName || '-'}`, 16, true); page.y += 8;
    });
    const rows = (invoice.lines || []).map((line: any) => {
      const names = tripLocationNames(line);
      let route = `จาก ${names.origin}\nไป ${names.destination}`;
      const version = Number(invoice.snapshotVersion);
      let amount: string;
      if (version >= 3) {
        route += `\nน้ำหนัก ${formatWeightTons(line.weightKg)} ตัน · ${line.quantity ?? 1} เที่ยว\nราคาเหมา/เที่ยว ${formatMoney(line.billingSatang)} บาท`;
        amount = formatMoney(line.billingSatang);
      } else if (version === 2 || line.billingPricingMode === 'PER_TRIP' || Object.prototype.hasOwnProperty.call(line, 'billingExtraSatang')) {
        route += `\nน้ำหนัก ${formatWeightTons(line.weightKg)} ตัน · ${line.quantity ?? 1} เที่ยว\nราคา/เที่ยว ${formatMoney(line.billingSatang)} บาท\nเงินเพิ่มเดิม ${formatMoney(line.billingExtraSatang ?? 0)} บาท${line.billingExtraNote ? ' ('+line.billingExtraNote+')' : ''}`;
        amount = formatMoney(line.billingSatang + (line.billingExtraSatang ?? 0));
      } else {
        const value = line.totalSatang ?? line.amountSatang ?? line.billingSatang;
        amount = Number.isSafeInteger(value) ? formatMoney(value) : 'ตามเอกสารเดิม';
        if (line.note) route += '\n' + line.note;
      }
      return [line.departureDate || line.dateKey || '-', line.plateNumberSnapshot || '-', route, amount];
    });
    layout.table([{title:'วันที่',width:75},{title:'ทะเบียนรถ',width:80},{title:'ต้นทาง - ปลายทาง / รายละเอียด',width:270},{title:'ยอดเงิน (บาท)',width:90,align:'right'}], rows);
    layout.paragraph(`ยอดรวม ${Number.isSafeInteger(invoice.totalSatang) ? formatMoney(invoice.totalSatang)+' บาท' : 'ตาม snapshot เดิม'}`, 18, true, 'right');
    if (invoice.note) layout.paragraph(`หมายเหตุ: ${invoice.note}`);
    layout.footers();
    doc.end(); const buffer=await done;
    return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="invoice-${id}.pdf"`}});
  } catch(e:any) { return createErrorResponse(e.code || 'INTERNAL_ERROR',e.message,e.statusCode||500); }
}
