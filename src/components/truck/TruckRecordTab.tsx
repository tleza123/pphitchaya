'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
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

interface TripForm { customName: string; manualPay: string; formKey: string; tripId: string; fromLocation: string; originId: string; destinationMode: string; paySatang: number | null; note: string; departureDate: string; arrivalDate: string; billing: string; weight: string; customer: string; customerId: string; billable: boolean; cancelled: boolean }

const blankTrip = (from: string): TripForm => ({ customName: '', manualPay: '', formKey: crypto.randomUUID(), tripId: '', fromLocation: from, originId: '', destinationMode: '', paySatang: null, note: '', departureDate: '', arrivalDate: '', billing: '', weight: '', customer: '', customerId: '', billable: false, cancelled: false });

function money(text: string, label: string): number {
  try { return optionalMoney(text); } catch { throw new Error(`${label}: กรอกจำนวนเงินเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง`); }
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
  const [loading, setLoading] = useState(true);
  const [loadedSheet, setLoadedSheet] = useState('');
  const [legacyFeeReviewRequired, setLegacyFeeReviewRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ err: boolean; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const intent = useRef(new MutationIntent());
  const bootRef = useRef(boot);
  bootRef.current = boot;

  useEffect(() => {
    if (!truckId && boot.trucks.length) setTruckId((boot.trucks.find(t => t.status === 'ACTIVE') || boot.trucks[0]).truckId);
  }, [boot.trucks, truckId]);

  useEffect(() => {
    if (!truckId) return;
    const currentTruck = boot.trucks.find(t => t.truckId === truckId);
    if (!currentTruck) return;
    const matched = boot.truckDrivers?.find(d => (currentTruck.driverId && d.driverId === currentTruck.driverId) || (currentTruck.driverName && d.name === currentTruck.driverName && d.status === 'ACTIVE'))
      || boot.truckDrivers?.find(d => currentTruck.driverName && d.name === currentTruck.driverName);
    if (matched) setDriverId(matched.driverId);
  }, [truckId, boot.trucks, boot.truckDrivers]);

  useEffect(() => {
    if (editTarget) { setDate(editTarget.dateKey); setTruckId(editTarget.truckId); setReloadKey(k => k + 1); }
  }, [editTarget]);

  useEffect(() => {
    if (!active || !truckId || !date) return;
    let stale = false;
    setLoading(true);
    setLoadedSheet('');
    setMsg(null);
    getJson(`/api/truck/records?date=${date}&truckId=${encodeURIComponent(truckId)}`)
      .then(d => {
        if (stale) return;
        const b = bootRef.current;
        const rec = d.records?.[0];
        setLoadedSheet(`${date}_${truckId}`);
        if (rec?.driverId) {
          setDriverId(rec.driverId);
        } else {
          const currentTruck = b.trucks.find(t => t.truckId === truckId);
          const matched = b.truckDrivers?.find(d => (currentTruck?.driverId && d.driverId === currentTruck.driverId) || (currentTruck?.driverName && d.name === currentTruck.driverName && d.status === 'ACTIVE'))
            || b.truckDrivers?.find(d => currentTruck?.driverName && d.name === currentTruck.driverName);
          setDriverId(matched?.driverId || '');
        }
        if (!rec) {
          setTrips([blankTrip(b.truckOrigins[0]?.name || '')]);
          setPhotos([]); setRevision(0); setLegacyFeeReviewRequired(false);
          return;
        }
        setLegacyFeeReviewRequired((rec.trips as TruckTripItem[]).some(needsLegacyPricingReview));
        setTrips((rec.trips as TruckTripItem[]).map(t => {
          const custId = t.billable === false ? '' : (t.customerId || '');
          const isBillable = Boolean(custId);
          return {
            ...blankTrip(t.fromLocation),
            weight: t.weightKg == null ? '' : formatWeightTons(t.weightKg),
            billable: isBillable,
            cancelled: t.status === 'CANCELLED',
            tripId: t.tripId || '',
            fromLocation: t.fromLocation,
            originId: t.originId || '',
            destinationMode: t.destinationMode === '__OTHER__' ? '__OTHER__' : t.originId && t.destinationId ? `LOC_${t.destinationId}` : '',
            customName: t.destinationMode === '__OTHER__' ? t.destinationName : '',
            manualPay: t.destinationMode === '__OTHER__' && t.driverPaySatang != null ? satangToDecimalString(t.driverPaySatang) : '',
            paySatang: t.driverPaySatang ?? null,
            note: t.note || '',
            departureDate: t.departureDate || (t.departedAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t.departedAt)) : date),
            arrivalDate: t.arrivalDate || (t.arrivedAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t.arrivedAt)) : ''),
            billing: isBillable && t.billingSatang != null ? satangToDecimalString(t.billingSatang) : '',
            customer: isBillable ? (t.customerName || '') : '',
            customerId: custId
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
    if (mode === '__OTHER__') { patchTrip(i, { destinationMode: mode, paySatang: null, manualPay: '', customName: '', billing: '' }); return; }
    if (boot.truckLocations?.find(l => `LOC_${l.locationId}` === mode)?.isShop) {
      const tariff = boot.truckTariffs?.find(x => x.status === 'ACTIVE' && x.originId === trips[i].originId && x.destinationId === mode.slice(4) && !x.customerId);
      patchTrip(i, { destinationMode: mode, paySatang: tariff?.driverPaySatang ?? null, customerId: '', customer: '', billable: false, billing: '', weight: '' });
      return;
    }
    if (mode.startsWith('LOC_')) {
      const rates = boot.truckTariffs?.filter(x => x.status === 'ACTIVE' && x.originId === trips[i].originId && x.destinationId === mode.slice(4)) || [];
      const tariff = rates.find(x => !x.customerId);
      const customerRate = rates.find(x => x.customerId && x.customerId === trips[i].customerId);
      patchTrip(i, { destinationMode: mode, paySatang: tariff?.driverPaySatang ?? null, billing: customerRate?.customerRateSatang == null ? '' : satangToDecimalString(customerRate.customerRateSatang) });
      return;
    }
    const dest = boot.truckDestinations.find(d => `DEST_${d.destinationId}` === mode);
    patchTrip(i, { destinationMode: mode, paySatang: dest?.driverPaySatang ?? null });
  };
  const totalPay = trips.every(t => t.paySatang != null) ? trips.reduce((s, t) => s + (t.paySatang ?? 0), 0) : null;

  const save = async () => {
    if (saving || loading || loadedSheet !== `${date}_${truckId}`) return;
    setMsg(null);
    try {
      if (!truckId) throw new Error('เลือกรถสิบล้อก่อนบันทึก');
      const selectedTruck = boot.trucks.find(t => t.truckId === truckId);
      let targetDriverId = driverId;
      if (!targetDriverId && selectedTruck) {
        const matched = boot.truckDrivers?.find(d => (selectedTruck.driverId && d.driverId === selectedTruck.driverId) || (selectedTruck.driverName && d.name === selectedTruck.driverName && d.status === 'ACTIVE'))
          || boot.truckDrivers?.find(d => selectedTruck.driverName && d.name === selectedTruck.driverName);
        if (matched) targetDriverId = matched.driverId;
      }
      if (!targetDriverId) throw new Error(`ยังไม่ระบุคนขับสำหรับรถ ${selectedTruck?.plateNumber || ''} (ตั้งค่าได้ในเมนูตั้งค่า)`);
      const items: TruckTripItem[] = trips.map((t, i) => {
        const label = `เที่ยวที่ ${i + 1}`;
        if (!t.destinationMode) throw new Error(`${label}: เลือกปลายทาง`);
        const loc = t.destinationMode.startsWith('LOC_') ? boot.truckLocations?.find(d => d.locationId === t.destinationMode.slice(4)) : undefined;
        const other = t.destinationMode === '__OTHER__';
        if (other && !t.customName.trim()) throw new Error(`${label}: ระบุชื่อปลายทาง`);
        if (other && !t.manualPay.trim()) throw new Error(`${label}: ระบุค่าเที่ยวคนขับ`);
        const manualPay = other ? money(t.manualPay, label) : null;
        if (!loc && !other) throw new Error(`${label}: เลือกปลายทางจากรายการ`);
        const isBillable = !loc?.isShop && Boolean(t.customerId);
        if (!t.originId) throw new Error(`${label}: เลือกต้นทาง`);
        return {
          ...(t.tripId ? { tripId: t.tripId } : {}),
          tripIndex: i + 1,
          fromLocation: t.fromLocation.trim(),
          destinationMode: t.destinationMode,
          originId: t.originId || null,
          destinationId: loc?.locationId || null,
          destinationName: other ? t.customName.trim() : `${loc!.code} — ${loc!.name}`,
          ...(other ? { manualDriverPaySatang: manualPay! } : {}),
          pricingVersion: 3,
          billingPricingMode: 'PER_TRIP',
          weightKg: loc?.isShop ? null : parseTonsToKg(t.weight),
          note: t.note.trim(),
          departureDate: t.departureDate || date,
          arrivalDate: t.arrivalDate || null,
          status: t.cancelled ? 'CANCELLED' : t.arrivalDate ? 'COMPLETED' : 'OPEN',
          customerId: isBillable ? t.customerId : null,
          customerName: isBillable ? t.customer.trim() : '',
          billable: isBillable,
          billingSatang: isBillable ? (t.billing.trim() ? money(t.billing, label) : null) : null
        };
      });
      const payload = { dateKey: date, truckId, driverId: targetDriverId, trips: items, fuelCostSatang: 0, photos, expectedRevision: revision };
      setSaving(true);
      const rec = await sendJson('/api/truck/records', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setRevision(rec.revision);
      setTrips(current => current.map((trip, i) => ({ ...trip, tripId: rec.trips?.[i]?.tripId || trip.tripId, paySatang: rec.trips?.[i]?.driverPaySatang ?? null, billing: rec.trips?.[i]?.billingSatang == null ? '' : satangToDecimalString(rec.trips[i].billingSatang) })));
      setPhotos(rec.photos || []);
      setMsg({ err: false, text: 'บันทึกใบงานแล้ว' });
      onSaved();
    } catch (e) {
      setMsg({ err: true, text: e instanceof Error && e.message === 'INVALID_WEIGHT' ? 'น้ำหนักต้องไม่ติดลบ และทศนิยมไม่เกิน 3 ตำแหน่ง' : errMsg(e) });
    } finally {
      setSaving(false);
    }
  };

  if (!boot.trucks.length) {
    return <div className={styles.panel}><p className={styles.empty}>เพิ่มรถสิบล้อในเมนูตั้งค่าก่อนบันทึกงาน</p></div>;
  }

  return (
    <div className={`${styles.stack} ${styles.recordForm}`} aria-busy={loading}>
      {msg && (
        <div
          role={msg.err ? 'alert' : 'status'}
          className={msg.err ? 'app-notice app-notice-danger' : 'app-notice app-notice-success'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', fontWeight: 700 }}
        >
          <span>{msg.text}</span>
          {msg.err && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving || loading} onClick={() => setReloadKey(k => k + 1)}>
              <RefreshCw size={17} aria-hidden="true" />
              <span>โหลดใบงานล่าสุด</span>
            </button>
          )}
        </div>
      )}

      <fieldset disabled={saving || loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className={styles.panel}>
          <div className={styles.row2}>
            <div className={settings.formGroup}>
              <label className={settings.formLabel} htmlFor="tr-date">วันที่</label>
              <div className={styles.dateRow}>
                <input id="tr-date" type="date" className={settings.formInput} value={date} onChange={e => e.target.value && setDate(e.target.value)} />
                <button type="button" className="btn btn-secondary" onClick={() => setDate(boot.serverToday)}>วันนี้</button>
              </div>
              <p className={styles.hint}>{formatThaiDate(date)} · รอบค่าเที่ยว {date.slice(0, 7)}</p>
            </div>
            <div className={settings.formGroup}>
              <label className={settings.formLabel} htmlFor="tr-truck">รถสิบล้อ</label>
              <select id="tr-truck" className={settings.formInput} value={truckId} onChange={e => setTruckId(e.target.value)}>
                {boot.trucks.map(t => (
                  <option key={t.truckId} value={t.truckId}>{t.plateNumber}{t.driverName ? ` (${t.driverName})` : ''}{t.status === 'SUSPENDED' ? ' - พักรถ' : ''}</option>
                ))}
              </select>
              <p className={styles.hint}>คนขับประจำรถ: {boot.trucks.find(t => t.truckId === truckId)?.driverName || 'ไม่ระบุ'}</p>
            </div>
          </div>

          {revision > 0 && (
            <div className="app-notice" role="status" style={{ marginTop: '0.5rem' }}>
              กำลังแก้ไขใบงานวันที่ {formatThaiDate(date)} · แก้ไขหรือเพิ่มเที่ยวแล้วกดบันทึก
            </div>
          )}
          {legacyFeeReviewRequired && (
            <div className="app-notice app-notice-danger" role="alert" style={{ marginTop: '0.75rem', display: 'grid', gap: '0.6rem' }}>
              <p>ใบงานนี้ต้องยืนยันราคาเดิมก่อนแก้ไขหรือออกเอกสาร</p>
              <a className="btn btn-danger btn-sm" style={{ width: 'fit-content' }} href="/truck/review">ไปตรวจราคาเดิม</a>
            </div>
          )}
        </div>

        <div className={styles.panel}>
          <datalist id="tr-origins">{boot.truckOrigins.map(o => <option key={o.originId} value={o.name} />)}</datalist>
          {trips.map((t, i) => {
            const isShop = boot.truckLocations?.find(l => `LOC_${l.locationId}` === t.destinationMode)?.isShop === true;
            return (
              <div className={styles.trip} key={t.formKey}>
                <div className={styles.tripHead}>
                  <span>เที่ยวที่ {i + 1}</span>
                  {trips.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setTrips(ts => ts.filter((_, j) => j !== i))}
                      aria-label={`ลบเที่ยวที่ ${i + 1}`}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                      <span>ลบเที่ยวนี้</span>
                    </button>
                  )}
                </div>

                <div className={styles.row2}>
                  <div className={settings.formGroup}>
                    <label className={settings.formLabel} htmlFor={`tr-from-${i}`}>ต้นทาง</label>
                    <select id={`tr-from-${i}`} className={settings.formInput} value={t.originId} onChange={e => { const l = boot.truckLocations?.find(x => x.locationId === e.target.value); patchTrip(i, { originId: e.target.value, fromLocation: l ? `${l.code} — ${l.name}` : '', destinationMode: '', paySatang: null, billing: '' }); }}>
                      <option value="">เลือกต้นทาง</option>
                      {boot.truckLocations?.filter(x => x.status === 'ACTIVE').map(l => <option key={l.locationId} value={l.locationId}>{l.code}. {l.name}</option>)}
                    </select>
                  </div>
                  <div className={settings.formGroup}>
                    <label className={settings.formLabel} htmlFor={`tr-dest-${i}`}>ปลายทาง</label>
                    <select id={`tr-dest-${i}`} className={settings.formInput} value={t.destinationMode} onChange={e => pickDestination(i, e.target.value)}>
                      <option value="" disabled>เลือกปลายทาง</option>
                      <option value="__OTHER__">กรอกปลายทางเอง</option>
                      {boot.truckLocations?.filter(x => x.status === 'ACTIVE' && x.locationId !== t.originId).map(l => <option key={l.locationId} value={`LOC_${l.locationId}`}>{l.code}. {l.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className={styles.row2}>
                  <div className={settings.formGroup}><label className={settings.formLabel} htmlFor={`tr-departure-${i}`}>วันที่ออก</label><input id={`tr-departure-${i}`} type="date" className={settings.formInput} value={t.departureDate || date} onChange={e => patchTrip(i, { departureDate: e.target.value })} /></div>
                  <div className={settings.formGroup}><label className={settings.formLabel} htmlFor={`tr-arrival-${i}`}>วันที่ถึง (ไม่บังคับ)</label><input id={`tr-arrival-${i}`} type="date" className={settings.formInput} value={t.arrivalDate} onChange={e => patchTrip(i, { arrivalDate: e.target.value })} /></div>
                </div>

                {t.destinationMode === '__OTHER__' && (
                  <div className={styles.row2}>
                    <div className={settings.formGroup}><label className={settings.formLabel} htmlFor={`tr-custom-name-${i}`}>ชื่อปลายทาง</label><input id={`tr-custom-name-${i}`} className={settings.formInput} maxLength={200} value={t.customName} onChange={e => patchTrip(i, { customName: e.target.value })} placeholder="ระบุชื่อปลายทาง" required /></div>
                    <div className={settings.formGroup}><label className={settings.formLabel} htmlFor={`tr-manual-pay-${i}`}>ค่าเที่ยวคนขับ (บาท)</label><input id={`tr-manual-pay-${i}`} className={settings.formInput} inputMode="decimal" value={t.manualPay} onChange={e => { let pay: number | null = null; try { if (e.target.value.trim()) pay = money(e.target.value, 'ค่าเที่ยวคนขับ'); } catch {} patchTrip(i, { manualPay: e.target.value, paySatang: pay }); }} placeholder="กรอกค่าเที่ยวสำหรับงานนี้" required /></div>
                  </div>
                )}

                <p className={styles.hint}>รอบค่าเที่ยว {(t.departureDate || date).slice(0, 7)} (นับตามวันที่ออก)</p>

                {!isShop && (
                  <>
                    <div className={settings.formGroup}>
                      <label className={settings.formLabel} htmlFor={`tr-customer-${i}`}>ลูกค้า</label>
                      <select
                        id={`tr-customer-${i}`}
                        className={settings.formInput}
                        value={t.customerId}
                        onChange={e => {
                          const custId = e.target.value;
                          const isBillable = Boolean(custId);
                          const c = boot.truckCustomers?.find(x => x.customerId === custId);
                          const rate = isBillable ? boot.truckTariffs?.find(x => x.status === 'ACTIVE' && x.originId === t.originId && `LOC_${x.destinationId}` === t.destinationMode && x.customerId === custId) : undefined;
                          patchTrip(i, {
                            customerId: custId,
                            customer: c?.name || '',
                            billable: isBillable,
                            billing: rate?.customerRateSatang == null ? (isBillable ? t.billing : '') : satangToDecimalString(rate.customerRateSatang)
                          });
                        }}
                      >
                        <option value="">ไม่เรียกเก็บลูกค้า / รถเปล่า</option>
                        {boot.truckCustomers?.filter(c => c.status === 'ACTIVE').map(c => (
                          <option key={c.customerId} value={c.customerId}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.row2}>
                      <div className={settings.formGroup}>
                        <label className={settings.formLabel} htmlFor={`tr-weight-${i}`}>น้ำหนักบรรทุก (ตัน)</label>
                        <input id={`tr-weight-${i}`} inputMode="decimal" className={settings.formInput} value={t.weight} onChange={e => patchTrip(i, { weight: e.target.value })} placeholder="ยังไม่ระบุ" />
                      </div>
                      <div className={settings.formGroup}>
                        <label className={settings.formLabel} htmlFor={`tr-billing-${i}`}>ราคาขนส่งเหมาต่อเที่ยว (บาท)</label>
                        <input
                          id={`tr-billing-${i}`}
                          inputMode="decimal"
                          className={settings.formInput}
                          value={t.billable ? t.billing : ''}
                          disabled={!t.billable}
                          onChange={e => patchTrip(i, { billing: e.target.value })}
                          placeholder={t.billable ? 'ยังไม่ระบุราคา' : 'ไม่เรียกเก็บลูกค้า'}
                        />
                        <p className={styles.hint}>
                          ค่าขนส่งเที่ยวนี้: {t.billable ? (t.billing.trim() ? (() => { try { return `${formatMoney(money(t.billing, 'ราคา'))} บาท`; } catch { return 'จำนวนเงินไม่ถูกต้อง'; } })() : 'ยังไม่ระบุราคา') : 'ไม่เรียกเก็บลูกค้า'}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {isShop && <p className={styles.hint}>ส่งเข้าร้านค้า (ไม่เรียกเก็บลูกค้า)</p>}
                {t.destinationMode && (
                  <p style={{ fontWeight: 700, color: 'var(--team-primary-dark)' }}>
                    ค่าเที่ยวคนขับ: {t.paySatang == null ? 'ยังไม่ได้ตั้งราคา' : `${formatMoney(t.paySatang)} บาท`}
                  </p>
                )}

                <div className={settings.formGroup}>
                  <label className={settings.formLabel} htmlFor={`tr-note-${i}`}>หมายเหตุ</label>
                  <input id={`tr-note-${i}`} className={settings.formInput} value={t.note} placeholder="เช่น เลขใบส่งของ" onChange={e => patchTrip(i, { note: e.target.value })} />
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="btn btn-dashed btn-block"
            style={{ marginTop: '1rem' }}
            onClick={() => setTrips(ts => {
              const previous = ts[ts.length - 1];
              const location = previous?.destinationMode.startsWith('LOC_') ? boot.truckLocations?.find(l => l.locationId === previous.destinationMode.slice(4)) : undefined;
              return [...ts, { ...blankTrip(location ? `${location.code} — ${location.name}` : ''), originId: location?.locationId || '' }];
            })}
          >
            <Plus size={20} aria-hidden="true" />
            <span>เพิ่มเที่ยววิ่งที่ {trips.length + 1}</span>
          </button>
        </div>

        <div className={styles.panel}>
          <div className={styles.totalBar}>
            <div className={styles.totalFigs}>
              <div className={styles.fig}><small>จำนวนเที่ยว</small><strong>{trips.length} เที่ยว</strong></div>
              <div className={styles.fig}><small>ค่าเที่ยวคนขับรวม</small><strong>{totalPay == null ? 'ยังระบุราคาไม่ครบ' : `${formatMoney(totalPay)} บาท`}</strong></div>
            </div>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={save}
              disabled={saving || loading || loadedSheet !== `${date}_${truckId}` || legacyFeeReviewRequired}
              aria-busy={saving}
            >
              <Save size={20} aria-hidden="true" />
              <span>{saving ? 'กำลังบันทึก…' : revision > 0 ? 'บันทึกการแก้ไขใบงาน' : 'บันทึกใบงาน'}</span>
            </button>
            <LineSendButton scope="truck" />
          </div>
        </div>
      </fieldset>
    </div>
  );
}
