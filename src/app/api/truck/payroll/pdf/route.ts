import { TruckDocumentTable } from '@/lib/server/truck-document-table';
import { createThaiPdfDoc } from '@/lib/server/pdf-base';
import { tripLocationNames } from '@/lib/truck/location-names';
import { truckDateRange } from '@/lib/truck/date-range';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { getShopDocRef } from '@/lib/server/repository';
import { formatMoney } from '@/lib/payroll/money';
import { createErrorResponse } from '@/lib/server/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const range = truckDateRange({
      start: req.nextUrl.searchParams.get('start'),
      end: req.nextUrl.searchParams.get('end'),
      month: req.nextUrl.searchParams.get('month')
    });
    const month = range.id;
    const driverId = req.nextUrl.searchParams.get('driverId');
    if (!driverId || driverId.includes('/')) throw new Error('INVALID_INPUT');

    const snap = await getShopDocRef().collection('truckPayrollMonths').doc(month).get();
    const data = snap.data();
    if (data?.state !== 'CLOSED') return createErrorResponse('PAYROLL_NOT_CLOSED', 'รอบค่าแรงยังไม่ปิด', 409);

    const row = data?.snapshot?.drivers?.find((r: { driverId: string }) => r.driverId === driverId);
    if (!row) throw new Error('NOT_FOUND');

    const { doc, finish } = createThaiPdfDoc(`ใบสรุปค่าแรงคนขับ ${row.driverName} ${month}`);
    const payment = data?.payments?.[driverId];

    const layout = new TruckDocumentTable(doc, page => {
      doc.rect(page.left, 28, page.width, 3).fill('#0f2942');
      page.y = 36;
      page.headerText('ใบสรุปค่าแรงคนขับ', 23, true, 'center', '#0f2942');
      page.headerText(`รอบ ${data.start || range.start} ถึง ${data.end || range.end}`, 15.5, false, 'center', '#475569');
      page.rule('#cbd5e1', 0.75);
      page.headerText(`คนขับ ${row.driverName}`, 17, true, 'left', '#0f2942');
      if (payment?.status === 'PAID') {
        page.headerText(
          `วันที่จ่าย ${payment.paidDate}${payment.note ? ` (${payment.note})` : ''}`,
          14.5,
          false,
          'left',
          '#166534'
        );
      }
      page.headerText('ค่าเที่ยวรวมตามวันที่ออกรถในช่วงที่เลือก', 13.5, false, 'left', '#475569');
      page.y += 4;
    });

    const legacyBase = data.snapshot.payBasis !== 'TRIPS_ONLY' && ((row.days || []).length > 0 || row.baseSatang > 0);
    const departureDays = new Set((row.trips || []).map((trip: any) => trip.departureDate).filter(Boolean)).size;

    if (legacyBase) {
      layout.section('วันทำงานและค่าแรงฐาน');
      layout.table(
        [{ title: 'วันที่ทำงาน', width: 425 }, { title: 'ค่าแรง (บาท)', width: 90, align: 'right' }],
        (row.days || []).map((day: any) => [day.date, formatMoney(day.baseSatang)])
      );
    }

    layout.paragraph(`วันที่ออกรถ ${departureDays} วัน · ${(row.trips || []).length} เที่ยว`, 16, true, 'left', '#0f2942');

    layout.section('รายละเอียดค่าเที่ยวคนขับ');
    const routeCounts = new Map<string, number>();
    const rows = (row.trips || []).map((trip: any) => {
      const names = tripLocationNames(trip);
      const route = `จาก ${names.origin} ไป ${names.destination}`;
      const extra = trip.pricingVersion === 3 ? trip.legacyDriverExtraSatang ?? 0 : trip.driverExtraSatang ?? 0;
      routeCounts.set(route, (routeCounts.get(route) || 0) + 1);
      return [
        trip.departureDate || '-',
        trip.plate || '-',
        `จาก ${names.origin}\nไป ${names.destination}${extra > 0 ? '\nรวมเงินเพิ่มเดิม ' + formatMoney(extra) + ' บาท' : ''}`,
        formatMoney((trip.driverPaySatang ?? 0) + extra)
      ];
    });

    layout.table(
      [
        { title: 'วันที่ออก', width: 75 },
        { title: 'ทะเบียนรถ', width: 80 },
        { title: 'ต้นทาง - ปลายทาง', width: 270 },
        { title: 'ค่าเที่ยว (บาท)', width: 90, align: 'right' }
      ],
      rows
    );

    layout.section('จำนวนเที่ยวตามเส้นทาง');
    layout.table(
      [{ title: 'เส้นทาง', width: 425 }, { title: 'จำนวนเที่ยว', width: 90, align: 'right' }],
      [...routeCounts].map(([route, count]) => [route, String(count)])
    );

    layout.section('สรุปค่าแรง');
    const totals = [[`ค่าเที่ยว (${(row.trips || []).length} เที่ยว)`, formatMoney(row.tripSatang)]];
    if (legacyBase) totals.unshift([`ค่าแรงฐาน (${(row.days || []).length} วัน)`, formatMoney(row.baseSatang)]);
    if (row.extraSatang > 0) totals.push(['เงินเพิ่มเดิมจากข้อมูลก่อนรุ่น 3', formatMoney(row.extraSatang)]);
    layout.table([{ title: 'รายการ', width: 425 }, { title: 'จำนวนเงิน (บาท)', width: 90, align: 'right' }], totals);

    layout.summaryBox('ยอดรวมสุทธิ', `${formatMoney(row.totalSatang)} บาท`, `ออกรถ ${departureDays} วัน · ${(row.trips || []).length} เที่ยว`);
    layout.signatures('ผู้จ่ายเงิน', 'ผู้รับเงิน');
    layout.footers();

    const pdf = await finish();
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="truck-payroll-${month}.pdf"`
      }
    });
  } catch (e: unknown) {
    return createErrorResponse((e as Error).message || 'INTERNAL_ERROR', undefined, 422);
  }
}
