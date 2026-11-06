import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getTruckProfileRef,
  getLineSettingsRef,
  getTrucksCol,
  getTruckOriginsCol,
  getTruckDestinationsCol,
  getTruckRecordsCol
} from '@/lib/server/repository';
import { getBangkokToday, getBangkokMonth } from '@/lib/payroll/dates';
import {
  TruckDoc,
  TruckOriginDoc,
  TruckDestinationDoc,
  TruckDailyRecordDoc
} from '@/lib/truck/types';

export const dynamic = 'force-dynamic';

function maskToken(token?: string): string {
  if (!token) return '';
  const clean = token.trim();
  if (clean.length === 0) return '';
  if (clean.length <= 4) return '••••';
  return '••••' + clean.slice(-4);
}

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const shopId = getShopId();
    const today = getBangkokToday();
    const currentMonth = getBangkokMonth();

    const [
      profileSnap,
      lineSnap,
      trucksSnap,
      originsSnap,
      destinationsSnap,
      todayRecordsSnap
    ] = await Promise.all([
      getTruckProfileRef(shopId).get(),
      getLineSettingsRef(shopId).get(),
      getTrucksCol(shopId).get(),
      getTruckOriginsCol(shopId).get(),
      getTruckDestinationsCol(shopId).get(),
      getTruckRecordsCol(currentMonth, shopId).where('dateKey', '==', today).get()
    ]);

    const rawProfile = profileSnap.exists ? profileSnap.data() : null;
    const truckProfile = {
      companyName: rawProfile?.companyName || 'ระบบบันทึกงานรถสิบล้อ',
      revision: rawProfile?.revision || 1
    };

    const lineData = lineSnap.exists ? lineSnap.data() : null;
    const rawToken = lineData?.channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    const lineSettings = {
      channelAccessTokenMasked: maskToken(rawToken),
      defaultTargetId: lineData?.defaultTargetId ?? process.env.LINE_DEFAULT_TARGET_ID ?? '',
      attendanceTargetId: lineData?.attendanceTargetId ?? process.env.LINE_ATTENDANCE_TARGET_ID ?? '',
      truckTargetId: lineData?.truckTargetId ?? process.env.LINE_TRUCK_TARGET_ID ?? '',
      dailySummaryEnabled: typeof lineData?.dailySummaryEnabled === 'boolean'
        ? lineData.dailySummaryEnabled
        : (process.env.LINE_DAILY_SUMMARY_ENABLED !== 'false'),
      dailySummaryHour: typeof lineData?.dailySummaryHour === 'number'
        ? lineData.dailySummaryHour
        : 19,
      revision: lineData?.revision || 1
    };

    const trucks: TruckDoc[] = trucksSnap.docs.map(doc => {
      const d = doc.data();
      return {
        truckId: doc.id,
        plateNumber: d.plateNumber || '',
        driverName: d.driverName || '',
        notes: d.notes || '',
        status: d.status || 'ACTIVE',
        revision: d.revision || 1,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || ''
      };
    });

    const truckOrigins: TruckOriginDoc[] = originsSnap.docs.map(doc => {
      const d = doc.data();
      return {
        originId: doc.id,
        name: d.name || '',
        revision: d.revision || 1,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || ''
      };
    });

    const truckDestinations: TruckDestinationDoc[] = destinationsSnap.docs.map(doc => {
      const d = doc.data();
      return {
        destinationId: doc.id,
        name: d.name || '',
        driverPaySatang: typeof d.driverPaySatang === 'number' ? d.driverPaySatang : 0,
        revision: d.revision || 1,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || ''
      };
    });

    const todayRecords: TruckDailyRecordDoc[] = todayRecordsSnap.docs.map(doc => {
      const d = doc.data();
      return {
        recordId: doc.id,
        dateKey: d.dateKey,
        monthKey: d.monthKey,
        truckId: d.truckId,
        plateNumberSnapshot: d.plateNumberSnapshot || '',
        driverNameSnapshot: d.driverNameSnapshot || '',
        fuelCostSatang: d.fuelCostSatang || 0,
        totalDriverPaySatang: d.totalDriverPaySatang || 0,
        tripCount: d.tripCount || 0,
        trips: d.trips || [],
        photos: d.photos || [],
        revision: d.revision || 1,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || '',
        updatedBy: d.updatedBy || ''
      };
    });

    return createSuccessResponse({
      truckProfile,
      lineSettings,
      trucks,
      truckOrigins,
      truckDestinations,
      todayRecords,
      serverToday: today,
      monthKey: currentMonth
    });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
