import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/server/errors';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { getShopId, getEmployeesCol, getRatesCol, getCalendarVersionsCol, getCalendarOverridesCol,
  getMonthRef, getAttendanceCol, getMonthlyExtrasCol, getClosuresCol } from '@/lib/server/repository';
import { getBangkokToday } from '@/lib/payroll/dates';
import { calculateEmployeeMonth, EmployeeRecord, RateRecord, AttendanceRecord, MonthlyExtraRecord } from '@/lib/payroll/engine';
import { AnalyticsMonth, buildAnalytics, ReportPeriod, reportMonths } from '@/lib/payroll/analytics';
import { CalendarVersion } from '@/lib/payroll/calendar';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const query = req.nextUrl.searchParams;
    const period = (query.get('period') || 'day') as ReportPeriod;
    const today = getBangkokToday();
    const requestedMonths = reportMonths(period, Object.fromEntries(query), today);
    // Keep the same system start boundary as the existing payroll reports.
    const months = requestedMonths.filter(month => month >= '2026-08');
    if (!months.length) return createSuccessResponse(buildAnalytics([], period, today, requestedMonths, []));
    const shopId = getShopId();
    const db = getAdminFirestore();
    const [employeesSnap, versionsSnap, overridesSnap, monthSnaps] = await Promise.all([
      getEmployeesCol(shopId).get(), getCalendarVersionsCol(shopId).get(), getCalendarOverridesCol(shopId).get(),
      db.getAll(...months.map(month => getMonthRef(month, shopId)))
    ]);
    const employees = employeesSnap.docs.map(doc => ({ ...doc.data(), employeeId: doc.id })) as EmployeeRecord[];
    const calendarVersions = versionsSnap.docs.map(doc => ({ ...doc.data(), versionId: doc.id })) as CalendarVersion[];
    const calendar = Object.fromEntries(overridesSnap.docs.map(doc => [doc.id, doc.data().kind])) as Record<string, 'WORKDAY' | 'HOLIDAY'>;
    const closedMonths: string[] = [];
    const openMonths = months.filter((month, index) => monthSnaps[index].data()?.state !== 'CLOSED');
    const relevantEmployees = employees.filter(emp => openMonths.some(month => emp.startDate <= `${month}-31` && (!emp.endDate || emp.endDate >= `${month}-01`)));
    const rates = new Map<string, RateRecord[]>();
    await Promise.all(relevantEmployees.map(async employee => {
      const snap = await getRatesCol(employee.employeeId, shopId).get();
      rates.set(employee.employeeId, snap.docs.map(doc => ({ ...doc.data(), rateId: doc.id, employeeId: employee.employeeId })) as RateRecord[]);
    }));
    const results: AnalyticsMonth[] = [];
    // Bound simultaneous month reads to avoid a large annual report flooding Firestore.
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, months.length) }, async () => {
      while (cursor < months.length) {
        const index = cursor++;
        const month = months[index];
        const state = monthSnaps[index].data();
        if (state?.state === 'CLOSED') {
          if (!state.currentClosureId) throw new Error('ไม่พบ snapshot ของเดือนที่ปิดบัญชี');
          const closure = getClosuresCol(month, shopId).doc(state.currentClosureId);
          const [manifest, snapshots] = await Promise.all([closure.get(), closure.collection('employees').get()]);
          const employeeIds = manifest.data()?.employeeIds;
          if (!manifest.exists || !Array.isArray(employeeIds) || employeeIds.length !== snapshots.size || snapshots.docs.some(doc => !employeeIds.includes(doc.id))) {
            throw new Error('ข้อมูล snapshot ของเดือนที่ปิดบัญชีไม่ครบถ้วน');
          }
          closedMonths.push(month);
          for (const doc of snapshots.docs) {
            const data = doc.data();
            if (!Array.isArray(data.days) || !data.counts) throw new Error('ข้อมูล snapshot ไม่ครบถ้วน');
            results.push({ ...data, ...data.counts, employeeId: doc.id, month,
              grossSatang: data.grossSatang ?? data.baseSatang + data.extraSatang,
              deductionSatang: data.deductionSatang || 0, advanceSatang: data.advanceSatang || 0,
              extras: data.extras || [], pending: 0, isClosed: true } as AnalyticsMonth);
          }
          continue;
        }
        const [attendanceSnap, extrasSnap] = await Promise.all([
          getAttendanceCol(month, shopId).get(), getMonthlyExtrasCol(month, shopId).get()
        ]);
        const attendance = attendanceSnap.docs.map(doc => doc.data()) as AttendanceRecord[];
        const extras = extrasSnap.docs.map(doc => ({ ...doc.data(), extraId: doc.id })).filter((extra: any) => !extra.deletedAt) as MonthlyExtraRecord[];
        for (const employee of relevantEmployees) {
          if (employee.startDate > `${month}-31` || (employee.endDate && employee.endDate < `${month}-01`)) continue;
          const calculated = calculateEmployeeMonth({ month, today, systemStartDate: '2026-08-01', employee,
            rates: rates.get(employee.employeeId) || [], attendance, extras, calendarVersions, calendar });
          results.push({ ...calculated, name: employee.name, nickname: employee.nickname, position: employee.position });
        }
      }
    }));
    results.sort((a, b) => a.month.localeCompare(b.month) || a.employeeId.localeCompare(b.employeeId));
    return createSuccessResponse(buildAnalytics(results, period, today, requestedMonths, closedMonths.sort()));
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'REPORT_ERROR', error.message || 'ไม่สามารถโหลดรายงานละเอียดได้', error.statusCode || 422);
  }
}
