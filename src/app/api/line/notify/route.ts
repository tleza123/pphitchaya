import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import { getShopId } from '@/lib/server/repository';
import { getBangkokToday } from '@/lib/payroll/dates';
import { resolveLineConfig, resolveTargetId, sendLinePush } from '@/lib/line/client';
import { buildAttendanceDailyFlex, buildTruckDailyFlex } from '@/lib/line/flex-templates';
import { fetchAttendanceDailySummary, fetchTruckDailySummary } from '@/lib/line/daily-summary';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await verifyOwner(req);
    const body = await req.json().catch(() => ({}));
    const scope: 'attendance' | 'truck' | 'both' = body.scope || 'both';
    const isTest = Boolean(body.isTest);
    const dateKey = body.dateKey || getBangkokToday();

    const shopId = getShopId();
    const config = await resolveLineConfig(shopId);

    if (!config.channelAccessToken) {
      return createErrorResponse(
        'LINE_NOT_CONFIGURED',
        'ยังไม่ได้ตั้งค่า LINE Channel Access Token กรุณาตั้งค่าในแท็บตั้งค่า',
        422
      );
    }

    if (isTest) {
      const targetId = scope === 'truck'
        ? resolveTargetId(config, 'truck')
        : (scope === 'attendance'
            ? resolveTargetId(config, 'attendance')
            : (resolveTargetId(config, 'default') || resolveTargetId(config, 'attendance') || resolveTargetId(config, 'truck')));

      const testMessage = {
        type: 'text',
        text: 'ทดสอบการเชื่อมต่อ LINE Messaging API สำเร็จ\nระบบสามารถส่งข้อความแจ้งเตือนได้ตามปกติ'
      };

      const sendRes = await sendLinePush(config, [testMessage], targetId);
      if (!sendRes.ok) {
        return createErrorResponse('LINE_SEND_FAILED', sendRes.error || 'ส่งข้อความทดสอบไม่สำเร็จ', 502);
      }

      return createSuccessResponse({
        sent: true,
        mode: sendRes.mode,
        targetId: sendRes.targetId
      });
    }

    const results: any[] = [];

    // 1. Attendance Flex card
    if (scope === 'attendance' || scope === 'both') {
      const attendanceData = await fetchAttendanceDailySummary(shopId, dateKey);
      const flexMsg = buildAttendanceDailyFlex(attendanceData);
      const targetId = resolveTargetId(config, 'attendance');
      const sendRes = await sendLinePush(config, [flexMsg], targetId);
      results.push({ scope: 'attendance', ...sendRes });
    }

    // 2. Truck Flex card
    if (scope === 'truck' || scope === 'both') {
      const truckData = await fetchTruckDailySummary(shopId, dateKey);
      const flexMsg = buildTruckDailyFlex(truckData);
      const targetId = resolveTargetId(config, 'truck');
      const sendRes = await sendLinePush(config, [flexMsg], targetId);
      results.push({ scope: 'truck', ...sendRes });
    }

    const allSuccessful = results.every(r => r.ok);
    if (!allSuccessful) {
      const failed = results.find(r => !r.ok);
      return createErrorResponse('LINE_SEND_FAILED', failed?.error || 'การส่งข้อความบางส่วนไม่สำเร็จ', 502);
    }

    return createSuccessResponse({
      sent: true,
      dateKey,
      results
    });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.code === 'LINE_NOT_CONFIGURED') {
      return createErrorResponse('LINE_NOT_CONFIGURED', error.message, 422);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
