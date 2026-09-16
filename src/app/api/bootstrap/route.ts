import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getProfileRef,
  getEmployeesCol,
  getAttendanceCol,
  getMonthRef,
  getCalendarVersionsCol,
  getCalendarOverridesCol,
  getShopId
} from '@/lib/server/repository';
import { getBangkokToday, getBangkokMonth } from '@/lib/payroll/dates';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const shopId = getShopId();
    const today = getBangkokToday();
    const currentMonth = getBangkokMonth();

    const profileSnap = await getProfileRef(shopId).get();
    const rawProfile = profileSnap.exists ? profileSnap.data() : null;
    const shopName = rawProfile?.shopName || rawProfile?.displayName || 'DE TEAM';
    const profile = {
      displayName: shopName,
      shopName,
      timezone: rawProfile?.timezone || 'Asia/Bangkok',
      systemStartDate: rawProfile?.systemStartDate || '2026-08-01',
      revision: rawProfile?.revision || 1
    };

    const employeesSnap = await getEmployeesCol(shopId).get();
    const employees = employeesSnap.docs.map(doc => {
      const d = doc.data();
      return {
        employeeId: doc.id,
        name: d.name,
        nickname: d.nickname || '',
        position: d.position,
        startDate: d.startDate,
        endDate: d.endDate || null,
        photo: d.photo ? { version: d.photo.version, width: d.photo.width, height: d.photo.height } : null,
        revision: d.revision || 1
      };
    });

    const monthDocSnap = await getMonthRef(currentMonth, shopId).get();
    const monthState = monthDocSnap.exists
      ? monthDocSnap.data()
      : { state: 'OPEN', revision: 0, extrasRevision: 0 };

    const attendanceSnap = await getAttendanceCol(currentMonth, shopId)
      .where('dateKey', '==', today)
      .get();
    const todayAttendance = attendanceSnap.docs.map(doc => {
      const d = doc.data();
      return {
        key: doc.id,
        dateKey: d.dateKey,
        employeeId: d.employeeId,
        status: d.status,
        revision: d.revision,
        updatedAt: d.updatedAt
      };
    });

    const calendarVersionsSnap = await getCalendarVersionsCol(shopId).get();
    const calendarVersions = calendarVersionsSnap.docs.map(doc => ({
      versionId: doc.id,
      ...doc.data()
    }));

    const overridesSnap = await getCalendarOverridesCol(shopId).get();
    const calendarOverrides: Record<string, 'WORKDAY' | 'HOLIDAY'> = {};
    overridesSnap.docs.forEach(doc => {
      const d = doc.data();
      calendarOverrides[doc.id] = d.kind;
    });

    return createSuccessResponse({
      profile,
      serverToday: today,
      monthKey: currentMonth,
      employees,
      todayAttendance,
      monthState,
      calendarVersions,
      calendarOverrides
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
