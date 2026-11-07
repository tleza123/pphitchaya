import { mkdirSync, writeFileSync } from 'node:fs';
import { createTruckReportPdf } from '../src/lib/server/truck-pdf';
import type { TruckMonthlyReport } from '../src/lib/truck/types';

export function reportQaFixture(): TruckMonthlyReport {
  const records = Array.from({ length: 80 }, (_, i) => ({ recordId: `r${i}`, dateKey: '2026-11-30', monthKey: '2026-11', truckId: `t${i % 60}`, plateNumberSnapshot: `กข ${1000 + i % 60}`, driverNameSnapshot: 'สมชาย คนขับทดสอบชื่อยาวภาษาไทย', tripCount: 1, totalDriverPaySatang: 15000, fuelCostSatang: 0, photos: [], revision: 1, createdAt: '', updatedAt: '', updatedBy: '', trips: [{ tripIndex: 1, fromLocation: 'จุดเอ โรงงานผลิตวัสดุก่อสร้างบางบัวทอง', destinationName: 'จุดบี คลังสินค้าสาขาภาคตะวันออก', destinationMode: 'CUSTOM', driverPaySatang: 15000, note: i === 0 ? 'บันทึกยาวเพื่อทดสอบการแบ่งรายการข้ามหน้า '.repeat(300) + 'สิ้นสุดหมายเหตุยาว' : `รายการทดสอบ ${i + 1}` }] }));
  return { monthKey: '2026-11', records, perTruck: Array.from({ length: 60 }, (_, i) => ({ truckId: `t${i}`, plateNumber: `กข ${1000 + i}`, driverName: 'สมชาย คนขับทดสอบชื่อยาวภาษาไทย', tripCount: i < 20 ? 2 : 1, totalDriverPaySatang: i < 20 ? 30000 : 15000, totalFuelCostSatang: 0 })), totals: { totalTrips: 80, totalDriverPaySatang: 1200000, totalFuelCostSatang: 0, totalCostSatang: 1200000, activeTruckCount: 60 } } as TruckMonthlyReport;
}
if (require.main === module) {
  mkdirSync('output/truck-qa', { recursive: true });
  createTruckReportPdf(reportQaFixture(), 'บริษัท ทดสอบรายงานภาษาไทย').then(pdf => {
    writeFileSync('output/truck-qa/qa-report.pdf', pdf);
    console.log('output/truck-qa/qa-report.pdf');
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
