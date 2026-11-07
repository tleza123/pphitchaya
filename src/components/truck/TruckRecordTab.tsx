'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import settings from '@/components/settings/settings.module.css';
import { LineSendButton } from '@/components/shared/LineSendButton';
import { MutationIntent } from '@/lib/client/mutation-intent';
import { optionalMoney } from '@/lib/client/form-money';
import { formatMoney, satangToDecimalString } from '@/lib/payroll/money';
import { formatThaiDate } from '@/lib/payroll/dates';
import { TruckPhotoMeta, TruckTripItem } from '@/lib/truck/types';
import { parseTonsToKg, formatWeightTons } from '@/lib/truck/weight';
import { needsLegacyPricingReview } from '@/lib/truck/pricing';
import { errMsg, getJson, sendJson } from './api';
import type { TruckBoot } from './TruckShell';
import styles from './truck.module.css';

interface TripForm { tripId: string; fromLocation: string; originId: string; destinationMode: string; paySatang: number | null; note: string; departureDate: string; arrivalDate: string; billing: string; weight: string; customer: string; customerId:string; billable:boolean; cancelled:boolean }

const blankTrip = (from: string): TripForm => ({ tripId: '', fromLocation: from, originId: '', destinationMode: '', paySatang: null, note: '', departureDate: '', arrivalDate: '', billing: '', weight: '', customer: '', customerId:'', billable:true, cancelled:false });

function money(text: string, label: string): number {
  try { return optionalMoney(text); } catch { throw new Error(`${label}: จำนวนเงินไม่ถูกต้อง ใช้ทศนิยมไม่เกิน 2 ตำแหน่ง`); }
}

interface Props {
  active: boolean;
  boot: TruckBoot;
  editTarget: { dateKey: string; truckId: string; nonce: number } | null;
  onSaved: () => void;
}

export function TruckRecordTab({ active, boot, editTarget, onSaved }: Props) {
  const [date, setDate] = useState(boot.serverToday);
  const [truckId, setTruckId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [trips, setTrips] = useState<TripForm[]>([blankTrip('')]);
  const [photos, setPhotos] = useState<TruckPhotoMeta[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [legacyFeeReviewRequired, setLegacyFeeReviewRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ err: boolean; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const intent = useRef(new MutationIntent());
  const bootRef = useRef(boot);
  bootRef.current = boot;

  // Default to the first active truck once the master data arrives.
  useEffect(() => {
    if (!truckId && boot.trucks.length) setTruckId((boot.trucks.find(t => t.status === 'ACTIVE') || boot.trucks[0]).truckId);
  }, [boot.trucks, truckId]);

  // "Edit" from the reports tab jumps here with a specific day and truck.
  useEffect(() => {
    if (editTarget) { setDate(editTarget.dateKey); setTruckId(editTarget.truckId); setReloadKey(k => k + 1); }
  }, [editTarget]);

  // Selecting a day + truck that already has a sheet loads it, so saving updates it in place.
  useEffect(() => {
    if (!active || !truckId || !date) return;
    let stale = false;
    setLoading(true);
    setMsg(null);
    getJson(`/api/truck/records?date=${date}&truckId=${encodeURIComponent(truckId)}`)
      .then(d => {
        if (stale) return;
        const b = bootRef.current;
        const rec = d.records?.[0];
        setDriverId(rec?.driverId || '');
        if (!rec) {
          setTrips([blankTrip(b.truckOrigins[0]?.name || '')]);
          setPhotos([]); setRevision(0); setLegacyFeeReviewRequired(false);
          return;
        }
        setLegacyFeeReviewRequired((rec.trips as TruckTripItem[]).some(needsLegacyPricingReview));
        setTrips((rec.trips as TruckTripItem[]).map(t => {
          return {
            ...blankTrip(t.fromLocation), weight:t.weightKg == null ? '' : formatWeightTons(t.weightKg), billable:t.billable!==false, cancelled:t.status==='CANCELLED',
            tripId: t.tripId || '', fromLocation: t.fromLocation, originId: t.originId || '', destinationMode: t.originId && t.destinationId ? `LOC_${t.destinationId}` : '',
            paySatang: t.driverPaySatang ?? null, note: t.note || '', departureDate: t.departureDate || (t.departedAt ? new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.departedAt)) : date), arrivalDate: t.arrivalDate || (t.arrivedAt ? new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.arrivedAt)) : ''), billing: t.billingSatang == null ? '' : satangToDecimalString(t.billingSatang), customer: t.customerName || '', customerId:t.customerId || ''
          };
        }));
        setPhotos(rec.photos || []);
        setRevision(rec.revision);
      })
      .catch(e => { if (!stale) setMsg({ err: true, text: errMsg(e) }); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [active, date, truckId, reloadKey]);

  const patchTrip = (i: number, patch: Partial<TripForm>) => setTrips(ts => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const pickDestination = (i: number, mode: string) => {
    if (mode.startsWith('LOC_')) { const rates=boot.truckTariffs?.filter(x=>x.status==='ACTIVE' && x.originId===trips[i].originId && x.destinationId===mode.slice(4)) || []; const tariff=rates.find(x=>!x.customerId); const customerRate=rates.find(x=>x.customerId && x.customerId===trips[i].customerId); patchTrip(i, { destinationMode:mode, paySatang:tariff?.driverPaySatang ?? null, billing: customerRate?.customerRateSatang == null ? '' : satangToDecimalString(customerRate.customerRateSatang) }); return; }
    const dest = boot.truckDestinations.find(d => `DEST_${d.destinationId}` === mode);
    patchTrip(i, { destinationMode: mode, paySatang: dest?.driverPaySatang ?? null });
  };
  const totalPay = trips.every(t => t.paySatang != null) ? trips.reduce((s, t) => s + (t.paySatang ?? 0), 0) : null;

  const save = async () => {
    if (saving) return;
    setMsg(null);
    try {
      if (!truckId) throw new Error('กรุณาเลือกรถสิบล้อ');
      if (!driverId) throw new Error('กรุณาเลือกคนขับ');
      const items: TruckTripItem[] = trips.map((t, i) => {
        const label = `เที่ยวที่ ${i + 1}`;
        if (!t.destinationMode) throw new Error(`${label}: กรุณาเลือกปลายทาง`);
        const loc = t.destinationMode.startsWith('LOC_') ? boot.truckLocations?.find(d => d.locationId === t.destinationMode.slice(4)) : undefined;
        if (!loc) throw new Error(`${label}: กรุณาเลือกปลายทางจากจุดที่ตั้งไว้`);
        return {
          ...(t.tripId ? {tripId:t.tripId} : {}), tripIndex: i + 1, fromLocation: t.fromLocation.trim(), destinationMode: t.destinationMode,
          originId: t.originId || null, destinationId: loc.locationId, destinationName: `${loc.code} — ${loc.name}`,
          pricingVersion: 3, billingPricingMode: 'PER_TRIP', weightKg: parseTonsToKg(t.weight), note: t.note.trim(), departureDate: t.departureDate || date, arrivalDate: t.arrivalDate || null, status: t.cancelled ? 'CANCELLED' : t.arrivalDate ? 'COMPLETED' : 'OPEN', customerId:t.customerId || null, customerName: t.customer.trim(), billable:t.billable, billingSatang: t.billable ? (t.billing.trim() ? money(t.billing, label) : null) : null
        };
      });
      const payload = { dateKey: date, truckId, driverId, trips: items, fuelCostSatang: 0, photos, expectedRevision: revision };
      setSaving(true);
      const rec = await sendJson('/api/truck/records', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setRevision(rec.revision);
      setTrips(current => current.map((trip, i) => ({ ...trip, tripId: rec.trips?.[i]?.tripId || trip.tripId, paySatang: rec.trips?.[i]?.driverPaySatang ?? null, billing: rec.trips?.[i]?.billingSatang == null ? '' : satangToDecimalString(rec.trips[i].billingSatang) })));
      setPhotos(rec.photos || []);
      setMsg({ err: false, text: 'บันทึกใบงานเรียบร้อยแล้ว' });
      onSaved();
    } catch (e) {
      setMsg({ err: true, text: e instanceof Error && e.message === 'INVALID_WEIGHT' ? 'น้ำหนักต้องไม่ติดลบและมีทศนิยมไม่เกิน 3 ตำแหน่ง' : errMsg(e) });
    } finally {
      setSaving(false);
    }
  };

  if (!boot.trucks.length) {
    return <div className={styles.panel}><p className={styles.empty}>ยังไม่มีข้อมูลรถ กรุณาเพิ่มรถสิบล้อในแท็บตั้งค่าก่อน</p></div>;
  }

  return (
    <div className={styles.stack} aria-busy={loading}>
      <fieldset disabled={saving || loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className={styles.panel}>
        <div className={styles.row2}>
          <div className={settings.formGroup}>
            <label className={settings.formLabel} htmlFor="tr-date">วันที่</label>
            <div className={styles.dateRow}>
              <input id="tr-date" type="date" className={settings.formInput} value={date} onChange={e => e.target.value && setDate(e.target.value)} />
              <button type="button" className={styles.iconBtn} onClick={() => setDate(boot.serverToday)}>วันนี้</button>
            </div>
            <p className={styles.hint}>{formatThaiDate(date)} · รอบค่าเที่ยวตามวันเริ่มเดินทาง {date.slice(0, 7)}</p>
          </div>
          <div className={settings.formGroup}>
            <label className={settings.formLabel} htmlFor="tr-truck">รถสิบล้อ</label>
            <select id="tr-truck" className={settings.formInput} value={truckId} onChange={e => setTruckId(e.target.value)}>
              {boot.trucks.map(t => (
                <option key={t.truckId} value={t.truckId}>{t.plateNumber}{t.driverName ? ` (${t.driverName})` : ''}{t.status === 'SUSPENDED' ? ' - พักรถ' : ''}</option>
              ))}
            </select>
          </div>
        </div>
        {revision > 0 && <div className={styles.editing} role="status">กำลังแก้ไขใบงานที่บันทึกไว้ของวันนี้ แก้ไขหรือเพิ่มเที่ยววิ่งแล้วกดบันทึกเพื่อทับข้อมูลเดิม</div>}
        {legacyFeeReviewRequired && <div className={styles.error} role="alert">ใบงานนี้ยังไม่ผ่านการตรวจราคาแบบใหม่ ต้องตรวจข้อมูลเดิมก่อนแก้ไขหรือออกเอกสาร <a href="/truck/review">ไปหน้าตรวจข้อมูลเก่า</a></div>}
        <div className={settings.formGroup}><label className={settings.formLabel} htmlFor="tr-driver">คนขับ</label><select id="tr-driver" className={settings.formInput} value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">เลือกคนขับ</option>{boot.truckDrivers?.filter(d=>d.status==='ACTIVE').map(d=><option key={d.driverId} value={d.driverId}>{d.name}</option>)}</select></div>
      </div>

      <div className={styles.panel}>
        <datalist id="tr-origins">{boot.truckOrigins.map(o => <option key={o.originId} value={o.name} />)}</datalist>
        {trips.map((t, i) => (
          <div className={styles.trip} key={i}>
            <div className={styles.tripHead}>
              <span>เที่ยวที่ {i + 1}</span>
              <label><input type="checkbox" checked={t.cancelled} onChange={e=>patchTrip(i,{cancelled:e.target.checked})} /> ยกเลิกเที่ยว</label>
              {trips.length > 1 && (
                <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => setTrips(ts => ts.filter((_, j) => j !== i))} aria-label={`ลบเที่ยวที่ ${i + 1}`}>
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className={styles.row2}>
              <div className={settings.formGroup}>
                <label className={settings.formLabel} htmlFor={`tr-from-${i}`}>ต้นทาง</label>
                <select id={`tr-from-${i}`} className={settings.formInput} value={t.originId} onChange={e => { const l=boot.truckLocations?.find(x=>x.locationId===e.target.value); patchTrip(i,{originId:e.target.value,fromLocation:l?`${l.code} — ${l.name}`:'', destinationMode:'',paySatang:null,billing:''}); }}><option value="">เลือกต้นทาง</option>{boot.truckLocations?.filter(x=>x.status==='ACTIVE').map(l=><option key={l.locationId} value={l.locationId}>{l.code} — {l.name}</option>)}</select>
              </div>
              <div className={settings.formGroup}>
                <label className={settings.formLabel} htmlFor={`tr-dest-${i}`}>ปลายทาง</label>
                <select id={`tr-dest-${i}`} className={settings.formInput} value={t.destinationMode} onChange={e => pickDestination(i, e.target.value)}>
                  <option value="" disabled>เลือกปลายทาง</option>
                  {boot.truckLocations?.filter(x=>x.status==='ACTIVE' && x.locationId!==t.originId).map(l=><option key={l.locationId} value={`LOC_${l.locationId}`}>{l.code} — {l.name}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.row2}>
              <div className={settings.formGroup}><label className={settings.formLabel} htmlFor={`tr-departure-${i}`}>วันที่ออก</label><input id={`tr-departure-${i}`} type="date" className={settings.formInput} value={t.departureDate || date} onChange={e => patchTrip(i, { departureDate: e.target.value })} /></div>
              <div className={settings.formGroup}><label className={settings.formLabel} htmlFor={`tr-arrival-${i}`}>วันที่ถึง (เว้นว่างถ้ายังค้าง)</label><input id={`tr-arrival-${i}`} type="date" className={settings.formInput} value={t.arrivalDate} onChange={e => patchTrip(i, { arrivalDate: e.target.value })} /></div>
            </div>
            <p className={styles.hint}>รอบค่าเที่ยว: {(t.departureDate || date).slice(0,7)} — ตามวันที่ออก</p>
            <label><input type="checkbox" checked={t.billable} onChange={e=>patchTrip(i,{billable:e.target.checked})} /> เรียกเก็บลูกค้า (ปิดสำหรับเที่ยวกลับอู่/รถเปล่า)</label>
            <div className={settings.formGroup}><label className={settings.formLabel} htmlFor={`tr-customer-${i}`}>ลูกค้า</label><select id={`tr-customer-${i}`} className={settings.formInput} value={t.customerId} onChange={e => {const c=boot.truckCustomers?.find(x=>x.customerId===e.target.value); const rate=boot.truckTariffs?.find(x=>x.status==='ACTIVE' && x.originId===t.originId && `LOC_${x.destinationId}`===t.destinationMode && x.customerId===e.target.value); patchTrip(i,{customerId:e.target.value,customer:c?.name||'',billing:rate?.customerRateSatang == null ? '' : satangToDecimalString(rate.customerRateSatang)});}}><option value="">ไม่เรียกเก็บลูกค้า / ยังไม่ระบุ</option>{boot.truckCustomers?.filter(c=>c.status==='ACTIVE').map(c=><option key={c.customerId} value={c.customerId}>{c.name}</option>)}</select></div>
            <label>น้ำหนักบรรทุก (ตัน)<input inputMode="decimal" className={settings.formInput} value={t.weight} onChange={e=>patchTrip(i,{weight:e.target.value})} placeholder="ยังไม่ระบุ" /></label>
            <div className={settings.formGroup}><label className={settings.formLabel} htmlFor={`tr-billing-${i}`}>ราคาขนส่งเหมาต่อเที่ยว (บาท)</label><input id={`tr-billing-${i}`} inputMode="decimal" className={settings.formInput} value={t.billing} onChange={e => patchTrip(i, { billing: e.target.value })} placeholder="ยังไม่ระบุราคา" /><p>จำนวนเงินเที่ยวนี้: {t.billable ? (t.billing.trim() ? (()=>{try{return `${formatMoney(money(t.billing,'ราคา'))} บาท`;}catch{return 'จำนวนเงินไม่ถูกต้อง';}})() : 'ยังไม่ระบุราคา') : 'ไม่เรียกเก็บลูกค้า'}</p></div>
            {t.destinationMode && <p>ค่าเที่ยวคนขับ: {t.paySatang == null ? 'ยังไม่ได้ตั้งราคา' : `${formatMoney(t.paySatang)} บาท`}</p>}
            <div className={settings.formGroup}>
              <label className={settings.formLabel} htmlFor={`tr-note-${i}`}>หมายเหตุ</label>
              <input id={`tr-note-${i}`} className={settings.formInput} value={t.note} placeholder="เช่น เลขใบส่งของ น้ำหนักบรรทุก" onChange={e => patchTrip(i, { note: e.target.value })} />
            </div>
          </div>
        ))}
        <button type="button" className={styles.addBtn} onClick={() => setTrips(ts => { const previous=ts[ts.length-1]; const location=previous?.destinationMode.startsWith('LOC_') ? boot.truckLocations?.find(l=>l.locationId===previous.destinationMode.slice(4)) : undefined; return [...ts, {...blankTrip(location ? `${location.code} — ${location.name}` : ''), originId:location?.locationId || ''}]; })}>
          <Plus size={20} aria-hidden="true" /> เพิ่มเที่ยววิ่งที่ {trips.length + 1}
        </button>
      </div>

      <div className={styles.panel}>
        <div className={styles.totalBar}>
          <div className={styles.totalFigs}>
            <div className={styles.fig}><small>จำนวนเที่ยว</small><strong>{trips.length}</strong></div>
            <div className={styles.fig}><small>ค่าเที่ยวคนขับ (บาท)</small><strong>{totalPay == null ? 'ยังไม่ครบราคา' : formatMoney(totalPay)}</strong></div>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={settings.primaryBtn} onClick={save} disabled={saving || loading || legacyFeeReviewRequired} aria-busy={saving}>
            {saving ? 'กำลังบันทึก...' : revision > 0 ? 'บันทึกการแก้ไขใบงาน' : 'บันทึกใบงาน'}
          </button>
          <LineSendButton scope="truck" className={settings.secondaryBtn} />
        </div>
        <div role={msg?.err ? 'alert' : 'status'} className={msg?.err ? styles.error : styles.ok}>{msg?.text}</div>
      </div>
      </fieldset>
    </div>
  );
}
