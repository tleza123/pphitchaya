import { getShopId, getMonthRef, getClosuresCol, getEmployeesCol, getCalendarVersionsCol,
  getCalendarOverridesCol, getAttendanceCol, getMonthlyExtrasCol, getRatesCol } from './repository';
import { calculateEmployeeMonth, EmployeeRecord, RateRecord, AttendanceRecord, MonthlyExtraRecord } from '../payroll/engine';
import { CalendarVersion } from '../payroll/calendar';
import { getBangkokToday, monthKey } from '../payroll/dates';
import { AnalyticsMonth } from '../payroll/analytics';

/** Read-only export: closed months always use their original employee snapshots. */
export async function loadSalaryReports(rawMonth: string, employeeId?: string): Promise<AnalyticsMonth[]> {
  const month = monthKey(rawMonth), shop = getShopId();
  const state = (await getMonthRef(month, shop).get()).data();
  if (state?.state === 'CLOSED') {
    if (!state.currentClosureId) throw new Error('ไม่พบข้อมูลปิดเดือน');
    const closure = getClosuresCol(month, shop).doc(state.currentClosureId);
    const [manifest, snapshots] = await Promise.all([closure.get(), closure.collection('employees').get()]);
    const ids = manifest.data()?.employeeIds;
    if (!manifest.exists || !Array.isArray(ids) || snapshots.size !== ids.length || snapshots.docs.some(doc => !ids.includes(doc.id))) {
      throw new Error('ข้อมูลปิดเดือนไม่ครบถ้วน ไม่สามารถส่งออกได้');
    }
    return snapshots.docs.filter(doc => !employeeId || doc.id === employeeId).map(doc => {
      const s = doc.data();
      if (!s.counts || !Array.isArray(s.days)) throw new Error('รายละเอียดปิดเดือนไม่ครบถ้วน');
      return { ...s, ...s.counts, employeeId: doc.id, month, isClosed: true, pending: 0,
        grossSatang: s.grossSatang ?? s.baseSatang + s.extraSatang,
        advanceSatang: s.advanceSatang || 0, deductionSatang: s.deductionSatang || 0,
        extras: s.extras || [] } as AnalyticsMonth;
    });
  }
  const [people, versions, overrides, attendance, extras] = await Promise.all([
    getEmployeesCol(shop).get(), getCalendarVersionsCol(shop).get(), getCalendarOverridesCol(shop).get(),
    getAttendanceCol(month, shop).get(), getMonthlyExtrasCol(month, shop).get()
  ]);
  const employees = people.docs.map(doc => ({ ...doc.data(), employeeId: doc.id }) as EmployeeRecord)
    .filter(emp => (!employeeId || emp.employeeId === employeeId) && emp.startDate <= `${month}-31` && (!emp.endDate || emp.endDate >= `${month}-01`));
  const results: AnalyticsMonth[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, employees.length) }, async () => {
    while (cursor < employees.length) {
      const employee = employees[cursor++];
      const rates = await getRatesCol(employee.employeeId, shop).get();
      const calc = calculateEmployeeMonth({ month, today: getBangkokToday(), systemStartDate: '2026-08-01', employee,
        rates: rates.docs.map(doc => ({ ...doc.data(), rateId: doc.id, employeeId: employee.employeeId })) as RateRecord[],
        calendarVersions: versions.docs.map(doc => ({ ...doc.data(), versionId: doc.id })) as CalendarVersion[],
        calendar: Object.fromEntries(overrides.docs.map(doc => [doc.id, doc.data().kind])),
        attendance: attendance.docs.map(doc => doc.data()) as AttendanceRecord[],
        extras: extras.docs.map(doc => ({ ...doc.data(), extraId: doc.id })).filter((extra: any) => !extra.deletedAt) as MonthlyExtraRecord[] });
      results.push({ ...calc, name: employee.name, nickname: employee.nickname, position: employee.position });
    }
  }));
  const latest = (await getMonthRef(month, shop).get()).data();
  if (['state', 'revision', 'extrasRevision', 'currentClosureId'].some(key => (state?.[key] ?? null) !== (latest?.[key] ?? null))) {
    throw new Error('ข้อมูลเดือนนี้เปลี่ยนระหว่างส่งออก กรุณาส่งออกอีกครั้ง');
  }
  return results.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}
