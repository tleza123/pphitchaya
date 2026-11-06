import { loadTruckReportRecords } from '@/lib/server/truck-report-data';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import { getShopId, getTrucksCol, getTruckRecordsCol } from '@/lib/server/repository';
import { getBangkokToday } from '@/lib/payroll/dates';
import { buildTruckAnalytics } from '@/lib/truck/analytics';
import { TruckReportPeriod, TruckDoc, TruckDailyRecordDoc } from '@/lib/truck/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const query = req.nextUrl.searchParams;

    const rawPeriod = (query.get('period') || 'day').toLowerCase();
    if (rawPeriod !== 'day' && rawPeriod !== 'month' && rawPeriod !== 'year') {
      return createErrorResponse('INVALID_PERIOD', 'ช่วงเวลาที่เลือกไม่ถูกต้อง รองรับ day, month, year', 400);
    }
    const period = rawPeriod as TruckReportPeriod;
    const today = getBangkokToday();

    let months: string[] = [];
    const explicitMonths = query.get('months');

    if (explicitMonths) {
      months = explicitMonths
        .split(',')
        .map(m => m.trim())
        .filter(m => /^\d{4}-\d{2}$/.test(m));
      if (months.length === 0) {
        return createErrorResponse('INVALID_MONTHS', 'รูปแบบเดือนไม่ถูกต้อง', 400);
      }
    } else if (period === 'day') {
      const m = query.get('month') || today.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) {
        return createErrorResponse('INVALID_MONTH', 'รูปแบบเดือนไม่ถูกต้อง', 400);
      }
      months = [m];
    } else if (period === 'month') {
      const rawYear = query.get('year') || (query.get('month') ? query.get('month')!.slice(0, 4) : today.slice(0, 4));
      if (!/^\d{4}$/.test(rawYear)) {
        return createErrorResponse('INVALID_YEAR', 'รูปแบบปีไม่ถูกต้อง', 400);
      }
      const year = Number(rawYear);
      months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    } else if (period === 'year') {
      const rawToYear = query.get('toYear') || query.get('year') || today.slice(0, 4);
      const rawFromYear = query.get('fromYear') || String(Number(rawToYear) - 2);

      if (!/^\d{4}$/.test(rawFromYear) || !/^\d{4}$/.test(rawToYear)) {
        return createErrorResponse('INVALID_YEAR', 'รูปแบบปีไม่ถูกต้อง', 400);
      }
      const from = Number(rawFromYear);
      const to = Number(rawToYear);
      if (from > to || to - from > 5) {
        return createErrorResponse('INVALID_YEAR', 'ช่วงปีไม่ถูกต้อง รองรับไม่เกิน 5 ปี', 400);
      }
      months = [];
      for (let y = from; y <= to; y++) {
        for (let m = 1; m <= 12; m++) {
          months.push(`${y}-${String(m).padStart(2, '0')}`);
        }
      }
    }

    const shopId = getShopId();

    // Fetch trucks snapshot
    const trucksSnap = await getTrucksCol(shopId).get();
    const trucks = trucksSnap.docs.map(doc => ({
      truckId: doc.id,
      ...doc.data()
    })) as TruckDoc[];

    const records = await loadTruckReportRecords(shopId, months);
    const recordsByMonth = new Map<string, TruckDailyRecordDoc[]>();
    for (const month of months) recordsByMonth.set(month, records.filter(r => r.monthKey === month));

    const result = buildTruckAnalytics(recordsByMonth, trucks, period, today, months);

    return createSuccessResponse(result);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(
      error.code || 'ANALYTICS_ERROR',
      error.message || 'ไม่สามารถโหลดข้อมูลวิเคราะห์ได้',
      error.statusCode || 422
    );
  }
}
