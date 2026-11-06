import { loadTruckReportRecords } from '@/lib/server/truck-report-data';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getTruckProfileRef,
  getTrucksCol,
  getTruckRecordsCol,
  getTruckMonthsCol
} from '@/lib/server/repository';
import { buildTruckMonthlyReport } from '@/lib/truck/engine';
import { createTruckReportPdf } from '@/lib/server/truck-pdf';
import { formatMoney } from '@/lib/payroll/money';
import { TruckDoc, TruckDailyRecordDoc } from '@/lib/truck/types';
import { recordsForAccountingMonths } from '@/lib/truck/report-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function escapeCsvField(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  const raw = String(val);
  const str = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const { searchParams } = new URL(req.url);

    const rawMonth = searchParams.get('month');
    if (!rawMonth || !/^\d{4}-\d{2}$/.test(rawMonth)) {
      return createErrorResponse('INVALID_MONTH', 'กรุณาระบุเดือนที่ต้องการส่งออก (YYYY-MM)', 400);
    }

    const format = (searchParams.get('format') || 'pdf').toLowerCase();
    if (format !== 'pdf' && format !== 'csv') {
      return createErrorResponse('INVALID_FORMAT', 'รูปแบบไฟล์ไม่ถูกต้อง รองรับเฉพาะ pdf และ csv', 400);
    }

    const truckId = searchParams.get('truckId') || undefined;
    const shopId = getShopId();

    const [profileSnap, trucksSnap] = await Promise.all([
      getTruckProfileRef(shopId).get(),
      getTrucksCol(shopId).get()
    ]);

    const companyName = profileSnap.exists && profileSnap.data()?.companyName
      ? profileSnap.data()!.companyName
      : 'ระบบบันทึกงานรถสิบล้อ';

    const trucks = trucksSnap.docs.map(doc => ({
      truckId: doc.id,
      ...doc.data()
    })) as TruckDoc[];

    let records = await loadTruckReportRecords(shopId, [rawMonth]);

    if (truckId) {
      records = records.filter(r => r.truckId === truckId);
    }

    const report = buildTruckMonthlyReport(records, trucks, rawMonth);

    if (format === 'pdf') {
      const pdfBuffer = await createTruckReportPdf(report, companyName, truckId);
      const filename = `truck-report-${rawMonth}${truckId ? `-${truckId}` : ''}.pdf`;

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store'
        }
      });
    }

    // format === 'csv'
    const headers = [
      'วันที่',
      'ทะเบียนรถ',
      'คนขับ',
      'เที่ยวที่',
      'ต้นทาง',
      'ปลายทาง',
      'ค่าเที่ยว (บาท)',
      'หมายเหตุ'
    ];

    const rows: string[][] = [];

    for (const record of report.records) {
      const plate = record.plateNumberSnapshot || record.truckId;
      const driver = record.driverNameSnapshot || '';

      if (record.trips && record.trips.length > 0) {
        record.trips.forEach((trip, index) => {
          const tripNo = trip.tripIndex ?? index + 1;
          const origin = trip.fromLocation || '';
          const destination = trip.destinationName || '';
          const driverPay = formatMoney(trip.driverPaySatang ?? 0);
          const note = trip.note || '';

          rows.push([
            trip.departureDate || record.dateKey,
            plate,
            driver,
            String(tripNo),
            origin,
            destination,
            driverPay,
            note
          ]);
        });
      } else {
        // Record with 0 trips (e.g. only fuel cost entered)
        rows.push([
          record.dateKey,
          plate,
          driver,
          '1',
          '',
          '',
          formatMoney(0),
          ''
        ]);
      }
    }

    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCsvField).join(','),
        ...rows.map(row => row.map(escapeCsvField).join(','))
      ].join('\r\n') +
      '\r\n';

    const filename = `truck-report-${rawMonth}${truckId ? `-${truckId}` : ''}.csv`;

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(
      err.code || 'EXPORT_ERROR',
      err.message || 'ส่งออกรายงานไม่สำเร็จ',
      err.statusCode || 422
    );
  }
}
