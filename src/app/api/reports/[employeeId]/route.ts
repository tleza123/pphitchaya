import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getMonthRef,
  getEmployeeRef,
  getAttendanceCol,
  getMonthlyExtrasCol,
  getCalendarVersionsCol,
  getCalendarOverridesCol,
  getClosuresCol,
  getRatesCol
} from '@/lib/server/repository';
import { monthKey, getBangkokToday } from '@/lib/payroll/dates';
import { calculateEmployeeMonth, EmployeeRecord, RateRecord } from '@/lib/payroll/engine';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    await verifyOwner(req);
    const { employeeId } = await params;
    const { searchParams } = new URL(req.url);
    const rawMonth = searchParams.get('month');
    if (!rawMonth) {
      return createErrorResponse('INVALID_MONTH', 'กรุณาระบุเดือนที่ต้องการดู', 400);
    }
    const targetMonth = monthKey(rawMonth);
    const shopId = getShopId();
    const today = getBangkokToday();

    // 1. Check Month state
    const monthSnap = await getMonthRef(targetMonth, shopId).get();
    const monthData = monthSnap.exists
      ? monthSnap.data()
      : { state: 'OPEN', revision: 0, extrasRevision: 0 };
    const isClosed = monthData?.state === 'CLOSED';
    if (isClosed && !monthData?.currentClosureId) return createErrorResponse('INCOMPLETE_CLOSURE', 'ไม่พบข้อมูลปิดเดือน', 409);

    // If CLOSED, read immutable snapshot
    if (isClosed && monthData?.currentClosureId) {
      const snapDoc = await getClosuresCol(targetMonth, shopId)
        .doc(monthData.currentClosureId)
        .collection('employees')
        .doc(employeeId)
        .get();

      if (snapDoc.exists) {
        const data = snapDoc.data();
        if (!data?.counts || !Array.isArray(data.days)) return createErrorResponse('INCOMPLETE_CLOSURE', 'รายละเอียดปิดเดือนไม่ครบถ้วน', 409);
        return createSuccessResponse({
          ...data,
          ...data.counts,
          employeeId,
          month: targetMonth,
          isClosed: true,
          pending: 0,
          grossSatang: data.grossSatang ?? data.baseSatang + data.extraSatang
        });
      }
      return createErrorResponse('INCOMPLETE_CLOSURE', 'ไม่พบรายงานรายบุคคลที่บันทึกตอนปิดเดือน', 409);
    }

    // Otherwise calculate dynamically
    const empSnap = await getEmployeeRef(employeeId, shopId).get();
    if (!empSnap.exists) {
      return createErrorResponse('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน', 404);
    }
    const employee = {
      employeeId,
      ...empSnap.data()
    } as EmployeeRecord;

    const [ratesSnap, calendarVersionsSnap, overridesSnap, attendanceSnap, extrasSnap] = await Promise.all([
      getRatesCol(employeeId, shopId).get(),
      getCalendarVersionsCol(shopId).get(),
      getCalendarOverridesCol(shopId).get(),
      getAttendanceCol(targetMonth, shopId).where('employeeId', '==', employeeId).get(),
      getMonthlyExtrasCol(targetMonth, shopId).where('employeeId', '==', employeeId).get()
    ]);
    const rates = ratesSnap.docs.map(d => ({
      rateId: d.id,
      employeeId,
      ...d.data()
    })) as RateRecord[];

    const calendarVersions = calendarVersionsSnap.docs.map(d => ({
      versionId: d.id,
      ...d.data()
    })) as any[];

    const overrides: Record<string, 'WORKDAY' | 'HOLIDAY'> = {};
    overridesSnap.docs.forEach(doc => {
      overrides[doc.id] = doc.data().kind;
    });

    const attendanceRecords = attendanceSnap.docs.map(d => d.data()) as any[];

    const monthlyExtras = extrasSnap.docs
      .map(d => ({
        extraId: d.id,
        ...d.data()
      }))
      .filter((x: any) => !x.deletedAt) as any[];

    const calc = calculateEmployeeMonth({
      month: targetMonth,
      today,
      systemStartDate: '2026-08-01',
      employee,
      rates,
      attendance: attendanceRecords,
      extras: monthlyExtras,
      calendarVersions,
      calendar: overrides
    });

    return createSuccessResponse({
      ...calc,
      name: employee.name,
      nickname: employee.nickname || '',
      position: employee.position,
      isClosed: false
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
