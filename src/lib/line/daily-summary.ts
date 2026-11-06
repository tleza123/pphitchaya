import { getAdminFirestore } from '../firebase/admin';
import { isWorkday, resolveWeekdaysForDate, type CalendarVersion } from '../payroll/calendar';
import { monthDates } from '../payroll/dates';
import { dailyPay, effectiveAttendanceStatus, employedOn, rateOn, type AttendanceStatus, type RateRecord } from '../payroll/engine';
import { DEFAULT_SHOP_NAME, displayShopName } from '../shop-name';
import type { AttendanceDailySummaryData, TruckDailySummaryData } from './flex-templates';

function resolveEmployeeRateOn(emp: any, rates: RateRecord[], dateStr: string): number {
  if (rates.length > 0) {
    try {
      return rateOn(rates, dateStr);
    } catch {
      return rates[0].dailySatang || 0;
    }
  }
  const fallback = Number(emp?.dailyRateSatang || emp?.dailySatang || 0);
  return Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 0;
}

/**
 * Fetches attendance daily summary data for a given shop and date.
 */
export async function fetchAttendanceDailySummary(
  shopId = process.env.SHOP_ID || 'main',
  dateKey: string
): Promise<AttendanceDailySummaryData> {
  const db = getAdminFirestore();
  const shopRef = db.collection('shops').doc(shopId);
  const monthKey = dateKey.slice(0, 7);

  // Read profile, calendar overrides, calendar versions, active employees, and month's attendance/extras
  const [profileSnap, overridesSnap, calendarVersionsSnap, employeesSnap, attendanceSnap, extrasSnap] = await Promise.all([
    shopRef.collection('profile').doc('main').get().catch(() => ({ exists: false, data: () => null })),
    shopRef.collection('calendarOverrides').get().catch(() => ({ docs: [] })),
    shopRef.collection('calendarVersions').get().catch(() => ({ docs: [] })),
    shopRef.collection('employees').get().catch(() => ({ docs: [] })),
    shopRef.collection('months').doc(monthKey).collection('attendance').get().catch(() => ({ docs: [] })),
    shopRef.collection('months').doc(monthKey).collection('extras').get().catch(() => ({ docs: [] }))
  ]);

  const profileData = profileSnap && typeof profileSnap.data === 'function' && profileSnap.exists ? profileSnap.data() : null;
  const rawShopName = profileData?.shopName || profileData?.displayName || profileData?.name || DEFAULT_SHOP_NAME;
  const shopName = displayShopName(rawShopName);
  const fallbackWeekdays: number[] = Array.isArray(profileData?.workDays) ? profileData.workDays : [1, 2, 3, 4, 5, 6];

  const calendarVersions: CalendarVersion[] = (Array.isArray((calendarVersionsSnap as any)?.docs) ? (calendarVersionsSnap as any).docs : [])
    .map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc;
      return d && Array.isArray(d.workDays) && typeof d.effectiveDate === 'string'
        ? { versionId: doc.id, workDays: d.workDays, effectiveDate: d.effectiveDate }
        : null;
    })
    .filter(Boolean) as CalendarVersion[];

  const overrides: Record<string, 'WORKDAY' | 'HOLIDAY'> = {};
  let holidayReason: string | undefined;
  const overrideDocs: any[] = Array.isArray((overridesSnap as any)?.docs) ? (overridesSnap as any).docs : [];
  overrideDocs.forEach((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc;
    if (d && (d.kind === 'WORKDAY' || d.kind === 'HOLIDAY')) {
      overrides[doc.id] = d.kind;
      if (doc.id === dateKey && d.kind === 'HOLIDAY') {
        holidayReason = d.name || d.reason;
      }
    }
  });

  // Fallback if mock only supports .doc(dateKey).get() on calendarOverrides
  if (!(dateKey in overrides)) {
    const singleHolidaySnap = await shopRef.collection('calendarOverrides').doc(dateKey).get().catch(() => ({ exists: false, data: () => null }));
    const holidayData = singleHolidaySnap && typeof singleHolidaySnap.data === 'function' && singleHolidaySnap.exists ? singleHolidaySnap.data() : null;
    if (holidayData && (holidayData.kind === 'WORKDAY' || holidayData.kind === 'HOLIDAY')) {
      overrides[dateKey] = holidayData.kind;
      if (holidayData.kind === 'HOLIDAY') {
        holidayReason = holidayData.name || holidayData.reason;
      }
    }
  }

  const isTargetWorkday = isWorkday(
    dateKey,
    resolveWeekdaysForDate(dateKey, calendarVersions, fallbackWeekdays),
    overrides
  );
  const isHoliday = overrides[dateKey] === 'HOLIDAY' || !isTargetWorkday;
  const holidayName = holidayReason || (isHoliday ? 'วันหยุดร้าน' : undefined);

  // Map of active employees eligible on dateKey
  const employeeMap = new Map<string, any>();
  const employeeDocs: any[] = Array.isArray((employeesSnap as any)?.docs) ? (employeesSnap as any).docs : [];
  employeeDocs.forEach((doc: any) => {
    const data = typeof doc.data === 'function' ? doc.data() : doc;
    if (!data) return;
    if (data.status === 'SUSPENDED' || data.status === 'RESIGNED' || data.suspended) return;
    const empId = data.employeeId || doc.id;
    const startDate = typeof data.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.startDate) ? data.startDate : '2000-01-01';
    const endDate = typeof data.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.endDate) ? data.endDate : null;
    if (!employedOn({ ...data, employeeId: empId, startDate, endDate }, dateKey)) return;
    employeeMap.set(empId, { ...data, employeeId: empId, startDate, endDate });
  });

  // Load each active employee's rate history (if stored in rates subcollection)
  const ratesByEmployee = new Map<string, RateRecord[]>();
  await Promise.all(
    Array.from(employeeMap.keys()).map(async empId => {
      const snap = await shopRef.collection('employees').doc(empId).collection('rates').get().catch(() => ({ docs: [] }));
      const rateDocs: any[] = Array.isArray((snap as any)?.docs) ? (snap as any).docs : [];
      const sorted = rateDocs
        .map((rDoc: any) => {
          const r = typeof rDoc.data === 'function' ? rDoc.data() : rDoc;
          return r && typeof r.dailySatang === 'number' && typeof r.effectiveFrom === 'string'
            ? ({ employeeId: empId, effectiveFrom: r.effectiveFrom, dailySatang: r.dailySatang } as RateRecord)
            : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.effectiveFrom.localeCompare(b.effectiveFrom)) as RateRecord[];
      ratesByEmployee.set(empId, sorted);
    })
  );

  // Index attendance docs by `${dateKey}_${empId}`
  const attendanceByDateEmp = new Map<string, any>();
  const attendanceDocs: any[] = Array.isArray((attendanceSnap as any)?.docs) ? (attendanceSnap as any).docs : [];
  attendanceDocs.forEach((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc;
    if (!d) return;
    const idStr = typeof doc.id === 'string' ? doc.id : '';
    const sepIdx = idStr.indexOf('_');
    const docDate = d.dateKey || (sepIdx > 0 ? idStr.slice(0, sepIdx) : '');
    const empId = d.employeeId || (sepIdx > 0 ? idStr.slice(sepIdx + 1) : '');
    if (docDate && empId) {
      attendanceByDateEmp.set(`${docDate}_${empId}`, d);
    }
  });

  const totalStaff = employeeMap.size;

  let presentFull = 0;
  let presentHalf = 0;
  let absent = 0;
  let dailyWagesSatang = 0;
  let dailyAdvanceSatang = 0;
  let monthlyNetPayrollSatang = 0;

  const specialStaff: Array<{
    name: string;
    status: string;
    advanceSatang?: number;
    deductionSatang?: number;
  }> = [];

  // 1. Today's summary: any active employee without an explicit HALF/ABSENT/LEAVE record counts as FULL (present)
  if (!isHoliday) {
    for (const [empId, emp] of employeeMap.entries()) {
      const rec = attendanceByDateEmp.get(`${dateKey}_${empId}`);
      const rawStatus = rec?.status as string | undefined;
      const status = rawStatus === 'LEAVE' ? 'LEAVE' : effectiveAttendanceStatus(rawStatus as AttendanceStatus | undefined);
      const rates = ratesByEmployee.get(empId) || [];
      const rateSatang = resolveEmployeeRateOn(emp, rates, dateKey);

      const explicitWage = rec && (rec.calculatedWageSatang !== undefined || rec.wageSatang !== undefined)
        ? Number(rec.calculatedWageSatang ?? rec.wageSatang ?? 0)
        : null;
      const wageSatang = explicitWage !== null
        ? explicitWage
        : status === 'LEAVE'
          ? 0
          : dailyPay(status === 'HALF' || status === 'ABSENT' ? status : 'FULL', rateSatang);

      const advSatang = Number(rec?.advanceSatang || 0);
      const dedSatang = Number(rec?.deductionSatang || 0);

      if (status === 'FULL') {
        presentFull++;
      } else if (status === 'HALF') {
        presentHalf++;
      } else if (status === 'ABSENT' || status === 'LEAVE') {
        absent++;
      }

      dailyWagesSatang += wageSatang;
      dailyAdvanceSatang += advSatang;

      if (status !== 'FULL' || advSatang > 0 || dedSatang > 0) {
        let statusText = 'ปกติ';
        if (status === 'HALF') statusText = 'ครึ่งวัน';
        else if (status === 'ABSENT') statusText = 'ไม่มา';
        else if (status === 'LEAVE') statusText = 'ลา';

        specialStaff.push({
          name: emp.name || rec?.employeeName || empId || 'พนักงาน',
          status: statusText,
          advanceSatang: advSatang > 0 ? advSatang : undefined,
          deductionSatang: dedSatang > 0 ? dedSatang : undefined
        });
      }
    }
  }

  // 2. Monthly net payroll accumulation up to dateKey
  const datesUpToToday = monthDates(monthKey).filter(d => d <= dateKey);
  const visitedDocKeys = new Set<string>();

  for (const dKey of datesUpToToday) {
    const dayWorkday = isWorkday(
      dKey,
      resolveWeekdaysForDate(dKey, calendarVersions, fallbackWeekdays),
      overrides
    ) && overrides[dKey] !== 'HOLIDAY';

    for (const [empId, emp] of employeeMap.entries()) {
      if (!employedOn(emp, dKey)) continue;
      const key = `${dKey}_${empId}`;
      visitedDocKeys.add(key);
      const rec = attendanceByDateEmp.get(key);
      const advSatang = Number(rec?.advanceSatang || 0);
      const dedSatang = Number(rec?.deductionSatang || 0);

      let wageSatang = 0;
      if (dayWorkday) {
        const rawStatus = rec?.status as string | undefined;
        const status = rawStatus === 'LEAVE' ? 'LEAVE' : effectiveAttendanceStatus(rawStatus as AttendanceStatus | undefined);
        const explicitWage = rec && (rec.calculatedWageSatang !== undefined || rec.wageSatang !== undefined)
          ? Number(rec.calculatedWageSatang ?? rec.wageSatang ?? 0)
          : null;
        if (explicitWage !== null) {
          wageSatang = explicitWage;
        } else if (status !== 'LEAVE') {
          const rates = ratesByEmployee.get(empId) || [];
          const rateSatang = resolveEmployeeRateOn(emp, rates, dKey);
          wageSatang = dailyPay(status === 'HALF' || status === 'ABSENT' ? status : 'FULL', rateSatang);
        }
      }
      monthlyNetPayrollSatang += wageSatang - advSatang - dedSatang;
    }
  }

  // Include any explicit attendance records not covered above (e.g., employees who later became inactive)
  for (const [key, rec] of attendanceByDateEmp.entries()) {
    if (visitedDocKeys.has(key)) continue;
    const wageSatang = Number(rec.calculatedWageSatang || rec.wageSatang || 0);
    const advSatang = Number(rec.advanceSatang || 0);
    const dedSatang = Number(rec.deductionSatang || 0);
    monthlyNetPayrollSatang += wageSatang - advSatang - dedSatang;
  }

  // Add monthly extras (bonuses / deductions)
  const extraDocs: any[] = Array.isArray((extrasSnap as any)?.docs) ? (extrasSnap as any).docs : [];
  extraDocs.forEach((doc: any) => {
    const x = typeof doc.data === 'function' ? doc.data() : doc;
    if (!x || x.deletedAt) return;
    const amt = Number(x.amountSatang || 0);
    if (x.type === 'DEDUCTION') {
      monthlyNetPayrollSatang -= amt;
    } else {
      monthlyNetPayrollSatang += amt;
    }
  });

  return {
    dateKey,
    shopName,
    isHoliday,
    holidayName,
    totalStaff,
    presentFull,
    presentHalf,
    absent,
    specialStaff: specialStaff.length > 0 ? specialStaff : undefined,
    dailyWagesSatang,
    dailyAdvanceSatang,
    monthlyNetPayrollSatang
  };
}

/**
 * Fetches truck daily summary data for a given shop and date.
 */
export async function fetchTruckDailySummary(
  shopId = process.env.SHOP_ID || 'main',
  dateKey: string
): Promise<TruckDailySummaryData> {
  const db = getAdminFirestore();
  const shopRef = db.collection('shops').doc(shopId);
  const monthKey = dateKey.slice(0, 7);

  const [truckProfileSnap, recordsSnap] = await Promise.all([
    shopRef.collection('profile').doc('truck').get().catch(() => ({ exists: false, data: () => null })),
    shopRef.collection('truckMonths').doc(monthKey).collection('records').get().catch(() => ({ docs: [] }))
  ]);

  const truckProfileData = truckProfileSnap && typeof truckProfileSnap.data === 'function' && truckProfileSnap.exists
    ? truckProfileSnap.data()
    : null;
  const companyName = truckProfileData?.companyName || 'ระบบบันทึกงานรถสิบล้อ';

  let totalTrips = 0;
  let totalDriverPaySatang = 0;
  let totalFuelCostSatang = 0;
  let activeTruckCount = 0;

  let monthTotalTrips = 0;
  let monthDriverPaySatang = 0;
  let monthFuelCostSatang = 0;

  const trucksList: Array<{
    plateNumber: string;
    driverName: string;
    tripCount: number;
    routesSummary?: string;
    driverPaySatang: number;
    fuelCostSatang: number;
  }> = [];

  const recordDocs: any[] = Array.isArray((recordsSnap as any)?.docs) ? (recordsSnap as any).docs : [];
  recordDocs.forEach((doc: any) => {
    const r = typeof doc.data === 'function' ? doc.data() : doc;
    if (!r) return;

    const rDateKey = r.dateKey || (typeof doc.id === 'string' ? doc.id.split('_')[0] : '');
    const tripCount = Number(r.tripCount || r.trips?.length || 0);
    const driverPaySatang = Number(r.totalDriverPaySatang || 0);
    const fuelCostSatang = Number(r.fuelCostSatang || 0);

    monthTotalTrips += tripCount;
    monthDriverPaySatang += driverPaySatang;
    monthFuelCostSatang += fuelCostSatang;

    if (rDateKey === dateKey) {
      activeTruckCount++;
      totalTrips += tripCount;
      totalDriverPaySatang += driverPaySatang;
      totalFuelCostSatang += fuelCostSatang;

      const trips = Array.isArray(r.trips) ? r.trips : [];
      const routesSummary = trips
        .map((t: any) => `${t.fromLocation || 'ต้นทาง'} -> ${t.destinationName || 'ปลายทาง'}`)
        .slice(0, 3)
        .join(', ');

      trucksList.push({
        plateNumber: r.plateNumberSnapshot || r.truckId || doc.id,
        driverName: r.driverNameSnapshot || 'คนขับ',
        tripCount,
        routesSummary: routesSummary || undefined,
        driverPaySatang,
        fuelCostSatang
      });
    }
  });

  return {
    dateKey,
    companyName,
    activeTruckCount,
    totalTrips,
    totalDriverPaySatang,
    totalFuelCostSatang,
    trucks: trucksList,
    monthTotalTrips,
    monthDriverPaySatang,
    monthFuelCostSatang
  };
}
