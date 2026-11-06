import { getAdminFirestore } from '../firebase/admin';
import { DEFAULT_SHOP_NAME, displayShopName } from '../shop-name';
import type { AttendanceDailySummaryData, TruckDailySummaryData } from './flex-templates';

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

  // Read profile, calendar overrides, active employees, and month's attendance
  const [profileSnap, holidaySnap, employeesSnap, attendanceSnap] = await Promise.all([
    shopRef.collection('profile').doc('main').get().catch(() => ({ exists: false, data: () => null })),
    shopRef.collection('calendarOverrides').doc(dateKey).get().catch(() => ({ exists: false, data: () => null })),
    shopRef.collection('employees').get().catch(() => ({ docs: [] })),
    shopRef.collection('months').doc(monthKey).collection('attendance').get().catch(() => ({ docs: [] }))
  ]);

  const profileData = profileSnap && typeof profileSnap.data === 'function' && profileSnap.exists ? profileSnap.data() : null;
  const rawShopName = profileData?.shopName || profileData?.displayName || DEFAULT_SHOP_NAME;
  const shopName = displayShopName(rawShopName);

  const holidayData = holidaySnap && typeof holidaySnap.data === 'function' && holidaySnap.exists ? holidaySnap.data() : null;
  const isHoliday = Boolean(holidayData && holidayData.kind === 'HOLIDAY');
  const holidayName = holidayData?.name || holidayData?.reason || (isHoliday ? 'วันหยุดร้าน' : undefined);

  // Map of active employees
  const employeeMap = new Map<string, any>();
  const employeeDocs: any[] = Array.isArray((employeesSnap as any)?.docs) ? (employeesSnap as any).docs : [];
  employeeDocs.forEach((doc: any) => {
    const data = typeof doc.data === 'function' ? doc.data() : doc;
    if (data && data.status !== 'SUSPENDED' && data.status !== 'RESIGNED') {
      employeeMap.set(doc.id, data);
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

  const attendanceDocs: any[] = Array.isArray((attendanceSnap as any)?.docs) ? (attendanceSnap as any).docs : [];
  attendanceDocs.forEach((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc;
    if (!d) return;

    const docDate = d.dateKey || (typeof doc.id === 'string' ? doc.id.split('_')[0] : '');
    const empId = d.employeeId || (typeof doc.id === 'string' ? doc.id.split('_')[1] : '');
    const emp = employeeMap.get(empId);

    // Sum monthly wage satang
    const wageSatang = Number(d.calculatedWageSatang || d.wageSatang || 0);
    const advSatang = Number(d.advanceSatang || 0);
    const dedSatang = Number(d.deductionSatang || 0);
    monthlyNetPayrollSatang += wageSatang - advSatang - dedSatang;

    if (docDate === dateKey) {
      const status = d.status || 'FULL';
      if (status === 'FULL') {
        presentFull++;
      } else if (status === 'HALF') {
        presentHalf++;
      } else if (status === 'ABSENT' || status === 'LEAVE') {
        absent++;
      }

      dailyWagesSatang += wageSatang;
      dailyAdvanceSatang += advSatang;

      const empName = emp?.name || d.employeeName || empId || 'พนักงาน';
      if (status !== 'FULL' || advSatang > 0 || dedSatang > 0) {
        let statusText = 'ปกติ';
        if (status === 'HALF') statusText = 'ครึ่งวัน';
        else if (status === 'ABSENT') statusText = 'ไม่มา';
        else if (status === 'LEAVE') statusText = 'ลา';

        specialStaff.push({
          name: empName,
          status: statusText,
          advanceSatang: advSatang > 0 ? advSatang : undefined,
          deductionSatang: dedSatang > 0 ? dedSatang : undefined
        });
      }
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
