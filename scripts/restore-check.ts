import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

async function main() {
  const targetArg = process.argv[2];
  const backupDir = path.join(process.cwd(), 'backups');

  let targetFile: string;
  if (targetArg) {
    targetFile = path.isAbsolute(targetArg) ? targetArg : path.join(process.cwd(), targetArg);
  } else {
    // Find latest file in backups/
    if (!fs.existsSync(backupDir)) {
      console.error('[ERROR] ไม่พบโฟลเดอร์ backups/');
      process.exit(1);
    }
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.error('[ERROR] ไม่พบไฟล์สำรองข้อมูลในโฟลเดอร์ backups/');
      process.exit(1);
    }
    targetFile = path.join(backupDir, files[0]);
  }

  console.log(`--- ตรวจสอบความสมบูรณ์ของไฟล์สำรองข้อมูล (Restore Check) ---`);
  console.log(`เป้าหมาย: ${targetFile}`);

  if (!fs.existsSync(targetFile)) {
    console.error(`[ERROR] ไม่พบไฟล์ ${targetFile}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(targetFile, 'utf-8');
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('[FAIL] รูปแบบ JSON ไม่ถูกต้อง (Invalid JSON Syntax)');
    process.exit(1);
  }

  const { checksum, ...payload } = data;
  if (!checksum) {
    console.error('[FAIL] ไฟล์ไม่มีค่า SHA-256 Checksum กำกับ');
    process.exit(1);
  }

  const jsonPayloadStr = JSON.stringify(payload, null, 2);
  const calculatedChecksum = crypto.createHash('sha256').update(jsonPayloadStr).digest('hex');

  console.log(`ค่า Checksum ในไฟล์:  ${checksum}`);
  console.log(`ค่า Checksum ที่คำนวณ: ${calculatedChecksum}`);

  if (checksum !== calculatedChecksum) {
    console.error('[FAIL] Checksum ไม่ตรงกัน! ข้อมูลอาจถูกดัดแปลงหรือเสียหาย');
    process.exit(1);
  }
  console.log('[PASS] ตรวจสอบ SHA-256 Checksum ถูกต้องสมบูรณ์ 100%');

  console.log('\n--- สรุปข้อมูลภายในไฟล์สำรอง ---');
  console.log(`รหัสร้าน: ${payload.shopId}`);
  console.log(`เวลาที่สำรอง: ${payload.backupTimestamp}`);
  console.log(`จำนวนรายการทั้งหมด: ${payload.totalRecords}`);

  if (payload.collections) {
    for (const [coll, docs] of Object.entries(payload.collections)) {
      console.log(`- ${coll}: ${(docs as any[]).length} เอกสาร`);
    }
  }

  console.log('\n[PASS] ไฟล์สำรองข้อมูลพร้อมสำหรับการกู้คืนอย่างปลอดภัย');
}

main().catch((err) => {
  console.error('ตรวจสอบไฟล์สำรองล้มเหลว:', err);
  process.exit(1);
});
