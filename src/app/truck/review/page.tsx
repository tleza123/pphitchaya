'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getJson, sendJson, errMsg } from '@/components/truck/api';
import { moneySatang, satangToDecimalString } from '@/lib/payroll/money';
import { parseTonsToKg, formatWeightTons } from '@/lib/truck/weight';
import { hasLegacyTripFees, legacyFeeSnapshot } from '@/lib/truck/pricing';
import { MutationIntent } from '@/lib/client/mutation-intent';
import docStyles from '@/components/truck/truck-documents.module.css';

type ReviewForm = Record<string, any>;
const moneyText = (value: number | null | undefined) => value == null ? 'ยังไม่ระบุ' : `${satangToDecimalString(value)} บาท`;
const tripStatusLabels: Record<string, string> = {
  OPEN: 'ยังไม่ระบุวันที่ถึง',
  COMPLETED: 'ถึงปลายทางแล้ว',
  CANCELLED: 'ยกเลิก'
};

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
      if (hasFees && !form.confirmLegacyPricing) throw new Error('ยืนยันว่าได้ตรวจเงินเพิ่มเดิมแล้ว');
      if (hasFees && current.billable !== false && (legacyFeeSnapshot(current).billingExtraSatang ?? 0) > 0 && !form.billing.trim()) throw new Error('ระบุราคาเหมาใหม่ก่อนบันทึก');
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
    <main className={docStyles.page} data-app-theme="truck">
      <header className={docStyles.pageHeader}>
        <Link className="btn btn-secondary btn-sm" style={{ width: 'fit-content' }} href="/truck">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>กลับหน้ารถสิบล้อ</span>
        </Link>
        <div>
          <h1>ตรวจข้อมูลเที่ยวเดิม</h1>
          <p className={docStyles.context}>ตรวจยอดเดิมและยืนยันราคาเหมาก่อนวางบิลหรือสรุปค่าเที่ยว</p>
        </div>
      </header>

      {error && <p className="app-notice app-notice-danger" role="alert">{error}</p>}

      {!current ? (
        <section className={docStyles.block}>
          {trips.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--team-muted)' }}>ไม่มีเที่ยวที่ต้องตรวจ</p>
          ) : (
            <div className={docStyles.invoiceList}>
              {trips.map(trip => (
                <article key={trip.tripId} className={docStyles.reviewCard}>
                  <p>
                    <strong>{trip.departureDate}</strong> · {trip.legacyDriverName || trip.driverNameSnapshot || 'ไม่ระบุคนขับ'}
                  </p>
                  <p>
                    {trip.originNameSnapshot || trip.fromLocation} → {trip.destinationNameSnapshot || trip.destinationName}
                    {' · '}{tripStatusLabels[trip.status] || 'ไม่ทราบสถานะ'}
                  </p>
                  {hasLegacyTripFees(trip) && (
                    <p className="app-notice" role="status">
                      ต้องตรวจเงินเพิ่มเดิม: คนขับ {moneyText(legacyFeeSnapshot(trip).driverExtraSatang)} · ลูกค้า {moneyText(legacyFeeSnapshot(trip).billingExtraSatang)}
                    </p>
                  )}
                  <div className={docStyles.buttonRow} style={{ marginTop: '0.4rem' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => open(trip)} disabled={Boolean(trip.invoiceId)}>
                      ตรวจและยืนยันราคา
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : data && (
        <section className={docStyles.block}>
          <form onSubmit={save}>
            <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.95rem' }}>
              <h2>{current.legacyRecordId || current.recordId || current.tripId}</h2>

              {hasLegacyTripFees(current) && (
                <section aria-label="สรุปเงินเดิม" className="app-notice" style={{ display: 'grid', gap: '0.4rem' }}>
                  <h3 style={{ margin: 0 }}>ยอดเดิมที่ต้องตรวจ</h3>
                  <p style={{ margin: 0 }}>ค่าขนส่งเดิม: {moneyText(current.billingSatang)}</p>
                  <p style={{ margin: 0 }}>ค่าบริการเพิ่มเติมเดิมของลูกค้า: {moneyText(legacyFeeSnapshot(current).billingExtraSatang)}</p>
                  <p style={{ margin: 0 }}>เงินเพิ่มคนขับเดิม: {moneyText(legacyFeeSnapshot(current).driverExtraSatang)}</p>
                  <p style={{ margin: 0 }}>เงินเพิ่มคนขับตามสิทธิ์เดิมเก็บแยกจากค่าเที่ยวใหม่</p>
                  {(legacyFeeSnapshot(current).billingExtraSatang ?? 0) > 0 && <p style={{ margin: 0, fontWeight: 700 }}>กรอกราคาเหมาต่อเที่ยวใหม่ด้วยตนเอง</p>}
                  <label className={docStyles.reviewCheck}>
                    <input type="checkbox" checked={form.confirmLegacyPricing} onChange={event => field('confirmLegacyPricing', event.target.checked)} />
                    <span>ตรวจยอดเดิมและกำหนดราคาใหม่แล้ว</span>
                  </label>
                </section>
              )}

              <div className={docStyles.filterGrid}>
                {[
                  ['driverId', 'คนขับ', data.truckDrivers, 'driverId'],
                  ['originId', 'ต้นทาง', data.truckLocations, 'locationId'],
                  ['destinationId', 'ปลายทาง', data.truckLocations, 'locationId'],
                  ['customerId', 'ลูกค้า', data.truckCustomers, 'customerId']
                ].map(([key, label, items, idKey]: any) => (
                  <label key={key}>
                    <span>{label}</span>
                    <select required={key !== 'customerId' || form.billable} value={form[key]} onChange={event => field(key, event.target.value)}>
                      <option value="">เลือก{label}</option>
                      {items.filter((item: any) => item.status === 'ACTIVE').map((item: any) => (
                        <option key={item[idKey]} value={item[idKey]}>{item.code ? `${item.code} — ` : ''}{item.name}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className={docStyles.filterGrid}>
                <label>
                  <span>วันที่ออก</span>
                  <input required type="date" value={form.departureDate} onChange={event => field('departureDate', event.target.value)} />
                </label>
                <label>
                  <span>วันที่ถึง</span>
                  <input type="date" value={form.arrivalDate} onChange={event => field('arrivalDate', event.target.value)} />
                </label>
                <label>
                  <span>น้ำหนักบรรทุก (ตัน)</span>
                  <input inputMode="decimal" value={form.weight} onChange={event => field('weight', event.target.value)} />
                </label>
              </div>

              <p style={{ margin: 0, fontWeight: 700 }}>ค่าเที่ยวคนขับก่อนปรับราคา: {moneyText(current.driverPaySatang)}</p>

              <label className={docStyles.reviewCheck}>
                <input type="checkbox" checked={form.billable} onChange={event => field('billable', event.target.checked)} />
                <span>เรียกเก็บลูกค้า</span>
              </label>

              <label>
                <span>ราคาขนส่งเหมาต่อเที่ยว (บาท)</span>
                <input inputMode="decimal" value={form.billing} onChange={event => field('billing', event.target.value)} placeholder="ยังไม่ระบุราคา" />
              </label>

              <label>
                <span>เหตุผลที่ยืนยันราคา</span>
                <input required value={form.reason} onChange={event => field('reason', event.target.value)} />
              </label>

              <div className={docStyles.buttonRow}>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'กำลังบันทึก…' : 'ยืนยันและบันทึกราคาเหมา'}
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setCurrent(null)}>
                  ยกเลิก
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
    </main>
  );
}
