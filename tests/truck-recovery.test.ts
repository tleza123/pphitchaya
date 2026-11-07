import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { backupTruckData } from '../scripts/backup';
import { restoreTruckBackup } from '../scripts/truck-restore';
import { importTruckMigration } from '../scripts/truck-migration-import';

// An atomic in-memory Firestore adapter: no SDK network initialization is permitted.
function database(seed: Record<string, any> = {}) {
  const data = new Map(Object.entries(structuredClone(seed)));
  class Ref {
    constructor(readonly path: string, readonly max = Infinity) {}
    get id() { return this.path.split('/').at(-1)!; }
    collection(id: string) { return new Ref(`${this.path}/${id}`); }
    doc(id: string) { return new Ref(`${this.path}/${id}`); }
    limit(n: number) { return new Ref(this.path, n); }
    async get(): Promise<any> {
      if (this.path.split('/').length % 2 === 0) return { exists: data.has(this.path), data: () => structuredClone(data.get(this.path)), ref: this, id: this.id };
      const docs = [...data.keys()].filter(k => k.startsWith(`${this.path}/`) && k.split('/').length === this.path.split('/').length + 1).slice(0, this.max);
      return { empty: !docs.length, docs: await Promise.all(docs.map(k => new Ref(k).get())) };
    }
  }
  const db = {
    collection: (id: string) => new Ref(id), doc: (id: string) => new Ref(id),
    async runTransaction(fn: (tx: any) => Promise<any>) {
      const writes: (() => void)[] = [];
      const result = await fn({ get: (r: Ref) => r.get(), getAll: (...r: Ref[]) => Promise.all(r.map(x => x.get())),
        create: (r: Ref, v: any) => { if (data.has(r.path)) throw Error('ALREADY_EXISTS'); writes.push(() => data.set(r.path, structuredClone(v))); },
        set: (r: Ref, v: any, options?: any) => writes.push(() => data.set(r.path, structuredClone(options?.merge ? { ...data.get(r.path), ...v } : v))) });
      writes.forEach(write => write()); return result;
    }
  };
  (globalThis as any).adminDb = db;
  return data;
}
const prefix = 'shops/main/';
function fixture() {
  const trip = { fromLocation: 'A — โรงงาน', destinationName: 'B — คลังสินค้า', departureDate: '2026-11-30', arrivalDate: '2026-12-02', departedAt: '2026-11-30T19:00:00+07:00', driverPaySatang: 15000, billingSatang: 120000, driverExtraSatang: 500, billingExtraSatang: 1000, note: 'เก็บราคาเดิม' };
  return {
    [`${prefix}profile/truck`]: { companyName: 'กิจการทดสอบ' },
    [`${prefix}trucks/t1`]: { plate: 'กข 1234' },
    [`${prefix}truckLocations/a`]: { code: 'A', active: true },
    [`${prefix}truckMonths/2026-12`]: { revision: 7 },
    [`${prefix}truckMonths/2026-12/records/r1`]: { recordId: 'r1', dateKey: '2026-12-02', truckId: 't1', totalDriverPaySatang: 15000, trips: [trip], photos: [{ photoId: 'photo1', dataUrl: 'data:image/png;base64,YWJj' }] },
    [`${prefix}truckMonths/2026-12/workDays/driver1_2026-12-02`]: { driverId: 'driver1', date: '2026-12-02', baseSatang: 30000, monthKey: '2026-12' },
    [`${prefix}truckInvoices/i1`]: { version: 2, totalSatang: 121000, snapshot: { lines: [trip] } },
    [`${prefix}truckInvoices/i1/payments/p1`]: { amountSatang: 10000, paidDate: '2026-12-05' },
    [`${prefix}truckPayrollMonths/2026-11`]: { state: 'OPEN', revision: 2 },
    [`${prefix}truckPayrollMonths/2026-11/versions/v1`]: { snapshot: { totalSatang: 15000 }, reason: 'เปิดแก้' },
    [`${prefix}truckPhotos/photo1`]: { dataUrl: 'data:image/png;base64,YWJj' },
    [`${prefix}requests/req1`]: { result: { invoiceId: 'i1' }, requestId: 'req1' },
    [`${prefix}audit/audit1`]: { action: 'CREATE_INVOICE', before: null, after: { invoiceId: 'i1' } }
  };
}
function rewrite(file: string, change: (b: any) => void) {
  const b = JSON.parse(readFileSync(file, 'utf8')); change(b); const { checksum: _, ...payload } = b;
  b.checksum = createHash('sha256').update(JSON.stringify(payload, null, 2)).digest('hex'); writeFileSync(file, JSON.stringify(b));
}

test('actual backup/restore entry points roundtrip snapshots, photos, receipts, audit and nested documents; reject overwrite', async () => {
  process.env.SHOP_ID = 'main';
  const dir = mkdtempSync(path.join(tmpdir(), 'truck-recovery-'));
  try {
    const source = fixture(); database(source); const file = await backupTruckData(dir);
    const payload = JSON.parse(readFileSync(file, 'utf8')); assert.equal(payload.totalRecords, Object.keys(source).length);
    const conflictingReceipt = database({ [`${prefix}requests/req1`]: { result: 'existing' } });
    await assert.rejects(restoreTruckBackup([file, '--apply']), /RESTORE_TARGET_EXISTS/);
    assert.equal(conflictingReceipt.size, 2, 'only existing receipt and maintenance lock remain; no partial restore');
    assert.equal(conflictingReceipt.has(`${prefix}truckInvoices/i1`), false);
    assert.deepEqual(conflictingReceipt.get(`${prefix}requests/req1`), { result: 'existing' });
    const busy = database({ [`${prefix}truckControl/main`]: { maintenance: true, restoreChecksum: 'another-restore' } });
    await assert.rejects(restoreTruckBackup([file, '--apply']), /MAINTENANCE_ALREADY_ACTIVE/);
    assert.equal(busy.size, 1);
    const restored = database(); await restoreTruckBackup([file, '--apply']);
    for (const [key, value] of Object.entries(source)) {
      const actual = restored.get(key);
      // Month partition metadata is added by the existing backup format to records.
      assert.deepEqual(actual, key.includes('/records/') ? { ...value, monthKey: '2026-12' } : value);
    }
    assert.equal(restored.get(`${prefix}truckControl/main`).maintenance, false);
    const originalInvoice = structuredClone(restored.get(`${prefix}truckInvoices/i1`));
    await assert.rejects(restoreTruckBackup([file, '--apply']), /RESTORE_TARGET_NOT_EMPTY/);
    assert.deepEqual(restored.get(`${prefix}truckInvoices/i1`), originalInvoice);
    assert.equal(restored.get(`${prefix}truckControl/main`).maintenance, true, 'failed restore stays in maintenance for reconciliation');
    const broken = JSON.parse(readFileSync(file, 'utf8')); broken.collections.trucks[0].plate = 'tampered'; writeFileSync(file, JSON.stringify(broken));
    const clean = database(); await assert.rejects(restoreTruckBackup([file, '--apply']), /BACKUP_CHECKSUM_INVALID/); assert.equal(clean.size, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migration importer preserves legacy money/time/photos and start month, is idempotent, and refuses conflicts/closed months/maintenance', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'truck-migration-'));
  try {
    database(fixture()); const file = await backupTruckData(dir);
    const target = database(); await importTruckMigration([file, '--apply']);
    const [id, trip] = [...target.entries()][0];
    assert.equal(target.size, 1); assert.equal(trip.accountingMonth, '2026-11'); assert.equal(trip.weightKg, null);
    assert.equal(trip.driverPaySatang, 15000); assert.equal(trip.billingSatang, 120000); assert.equal(trip.driverId, null); assert.equal(trip.customerId, null);
    assert.equal(trip.departedAt, '2026-11-30T19:00:00+07:00'); assert.equal(trip.legacyTripSnapshot.billingExtraSatang, 1000);
    assert.equal(trip.photos[0].dataUrl, 'data:image/png;base64,YWJj');
    await importTruckMigration([file, '--apply']); assert.equal(target.size, 1);
    target.set(id, { ...trip, driverPaySatang: 1 }); await assert.rejects(importTruckMigration([file, '--apply']), /MIGRATION_CONFLICT/); assert.equal(target.get(id).driverPaySatang, 1);
    const closed = database({ [`${prefix}truckPayrollMonths/2026-11`]: { state: 'CLOSED' } });
    await assert.rejects(importTruckMigration([file, '--apply']), /MONTH_CLOSED/); assert.equal(closed.size, 1);
    const maintenance = database({ [`${prefix}truckControl/main`]: { maintenance: true } });
    await assert.rejects(importTruckMigration([file, '--apply']), /TRUCK_MAINTENANCE/); assert.equal(maintenance.size, 1);
    rewrite(file, b => b.collections.truckMonthRecords[0].totalDriverPaySatang = 999); database();
    await assert.rejects(importTruckMigration([file, '--apply']), /BACKUP_TOTAL_MISMATCH/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('restore validates shop identity, duplicate paths and incomplete backups before entering maintenance', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'truck-invalid-backup-'));
  try {
    database(fixture()); const file = await backupTruckData(dir); const pristine = readFileSync(file, 'utf8');
    for (const [change, error] of [
      [(b: any) => b.shopId = 'another-shop', /BACKUP_SHOP_MISMATCH/],
      [(b: any) => b.collections.trucks.push(b.collections.trucks[0]), /DUPLICATE_BACKUP_PATH/],
      [(b: any) => delete b.collections.truckPayrollVersions, /BACKUP_INCOMPLETE/],
      [(b: any) => delete b.collections.requests, /BACKUP_INCOMPLETE/],
      [(b: any) => delete b.collections.audit, /BACKUP_INCOMPLETE/],
      [(b: any) => b.collections.trucks = Array.from({ length: 451 }, (_, i) => ({ _id: `t${i}` })), /RESTORE_TOO_LARGE/]
    ] as const) {
      writeFileSync(file, pristine); rewrite(file, change); const target = database();
      await assert.rejects(restoreTruckBackup([file, '--apply']), error); assert.equal(target.size, 0);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migration preview CLI writes a dry-run without DB and refuses overwriting its output', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'truck-preview-'));
  try {
    database(fixture()); const file = await backupTruckData(dir); const output = path.join(dir, 'preview.json');
    const run = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/truck-migration-preview.ts', file, output], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, FIREBASE_PROJECT_ID: '', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '' } });
    const first = run(); assert.equal(first.status, 0, first.stderr);
    const preview = JSON.parse(readFileSync(output, 'utf8')); assert.equal(preview.tripCount, 1); assert.equal(preview.totalDriverPaySatang, 15000); assert.equal(preview.trips[0].accountingMonth, '2026-11');
    const saved = readFileSync(output, 'utf8'); const second = run(); assert.notEqual(second.status, 0); assert.match(second.stderr, /EEXIST/); assert.equal(readFileSync(output, 'utf8'), saved);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
