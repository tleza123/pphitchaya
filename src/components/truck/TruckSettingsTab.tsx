'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
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

function MasterSection({ active, title, fields, items, busy, onSave, onDelete, autoRoutes = false }: {
  active: boolean; title: string; fields: Field[]; items: Item[]; busy: boolean; autoRoutes?: boolean;
  onSave: (values: Record<string, string>, id: string | null) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const customerOptions = fields.find(field => field.key === 'customerId')?.options;
  const matching = autoRoutes ? items.filter(item => (customerFilter === 'all' || item.values.customerId === customerFilter) && `${item.title} ${item.sub || ''}`.toLowerCase().includes(search.toLowerCase().trim())) : items;

  const [editing, setEditing] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dialogId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const close = () => { if (!busy && !savingRef.current) setEditing(null); };
  useModalInteraction(active && Boolean(editing), close);
  useEffect(() => {
    if (!active) setEditing(null);
    else if (editing) formRef.current?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true });
  }, [active, editing]);
  useEffect(() => {
    if (customerFilter !== 'all' && !customerOptions?.some(option => option.value === customerFilter)) setCustomerFilter('all');
  }, [customerFilter, customerOptions]);
  const [values, setValues] = useState<Record<string, string>>({});
  const open = (item?: Item) => { setEditing(item ? item.id : 'new'); setValues(item ? item.values : {}); setFormError(''); setNotice(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || savingRef.current) return;
    savingRef.current = true; setSaving(true); setFormError('');
    try {
      await onSave(values, editing === 'new' ? null : editing);
      setNotice(editing === 'new' ? 'เพิ่มข้อมูลเรียบร้อยแล้ว' : 'บันทึกการแก้ไขเรียบร้อยแล้ว'); setEditing(null);
    } catch (error) { setFormError(errMsg(error)); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const renderItem = (item: Item) => (
        <div className={styles.item} key={item.id}>
          <div className={styles.itemText}>
            <strong>{item.title}</strong>
            {item.sub && <span>{item.sub}</span>}
            {item.flag && <div className={styles.suspended}>{item.flag}</div>}
          </div>
          <div className={styles.itemActions}>
            <button type="button" className={styles.iconBtn} onClick={() => open(item)} disabled={busy} aria-label={`แก้ไข ${item.title}`}><Pencil size={18} aria-hidden="true" />{autoRoutes ? 'กรอกราคา' : null}</button>
            {item.values.generated !== 'true' && <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(item)} disabled={busy} aria-label={`ลบ ${item.title}`}><Trash2 size={18} aria-hidden="true" /></button>}
          </div>
        </div>
  );

  return (
    <div className={styles.panel}>
      <div className={styles.sectionHead}>
        <h3>{title}</h3>
        {!autoRoutes && <button type="button" className={styles.iconBtn} onClick={() => open()} disabled={busy}><Plus size={18} aria-hidden="true" /> เพิ่ม</button>}
      </div>
      {notice && <p className={styles.ok} role="status">{notice}</p>}
      {!autoRoutes && items.length === 0 && <p className={styles.empty}>ยังไม่มีข้อมูล</p>}
      {autoRoutes && <><p className={styles.hint}>เชื่อมทุกจุดทั้งขาไปและขากลับ เว้นราคาไว้ให้กรอกเอง{customerOptions ? ' แยกตามลูกค้าแต่ละราย' : ''} · {items.length} รายการ</p>
        <div className={styles.row2}>
          {customerOptions && <label className={settings.formLabel}>ลูกค้าที่ต้องการกำหนดราคา<select className={settings.formInput} value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}><option value="all">ลูกค้าทุกคน</option>{customerOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
          <label className={settings.formLabel}>ค้นหาเส้นทาง<input className={settings.formInput} type="search" aria-label={`ค้นหา${title}`} placeholder="ค้นหาจุดรับ–ส่งหรือลูกค้า" value={search} onChange={e => setSearch(e.target.value)} /></label>
        </div></>}
      {autoRoutes ? <div className={styles.routeGroups} aria-label={`หมวด${title}`}>
        {[...new Set(matching.map(item => item.values.originId))].map(originId => {
          const routes = matching.filter(item => item.values.originId === originId);
          const label = fields.find(field => field.key === 'originId')?.options?.find(option => option.value === originId)?.label || originId;
          return <details key={originId} className={styles.routeGroup} open={search.trim() ? true : undefined}><summary>{label} · {routes.length} เส้นทาง</summary><div className={styles.routeGroupItems}>{routes.map(renderItem)}</div></details>;
        })}
        {matching.length === 0 && <p className={styles.empty}>{customerOptions?.length === 0 ? 'เพิ่มลูกค้าก่อน ระบบจะเชื่อมเส้นทางทุกคู่ให้อัตโนมัติ' : 'ไม่พบเส้นทางที่ค้นหา'}</p>}
      </div> : items.map(renderItem)}
      {active && editing && (
        <div className={reports.modalOverlay}>
        <form ref={formRef} className={`${reports.modalCard} ${styles.masterDialog}`} onSubmit={submit} data-app-dialog role="dialog" aria-modal="true" aria-labelledby={dialogId} tabIndex={-1} aria-busy={saving}>
          <div className={styles.sectionHead}><h3 id={dialogId}>{editing === 'new' ? 'เพิ่ม' : autoRoutes ? 'กำหนด' : 'แก้ไข'}{title}</h3><button type="button" className={styles.iconBtn} aria-label={`ปิดฟอร์ม${title}`} disabled={busy || saving} onClick={close}><X size={18} aria-hidden="true" /></button></div>
          <fieldset disabled={busy || saving} className={styles.masterFields}>
          {fields.map(f => (
            <div className={settings.formGroup} key={f.key}>
              {f.kind === 'check' ? (
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={values[f.key] === 'true'} onChange={e => setValues(v => ({ ...v, [f.key]: String(e.target.checked) }))} /> {f.label}
                </label>
              ) : (
                <>
                  <label className={settings.formLabel} htmlFor={`ms-${title}-${f.key}`}>{f.label}</label>
                  {f.kind === 'select' ? <select id={`ms-${title}-${f.key}`} required={f.required} disabled={autoRoutes} className={settings.formInput} value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}><option value="">เลือก{f.label}</option>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input id={`ms-${title}-${f.key}`} required={f.required} inputMode={f.kind === 'money' ? 'decimal' : undefined} className={settings.formInput}
                    value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />}
                </>
              )}
            </div>
          ))}
          {title.startsWith('ราคา') && values.originId && values.destinationId && <p>เส้นทาง: {fields.find(f=>f.key==='originId')?.options?.find(o=>o.value===values.originId)?.label} → {fields.find(f=>f.key==='destinationId')?.options?.find(o=>o.value===values.destinationId)?.label} · {values.billing || values.pay || 'ยังไม่ระบุ'} บาท</p>}
          {formError && <p className={styles.error} role="alert">{formError}</p>}
          <div className={styles.masterActions}>
            <button type="button" className={settings.secondaryBtn} onClick={close}>ยกเลิก</button>
            <button type="submit" className={settings.primaryBtn} aria-busy={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
          </div>
          </fieldset>
        </form>
        </div>
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

  const truckDriversList: Item[] = boot.trucks.map(t => {
    const d = (boot.truckDrivers || []).find(driver => (t.driverId && driver.driverId === t.driverId) || (t.driverName && driver.name === t.driverName));
    const wageSatang = d?.baseWageSatang ?? (t.baseWageSatang ?? 30000);
    return {
      id: t.truckId,
      title: t.plateNumber,
      sub: `${t.driverName ? `คนขับ: ${t.driverName}` : 'ไม่ระบุคนขับ'} · ค่าแรงฐาน ${formatMoney(wageSatang)} บาท/วัน`,
      flag: t.status === 'SUSPENDED' ? 'พักรถ' : undefined,
      values: {
        plateNumber: t.plateNumber,
        driverName: t.driverName || '',
        base: String(wageSatang / 100),
        suspended: String(t.status === 'SUSPENDED')
      }
    };
  });
  const origins: Item[] = boot.truckOrigins.map(o => ({ id: o.originId, title: o.name, values: { name: o.name } }));
  const dests: Item[] = boot.truckDestinations.map(d => ({
    id: d.destinationId, title: d.name, sub: `ค่าเที่ยวคนขับ ${formatMoney(d.driverPaySatang)} บาท`,
    values: { name: d.name, pay: satangToDecimalString(d.driverPaySatang) }
  }));
  const customers: Item[] = ((boot as any).truckCustomers || []).filter((d:any) => d.status !== 'SUSPENDED').map((d: any) => ({ id: d.customerId, title: d.name, values: { name: d.name, revision: String(d.revision) } }));
  const locations: Item[] = ((boot as any).truckLocations || []).filter((d:any) => d.status !== 'SUSPENDED').map((d:any) => ({id:d.locationId,title:`${d.code}. ${d.name}`,values:{code:d.code,name:d.name,detail:d.detail||'',isShop:String(d.isShop === true),revision:String(d.revision)}}));
  const tariffs: Item[] = ((boot as any).truckTariffs || []).filter((d:any) => d.status !== 'SUSPENDED').map((d:any) => ({id:d.tariffId,title:`${locations.find(x=>x.id===d.originId)?.title || d.originId} → ${locations.find(x=>x.id===d.destinationId)?.title || d.destinationId}`,sub:d.customerId ? `${customers.find(x=>x.id===d.customerId)?.title || d.customerId}: ${d.customerRateSatang == null ? 'ยังไม่ได้ตั้งราคา' : formatMoney(d.customerRateSatang)+' บาท'}` : (d.driverPaySatang == null ? 'ยังไม่ได้ตั้งราคา' : `ค่าเที่ยว ${formatMoney(d.driverPaySatang)} บาท`),values:{generated:String(d.generated === true),originId:d.originId,destinationId:d.destinationId,customerId:d.customerId||'',pay:d.driverPaySatang == null ? '' : satangToDecimalString(d.driverPaySatang),billing:d.customerRateSatang==null?'':satangToDecimalString(d.customerRateSatang),revision:String(d.revision)}}));

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

      <MasterSection active={active} title="จุดรับ–ส่ง" busy={busy} items={locations}
        fields={[{key:'code',label:'รหัสจุด เช่น A',required:true},{key:'name',label:'ชื่อสถานที่',required:true},{key:'detail',label:'ที่อยู่หรือรายละเอียด'},{key:'isShop',label:'ร้านค้า (ไม่เรียกเก็บลูกค้าและไม่ระบุน้ำหนัก)',kind:'check'}]}
        onSave={(v,id)=>act(()=>post({action:'UPSERT_LOCATION',location:{id:id||undefined,code:v.code,name:v.name,detail:v.detail,isShop:v.isShop==='true'},expectedRevision:id?Number(v.revision):0}),'บันทึกจุดแล้ว')}
        onDelete={item=>{setPendingDelete({item,request:{action:'DISABLE_LOCATION',id:item.id,expectedRevision:Number(item.values.revision)},success:'ปิดใช้งานจุดแล้ว'});return Promise.resolve();}} />
      <MasterSection active={active} title="ราคาค่าเที่ยวคนขับ" autoRoutes busy={busy} items={tariffs.filter(t=>!t.values.customerId)}
        fields={[{key:'originId',label:'ต้นทาง',kind:'select',required:true,options:locations.map(l=>({value:l.id,label:l.title}))},{key:'destinationId',label:'ปลายทาง',kind:'select',required:true,options:locations.map(l=>({value:l.id,label:l.title}))},{key:'pay',label:'ค่าเที่ยวคนขับ (บาท)',kind:'money',required:true}]}
        onSave={(v,id)=>act(()=>post({action:'UPSERT_TARIFF',tariff:{id:v.generated === 'true' ? undefined : id||undefined,originId:v.originId,destinationId:v.destinationId,customerId:null,driverPaySatang:baht(v.pay)},expectedRevision:id?Number(v.revision):0}),'บันทึกราคาแล้ว')}
        onDelete={item=>{setPendingDelete({item,request:{action:'DISABLE_TARIFF',id:item.id,expectedRevision:Number(item.values.revision)},success:'ปิดใช้งานราคาแล้ว'});return Promise.resolve();}} />
      <MasterSection active={active} title="ราคาขนส่งลูกค้าต่อเที่ยว" autoRoutes busy={busy} items={tariffs.filter(t=>!!t.values.customerId)}
        fields={[{key:'customerId',label:'ลูกค้า',kind:'select',required:true,options:customers.map(c=>({value:c.id,label:c.title}))},{key:'originId',label:'ต้นทาง',kind:'select',required:true,options:locations.map(l=>({value:l.id,label:l.title}))},{key:'destinationId',label:'ปลายทาง',kind:'select',required:true,options:locations.map(l=>({value:l.id,label:l.title}))},{key:'billing',label:'ราคาขนส่งต่อเที่ยว (บาท)',kind:'money',required:true}]}
        onSave={(v,id)=>act(()=>post({action:'UPSERT_TARIFF',tariff:{id:v.generated === 'true' ? undefined : id||undefined,originId:v.originId,destinationId:v.destinationId,customerId:v.customerId,customerRateSatang:baht(v.billing)},expectedRevision:id?Number(v.revision):0}),'บันทึกราคาแล้ว')}
        onDelete={item=>{setPendingDelete({item,request:{action:'DISABLE_TARIFF',id:item.id,expectedRevision:Number(item.values.revision)},success:'ปิดใช้งานราคาแล้ว'});return Promise.resolve();}} />

      <MasterSection active={active} title="รถและคนขับประจำรถ" busy={busy} items={truckDriversList}
        fields={[
          { key: 'plateNumber', label: 'ทะเบียนรถ', required: true },
          { key: 'driverName', label: 'ชื่อคนขับ', required: true },
          { key: 'base', label: 'ค่าแรงฐานต่อวัน (บาท)', kind: 'money', required: true },
          { key: 'suspended', label: 'พักรถชั่วคราว', kind: 'check' }
        ]}
        onSave={(v, id) => act(() => post({
          action: 'UPSERT_TRUCK',
          truck: {
            truckId: id ?? undefined,
            plateNumber: v.plateNumber.trim(),
            driverName: v.driverName.trim(),
            baseWageSatang: baht(v.base || '300'),
            status: v.suspended === 'true' ? 'SUSPENDED' : 'ACTIVE'
          },
          expectedRevision: id ? boot.trucks.find(t => t.truckId === id)?.revision : undefined
        }), 'บันทึกข้อมูลรถและคนขับแล้ว')}
        onDelete={item => {
          setPendingDelete({
            item,
            request: { action: 'DELETE_TRUCK', truckId: item.id },
            success: 'ลบข้อมูลรถแล้ว'
          });
          return Promise.resolve();
        }} />

      <MasterSection active={active} title="ลูกค้า" busy={busy} items={customers}
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
