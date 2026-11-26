'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Download, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
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
      setNotice(editing === 'new' ? 'เพิ่มข้อมูลแล้ว' : 'บันทึกการแก้ไขแล้ว'); setEditing(null);
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
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(item)} disabled={busy} aria-label={`แก้ไข ${item.title}`}>
          <Pencil size={17} aria-hidden="true" />
          <span>{autoRoutes ? 'กรอกราคา' : 'แก้ไข'}</span>
        </button>
        {item.values.generated !== 'true' && (
          <button type="button" className="btn btn-danger btn-icon" onClick={() => onDelete(item)} disabled={busy} aria-label={`ลบ ${item.title}`}>
            <Trash2 size={17} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.panel}>
      <div className={styles.sectionHead}>
        <h3>{title}</h3>
        {!autoRoutes && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => open()} disabled={busy}>
            <Plus size={18} aria-hidden="true" />
            <span>เพิ่ม</span>
          </button>
        )}
      </div>
      {notice && <p className="app-notice app-notice-success" role="status" style={{ marginBottom: '0.75rem' }}>{notice}</p>}
      {!autoRoutes && items.length === 0 && <p className={styles.empty}>ยังไม่มีข้อมูล</p>}
      {autoRoutes && (
        <>
          <p className={styles.hint}>สร้างเส้นทางทั้งสองทิศให้อัตโนมัติ เลือกกรอกราคา{customerOptions ? 'แยกตามลูกค้า' : ''} · {items.length} เส้นทาง</p>
          <div className={styles.row2} style={{ marginTop: '0.75rem' }}>
            {customerOptions && (
              <label className={settings.formLabel}>
                เลือกลูกค้า
                <select className={settings.formInput} value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
                  <option value="all">ลูกค้าทุกราย</option>
                  {customerOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
            <label className={settings.formLabel}>
              ค้นหาเส้นทาง
              <input className={settings.formInput} type="search" aria-label={`ค้นหา${title}`} placeholder="ค้นหาจุดรับ-ส่งหรือลูกค้า" value={search} onChange={e => setSearch(e.target.value)} />
            </label>
          </div>
        </>
      )}
      {autoRoutes ? (
        <div className={styles.routeGroups} aria-label={`หมวด${title}`}>
          {[...new Set(matching.map(item => item.values.originId))].map(originId => {
            const routes = matching.filter(item => item.values.originId === originId);
            const label = fields.find(field => field.key === 'originId')?.options?.find(option => option.value === originId)?.label || originId;
            return (
              <details key={originId} className={styles.routeGroup} open={search.trim() ? true : undefined}>
                <summary>{label} · {routes.length} เส้นทาง</summary>
                <div className={styles.routeGroupItems}>{routes.map(renderItem)}</div>
              </details>
            );
          })}
          {matching.length === 0 && <p className={styles.empty}>{customerOptions?.length === 0 ? 'เพิ่มลูกค้าก่อน เพื่อสร้างรายการเส้นทางอัตโนมัติ' : 'ไม่พบเส้นทางที่ค้นหา'}</p>}
        </div>
      ) : items.map(renderItem)}

      {active && editing && (
        <div className="app-modal-overlay">
          <form ref={formRef} className={`app-modal-card ${styles.masterDialog}`} onSubmit={submit} data-app-dialog role="dialog" aria-modal="true" aria-labelledby={dialogId} tabIndex={-1} aria-busy={saving}>
            <div className={styles.sectionHead}>
              <h3 id={dialogId}>{editing === 'new' ? 'เพิ่ม' : autoRoutes ? 'กำหนด' : 'แก้ไข'}{title}</h3>
              <button type="button" className="btn btn-secondary btn-icon" aria-label={`ปิดฟอร์ม${title}`} disabled={busy || saving} onClick={close}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <fieldset disabled={busy || saving} className={styles.masterFields}>
              {fields.map(f => (
                <div className={settings.formGroup} key={f.key}>
                  {f.kind === 'check' ? (
                    <label className={styles.checkRow}>
                      <input type="checkbox" checked={values[f.key] === 'true'} onChange={e => setValues(v => ({ ...v, [f.key]: String(e.target.checked) }))} />
                      <span>{f.label}</span>
                    </label>
                  ) : (
                    <>
                      <label className={settings.formLabel} htmlFor={`ms-${title}-${f.key}`}>{f.label}</label>
                      {f.kind === 'select' ? (
                        <select id={`ms-${title}-${f.key}`} required={f.required} disabled={autoRoutes} className={settings.formInput} value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}>
                          <option value="">เลือก{f.label}</option>
                          {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input id={`ms-${title}-${f.key}`} required={f.required} inputMode={f.kind === 'money' ? 'decimal' : undefined} className={settings.formInput}
                          value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
                      )}
                    </>
                  )}
                </div>
              ))}
              {title.startsWith('ราคา') && values.originId && values.destinationId && (
                <p style={{ fontWeight: 700, color: 'var(--team-primary-dark)' }}>
                  เส้นทาง: {fields.find(f => f.key === 'originId')?.options?.find(o => o.value === values.originId)?.label} → {fields.find(f => f.key === 'destinationId')?.options?.find(o => o.value === values.destinationId)?.label} · {values.billing || values.pay || 'ยังไม่ระบุ'} บาท
                </p>
              )}
              {formError && <p className="app-notice app-notice-danger" role="alert">{formError}</p>}
              <div className="app-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary" aria-busy={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
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
  const [address, setAddress] = useState(boot.truckProfile.address || '');
  const [phone, setPhone] = useState(boot.truckProfile.phone || '');
  const [taxId, setTaxId] = useState(boot.truckProfile.taxId || '');
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
  const baht = (text: string) => { try { return moneySatang(text.trim()); } catch { throw new Error('กรอกจำนวนเงินเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'); } };

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
  const customers: Item[] = (boot.truckCustomers || []).filter(d => d.status !== 'SUSPENDED').map((d: any) => ({ id: d.customerId, title: d.name, values: { name: d.name, revision: String(d.revision) } }));
  const locations: Item[] = (boot.truckLocations || []).filter(d => d.status !== 'SUSPENDED').map((d: any) => ({ id: d.locationId, title: `${d.code}. ${d.name}`, values: { code: d.code, name: d.name, detail: d.detail || '', isShop: String(d.isShop === true), revision: String(d.revision) } }));
  const tariffs: Item[] = (boot.truckTariffs || []).filter(d => d.status !== 'SUSPENDED').map((d: any) => ({
    id: d.tariffId,
    title: `${locations.find(x => x.id === d.originId)?.title || d.originId} → ${locations.find(x => x.id === d.destinationId)?.title || d.destinationId}`,
    sub: d.customerId
      ? `${customers.find(x => x.id === d.customerId)?.title || d.customerId}: ${d.customerRateSatang == null ? 'ยังไม่ได้ตั้งราคา' : formatMoney(d.customerRateSatang) + ' บาท'}`
      : (d.driverPaySatang == null ? 'ยังไม่ได้ตั้งราคา' : `ค่าเที่ยว ${formatMoney(d.driverPaySatang)} บาท`),
    values: {
      generated: String(d.generated === true),
      originId: d.originId,
      destinationId: d.destinationId,
      customerId: d.customerId || '',
      pay: d.driverPaySatang == null ? '' : satangToDecimalString(d.driverPaySatang),
      billing: d.customerRateSatang == null ? '' : satangToDecimalString(d.customerRateSatang),
      revision: String(d.revision)
    }
  }));

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
    }, 'กู้คืนข้อมูลแล้ว').catch(() => undefined);
  };

  return (
    <div className={styles.stack} aria-busy={busy}>
      <h2 className={reports.title}>ตั้งค่าระบบรถสิบล้อ</h2>

      {msg?.text && (
        <div role={msg.err ? 'alert' : 'status'} className={msg.err ? 'app-notice app-notice-danger' : 'app-notice app-notice-success'} style={{ fontWeight: 700 }}>
          {msg.text}
        </div>
      )}

      <MasterSection active={active} title="จุดรับ-ส่ง" busy={busy} items={locations}
        fields={[{ key: 'code', label: 'รหัสจุด เช่น A', required: true }, { key: 'name', label: 'ชื่อสถานที่', required: true }, { key: 'detail', label: 'ที่อยู่หรือรายละเอียด' }, { key: 'isShop', label: 'ร้านค้า (ไม่เรียกเก็บลูกค้าและไม่ระบุน้ำหนัก)', kind: 'check' }]}
        onSave={(v, id) => act(() => post({ action: 'UPSERT_LOCATION', location: { id: id || undefined, code: v.code, name: v.name, detail: v.detail, isShop: v.isShop === 'true' }, expectedRevision: id ? Number(v.revision) : 0 }), 'บันทึกจุดแล้ว')}
        onDelete={item => { setPendingDelete({ item, request: { action: 'DISABLE_LOCATION', id: item.id, expectedRevision: Number(item.values.revision) }, success: 'ปิดใช้งานจุดแล้ว' }); return Promise.resolve(); }} />

      <MasterSection active={active} title="ราคาค่าเที่ยวคนขับ" autoRoutes busy={busy} items={tariffs.filter(t => !t.values.customerId)}
        fields={[{ key: 'originId', label: 'ต้นทาง', kind: 'select', required: true, options: locations.map(l => ({ value: l.id, label: l.title })) }, { key: 'destinationId', label: 'ปลายทาง', kind: 'select', required: true, options: locations.map(l => ({ value: l.id, label: l.title })) }, { key: 'pay', label: 'ค่าเที่ยวคนขับ (บาท)', kind: 'money', required: true }]}
        onSave={(v, id) => act(() => post({ action: 'UPSERT_TARIFF', tariff: { id: v.generated === 'true' ? undefined : id || undefined, originId: v.originId, destinationId: v.destinationId, customerId: null, driverPaySatang: baht(v.pay) }, expectedRevision: id ? Number(v.revision) : 0 }), 'บันทึกราคาแล้ว')}
        onDelete={item => { setPendingDelete({ item, request: { action: 'DISABLE_TARIFF', id: item.id, expectedRevision: Number(item.values.revision) }, success: 'ปิดใช้งานราคาแล้ว' }); return Promise.resolve(); }} />

      <MasterSection active={active} title="ราคาขนส่งต่อเที่ยวสำหรับลูกค้า" autoRoutes busy={busy} items={tariffs.filter(t => !!t.values.customerId)}
        fields={[{ key: 'customerId', label: 'ลูกค้า', kind: 'select', required: true, options: customers.map(c => ({ value: c.id, label: c.title })) }, { key: 'originId', label: 'ต้นทาง', kind: 'select', required: true, options: locations.map(l => ({ value: l.id, label: l.title })) }, { key: 'destinationId', label: 'ปลายทาง', kind: 'select', required: true, options: locations.map(l => ({ value: l.id, label: l.title })) }, { key: 'billing', label: 'ราคาขนส่งต่อเที่ยว (บาท)', kind: 'money', required: true }]}
        onSave={(v, id) => act(() => post({ action: 'UPSERT_TARIFF', tariff: { id: v.generated === 'true' ? undefined : id || undefined, originId: v.originId, destinationId: v.destinationId, customerId: v.customerId, customerRateSatang: baht(v.billing) }, expectedRevision: id ? Number(v.revision) : 0 }), 'บันทึกราคาแล้ว')}
        onDelete={item => { setPendingDelete({ item, request: { action: 'DISABLE_TARIFF', id: item.id, expectedRevision: Number(item.values.revision) }, success: 'ปิดใช้งานราคาแล้ว' }); return Promise.resolve(); }} />

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
        <div className={styles.sectionHead}><h3>ข้อมูลกิจการ</h3></div>
        <div className={settings.formGroup}>
          <label className={settings.formLabel} htmlFor="tr-company">ชื่อกิจการรถสิบล้อ</label>
          <input id="tr-company" className={settings.formInput} value={company} maxLength={100} onChange={e => setCompany(e.target.value)} />
        </div>
        <div className={settings.formGroup}>
          <label className={settings.formLabel} htmlFor="tr-address">ที่อยู่กิจการ</label>
          <textarea id="tr-address" className={settings.formTextarea} value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <div className={styles.row2}>
          <div className={settings.formGroup}>
            <label className={settings.formLabel} htmlFor="tr-phone">โทรศัพท์</label>
            <input id="tr-phone" className={settings.formInput} value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className={settings.formGroup}>
            <label className={settings.formLabel} htmlFor="tr-taxid">เลขประจำตัวผู้เสียภาษี</label>
            <input id="tr-taxid" className={settings.formInput} value={taxId} onChange={e => setTaxId(e.target.value)} />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || !company.trim()}
          onClick={() => act(async () => { await post({ action: 'UPDATE_PROFILE', companyName: company, address, phone, taxId, expectedRevision: boot.truckProfile.revision }); }, 'บันทึกข้อมูลกิจการแล้ว').catch(() => undefined)}
        >
          <Save size={20} aria-hidden="true" />
          <span>บันทึกข้อมูลกิจการ</span>
        </button>
      </div>

      <LineSettings />

      <div className={styles.panel}>
        <div className={styles.sectionHead}><h3>สำรองข้อมูล</h3></div>
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <button type="button" className="btn btn-secondary btn-block" onClick={backup} disabled={busy}>
            <Download size={20} aria-hidden="true" />
            <span>ดาวน์โหลดไฟล์สำรอง (JSON)</span>
          </button>
          <p className={styles.hint}>การกู้คืนทำผ่านคำสั่งผู้ดูแล (ตามคู่มือ TRUCK_MIGRATION_RUNBOOK.md) เพื่อป้องกันเขียนทับเอกสารการเงิน</p>
          <input ref={restoreRef} type="file" accept=".json,application/json" hidden onChange={e => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      {(pendingDelete || pendingRestore) && (
        <div className="app-modal-overlay">
          <div
            className="app-modal-card"
            data-app-dialog
            role="dialog"
            aria-modal="true"
            aria-label={pendingDelete ? 'ยืนยันการลบข้อมูล' : 'ยืนยันการกู้คืนข้อมูล'}
            tabIndex={-1}
          >
            <h3 className={`app-modal-title ${pendingDelete ? 'app-modal-title-danger' : 'app-modal-title-warning'}`}>
              {pendingDelete ? 'ยืนยันการลบข้อมูล' : 'ยืนยันการกู้คืนข้อมูล'}
            </h3>
            <p className="app-modal-desc">
              {pendingDelete
                ? `ต้องการลบ "${pendingDelete.item.title}" หรือไม่`
                : 'การกู้คืนจะเขียนทับข้อมูลที่มีรหัสเดียวกัน ต้องการดำเนินการต่อหรือไม่'}
            </p>
            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setPendingDelete(null); setPendingRestore(null); }}>ยกเลิก</button>
              <button
                type="button"
                className={`btn ${pendingDelete ? 'btn-danger-solid' : 'btn-warning-solid'}`}
                onClick={() => { if (pendingDelete) { void confirmDeleteAction(); } else { void confirmRestoreAction(); } }}
              >
                {pendingDelete ? 'ยืนยันลบ' : 'ยืนยันกู้คืน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
