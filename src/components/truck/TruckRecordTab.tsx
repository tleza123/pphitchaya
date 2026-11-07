'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Plus, Trash2, X } from 'lucide-react';
import settings from '@/components/settings/settings.module.css';
import { LineSendButton } from '@/components/shared/LineSendButton';
import { MutationIntent } from '@/lib/client/mutation-intent';
import { optionalMoney } from '@/lib/client/form-money';
import { formatMoney, satangToDecimalString } from '@/lib/payroll/money';
import { formatThaiDate } from '@/lib/payroll/dates';
import { TruckPhotoMeta, TruckTripItem } from '@/lib/truck/types';
import { errMsg, getJson, sendJson } from './api';
import { PhotoLightbox } from './PhotoLightbox';
import type { TruckBoot } from './TruckShell';
import styles from './truck.module.css';

interface TripForm { tripId: string; fromLocation: string; originId: string; destinationMode: string; customName: string; customPay: string; paySatang: number; note: string; startTime: string; endTime: string; billing: string; customer: string; customerId:string; billable:boolean; departureTime:string; arrivalTime:string; driverExtra:string; billingExtra:string; driverExtraNote:string; billingExtraNote:string; overrideReason:string; cancelled:boolean }
const OTHER = '__OTHER__';
const MAX_PHOTOS = 5;

const blankTrip = (from: string): TripForm => ({ tripId: '', fromLocation: from, originId: '', destinationMode: '', customName: '', customPay: '', paySatang: 0, note: '', startTime: '', endTime: '', billing: '', customer: '', customerId:'', billable:true, departureTime:'', arrivalTime:'', driverExtra:'', billingExtra:'', driverExtraNote:'', billingExtraNote:'', overrideReason:'', cancelled:false });

function toWebp(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ไม่สามารถเปิดรูปภาพนี้ได้')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('แปลงรูปภาพไม่สำเร็จ'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('แปลงรูปภาพไม่สำเร็จ'))), 'image/webp', 0.78);
    };
    img.src = url;
  });
}

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
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ err: boolean; text: string } | null>(null);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
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
          setPhotos([]); setRevision(0);
          return;
        }
        setTrips((rec.trips as TruckTripItem[]).map(t => {
          const known = t.destinationMode !== OTHER && b.truckDestinations.some(x => `DEST_${x.destinationId}` === t.destinationMode);
          return {
            ...blankTrip(t.fromLocation), billable:t.billable!==false, departureTime:t.departureTime||'', arrivalTime:t.arrivalTime||'', driverExtra:satangToDecimalString(t.driverExtraSatang||0), billingExtra:satangToDecimalString(t.billingExtraSatang||0), driverExtraNote:t.driverExtraNote||'', billingExtraNote:t.billingExtraNote||'', cancelled:t.status==='CANCELLED',
            tripId: t.tripId || '', fromLocation: t.fromLocation, originId: t.originId || '', destinationMode: t.originId ? `LOC_${t.destinationId}` : known ? t.destinationMode : OTHER,
            customName: known ? '' : t.destinationName, customPay: known || t.driverPaySatang == null ? '' : satangToDecimalString(t.driverPaySatang),
            paySatang: t.driverPaySatang ?? 0, note: t.note || '', startTime: t.departureDate || (t.departedAt ? new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.departedAt)) : date), endTime: t.arrivalDate || (t.arrivedAt ? new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.arrivedAt)) : ''), billing: t.billingSatang == null ? '' : satangToDecimalString(t.billingSatang), customer: t.customerName || '', customerId:t.customerId || '', overrideReason:t.overrideReason||''
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
    if (mode.startsWith('LOC_')) { const rates=boot.truckTariffs?.filter(x=>x.status==='ACTIVE' && x.originId===trips[i].originId && x.destinationId===mode.slice(4)) || []; const tariff=rates.find(x=>!x.customerId); const customerRate=rates.find(x=>x.customerId && x.customerId===trips[i].customerId); patchTrip(i, { destinationMode:mode, paySatang:tariff?.driverPaySatang ?? 0, customPay:tariff ? satangToDecimalString(tariff.driverPaySatang) : '', billing: customerRate?.customerRateSatang == null ? '' : satangToDecimalString(customerRate.customerRateSatang), overrideReason:'' }); return; }
    const dest = boot.truckDestinations.find(d => `DEST_${d.destinationId}` === mode);
    patchTrip(i, { destinationMode: mode, paySatang: dest?.driverPaySatang ?? 0, overrideReason:'' });
  };
  const tripPay = (t: TripForm) => {
    if (t.destinationMode !== OTHER && !t.destinationMode.startsWith('LOC_')) return t.paySatang;
    try { return optionalMoney(t.customPay); } catch { return 0; }
  };
  const totalPay = trips.reduce((s, t) => s + tripPay(t), 0);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || uploading) return;
    setUploading(true);
    setMsg(null);
    try {
      const added: TruckPhotoMeta[] = [];
      for (const file of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
        const fd = new FormData();
        fd.append('file', await toWebp(file), 'bill.webp');
        const res = await fetch('/api/truck/photos', { method: 'POST', body: fd });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'อัปโหลดรูปภาพไม่สำเร็จ');
        added.push(json.data);
      }
      setPhotos(p => [...p, ...added]);
    } catch (e) {
      setMsg({ err: true, text: errMsg(e) });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (saving || uploading) return;
    setMsg(null);
    try {
      if (!truckId) throw new Error('กรุณาเลือกรถสิบล้อ');
      if (!driverId) throw new Error('กรุณาเลือกคนขับ');
      const items: TruckTripItem[] = trips.map((t, i) => {
        const label = `เที่ยวที่ ${i + 1}`;
        if (!t.destinationMode) throw new Error(`${label}: กรุณาเลือกปลายทาง`);
        const other = t.destinationMode === OTHER;
        if (other && !t.customName.trim()) throw new Error(`${label}: กรุณาระบุชื่อปลายทาง`);
        const loc = t.destinationMode.startsWith('LOC_') ? boot.truckLocations?.find(d => d.locationId === t.destinationMode.slice(4)) : undefined;
        const dest = other ? undefined : boot.truckDestinations.find(d => `DEST_${d.destinationId}` === t.destinationMode);
        if (loc && !t.customPay.trim() && t.endTime && !t.cancelled) throw new Error(`${label}: ยังไม่ได้ตั้งค่าเที่ยวเส้นทางนี้`);
        return {
          ...(t.tripId ? {tripId:t.tripId} : {}), tripIndex: i + 1, fromLocation: t.fromLocation.trim(), destinationMode: t.destinationMode,
          originId: t.originId || null, destinationId: loc?.locationId ?? dest?.destinationId ?? null, destinationName: loc ? `${loc.code} — ${loc.name}` : other ? t.customName.trim() : dest?.name ?? '',
          driverPaySatang: other || loc ? (t.customPay.trim() ? money(t.customPay,label) : null) : t.paySatang, note: t.note.trim(), departureDate: t.startTime || date, arrivalDate: t.endTime || null, departureTime:t.departureTime||null, arrivalTime:t.arrivalTime||null, status: t.cancelled ? 'CANCELLED' : t.endTime ? 'COMPLETED' : 'OPEN', customerId:t.customerId || null, customerName: t.customer.trim(), billable:t.billable, billingSatang: t.billable ? (t.billing.trim() ? money(t.billing, label) : null) : 0, billingExtraSatang: t.billable?money(t.billingExtra,label):0, driverExtraSatang: money(t.driverExtra,label), driverExtraNote:t.driverExtraNote, billingExtraNote:t.billingExtraNote, overrideReason:t.overrideReason.trim()
        };
      });
      const payload = { dateKey: date, truckId, driverId, trips: items, fuelCostSatang: 0, photos, expectedRevision: revision };
      setSaving(true);
      const rec = await sendJson('/api/truck/records', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setRevision(rec.revision);
      setTrips(current => current.map((trip, i) => ({ ...trip, tripId: rec.trips?.[i]?.tripId || trip.tripId })));
      setPhotos(rec.photos || []);
      setMsg({ err: false, text: 'บันทึกใบงานเรียบร้อยแล้ว' });
      onSaved();
    } catch (e) {
      setMsg({ err: true, text: errMsg(e) });
    } finally {
      setSaving(false);
    }
  };

  if (!boot.trucks.length) {
    return <div className={styles.panel}><p className={styles.empty}>ยังไม่มีข้อมูลรถ กรุณาเพิ่มรถสิบล้อในแท็บตั้งค่าก่อน</p></div>;
  }

  return (
    <div className={styles.stack} aria-busy={loading}>
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
              <div className={settings.formGroup}><label className={settings.formLabel}>วันที่ออก</label><input type="date" className={settings.formInput} value={t.startTime || date} onChange={e => patchTrip(i, { startTime: e.target.value })} /></div>
              <div className={settings.formGroup}><label className={settings.formLabel}>วันที่ถึง (เว้นว่างถ้ายังค้าง)</label><input type="date" className={settings.formInput} value={t.endTime} onChange={e => patchTrip(i, { endTime: e.target.value })} /></div>
            </div>
            <p className={styles.hint}>รอบค่าเที่ยว: {(t.startTime || date).slice(0,7)} — ตามวันที่ออก</p>
            <div className={styles.row2}>
              <label>เวลาออก (ถ้าทราบ)<input type="time" className={settings.formInput} value={t.departureTime} onChange={e=>patchTrip(i,{departureTime:e.target.value})} /></label>
              <label>เวลาถึง (ถ้าทราบ)<input type="time" className={settings.formInput} value={t.arrivalTime} onChange={e=>patchTrip(i,{arrivalTime:e.target.value})} /></label>
            </div>
            <label><input type="checkbox" checked={t.billable} onChange={e=>patchTrip(i,{billable:e.target.checked})} /> เรียกเก็บลูกค้า (ปิดสำหรับเที่ยวกลับอู่/รถเปล่า)</label>
            <div className={styles.row2}>
              <div className={settings.formGroup}><label className={settings.formLabel}>ลูกค้า</label><select className={settings.formInput} value={t.customerId} onChange={e => {const c=boot.truckCustomers?.find(x=>x.customerId===e.target.value); const rate=boot.truckTariffs?.find(x=>x.status==='ACTIVE' && x.originId===t.originId && `LOC_${x.destinationId}`===t.destinationMode && x.customerId===e.target.value); patchTrip(i,{customerId:e.target.value,customer:c?.name||'',billing:rate?.customerRateSatang == null ? '' : satangToDecimalString(rate.customerRateSatang),overrideReason:''});}}><option value="">ไม่เรียกเก็บลูกค้า / ยังไม่ระบุ</option>{boot.truckCustomers?.filter(c=>c.status==='ACTIVE').map(c=><option key={c.customerId} value={c.customerId}>{c.name}</option>)}</select></div>
              <div className={settings.formGroup}><label className={settings.formLabel}>ค่าขนส่งเที่ยวนี้ (บาท)</label><input inputMode="decimal" className={settings.formInput} value={t.billing} onChange={e => patchTrip(i, { billing: e.target.value })} placeholder="เว้นว่างถ้ายังไม่ทราบ" /></div>
            </div>
            <div className={settings.formGroup}><label className={settings.formLabel} htmlFor={`tr-override-${i}`}>เหตุผลกรณีใช้ราคาต่างจากมาตรฐาน</label><input id={`tr-override-${i}`} className={settings.formInput} value={t.overrideReason} maxLength={500} onChange={e=>patchTrip(i,{overrideReason:e.target.value})} placeholder="ระบุเมื่อกรอกราคาพิเศษ" /></div>
            <div className={styles.row2}>
              <div className={settings.formGroup}>
                <label className={settings.formLabel} htmlFor={`tr-from-${i}`}>ต้นทาง</label>
                <select id={`tr-from-${i}`} className={settings.formInput} value={t.originId} onChange={e => { const l=boot.truckLocations?.find(x=>x.locationId===e.target.value); patchTrip(i,{originId:e.target.value,fromLocation:l?`${l.code} — ${l.name}`:'', destinationMode:'',customPay:'',overrideReason:''}); }}><option value="">เลือกต้นทาง</option>{boot.truckLocations?.filter(x=>x.status==='ACTIVE').map(l=><option key={l.locationId} value={l.locationId}>{l.code} — {l.name}</option>)}</select>
              </div>
              <div className={settings.formGroup}>
                <label className={settings.formLabel} htmlFor={`tr-dest-${i}`}>ปลายทาง</label>
                <select id={`tr-dest-${i}`} className={settings.formInput} value={t.destinationMode} onChange={e => pickDestination(i, e.target.value)}>
                  <option value="" disabled>เลือกปลายทาง</option>
                  {boot.truckLocations?.filter(x=>x.status==='ACTIVE' && x.locationId!==t.originId).map(l=><option key={l.locationId} value={`LOC_${l.locationId}`}>{l.code} — {l.name}</option>)}
                </select>
              </div>
            </div>
            {t.destinationMode === OTHER ? (
              <div className={styles.row2}>
                <div className={settings.formGroup}>
                  <label className={settings.formLabel} htmlFor={`tr-cn-${i}`}>ชื่อปลายทาง</label>
                  <input id={`tr-cn-${i}`} className={settings.formInput} value={t.customName} onChange={e => patchTrip(i, { customName: e.target.value })} />
                </div>
                <div className={settings.formGroup}>
                  <label className={settings.formLabel} htmlFor={`tr-cp-${i}`}>ค่าเที่ยวคนขับ (บาท)</label>
                  <input id={`tr-cp-${i}`} inputMode="decimal" className={settings.formInput} value={t.customPay} onChange={e => patchTrip(i, { customPay: e.target.value })} />
                </div>
              </div>
            ) : t.destinationMode.startsWith('LOC_') ? <div className={settings.formGroup}><label className={settings.formLabel}>ค่าเที่ยวคนขับ (บาท)</label><input className={settings.formInput} inputMode="decimal" value={t.customPay} placeholder="ยังไม่ได้ตั้งราคา" onChange={e=>patchTrip(i,{customPay:e.target.value})} /></div> : t.destinationMode ? (
              <p className={styles.pay}>ค่าเที่ยวคนขับ {formatMoney(t.paySatang)} บาท</p>
            ) : null}
            <div className={settings.formGroup}>
              <label className={settings.formLabel} htmlFor={`tr-note-${i}`}>หมายเหตุ</label>
              <input id={`tr-note-${i}`} className={settings.formInput} value={t.note} placeholder="เช่น เลขใบส่งของ น้ำหนักบรรทุก" onChange={e => patchTrip(i, { note: e.target.value })} />
            </div>
            <div className={styles.row2}>
              <label>เงินเพิ่มคนขับ (บาท)<input inputMode="decimal" className={settings.formInput} value={t.driverExtra} onChange={e=>patchTrip(i,{driverExtra:e.target.value})} /><input className={settings.formInput} placeholder="คำอธิบายเงินเพิ่มคนขับ" value={t.driverExtraNote} onChange={e=>patchTrip(i,{driverExtraNote:e.target.value})} /></label>
              <label>ค่าบริการเพิ่มลูกค้า (บาท)<input inputMode="decimal" disabled={!t.billable} className={settings.formInput} value={t.billingExtra} onChange={e=>patchTrip(i,{billingExtra:e.target.value})} /><input className={settings.formInput} placeholder="คำอธิบายค่าบริการเพิ่ม" value={t.billingExtraNote} onChange={e=>patchTrip(i,{billingExtraNote:e.target.value})} /></label>
            </div>
          </div>
        ))}
        <button type="button" className={styles.addBtn} onClick={() => setTrips(ts => { const previous=ts[ts.length-1]; const location=previous?.destinationMode.startsWith('LOC_') ? boot.truckLocations?.find(l=>l.locationId===previous.destinationMode.slice(4)) : undefined; return [...ts, {...blankTrip(location ? `${location.code} — ${location.name}` : ''), originId:location?.locationId || ''}]; })}>
          <Plus size={20} aria-hidden="true" /> เพิ่มเที่ยววิ่งที่ {trips.length + 1}
        </button>
      </div>

      <div className={styles.panel}>
        <label className={styles.fileLabel}>
          <Camera size={20} aria-hidden="true" />
          {uploading ? 'กำลังอัปโหลด...' : 'แนบรูปบิล / ใบส่งของ'}
          <input type="file" accept="image/*" multiple hidden disabled={uploading || photos.length >= MAX_PHOTOS} onChange={e => { void addPhotos(e.target.files); e.target.value = ''; }} />
        </label>
        <p className={styles.hint}>แนบได้ไม่เกิน {MAX_PHOTOS} รูป ({photos.length}/{MAX_PHOTOS}) ระบบย่อเป็น WebP ให้อัตโนมัติ</p>
        {photos.length > 0 && (
          <div className={styles.thumbs}>
            {photos.map(p => (
              <div className={styles.thumb} key={p.photoId}>
                <button type="button" onClick={() => setViewPhoto(p.photoId)} aria-label="ดูรูปหลักฐานขนาดใหญ่">
                  <img src={`/api/truck/photos/${p.photoId}`} alt="รูปหลักฐาน" loading="lazy" />
                </button>
                <button type="button" className={styles.thumbRemove} onClick={() => setPhotos(ps => ps.filter(x => x.photoId !== p.photoId))} aria-label="เอารูปออกจากใบงาน">
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.totalBar}>
          <div className={styles.totalFigs}>
            <div className={styles.fig}><small>จำนวนเที่ยว</small><strong>{trips.length}</strong></div>
            <div className={styles.fig}><small>ค่าเที่ยวคนขับ (บาท)</small><strong>{formatMoney(totalPay)}</strong></div>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={settings.primaryBtn} onClick={save} disabled={saving || uploading || loading} aria-busy={saving}>
            {saving ? 'กำลังบันทึก...' : revision > 0 ? 'บันทึกการแก้ไขใบงาน' : 'บันทึกใบงาน'}
          </button>
          <LineSendButton scope="truck" className={settings.secondaryBtn} />
        </div>
        <div role={msg?.err ? 'alert' : 'status'} className={msg?.err ? styles.error : styles.ok}>{msg?.text}</div>
      </div>
      <PhotoLightbox photoId={viewPhoto} onClose={() => setViewPhoto(null)} />
    </div>
  );
}
