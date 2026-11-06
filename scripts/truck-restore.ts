import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Restore is deliberately create-only: existing documents require manual reconciliation.
async function main() {
  const [input, flag] = process.argv.slice(2);
  if (!input || flag !== '--apply') throw new Error('Usage: npm run truck:restore -- <backup.json> --apply');
  const backup = JSON.parse(readFileSync(input, 'utf8'));
  const {checksum,...payload} = backup;
  if (checksum !== createHash('sha256').update(JSON.stringify(payload,null,2)).digest('hex')) throw new Error('BACKUP_CHECKSUM_INVALID');
  try { (process as any).loadEnvFile?.('.env.local'); } catch {}
  const {getAdminFirestore} = await import('../src/lib/firebase/admin');
  const {getShopId} = await import('../src/lib/server/repository');
  if (payload.shopId !== getShopId()) throw new Error('BACKUP_SHOP_MISMATCH');
  const c = payload.collections;
  const names = ['trucks','truckOrigins','truckDestinations','truckLocations','truckDrivers','truckCustomers','truckTariffs','truckTrips','truckRuns','truckPayrollMonths','truckInvoices','truckPayments','truckMonths','truckPhotos'];
  if (!c || names.some(name => !Array.isArray(c[name])) || !Array.isArray(c.truckMonthRecords) || !Array.isArray(c.truckMonth_workDays) || !Array.isArray(c.truckMonth_payroll) || !Array.isArray(c.truckInvoicePayments) || !Array.isArray(c.truckPayrollVersions)) throw new Error('BACKUP_INCOMPLETE');
  const shop = getAdminFirestore().collection('shops').doc(getShopId());
  const entries: {path:string; data:Record<string,unknown>}[] = [];
  if (!Array.isArray(c.profile)) throw new Error('BACKUP_INCOMPLETE');
  const truckProfile = c.profile.find((p: {_id:string}) => p._id === 'truck');
  if (truckProfile) { const {_id,...data} = truckProfile; entries.push({path:'profile/truck',data}); }
  for (const name of names) for (const {_id,...data} of c[name]) { if (typeof _id !== 'string' || !_id || _id.includes('/')) throw new Error('INVALID_ID'); entries.push({path:`${name}/${_id}`,data}); }
  for (const [key, sub] of [['truckMonthRecords','records'],['truckMonth_workDays','workDays'],['truckMonth_payroll','payroll']]) {
    for (const {_id,monthKey,...data} of c[key]) { if (!/^\d{4}-\d{2}$/.test(monthKey) || typeof _id !== 'string' || !_id || _id.includes('/')) throw new Error('INVALID_ID'); entries.push({path:`truckMonths/${monthKey}/${sub}/${_id}`,data:{...data,monthKey}}); }
  }
  for (const {_id,invoiceId,...data} of c.truckInvoicePayments) { if (typeof _id !== 'string'||!_id||_id.includes('/')||typeof invoiceId !== 'string'||!invoiceId||invoiceId.includes('/')) throw new Error('INVALID_ID'); entries.push({path:`truckInvoices/${invoiceId}/payments/${_id}`,data}); }
  for (const {_id,payrollMonthId,...data} of c.truckPayrollVersions) { if (typeof _id !== 'string'||!_id||_id.includes('/')||typeof payrollMonthId !== 'string'||!payrollMonthId||payrollMonthId.includes('/')) throw new Error('INVALID_ID'); entries.push({path:`truckPayrollMonths/${payrollMonthId}/versions/${_id}`,data}); }
  const seen = new Set<string>();
  for (const entry of entries) { if (seen.has(entry.path)) throw new Error('DUPLICATE_BACKUP_PATH'); seen.add(entry.path); }
  if (entries.length > 450) throw new Error('RESTORE_TOO_LARGE');
  const db = getAdminFirestore();
  const control = shop.collection('truckControl').doc('main');
  await db.runTransaction(async tx => {
    const current = (await tx.get(control)).data();
    if (current?.maintenance && current.restoreChecksum !== checksum) throw new Error('MAINTENANCE_ALREADY_ACTIVE');
    tx.set(control, {maintenance:true, restoreChecksum:checksum}, {merge:true});
  });
  // If interrupted, maintenance remains active; retry the identical backup.
  await db.runTransaction(async tx => {
    const state = (await tx.get(control)).data();
    if (!state?.maintenance || state.restoreChecksum !== checksum) throw new Error('RESTORE_LOCK_LOST');
    if ((await tx.get(shop.collection('profile').doc('truck'))).exists) throw new Error('RESTORE_TARGET_NOT_EMPTY:profile/truck');
    for (const name of names) {
      if (!(await tx.get(shop.collection(name).limit(1))).empty) throw new Error(`RESTORE_TARGET_NOT_EMPTY:${name}`);
    }
    const refs = entries.map(entry => db.doc(`${shop.path}/${entry.path}`));
    for (const ref of refs) if ((await tx.get(ref)).exists) throw new Error(`RESTORE_TARGET_EXISTS:${ref.path}`);
    entries.forEach((entry, i) => tx.create(refs[i], entry.data));
    tx.set(control, {maintenance:false, restoreChecksum:null}, {merge:true});
  });
  console.log(`Restored ${entries.length} truck documents atomically.`);
}
main().catch(e => {console.error(e);process.exitCode=1;});
