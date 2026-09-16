import { getAdminFirestore } from '../src/lib/firebase/admin';
import {
  getShopId,
  getEmployeesCol,
  getRatesCol,
  getExtraTemplatesCol,
  getAttendanceCol
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

  const demoEmployees = [
    {
      id: 'emp_somchai_01',
      name: 'สมชาย สุขสบาย',
      nickname: 'ชาย',
      position: 'หัวหน้าช่าง',
      notes: 'ดูแลระบบไฟและเครื่องจักร',
      startDate: '2025-01-01',
      dailyRateSatang: 60000, // 600 บาท
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
      dailyRateSatang: 50000, // 500 บาท
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
      dailyRateSatang: 45000, // 450 บาท
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
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      },
      { merge: true }
    );

    // Rates subcollection
    const ratesCol = getRatesCol(emp.id, shopId);
    await ratesCol.doc('initial').set({
      rateId: 'initial',
      employeeId: emp.id,
      dailySatang: emp.dailyRateSatang,
      effectiveFrom: emp.startDate,
      revision: 1,
      createdAt: new Date().toISOString()
    });

    // Extra templates subcollection
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
        createdAt: new Date().toISOString()
      });
    }

    console.log(`[OK] บันทึกพนักงาน: ${emp.name}`);
  }

  // 2. Insert attendance for dates up to today in current month
  const dates = monthDates(currentMonth);
  const pastDates = dates.filter((d: string) => d <= todayDate);

  const statuses: ('FULL' | 'HALF' | 'ABSENT')[] = [
    'FULL',
    'FULL',
    'FULL',
    'FULL',
    'HALF',
    'FULL',
    'ABSENT'
  ];

  const attendanceCol = getAttendanceCol(currentMonth, shopId);
  let recordCount = 0;

  for (const dateKey of pastDates) {
    const dateObj = new Date(`${dateKey}T00:00:00+07:00`);
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 0) continue; // Sunday off

    for (let i = 0; i < demoEmployees.length; i++) {
      const emp = demoEmployees[i];
      const status = statuses[(recordCount + i) % statuses.length];
      const attId = `${dateKey}_${emp.id}`;
      const attRef = attendanceCol.doc(attId);

      await attRef.set(
        {
          dateKey,
          employeeId: emp.id,
          status,
          revision: 1,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        },
        { merge: true }
      );
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
