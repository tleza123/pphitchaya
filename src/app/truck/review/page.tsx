'use client';

import { useEffect, useRef, useState } from 'react';
import { getJson, sendJson, errMsg } from '@/components/truck/api';
import { moneySatang, satangToDecimalString } from '@/lib/payroll/money';
import { parseTonsToKg, formatWeightTons } from '@/lib/truck/weight';
import { hasLegacyTripFees, legacyFeeSnapshot } from '@/lib/truck/pricing';
import { MutationIntent } from '@/lib/client/mutation-intent';
import styles from '@/components/settings/settings.module.css';

type ReviewForm = Record<string, any>;
const moneyText = (value: number | null | undefined) => value == null ? 'ยังไม่ระบุ' : `${satangToDecimalString(value)} บาท`;

export default function ReviewTrips() {
  const [data, setData] = useState<any>(null);
  const [trips, setTrips] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [form, setForm] = useState<ReviewForm>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const intent = useRef(new MutationIntent());

  const load = async () => {
    try {
      const [settingsData, tripData] = await Promise.all([getJson('/api/truck/settings'), getJson('/api/truck/trips')]);
      setData(settingsData);
      setTrips(tripData.trips);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  useEffect(() => { void load(); }, []);

  const open = (trip: any) => {
    const oldPricing = legacyFeeSnapshot(trip);
    const hasFees = hasLegacyTripFees(trip);
    setCurrent(trip);
    setForm({
      ...trip,
      driverId: trip.driverId || '',
      originId: trip.originId || '',
      destinationId: trip.destinationId || '',
      customerId: trip.customerId || '',
      arrivalDate: trip.arrivalDate || '',
      billable: trip.billable !== false,
      billing: hasFees && (oldPricing.billingExtraSatang ?? 0) > 0 ? '' : trip.billingSatang == null ? '' : satangToDecimalString(trip.billingSatang),
      weight: trip.weightKg == null ? '' : formatWeightTons(trip.weightKg),
      confirmLegacyPricing: false,
      reason: ''
    });
    setError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const hasFees = hasLegacyTripFees(current);
      if (hasFees && !form.confirmLegacyPricing) throw new Error('กรุณายืนยันว่าได้ตรวจเงินเพิ่มเดิมแล้ว');
      if (hasFees && current.billable !== false && (legacyFeeSnapshot(current).billingExtraSatang ?? 0) > 0 && !form.billing.trim()) throw new Error('กรุณาระบุราคาเหมาใหม่อย่างชัดเจน');
      const payload = {
        tripId: current.tripId,
        expectedRevision: current.revision || 0,
        expectedRecordRevision: current.recordId ? current.recordRevision : undefined,
        pricingVersion: 3,
        billingPricingMode: 'PER_TRIP',
        driverId: form.driverId,
        originId: form.originId,
        destinationId: form.destinationId,
        customerId: form.customerId || null,
        departureDate: form.departureDate,
        arrivalDate: form.arrivalDate || null,
        billable: form.billable,
        weightKg: parseTonsToKg(form.weight),
        billingSatang: form.billable && form.billing.trim() ? moneySatang(form.billing) : null,
        cancelled: form.cancelled || false,
        confirmLegacyPricing: form.confirmLegacyPricing,
        reason: form.reason
      };
      await sendJson('/api/truck/trips', 'PATCH', payload, intent.current.requestId(payload));
      intent.current.complete();
      setCurrent(null);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: string, value: any) => setForm((previous: ReviewForm) => ({ ...previous, [key]: value }));

  return (
    <main style={{ maxWidth: 900, margin: 'auto', padding: 24 }}>
      <a href="/truck">กลับระบบรถ</a>
      <h1>ตรวจข้อมูลเที่ยวที่ย้ายมาและราคาเดิม</h1>
      <p>ตรวจยอดเดิมและยืนยันราคาเหมาต่อเที่ยวก่อนนำเที่ยวรุ่นเก่าเข้าสู่การวางบิลและค่าแรงรุ่นใหม่</p>
      {error && <p role="alert">{error}</p>}
      {!current ? trips.length === 0 ? <p>ไม่มีเที่ยวที่ต้องตรวจ</p> : trips.map(trip => (
        <article key={trip.tripId} style={{ padding: 12, borderBottom: '1px solid #ddd' }}>
          <div>{trip.departureDate} · {trip.legacyDriverName || trip.driverNameSnapshot || 'ไม่ระบุคนขับ'} · {trip.originNameSnapshot || trip.fromLocation} → {trip.destinationNameSnapshot || trip.destinationName} · {trip.status}</div>
          {hasLegacyTripFees(trip) && <p role="status">ต้องตรวจเงินเพิ่มเดิม: คนขับ {moneyText(legacyFeeSnapshot(trip).driverExtraSatang)} · ลูกค้า {moneyText(legacyFeeSnapshot(trip).billingExtraSatang)}</p>}
          <button type="button" onClick={() => open(trip)} disabled={!!trip.invoiceId}>ตรวจและยืนยันราคา</button>
        </article>
      )) : data && (
        <form onSubmit={save}>
          <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
            <h2>{current.legacyRecordId || current.recordId || current.tripId}</h2>
            {hasLegacyTripFees(current) && (
              <section aria-label="สรุปเงินเดิม" style={{ border: '1px solid #b45309', padding: 12, marginBottom: 16 }}>
                <h3>ยอดเดิมที่ต้องตรวจ</h3>
                <p>ค่าขนส่งเดิม: {moneyText(current.billingSatang)}</p>
                <p>ค่าบริการเพิ่มลูกค้าเดิม: {moneyText(legacyFeeSnapshot(current).billingExtraSatang)}</p>
                <p>เงินเพิ่มคนขับเดิม: {moneyText(legacyFeeSnapshot(current).driverExtraSatang)}</p>
                <p>เงินเพิ่มคนขับจะถูกเก็บเป็นสิทธิ์เดิมแยกจากค่าเที่ยวรุ่นใหม่ ไม่ถูกลบหรือรวมเข้าค่าเที่ยว</p>
                {(legacyFeeSnapshot(current).billingExtraSatang ?? 0) > 0 && <p>ราคาขนส่งเหมาต่อเที่ยวใหม่ต้องระบุเอง ระบบจะไม่รวมยอดเดิมให้อัตโนมัติ</p>}
                <label><input type="checkbox" checked={form.confirmLegacyPricing} onChange={event => field('confirmLegacyPricing', event.target.checked)} /> ยืนยันว่าตรวจยอดเดิมและกำหนดราคาใหม่ตามที่แสดงแล้ว</label>
              </section>
            )}
            {[
              ['driverId', 'คนขับ', data.truckDrivers, 'driverId'],
              ['originId', 'ต้นทาง', data.truckLocations, 'locationId'],
              ['destinationId', 'ปลายทาง', data.truckLocations, 'locationId'],
              ['customerId', 'ลูกค้า', data.truckCustomers, 'customerId']
            ].map(([key, label, items, idKey]: any) => (
              <label key={key} style={{ display: 'block', marginBottom: 12 }}>
                {label}
                <select className={styles.formInput} required={key !== 'customerId' || form.billable} value={form[key]} onChange={event => field(key, event.target.value)}>
                  <option value="">เลือก{label}</option>
                  {items.filter((item: any) => item.status === 'ACTIVE').map((item: any) => <option key={item[idKey]} value={item[idKey]}>{item.code ? `${item.code} — ` : ''}{item.name}</option>)}
                </select>
              </label>
            ))}
            <label style={{ display: 'block' }}>วันที่ออก<input className={styles.formInput} required type="date" value={form.departureDate} onChange={event => field('departureDate', event.target.value)} /></label>
            <label style={{ display: 'block' }}>วันที่ถึง<input className={styles.formInput} type="date" value={form.arrivalDate} onChange={event => field('arrivalDate', event.target.value)} /></label>
            <label style={{ display: 'block' }}>น้ำหนักบรรทุก (ตัน)<input className={styles.formInput} inputMode="decimal" value={form.weight} onChange={event => field('weight', event.target.value)} /></label>
            <p>ค่าเที่ยวคนขับเดิมจาก snapshot: {moneyText(current.driverPaySatang)}</p>
            <label><input type="checkbox" checked={form.billable} onChange={event => field('billable', event.target.checked)} /> เรียกเก็บลูกค้า</label>
            <label style={{ display: 'block' }}>ราคาขนส่งเหมาต่อเที่ยว (บาท)<input className={styles.formInput} inputMode="decimal" value={form.billing} onChange={event => field('billing', event.target.value)} placeholder="ยังไม่ระบุราคา" /></label>
            <label style={{ display: 'block' }}>เหตุผลการตรวจและยืนยัน<input className={styles.formInput} required value={form.reason} onChange={event => field('reason', event.target.value)} /></label>
            <button type="submit" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'ยืนยันและบันทึกราคาเหมา'}</button>
            <button type="button" disabled={busy} onClick={() => setCurrent(null)}>ยกเลิก</button>
          </fieldset>
        </form>
      )}
    </main>
  );
}