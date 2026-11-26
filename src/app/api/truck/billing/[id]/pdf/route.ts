import { TruckDocumentTable } from '@/lib/server/truck-document-table';
import { createThaiPdfDoc } from '@/lib/server/pdf-base';
import { tripLocationNames } from '@/lib/truck/location-names';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createErrorResponse } from '@/lib/server/errors';
import { getTruckInvoicesCol } from '@/lib/server/repository';
import { formatMoney } from '@/lib/payroll/money';
import { formatWeightTons } from '@/lib/truck/weight';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await verifyOwner(req);
    const { id } = await context.params;
    if (!id || id.includes('/')) return createErrorResponse('INVALID_INPUT', undefined, 422);
    const snap = await getTruckInvoicesCol().doc(id).get();
    const invoice = snap.data();
    if (!snap.exists || !invoice) return createErrorResponse('NOT_FOUND', undefined, 404);

    const { doc, finish } = createThaiPdfDoc(`ใบวางบิล ${invoice.documentNo || id}`);
    const layout = new TruckDocumentTable(doc, page => {
      doc.rect(page.left, 28, page.width, 3).fill('#0f2942');
      page.y = 36;
      page.headerText('ใบวางบิล', 24, true, 'left', '#0f2942');
      const company = invoice.company || {};
      if (company.companyName) page.headerText(String(company.companyName), 16.5, true);
      if (company.address) page.headerText(`ที่อยู่ ${company.address}`, 14, false, 'left', '#475569');
      const contact = [
        company.phone ? `โทรศัพท์ ${company.phone}` : '',
        company.taxId ? `เลขประจำตัวผู้เสียภาษี ${company.taxId}` : ''
      ].filter(Boolean).join('   ·   ');
      if (contact) page.headerText(contact, 14, false, 'left', '#475569');
      page.rule('#cbd5e1', 0.75);
      page.headerText(
        `เลขที่ ${invoice.documentNo || '-'}   ·   วันที่ออก ${invoice.issueDate || '-'}   ·   ครบกำหนด ${invoice.dueDate || '-'}`,
        14.5
      );
      if (invoice.start && invoice.end) page.headerText(`ช่วงวันที่ ${invoice.start} ถึง ${invoice.end}`, 14, false, 'left', '#475569');
      page.headerText(`ลูกค้า ${invoice.customerName || '-'}`, 16.5, true, 'left', '#0f2942');
      page.y += 6;
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
        route += `\nน้ำหนัก ${formatWeightTons(line.weightKg)} ตัน · ${line.quantity ?? 1} เที่ยว\nราคา/เที่ยว ${formatMoney(line.billingSatang)} บาท\nเงินเพิ่มเดิม ${formatMoney(line.billingExtraSatang ?? 0)} บาท${line.billingExtraNote ? ' (' + line.billingExtraNote + ')' : ''}`;
        amount = formatMoney(line.billingSatang + (line.billingExtraSatang ?? 0));
      } else {
        const value = line.totalSatang ?? line.amountSatang ?? line.billingSatang;
        amount = Number.isSafeInteger(value) ? formatMoney(value) : 'ตามเอกสารเดิม';
        if (line.note) route += '\n' + line.note;
      }
      return [line.departureDate || line.dateKey || '-', line.plateNumberSnapshot || '-', route, amount];
    });

    layout.table(
      [
        { title: 'วันที่', width: 75 },
        { title: 'ทะเบียนรถ', width: 80 },
        { title: 'ต้นทาง - ปลายทาง / รายละเอียด', width: 270 },
        { title: 'ยอดเงิน (บาท)', width: 90, align: 'right' }
      ],
      rows
    );

    const totalText = Number.isSafeInteger(invoice.totalSatang)
      ? `${formatMoney(invoice.totalSatang)} บาท`
      : 'ตามยอดที่บันทึกไว้เดิม';
    const paymentDetail = Number.isSafeInteger(invoice.paidSatang) && invoice.paidSatang > 0 && Number.isSafeInteger(invoice.balanceSatang)
      ? `รับชำระแล้ว ${formatMoney(invoice.paidSatang)} บาท · คงเหลือ ${formatMoney(invoice.balanceSatang)} บาท`
      : `จำนวนทั้งหมด ${rows.length} รายการ`;
    layout.summaryBox('ยอดรวมทั้งสิ้น', totalText, paymentDetail);

    if (invoice.note) layout.paragraph(`หมายเหตุ: ${invoice.note}`, 14.5, false, 'left', '#475569');
    layout.signatures('ผู้วางบิล', 'ผู้รับวางบิล');
    layout.footers();

    const buffer = await finish();
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`
      }
    });
  } catch (e: any) {
    return createErrorResponse(e.code || 'INTERNAL_ERROR', e.message, e.statusCode || 500);
  }
}
