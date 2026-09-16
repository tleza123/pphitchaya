import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getAdminFirestore } from '../src/lib/firebase/admin';
import { getShopId, getShopDocRef } from '../src/lib/server/repository';

try {
  (process as any).loadEnvFile?.('.env.local');
} catch {}

async function main() {
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
    'audit'
  ];

  const shopDoc = getShopDocRef(shopId);

  for (const collName of collectionsToBackup) {
    const snap = await shopDoc.collection(collName).get();
    backupData[collName] = snap.docs.map((doc) => ({
      _id: doc.id,
      ...doc.data()
    }));
    totalRecords += snap.docs.length;
    console.log(`[OK] ดึงข้อมูลคอลเลกชัน ${collName}: ${snap.docs.length} รายการ`);
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

  const backupDir = path.join(process.cwd(), 'backups');
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
}

main().catch((err) => {
  console.error('สำรองข้อมูลล้มเหลว:', err);
  process.exit(1);
});
