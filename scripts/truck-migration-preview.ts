import { readFileSync, writeFileSync } from 'node:fs';
import { previewLegacyTruckMigration } from '../src/lib/truck/legacy-migration';
import type { TruckDailyRecordDoc } from '../src/lib/truck/types';

const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) {
  throw new Error('Usage: npm run truck:migration:preview -- <backup.json> <preview.json>');
}
const backup = JSON.parse(readFileSync(input, 'utf8'));
const records = backup.records ?? backup.collections?.truckMonthRecords;
if (!Array.isArray(records)) throw new Error('Backup has no truck records');
const normalized: TruckDailyRecordDoc[] = records.map((r: TruckDailyRecordDoc & { _id?: string }) => ({ ...r, recordId: r.recordId || r._id || '' }));
const preview = previewLegacyTruckMigration(normalized);
writeFileSync(output, JSON.stringify({ source: input, generatedAt: new Date().toISOString(), ...preview }, null, 2), { encoding: 'utf8', flag: 'wx' });
console.log(`ตรวจ ${preview.recordCount} ใบงาน ${preview.tripCount} เที่ยว ยอดค่าเที่ยว ${preview.totalDriverPaySatang} สตางค์`);
console.log(`พบ ${preview.warnings.length} ข้อที่ต้องตรวจ ผลบันทึกที่ ${output}`);
