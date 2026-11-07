'use client';

import { useEffect, useRef, useState } from 'react';
import settings from '@/components/settings/settings.module.css';
import styles from '@/components/truck/truck.module.css';
import { formatMoney, moneySatang } from '@/lib/payroll/money';
import { getJson, sendJson, errMsg, download } from '@/components/truck/api';
import { MutationIntent } from '@/lib/client/mutation-intent';
import { getBangkokMonth } from '@/lib/payroll/dates';
import { getTripCustomerChargeSatang } from '@/lib/truck/pricing';

export default function TruckBillingPage() {
  const [month, setMonth] = useState(getBangkokMonth());
  const [trips, setTrips] = useState<any[]>([]);
  const [legacyPricingReview, setLegacyPricingReview] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const intent = useRef(new MutationIntent());

  const load = async () => {
    try {
      const data = await getJson(`/api/truck/billing?month=${month}`);
      setTrips(data.trips);
      setLegacyPricingReview(data.legacyPricingReview || []);
      setInvoices(data.invoices);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  useEffect(() => { void load(); }, [month]);

  const invoice = async () => {
    try {
      const issueDate = prompt('วันที่ออกใบวางบิล (YYYY-MM-DD)');
      if (!issueDate) return;
      const dueDate = prompt('วันครบกำหนด (YYYY-MM-DD)', issueDate);
      if (!dueDate) return;
      const payload = { action: 'INVOICE', tripIds: selected, issueDate, dueDate, note };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setSelected([]);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const receive = async (invoice: any) => {
    const amount = prompt('ยอดรับชำระ (บาท)');
    if (amount === null) return;
    const paidDate = prompt('วันที่รับเงิน (YYYY-MM-DD)');
    if (!paidDate) return;
    const channel = prompt('ช่องทางรับเงิน') || '';
    const reference = prompt('เลขอ้างอิง (ถ้ามี)') || '';
    const paymentNote = prompt('หมายเหตุการรับเงิน (ถ้ามี)') || '';
    try {
      const payload = { action: 'PAYMENT', invoiceId: invoice.invoiceId, expectedRevision: invoice.revision, amountSatang: moneySatang(amount.trim()), paidDate, channel, reference, note: paymentNote };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const voidPayment = async (invoice: any, payment: any) => {
    const reason = prompt('เหตุผลในการยกเลิกรายการรับเงิน');
    if (!reason?.trim()) return;
    try {
      const payload = { action: 'VOID_PAYMENT', invoiceId: invoice.invoiceId, paymentId: payment.paymentId, expectedRevision: invoice.revision, reason };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const voidInvoice = async (invoice: any) => {
    const reason = prompt('เหตุผลในการยกเลิกใบวางบิล');
    if (!reason?.trim()) return;
    try {
      const payload = { action: 'VOID_INVOICE', invoiceId: invoice.invoiceId, expectedRevision: invoice.revision, reason };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <main className={styles.stack} style={{ maxWidth: 1000, margin: '2rem auto', padding: '1rem' }}>
      <a href="/truck">กลับหน้ารถบรรทุก</a>
      <h1>วางบิลและรับชำระ</h1>
      <p>เลือกเที่ยวที่เสร็จแล้วตามเดือนเริ่มงาน</p>
      <input type="month" className={settings.formInput} value={month} onChange={event => { setMonth(event.target.value); setSelected([]); }} />
      {error && <p role="alert">{error}</p>}
      {legacyPricingReview.length > 0 && (
        <section className={styles.panel} role="status">
          <h2>เที่ยวที่ต้องตรวจราคาเดิม</h2>
          <p>เที่ยวเหล่านี้ยังไม่เข้ารายการวางบิลจนกว่าจะตรวจยอดเดิมและยืนยันราคาเหมา</p>
          {legacyPricingReview.map(trip => <p key={trip.tripId}>{trip.departureDate} · {trip.plateNumberSnapshot} · {trip.fromLocation} → {trip.destinationName} · {trip.customerName}</p>)}
          <a href="/truck/review">ไปหน้าตรวจข้อมูลเก่า</a>
        </section>
      )}
      <section className={styles.panel}>
        <h2>เที่ยวที่ยังไม่วางบิล</h2>
        {trips.map(trip => (
          <label key={trip.tripId} style={{ display: 'block', padding: 8 }}>
            <input type="checkbox" checked={selected.includes(trip.tripId)} onChange={event => setSelected(value => event.target.checked ? [...value, trip.tripId] : value.filter(id => id !== trip.tripId))} />{' '}
            {trip.departureDate || trip.accountingDate} · {trip.plateNumberSnapshot} · {trip.fromLocation} → {trip.destinationName} · {trip.customerName} · {formatMoney(getTripCustomerChargeSatang(trip) ?? 0)} บาท
          </label>
        ))}
        {trips.length === 0 && <p className={styles.empty}>ไม่มีเที่ยวพร้อมวางบิล</p>}
        <textarea className={settings.formInput} placeholder="หมายเหตุ" value={note} onChange={event => setNote(event.target.value)} />
        <button className={settings.primaryBtn} disabled={!selected.length} onClick={() => void invoice()}>ออกใบวางบิล</button>
      </section>
      <section className={styles.panel}>
        <h2>ใบวางบิล</h2>
        {invoices.map(invoice => (
          <article key={invoice.invoiceId} style={{ padding: 10, borderBottom: '1px solid #ddd' }}>
            <strong>{invoice.documentNo}</strong> · {invoice.customerName} · ยอด {formatMoney(invoice.totalSatang)} · รับแล้ว {formatMoney(invoice.paidSatang || 0)} · ค้าง {formatMoney(invoice.balanceSatang)}{' '}
            <button onClick={() => void download(`/api/truck/billing/${invoice.invoiceId}/pdf`, `${invoice.documentNo}.pdf`).catch(e => setError(errMsg(e)))}>PDF</button>{' '}
            {invoice.status === 'OPEN' && invoice.paidSatang === 0 && <button onClick={() => void voidInvoice(invoice)}>ยกเลิกใบวางบิล</button>}{' '}
            {invoice.status === 'OPEN' && invoice.balanceSatang > 0 && <button onClick={() => void receive(invoice)}>บันทึกรับเงิน</button>}
            {invoice.payments?.map((payment: any) => <div key={payment.paymentId}>{payment.paidDate} · {formatMoney(payment.amountSatang)} บาท · {payment.status === 'VOID' ? `ยกเลิก: ${payment.voidReason}` : <button onClick={() => void voidPayment(invoice, payment)}>ยกเลิกรายการรับเงิน</button>}</div>)}
          </article>
        ))}
      </section>
    </main>
  );
}