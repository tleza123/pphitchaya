'use client';
import { useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import settings from '@/components/settings/settings.module.css';
import reports from '@/components/reports/reports.module.css';
import { LineSettings } from '@/components/shared/LineSettings';
import { useModalInteraction } from '@/components/shared/useModalInteraction';
import { formatMoney, moneySatang, satangToDecimalString } from '@/lib/payroll/money';
import { errMsg, getJson, saveBlob, sendJson } from './api';
import type { TruckBoot } from './TruckShell';
import styles from './truck.module.css';

interface Field { key: string; label: string; kind?: 'text' | 'money' | 'check' | 'select'; required?: boolean; options?: { value: string; label: string }[] }
interface Item { id: string; title: string; sub?: string; flag?: string; values: Record<string, string> }

function MasterSection({ title, fields, items, busy, onSave, onDelete }: {
  title: string; fields: Field[]; items: Item[]; busy: boolean;
  onSave: (values: Record<string, string>, id: string | null) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const open = (item?: Item) => { setEditing(item ? item.id : 'new'); setValues(item ? item.values : {}); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await onSave(values, editing === 'new' ? null : editing); setEditing(null); } catch { /* error already shown; keep the form open */ }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.sectionHead}>
        <h3>{title}</h3>
        <button type="button" className={styles.iconBtn} onClick={() => open()} disabled={busy}><Plus size={18} aria-hidden="true" /> เพิ่ม</button>
      </div>
      {items.length === 0 && editing !== 'new' && <p className={styles.empty}>ยังไม่มีข้อมูล</p>}
      {items.map(item => (
        <div className={styles.item} key={item.id}>
          <div className={styles.itemText}>
            <strong>{item.title}</strong>
            {item.sub && <span>{item.sub}</span>}
            {item.flag && <div className={styles.suspended}>{item.flag}</div>}
          </div>
          <div className={styles.itemActions}>
            <button type="button" className={styles.iconBtn} onClick={() => open(item)} disabled={busy} aria-label={`แก้ไข ${item.title}`}><Pencil size={18} aria-hidden="true" /></button>
            <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(item)} disabled={busy} aria-label={`ลบ ${item.title}`}><Trash2 size={18} aria-hidden="true" /></button>
          </div>
        </div>
      ))}
      {editing && (
        <form onSubmit={submit} style={{ marginTop: '1rem' }}>
          {fields.map(f => (
            <div className={settings.formGroup} key={f.key}>
              {f.kind === 'check' ? (
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={values[f.key] === 'true'} onChange={e => setValues(v => ({ ...v, [f.key]: String(e.target.checked) }))} /> {f.label}
                </label>
              ) : (
                <>
                  <label className={settings.formLabel} htmlFor={`ms-${title}-${f.key}`}>{f.label}</label>
                  {f.kind === 'select' ? <select id={`ms-${title}-${f.key}`} required={f.required} className={settings.formInput} value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}><option value="">เลือก{f.label}</option>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input id={`ms-${title}-${f.key}`} required={f.required} inputMode={f.kind === 'money' ? 'decimal' : undefined} className={settings.formInput}
                    value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />}
                </>
              )}
            </div>
          ))}
          {title.startsWith('ราคา') && values.originId && values.destinationId && <p>เส้นทาง: {fields.find(f=>f.key==='originId')?.options?.find(o=>o.value===values.originId)?.label} → {fields.find(f=>f.key==='destinationId')?.options?.find(o=>o.value===values.destinationId)?.label} · {values.billing || values.pay || 'ยังไม่ระบุ'} บาท</p>}
          <div style={{ display: 'grid', gap: '.6rem' }}>
            <button type="submit" className={settings.primaryBtn} disabled={busy} aria-busy={busy}>บันทึก</button>
            <button type="button" className={settings.secondaryBtn} onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function TruckSettingsTab({ active, boot, onChanged }: { active: boolean; boot: TruckBoot; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ err: boolean; text: string } | null>(null);
  const [company, setCompany] = useState(boot.truckProfile.companyName);
  const [address,setAddress]=useState(boot.truckProfile.address||'');
  const [phone,setPhone]=useState(boot.truckProfile.phone||'');
  const [taxId,setTaxId]=useState(boot.truckProfile.taxId||'');
  const [pendingDelete, setPendingDelete] = useState<{ item: Item; request: Record<string, unknown>; success: string } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<File | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  useModalInteraction(active && Boolean(pendingDelete || pendingRestore), () => {
    setPendingDelete(null);
    setPendingRestore(null);
  });

  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); await onChanged(); setMsg({ err: false, text: ok }); }
    catch (e) { setMsg({ err: true, text: errMsg(e) }); throw e; }
    finally { setBusy(false); }
  };
  const post = (body: object) => sendJson('/api/truck/settings', 'POST', body);
  const baht = (text: string) => { try { return moneySatang(text.trim()); } catch { throw new Error('จำนวนเงินไม่ถูกต้อง ใช้ทศนิยมไม่เกิน 2 ตำแหน่ง'); } };

  const trucks: Item[] = boot.trucks.map(t => ({
    id: t.truckId, title: t.plateNumber, sub: t.driverName ? `คนขับ: ${t.driverName}` : 'ไม่ระบุคนขับ',
    flag: t.status === 'SUSPENDED' ? 'พักรถ' : undefined,
    values: { plateNumber: t.plateNumber, driverName: t.driverName, suspended: String(t.status === 'SUSPENDED') }
  }));
  const origins: Item[] = boot.truckOrigins.map(o => ({ id: o.originId, title: o.name, values: { name: o.name } }));
  const dests: Item[] = boot.truckDestinations.map(d => ({
    id: d.destinationId, title: d.name, sub: `ค่าเที่ยวคนขับ ${formatMoney(d.driverPaySatang)} บาท`,
    values: { name: d.name, pay: satangToDecimalString(d.driverPaySatang) }
  }));
  const drivers: Item[] = ((boot as any).truckDrivers || []).filter((d:any) => d.status !== 'SUSPENDED').map((d: any) => ({ id: d.driverId, title: d.name, sub: `ค่าแรงฐาน ${formatMoney(d.baseWageSatang ?? 30000)} บาท/วัน`, values: { name: d.name, base: String((d.baseWageSatang ?? 30000) / 100), revision: String(d.revision) } }));
  const customers: Item[] = ((boot as any).truckCustomers || []).filter((d:any) => d.status !== 'SUSPENDED').map((d: any) => ({ id: d.customerId, title: d.name, values: { name: d.name, revision: String(d.revision) } }));
  const locations: Item[] = ((boot as any).truckLocations || []).filter((d:any) => d.status !== 'SUSPENDED').map((d:any) => ({id:d.locationId,title:`${d.code} — ${d.name}`,values:{code:d.code,name:d.name,detail:d.detail||'',revision:String(d.revision)}}));
  const tariffs: Item[] = ((boot as any).truckTariffs || []).filter((d:any) => d.status !== 'SUSPENDED').map((d:any) => ({id:d.tariffId,title:`${locations.find(x=>x.id===d.originId)?.title || d.originId} → ${locations.find(x=>x.id===d.destinationId)?.title || d.destinationId}`,sub:d.customerId ? `${customers.find(x=>x.id===d.customerId)?.title || d.customerId}: ${d.customerRateSatang == null ? 'ยังไม่ได้ตั้งราคา' : formatMoney(d.customerRateSatang)+' บาท'}` : `ค่าเที่ยว ${formatMoney(d.driverPaySatang)} บาท`,values:{originId:d.originId,destinationId:d.destinationId,customerId:d.customerId||'',pay:d.driverPaySatang == null ? '' : satangToDecimalString(d.driverPaySatang),billing:d.customerRateSatang==null?'':satangToDecimalString(d.customerRateSatang),revision:String(d.revision)}}));

  const backup = () => act(async () => {
    const data = await getJson('/api/truck/backup');
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `truck-backup-${boot.serverToday}.json`);
  }, 'ดาวน์โหลดไฟล์สำรองแล้ว').catch(() => undefined);

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setPendingRestore(file);
  };

  const confirmDeleteAction = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    await act(() => post(target.request), target.success).catch(() => undefined);
  };

  const confirmRestoreAction = async () => {
    const file = pendingRestore;
    if (!file) return;
    setPendingRestore(null);
    await act(async () => {
      await sendJson('/api/truck/backup', 'POST', JSON.parse(await file.text()));
    }, 'กู้คืนข้อมูลสำเร็จ').catch(() => undefined);
  };

  return (
    <div className={styles.stack} aria-busy={busy}>
      <h2 className={reports.title}>ตั้งค่าระบบรถสิบล้อ</h2>

      <MasterSection title="จุดรับ–ส่ง" busy={busy} items={locations}
        fields={[{key:'code',label:'รหัสจุด เช่น A',required:true},{key:'name',label:'ชื่อสถานที่',required:true},{key:'detail',label:'ที่อยู่หรือรายละเอียด'}]}
        onSave={(v,id)=>act(()=>post({action:'UPSERT_LOCATION',location:{id:id||undefined,code:v.code,name:v.name,detail:v.detail},expectedRevision:id?Number(v.revision):0}),'บันทึกจุดแล้ว')}
        onDelete={item=>{setPendingDelete({item,request:{action:'DISABLE_LOCATION',id:item.id,expectedRevision:Number(item.values.revision)},success:'ปิดใช้งานจุดแล้ว'});return Promise.resolve();}} />
      <MasterSection title="ราคาค่าเที่ยวคนขับ" busy={busy} items={tariffs.filter(t=>!t.values.customerId)}
        fields={[{key:'originId',label:'ต้นทาง',kind:'select',required:true,options:locations.map(l=>({value:l.id,label:l.title}))},{key:'destinationId',label:'ปลายทาง',kind:'select',required:true,options:locations.map(l=>({value:l.id,label:l.title}))},{key:'pay',label:'ค่าเที่ยวคนขับ (บาท)',kind:'money',required:true}]}
        onSave={(v,id)=>act(()=>post({action:'UPSERT_TARIFF',tariff:{id:id||undefined,originId:v.originId,destinationId:v.destinationId,customerId:null,driverPaySatang:baht(v.pay)},expectedRevision:id?Number(v.revision):0}),'บันทึกราคาแล้ว')}
        onDelete={item=>{setPendingDelete({item,request:{action:'DISABLE_TARIFF',id:item.id,expectedRevision:Number(item.values.revision)},success:'ปิดใช้งานราคาแล้ว'});return Promise.resolve();}} />
      <MasterSection title="ราคาขนส่งลูกค้าต่อเที่ยว" busy={busy} items={tariffs.filter(t=>!!t.values.customerId)}
        fields={[{key:'customerId',label:'ลูกค้า',kind:'select',required:true,options:customers.map(c=>({value:c.id,label:c.title}))},{key:'originId',label:'ต้นทาง',kind:'select',required:true,options:locations.map(l=>({value:l.id,label:l.title}))},{key:'destinationId',label:'ปลายทาง',kind:'select',required:true,options:locations.map(l=>({value:l.id,label:l.title}))},{key:'billing',label:'ราคาขนส่งต่อเที่ยว (บาท)',kind:'money',required:true}]}
        onSave={(v,id)=>act(()=>post({action:'UPSERT_TARIFF',tariff:{id:id||undefined,originId:v.originId,destinationId:v.destinationId,customerId:v.customerId,customerRateSatang:baht(v.billing)},expectedRevision:id?Number(v.revision):0}),'บันทึกราคาแล้ว')}
        onDelete={item=>{setPendingDelete({item,request:{action:'DISABLE_TARIFF',id:item.id,expectedRevision:Number(item.values.revision)},success:'ปิดใช้งานราคาแล้ว'});return Promise.resolve();}} />

      <MasterSection title="รถสิบล้อและคนขับ" busy={busy} items={trucks}
        fields={[{ key: 'plateNumber', label: 'ทะเบียนรถ', required: true }, { key: 'driverName', label: 'คนขับประจำ' }, { key: 'suspended', label: 'พักรถชั่วคราว', kind: 'check' }]}
        onSave={(v, id) => act(() => post({ action: 'UPSERT_TRUCK', truck: { truckId: id ?? undefined, plateNumber: v.plateNumber, driverName: v.driverName || '', status: v.suspended === 'true' ? 'SUSPENDED' : 'ACTIVE' }, expectedRevision: id ? boot.trucks.find(t => t.truckId === id)?.revision : undefined }), 'บันทึกข้อมูลรถแล้ว')}
        onDelete={item => { setPendingDelete({ item, request: { action: 'DELETE_TRUCK', truckId: item.id }, success: 'ลบรถแล้ว' }); return Promise.resolve(); }} />

      <MasterSection title="คนขับและค่าแรงฐานรายวัน" busy={busy} items={drivers}
        fields={[{ key: 'name', label: 'ชื่อคนขับ', required: true }, { key: 'base', label: 'ค่าแรงฐานต่อวัน (บาท)', kind: 'money', required: true }]}
        onSave={(v, id) => act(() => post({ action: 'UPSERT_DRIVER', driver: { driverId: id || undefined, name: v.name, baseWageSatang: baht(v.base || '300') }, expectedRevision: id ? Number(v.revision) : 0 }), 'บันทึกคนขับแล้ว')}
        onDelete={item => { setPendingDelete({ item, request: { action: 'DELETE_DRIVER', driverId: item.id, expectedRevision: Number(item.values.revision) }, success: 'ปิดใช้งานคนขับแล้ว' }); return Promise.resolve(); }} />

      <MasterSection title="ลูกค้า" busy={busy} items={customers}
        fields={[{ key: 'name', label: 'ชื่อลูกค้า', required: true }]}
        onSave={(v, id) => act(() => post({ action: 'UPSERT_CUSTOMER', customer: { customerId: id || undefined, name: v.name }, expectedRevision: id ? Number(v.revision) : 0 }), 'บันทึกลูกค้าแล้ว')}
        onDelete={item => { setPendingDelete({ item, request: { action: 'DELETE_CUSTOMER', customerId: item.id, expectedRevision: Number(item.values.revision) }, success: 'ปิดใช้งานลูกค้าแล้ว' }); return Promise.resolve(); }} />

      <div className={styles.panel}>
        <div className={styles.sectionHead}><h3>ชื่อกิจการ</h3></div>
        <div className={settings.formGroup}>
          <label className={settings.formLabel} htmlFor="tr-company">ชื่อกิจการรถสิบล้อ</label>
          <input id="tr-company" className={settings.formInput} value={company} maxLength={100} onChange={e => setCompany(e.target.value)} />
          <label className={settings.formLabel}>ที่อยู่กิจการ<textarea className={settings.formInput} value={address} onChange={e=>setAddress(e.target.value)} /></label>
          <label className={settings.formLabel}>โทรศัพท์<input className={settings.formInput} value={phone} onChange={e=>setPhone(e.target.value)} /></label>
          <label className={settings.formLabel}>เลขประจำตัวผู้เสียภาษี<input className={settings.formInput} value={taxId} onChange={e=>setTaxId(e.target.value)} /></label>
        </div>
        <button type="button" className={settings.primaryBtn} disabled={busy || !company.trim()}
          onClick={() => act(async () => { await post({ action: 'UPDATE_PROFILE', companyName: company,address,phone,taxId, expectedRevision: boot.truckProfile.revision }); }, 'บันทึกข้อมูลกิจการแล้ว').catch(() => undefined)}>
          บันทึกชื่อกิจการ
        </button>
      </div>

      <LineSettings />

      <div className={styles.panel}>
        <div className={styles.sectionHead}><h3>สำรองและกู้คืนข้อมูล</h3></div>
        <div style={{ display: 'grid', gap: '.6rem' }}>
          <button type="button" className={settings.secondaryBtn} onClick={backup} disabled={busy}>ดาวน์โหลดไฟล์สำรอง (JSON)</button>
          <p className={styles.hint}>กู้คืนข้อมูลผ่านเครื่องมือของผู้ดูแล ตามคู่มือ TRUCK_MIGRATION_RUNBOOK.md เพื่อป้องกันการเขียนทับเอกสารการเงิน</p>
          <input ref={restoreRef} type="file" accept=".json,application/json" hidden onChange={e => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      {(pendingDelete || pendingRestore) && (
        <div data-app-dialog role="dialog" aria-modal="true" aria-label={pendingDelete ? 'ยืนยันการลบข้อมูล' : 'ยืนยันการกู้คืนข้อมูล'} tabIndex={-1}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 120 }}>
          <div style={{ width: 'min(28rem, 100%)', background: '#fff', borderRadius: 'var(--team-radius-card)', border: '1px solid var(--team-border)', padding: '1.2rem' }}>
            <h3 style={{ margin: '0 0 .7rem', color: 'var(--team-primary-dark)' }}>{pendingDelete ? 'ยืนยันการลบข้อมูล' : 'ยืนยันการกู้คืนข้อมูล'}</h3>
            <p style={{ margin: '0 0 1rem', color: 'var(--team-text)' }}>
              {pendingDelete
                ? `ต้องการลบ "${pendingDelete.item.title}" ใช่หรือไม่`
                : 'การกู้คืนจะเขียนทับข้อมูลที่มีรหัสเดียวกันในคลังข้อมูล ต้องการดำเนินการต่อหรือไม่'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.6rem' }}>
              <button type="button" className={settings.secondaryBtn} onClick={() => { setPendingDelete(null); setPendingRestore(null); }}>ยกเลิก</button>
              <button type="button" className={settings.primaryBtn} onClick={() => { if (pendingDelete) { void confirmDeleteAction(); } else { void confirmRestoreAction(); } }}>ยืนยัน</button>
            </div>
          </div>
        </div>
      )}

      <div role={msg?.err ? 'alert' : 'status'} className={msg?.err ? styles.error : styles.ok}>{msg?.text}</div>
    </div>
  );
}
