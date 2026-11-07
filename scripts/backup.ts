import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getAdminFirestore } from '../src/lib/firebase/admin';
import { getShopId, getShopDocRef } from '../src/lib/server/repository';

try {
  (process as any).loadEnvFile?.('.env.local');
} catch {}

export async function backupTruckData(backupDir = path.join(process.cwd(), 'backups')) {
  const shopId = getShopId();
  console.log(`--- เริ่มการสำรองข้อมูล (Backup) ร้าน ${shopId} ---`);

  const db = getAdminFirestore();
  const backupData: Record<string, any[]> = {};
  let totalRecords = 0;

  const collectionsToBackup = [
    'profile',
    'control',
    'calendarVersions',
    'calendarOverrides',
    'employees',
    'months',
    'closeJobs',
    'requests',
    'audit',
    'trucks',
    'truckOrigins',
    'truckDestinations',
    'truckLocations',
    'truckDrivers',
    'truckCustomers',
    'truckTariffs',
    'truckTrips',
    'truckRuns',
    'truckPayrollMonths',
    'truckInvoices',
    'truckPayments',
    'truckMonths',
    'truckPhotos'
  ];

  const shopDoc = getShopDocRef(shopId);

  for (const collName of collectionsToBackup) {
    const snap = await shopDoc.collection(collName).get();

    if (collName === 'truckMonths') {
      const monthRecords = await Promise.all(snap.docs.map(async (doc) => {
        const recordsSnap = await doc.ref.collection('records').get();
        return recordsSnap.docs.map((recordDoc) => ({
          ...recordDoc.data(),
          monthKey: doc.id,
          _id: recordDoc.id
        }));
      }));
      backupData[collName] = snap.docs.map((doc) => ({
        ...doc.data(),
        _id: doc.id
      }));
      backupData.truckMonthRecords = monthRecords.flat();
      for (const subcollection of ['workDays', 'payroll']) {
        const nested = await Promise.all(snap.docs.map(async (doc) => {
          const sub = await doc.ref.collection(subcollection).get();
          return sub.docs.map(d => ({ ...d.data(), monthKey: doc.id, _id: d.id }));
        }));
        backupData[`truckMonth_${subcollection}`] = nested.flat();
        totalRecords += backupData[`truckMonth_${subcollection}`].length;
      }
      totalRecords += snap.docs.length + backupData.truckMonthRecords.length;
      console.log(`[OK] ดึงข้อมูลคอลเลกชัน ${collName}: ${snap.docs.length} เอกสาร + ${backupData.truckMonthRecords.length} records`);
      continue;
    }

    const items = snap.docs.map((doc) => ({
      ...doc.data(),
      _id: doc.id
    }));
    if (collName === 'truckInvoices') {
      const payments = await Promise.all(snap.docs.map(async doc => {
        const sub = await doc.ref.collection('payments').get();
        return sub.docs.map(d => ({ ...d.data(), invoiceId: doc.id, _id: d.id }));
      }));
      backupData.truckInvoicePayments = payments.flat();
      totalRecords += backupData.truckInvoicePayments.length;
    }
    if (collName === 'truckPayrollMonths') {
      const versions = await Promise.all(snap.docs.map(async doc => {
        const sub = await doc.ref.collection('versions').get();
        return sub.docs.map(d => ({ ...d.data(), payrollMonthId: doc.id, _id: d.id }));
      }));
      backupData.truckPayrollVersions = versions.flat();
      totalRecords += backupData.truckPayrollVersions.length;
    }
    backupData[collName] = items;
    totalRecords += items.length;
    console.log(`[OK] ดึงข้อมูลคอลเลกชัน ${collName}: ${items.length} รายการ`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPayload = {
    shopId,
    backupTimestamp: new Date().toISOString(),
    totalRecords,
    collections: backupData
  };

  const jsonStr = JSON.stringify(backupPayload, null, 2);
  const checksum = crypto.createHash('sha256').update(jsonStr).digest('hex');

  const finalOutput = {
    checksum,
    ...backupPayload
  };

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filename = `backup_${shopId}_${timestamp}.json`;
  const filePath = path.join(backupDir, filename);

  fs.writeFileSync(filePath, JSON.stringify(finalOutput, null, 2), 'utf-8');

  console.log(`--- สำรองข้อมูลเสร็จสมบูรณ์ ---`);
  console.log(`ไฟล์: ${filePath}`);
  console.log(`จำนวนข้อมูลรวม: ${totalRecords} รายการ`);
  console.log(`SHA-256 Checksum: ${checksum}`);
  return filePath;
}

if (require.main === module) backupTruckData().catch((err) => {
  console.error('สำรองข้อมูลล้มเหลว:', err);
  process.exit(1);
});
