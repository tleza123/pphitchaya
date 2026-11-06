import { loadTruckReportRecords } from '@/lib/server/truck-report-data';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import { getShopId, getTrucksCol, getTruckMonthsCol, getTruckRecordsCol } from '@/lib/server/repository';
import { buildTruckMonthlyReport } from '@/lib/truck/engine';
import { TruckDoc, TruckDailyRecordDoc } from '@/lib/truck/types';
import { recordsForAccountingMonths } from '@/lib/truck/report-records';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const { searchParams } = new URL(req.url);

    const rawMonth = searchParams.get('month');
    const rawMonths = searchParams.get('months');
    const truckId = searchParams.get('truckId') || undefined;

    if (!rawMonth && !rawMonths) {
      return createErrorResponse('INVALID_MONTH', 'กรุณาระบุเดือนที่ต้องการดูรายงาน', 400);
    }

    let months: string[] = [];
    if (rawMonths) {
      months = rawMonths
        .split(',')
        .map(m => m.trim())
        .filter(m => /^\d{4}-\d{2}$/.test(m));
      if (months.length === 0) {
        return createErrorResponse('INVALID_MONTH', 'รูปแบบเดือนไม่ถูกต้อง', 400);
      }
    } else if (rawMonth) {
      if (!/^\d{4}-\d{2}$/.test(rawMonth)) {
        return createErrorResponse('INVALID_MONTH', 'รูปแบบเดือนไม่ถูกต้อง', 400);
      }
      months = [rawMonth];
    }

    const shopId = getShopId();

    // Fetch trucks snapshot
    const trucksSnap = await getTrucksCol(shopId).get();
    const trucks = trucksSnap.docs.map(doc => ({
      truckId: doc.id,
      ...doc.data()
    })) as TruckDoc[];

    const allRecords = await loadTruckReportRecords(shopId, months);
    const targetRecords = truckId ? allRecords.filter(r => r.truckId === truckId) : allRecords;

    const reportMonth = months[0];
    const report = buildTruckMonthlyReport(targetRecords, trucks, reportMonth);

    // If filtered by specific truck, constrain perTruck rows to that truck
    if (truckId) {
      report.perTruck = report.perTruck.filter(t => t.truckId === truckId);
    }

    return createSuccessResponse(report);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
