import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getMonthRef,
  getEmployeesCol,
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

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const { searchParams } = new URL(req.url);
    const rawMonth = searchParams.get('month');
    if (!rawMonth) {
      return createErrorResponse('INVALID_MONTH', 'กรุณาระบุเดือนที่ต้องการดูรายงาน', 400);
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

    // If month is CLOSED, return immutable closure snapshot!
    if (isClosed && monthData?.currentClosureId) {
      const closureSnap = await getClosuresCol(targetMonth, shopId)
        .doc(monthData.currentClosureId)
        .get();

      if (closureSnap.exists) {
        const manifest = closureSnap.data() as any;
        const snapshotsSnap = await getClosuresCol(targetMonth, shopId)
          .doc(monthData.currentClosureId)
          .collection('employees')
          .get();

        const employeeReports = snapshotsSnap.docs.map(doc => {
          const s = doc.data() as any;
          return {
            employeeId: doc.id,
            name: s.name,
            nickname: s.nickname || '',
            position: s.position,
            full: s.counts.full,
            half: s.counts.half,
            absent: s.counts.absent,
            workedDays: s.counts.workedDays,
            paidDayUnits: s.counts.paidDayUnits,
            pending: 0,
            baseSatang: s.baseSatang,
            extraSatang: s.extraSatang,
            advanceSatang: s.advanceSatang || 0,
            deductionSatang: s.deductionSatang || 0,
            grossSatang: s.grossSatang ?? (s.baseSatang + s.extraSatang),
            totalSatang: s.totalSatang
          };
        });

        return createSuccessResponse({
          month: targetMonth,
          isClosed: true,
          closedAt: monthData.closedAt,
          closedBy: monthData.closedBy,
          closureId: monthData.currentClosureId,
          totals: {
            ...manifest.totalsSatang,
            deduction: manifest.totalsSatang?.deduction || 0
          },
          pendingTotal: 0,
          employees: employeeReports
        });
      }
    }

    // Otherwise calculate dynamically for OPEN / CLOSING month
    const employeesSnap = await getEmployeesCol(shopId).get();
    const employees = employeesSnap.docs
      .map(doc => ({
        employeeId: doc.id,
        ...doc.data()
      })) as (EmployeeRecord & { [key: string]: any })[];

    // Filter employees who worked or were employed in targetMonth
    const monthStart = `${targetMonth}-01`;
    const relevantEmployees = employees.filter(emp => {
      if (emp.startDate > `${targetMonth}-31`) return false;
      if (emp.endDate && emp.endDate < monthStart) return false;
      return true;
    });

    // Calendar
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

    // Attendance
    const attendanceSnap = await getAttendanceCol(targetMonth, shopId).get();
    const attendanceRecords = attendanceSnap.docs.map(d => ({
      ...d.data()
    })) as any[];

    // Monthly Extras
    const extrasSnap = await getMonthlyExtrasCol(targetMonth, shopId).get();
    const monthlyExtras = extrasSnap.docs
      .map(d => ({
        extraId: d.id,
        ...d.data()
      }))
      .filter((x: any) => !x.deletedAt) as any[];

    // Calculate per employee
    let totalBase = 0;
    let totalExtra = 0;
    let totalAdvance = 0;
    let totalDeduction = 0;
    let totalGross = 0;
    let totalNet = 0;
    let totalPending = 0;

    const employeeReports = await Promise.all(
      relevantEmployees.map(async emp => {
        const ratesSnap = await getRatesCol(emp.employeeId, shopId).get();
        const rates = ratesSnap.docs.map(d => ({
          rateId: d.id,
          employeeId: emp.employeeId,
          ...d.data()
        })) as RateRecord[];

        try {
          const calc = calculateEmployeeMonth({
            month: targetMonth,
            today,
            systemStartDate: '2026-08-01',
            employee: emp,
            rates,
            attendance: attendanceRecords,
            extras: monthlyExtras,
            calendarVersions,
            calendar: overrides
          });

          totalBase += calc.baseSatang;
          totalExtra += calc.extraSatang;
          totalAdvance += calc.advanceSatang;
          totalDeduction += calc.deductionSatang;
          totalGross += calc.grossSatang;
          totalNet += calc.totalSatang;
          totalPending += calc.pending;

          return {
            employeeId: emp.employeeId,
            name: emp.name,
            nickname: emp.nickname || '',
            position: emp.position,
            full: calc.full,
            half: calc.half,
            absent: calc.absent,
            workedDays: calc.workedDays,
            paidDayUnits: calc.paidDayUnits,
            pending: calc.pending,
            baseSatang: calc.baseSatang,
            extraSatang: calc.extraSatang,
            advanceSatang: calc.advanceSatang,
            deductionSatang: calc.deductionSatang,
            grossSatang: calc.grossSatang,
            totalSatang: calc.totalSatang
          };
        } catch (e: any) {
          // If missing rate or employee dates invalid, return indicator
          return {
            employeeId: emp.employeeId,
            name: emp.name,
            nickname: emp.nickname || '',
            position: emp.position,
            full: 0,
            half: 0,
            absent: 0,
            workedDays: 0,
            paidDayUnits: 0,
            pending: 0,
            baseSatang: 0,
            extraSatang: 0,
            advanceSatang: 0,
            deductionSatang: 0,
            grossSatang: 0,
            totalSatang: 0,
            error: e.message
          };
        }
      })
    );

    return createSuccessResponse({
      month: targetMonth,
      isClosed: false,
      totals: {
        base: totalBase,
        extra: totalExtra,
        advance: totalAdvance,
        deduction: totalDeduction,
        gross: totalGross,
        total: totalNet
      },
      pendingTotal: totalPending,
      employees: employeeReports
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
