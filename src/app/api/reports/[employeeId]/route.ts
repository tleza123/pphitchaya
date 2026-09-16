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

    // If CLOSED, read immutable snapshot
    if (isClosed && monthData?.currentClosureId) {
      const snapDoc = await getClosuresCol(targetMonth, shopId)
        .doc(monthData.currentClosureId)
        .collection('employees')
        .doc(employeeId)
        .get();

      if (snapDoc.exists) {
        const data = snapDoc.data();
        return createSuccessResponse({
          employeeId,
          month: targetMonth,
          isClosed: true,
          ...data
        });
      }
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

    const ratesSnap = await getRatesCol(employeeId, shopId).get();
    const rates = ratesSnap.docs.map(d => ({
      rateId: d.id,
      employeeId,
      ...d.data()
    })) as RateRecord[];

    const calendarVersionsSnap = await getCalendarVersionsCol(shopId).get();
    const calendarVersions = calendarVersionsSnap.docs.map(d => ({
      versionId: d.id,
      ...d.data()
    })) as any[];

    const overridesSnap = await getCalendarOverridesCol(shopId).get();
    const overrides: Record<string, 'WORKDAY' | 'HOLIDAY'> = {};
    overridesSnap.docs.forEach(doc => {
      overrides[doc.id] = doc.data().kind;
    });

    const attendanceSnap = await getAttendanceCol(targetMonth, shopId)
      .where('employeeId', '==', employeeId)
      .get();
    const attendanceRecords = attendanceSnap.docs.map(d => d.data()) as any[];

    const extrasSnap = await getMonthlyExtrasCol(targetMonth, shopId)
      .where('employeeId', '==', employeeId)
      .get();
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
