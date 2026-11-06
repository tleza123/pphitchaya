import { getAdminFirestore } from '../src/lib/firebase/admin';
import {
  getShopId,
  getEmployeesCol,
  getRatesCol,
  getExtraTemplatesCol,
  getAttendanceCol,
  getTruckProfileRef,
  getTrucksCol,
  getTruckOriginsCol,
  getTruckDestinationsCol,
  getTruckRecordsCol
} from '../src/lib/server/repository';
import { getBangkokToday, getBangkokMonth, monthDates } from '../src/lib/payroll/dates';

try {
  (process as any).loadEnvFile?.('.env.local');
} catch {}

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    console.error('[ERROR] คำเตือน: ห้ามรัน seed-demo บน PRODUCTION เด็ดขาด');
    process.exit(1);
  }

  const shopId = getShopId();
  console.log(`--- เริ่มการสร้างข้อมูลทดสอบ (Seed Demo) สำหรับสภาพแวดล้อม DEV [${shopId}] ---`);

  const currentMonth = getBangkokMonth();
  const todayDate = getBangkokToday();
  const now = new Date().toISOString();

  const demoEmployees = [
    {
      id: 'emp_somchai_01',
      name: 'สมชาย สุขสบาย',
      nickname: 'ชาย',
      position: 'หัวหน้าช่าง',
      notes: 'ดูแลระบบไฟและเครื่องจักร',
      startDate: '2025-01-01',
      dailyRateSatang: 60000,
      extraTemplates: [
        { name: 'ค่าตำแหน่ง', amountSatang: 200000 },
        { name: 'ค่าเดินทาง', amountSatang: 100000 }
      ],
      revision: 1
    },
    {
      id: 'emp_somsak_02',
      name: 'สมศักดิ์ มีชัย',
      nickname: 'ศักดิ์',
      position: 'ช่างเทคนิค',
      notes: 'ช่างประจำสาขา',
      startDate: '2025-03-01',
      dailyRateSatang: 50000,
      extraTemplates: [{ name: 'ค่าเบี้ยเลี้ยง', amountSatang: 150000 }],
      revision: 1
    },
    {
      id: 'emp_wichai_03',
      name: 'วิชัย มั่นคง',
      nickname: 'บอย',
      position: 'ผู้ช่วยช่าง',
      notes: 'ทดลองงานผ่านแล้ว',
      startDate: '2025-06-01',
      dailyRateSatang: 45000,
      extraTemplates: [{ name: 'ค่าอาหาร', amountSatang: 100000 }],
      revision: 1
    }
  ];

  const employeesCol = getEmployeesCol(shopId);

  // 1. Insert employees
  for (const emp of demoEmployees) {
    const empRef = employeesCol.doc(emp.id);
    await empRef.set(
      {
        employeeId: emp.id,
        name: emp.name,
        nickname: emp.nickname,
        position: emp.position,
        notes: emp.notes,
        startDate: emp.startDate,
        endDate: null,
        revision: emp.revision,
        updatedAt: now,
        createdAt: now
      },
      { merge: true }
    );

    const ratesCol = getRatesCol(emp.id, shopId);
    await ratesCol.doc('initial').set({
      rateId: 'initial',
      employeeId: emp.id,
      dailySatang: emp.dailyRateSatang,
      effectiveFrom: emp.startDate,
      revision: 1,
      createdAt: now
    });

    const tmplCol = getExtraTemplatesCol(emp.id, shopId);
    for (let t = 0; t < emp.extraTemplates.length; t++) {
      const tmpl = emp.extraTemplates[t];
      await tmplCol.doc(`tmpl_${t + 1}`).set({
        templateId: `tmpl_${t + 1}`,
        employeeId: emp.id,
        label: tmpl.name,
        amountSatang: tmpl.amountSatang,
        active: true,
        revision: 1,
        createdAt: now
      });
    }

    console.log(`[OK] บันทึกพนักงาน: ${emp.name}`);
  }

  const truckProfileRef = getTruckProfileRef(shopId);
  const truckProfileSnap = await truckProfileRef.get();
  await truckProfileRef.set({
    companyName: 'หจก. ขนส่งตัวอย่าง',
    revision: truckProfileSnap.data()?.revision ?? 1,
    createdAt: truckProfileSnap.data()?.createdAt ?? now,
    updatedAt: now
  }, { merge: true });
  console.log('[OK] ตั้งค่า profile/truck สำหรับ demo');

  const trucksCol = getTrucksCol(shopId);
  const demoTrucks = [
    { truckId: 'truck_demo_01', plateNumber: '82-4510', driverName: 'สมหมาย สายลุย', status: 'ACTIVE', revision: 1 },
    { truckId: 'truck_demo_02', plateNumber: '83-1029', driverName: 'วิเชียร โชคดี', status: 'ACTIVE', revision: 1 }
  ];

  for (const truck of demoTrucks) {
    await trucksCol.doc(truck.truckId).set({
      ...truck,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
  }
  console.log('[OK] เพิ่มรถสิบล้อ demo 2 คัน');

  const originsCol = getTruckOriginsCol(shopId);
  const demoOrigins = [
    { originId: 'orig_demo_01', name: 'บ่อดินลาดหลุมแก้ว', revision: 1 },
    { originId: 'orig_demo_02', name: 'ท่าทรายบางปะอิน', revision: 1 }
  ];

  for (const origin of demoOrigins) {
    await originsCol.doc(origin.originId).set({
      ...origin,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
  }
  console.log('[OK] เพิ่มต้นทาง demo 2 แห่ง');

  const destinationsCol = getTruckDestinationsCol(shopId);
  const demoDestinations = [
    { destinationId: 'dest_demo_01', name: 'แพล้นปูนบางใหญ่', driverPaySatang: 35000, revision: 1 },
    { destinationId: 'dest_demo_02', name: 'ไซต์งานแจ้งวัฒนะ', driverPaySatang: 45000, revision: 1 },
    { destinationId: 'dest_demo_03', name: 'โกดังรังสิต', driverPaySatang: 40000, revision: 1 }
  ];

  for (const destination of demoDestinations) {
    await destinationsCol.doc(destination.destinationId).set({
      ...destination,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
  }
  console.log('[OK] เพิ่มปลายทาง demo 3 แห่ง');

  const dates = monthDates(currentMonth).filter((d: string) => d <= todayDate);
  const recordsCol = getTruckRecordsCol(currentMonth, shopId);
  let recordCount = 0;

  for (const dateKey of dates) {
    const dateObj = new Date(`${dateKey}T00:00:00+07:00`);
    if (dateObj.getDay() === 0) continue;

    for (let truckIndex = 0; truckIndex < demoTrucks.length; truckIndex++) {
      const truck = demoTrucks[truckIndex];
      const tripCount = 1 + ((dateObj.getDate() + truckIndex) % 3);
      const trips = Array.from({ length: tripCount }, (_, idx) => {
        const destination = demoDestinations[(dateObj.getDate() + truckIndex + idx) % demoDestinations.length];
        const origin = demoOrigins[(dateObj.getDate() + truckIndex + idx) % demoOrigins.length];
        const driverPaySatang = destination.driverPaySatang + (idx === 0 ? 2500 : 0);
        return {
          tripIndex: idx + 1,
          fromLocation: origin.name,
          destinationMode: `DEST_${destination.destinationId}`,
          destinationId: destination.destinationId,
          destinationName: destination.name,
          driverPaySatang,
          note: idx === 0 ? 'เที่ยวต้นทาง-ปลายทาง' : 'เที่ยวรับ-ส่ง'
        };
      });

      const totalDriverPaySatang = trips.reduce((sum, trip) => sum + trip.driverPaySatang, 0);
      const fuelCostSatang = 120000 + (dateObj.getDate() * 2300) + (truckIndex * 35000);
      const recordId = `${dateKey}_${truck.truckId}`;

      await recordsCol.doc(recordId).set({
        recordId,
        dateKey,
        monthKey: currentMonth,
        truckId: truck.truckId,
        plateNumberSnapshot: truck.plateNumber,
        driverNameSnapshot: truck.driverName,
        fuelCostSatang,
        totalDriverPaySatang,
        tripCount: trips.length,
        trips,
        photos: [],
        revision: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: 'seed-demo'
      }, { merge: true });

      recordCount++;
    }
  }

  console.log(`[OK] บันทึกข้อมูลเช็คชื่อตัวอย่างรวม ${recordCount} รายการในเดือน ${currentMonth}`);
  console.log('--- สร้างข้อมูลทดสอบสำเร็จ 100% ---');
}

main().catch((err) => {
  console.error('สร้างข้อมูลทดสอบล้มเหลว:', err);
  process.exit(1);
});
