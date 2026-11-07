import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { previewLegacyTruckMigration } from '../src/lib/truck/legacy-migration';
import type { TruckDailyRecordDoc } from '../src/lib/truck/types';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Import only from a verified full backup. Existing differing candidates are never overwritten. */
export async function importTruckMigration(args = process.argv.slice(2)) {
  const [input, flag] = args;
  if (!input || flag !== '--apply') throw new Error('Usage: npm run truck:migration:import -- <verified-backup.json> --apply');
  const backup = JSON.parse(readFileSync(input, 'utf8'));
  const { checksum, ...payload } = backup;
  const actual = createHash('sha256').update(JSON.stringify(payload, null, 2)).digest('hex');
  if (typeof checksum !== 'string' || checksum !== actual) throw new Error('BACKUP_CHECKSUM_INVALID');
  if (!Array.isArray(payload.collections?.truckMonthRecords)) throw new Error('BACKUP_RECORDS_MISSING');
  const records: TruckDailyRecordDoc[] = payload.collections.truckMonthRecords.map((r: TruckDailyRecordDoc & {_id?: string}) => ({...r, recordId:r.recordId || r._id || ''}));
  const preview = previewLegacyTruckMigration(records);
  if (preview.totalMismatchRecordIds.length) throw new Error('BACKUP_TOTAL_MISMATCH');
  try { (process as any).loadEnvFile?.('.env.local'); } catch {}
  const { getAdminFirestore } = await import('../src/lib/firebase/admin');
  const { getShopId } = await import('../src/lib/server/repository');
  const shopId = getShopId();
  if (payload.shopId !== shopId) throw new Error('BACKUP_SHOP_MISMATCH');
  const db = getAdminFirestore();
  let created = 0, unchanged = 0;
  for (const trip of preview.trips) {
    const ref = db.collection('shops').doc(shopId).collection('truckTrips').doc(String(trip.tripId));
    const didCreate = await db.runTransaction(async tx => {
      const month = String(trip.accountingMonth);
      const lock = db.collection('shops').doc(shopId).collection('truckPayrollMonths').doc(month);
      const control = db.collection('shops').doc(shopId).collection('truckControl').doc('main');
      const [snap, lockSnap, controlSnap] = await tx.getAll(ref, lock, control);
      if (controlSnap.data()?.maintenance) throw new Error('TRUCK_MAINTENANCE');
      if (snap.exists) {
        if (canonical(snap.data()) !== canonical(trip)) throw new Error(`MIGRATION_CONFLICT:${ref.id}`);
        return false;
      }
      if (lockSnap.data()?.state === 'CLOSED') throw new Error(`MONTH_CLOSED:${month}`);
      tx.create(ref, trip); return true;
    });
    if (didCreate) created++; else unchanged++;
  }
  console.log(JSON.stringify({created, unchanged, warnings:preview.warnings}, null, 2));
}
if (require.main === module) importTruckMigration().catch(error => { console.error(error); process.exitCode = 1; });
