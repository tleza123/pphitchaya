import { NextRequest } from 'next/server';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import { getShopId } from '@/lib/server/repository';
import { getBangkokToday } from '@/lib/payroll/dates';
import { resolveLineConfig, resolveTargetId, sendLinePush } from '@/lib/line/client';
import { buildAttendanceDailyFlex, buildTruckDailyFlex } from '@/lib/line/flex-templates';
import { fetchAttendanceDailySummary, fetchTruckDailySummary } from '@/lib/line/daily-summary';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Enforce CRON_SECRET if configured in production
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret) {
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader !== `Bearer ${expectedSecret}`) {
        return createErrorResponse('FORBIDDEN', 'Invalid Cron Secret', 401);
      }
    }

    const shopId = getShopId();
    const config = await resolveLineConfig(shopId);

    // 2. Check if LINE is configured
    if (!config.channelAccessToken) {
      return createSuccessResponse({
        skipped: true,
        reason: 'LINE_NOT_CONFIGURED',
        message: 'ข้ามการส่งสรุปรายวันเนื่องจากยังไม่ได้ตั้งค่า LINE Channel Access Token'
      });
    }

    // 3. Check if Daily Summary is enabled
    if (config.dailySummaryEnabled === false) {
      return createSuccessResponse({
        skipped: true,
        reason: 'DAILY_SUMMARY_DISABLED',
        message: 'ระบบปิดการส่งสรุปรายวันอัตโนมัติไว้'
      });
    }

    const dateKey = getBangkokToday();

    // 4. Fetch and dispatch Attendance Summary
    const attendanceData = await fetchAttendanceDailySummary(shopId, dateKey);
    const attendanceFlex = buildAttendanceDailyFlex(attendanceData);
    const attendanceTarget = resolveTargetId(config, 'attendance');
    const attendanceRes = await sendLinePush(config, [attendanceFlex], attendanceTarget);

    // 5. Fetch and dispatch Truck Summary
    const truckData = await fetchTruckDailySummary(shopId, dateKey);
    const truckFlex = buildTruckDailyFlex(truckData);
    const truckTarget = resolveTargetId(config, 'truck');
    const truckRes = await sendLinePush(config, [truckFlex], truckTarget);

    return createSuccessResponse({
      dispatched: true,
      dateKey,
      attendanceSent: attendanceRes.ok,
      truckSent: truckRes.ok
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
