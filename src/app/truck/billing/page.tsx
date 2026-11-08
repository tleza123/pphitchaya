'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import settings from '@/components/settings/settings.module.css';
import styles from '@/components/truck/truck.module.css';
import { formatMoney, moneySatang } from '@/lib/payroll/money';
import { getJson, sendJson, errMsg, download } from '@/components/truck/api';
import { MutationIntent } from '@/lib/client/mutation-intent';
import { getBangkokMonth, getBangkokToday } from '@/lib/payroll/dates';
import { getTripCustomerChargeSatang } from '@/lib/truck/pricing';
import { useModalInteraction } from '@/components/shared/useModalInteraction';

export default function TruckBillingPage() {
  const [start, setStart] = useState(getBangkokMonth() + '-01');
  const [end, setEnd] = useState(getBangkokToday());
  const [range, setRange] = useState({ start, end });
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const query = new URLSearchParams(range).toString();
  const activeQuery = useRef(query); activeQuery.current = query;
  const month = range.start + ' ถึง ' + range.end;
  const [trips, setTrips] = useState<any[]>([]);
  const [legacyPricingReview, setLegacyPricingReview] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [settingsCustomers, setSettingsCustomers] = useState<Array<{ customerId: string; name: string }>>([]);
  const [error, setError] = useState('');
  const intent = useRef(new MutationIntent());

  // Modal states
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceIssueDate, setInvoiceIssueDate] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');
  const [invoiceError, setInvoiceError] = useState('');

  const [payInvoice, setPayInvoice] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payChannel, setPayChannel] = useState('โอนเงิน');
  const [payReference, setPayReference] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payError, setPayError] = useState('');

  const [voidInvoiceTarget, setVoidInvoiceTarget] = useState<any | null>(null);
  const [voidInvoiceReason, setVoidInvoiceReason] = useState('');
  const [voidInvoiceError, setVoidInvoiceError] = useState('');

  const [voidPaymentTarget, setVoidPaymentTarget] = useState<{ invoice: any; payment: any } | null>(null);
  const [voidPaymentReason, setVoidPaymentReason] = useState('');
  const [voidPaymentError, setVoidPaymentError] = useState('');

  const isAnyModalOpen = Boolean(invoiceModalOpen || payInvoice || voidInvoiceTarget || voidPaymentTarget);
  useModalInteraction(isAnyModalOpen, () => {
    setInvoiceModalOpen(false);
    setPayInvoice(null);
    setVoidInvoiceTarget(null);
    setVoidPaymentTarget(null);
  });

  const loadSettings = async () => {
    try {
      const data = await getJson('/api/truck/settings');
      if (data?.truckCustomers) {
        setSettingsCustomers(data.truckCustomers.map((c: any) => ({ customerId: c.customerId, name: c.name })));
      }
    } catch {
      // Ignore settings error, customer list falls back to trips
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const load = async () => {
    if (activeQuery.current !== query) return;
    const current = ++sequence.current; setLoading(true); setSelected([]); setTrips([]); setInvoices([]);
    try {
      const data = await getJson(`/api/truck/billing?${query}`);
      if (current !== sequence.current) return;
      setTrips(data.trips || []); setLegacyPricingReview(data.legacyPricingReview || []); setInvoices(data.invoices || []); setError('');
    } catch (e) { if (current === sequence.current) setError(errMsg(e)); }
    finally { if (current === sequence.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { ++sequence.current; }; }, [query]);
  const search = () => { if (!start || !end || start > end) { setError('กรุณาเลือกช่วงวันที่ให้ถูกต้อง'); return; } if (range.start === start && range.end === end) { void load(); return; } setRange({ start, end }); };

  // Derived customer list from unbilled trips and settings
  const customers = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trips) {
      if (t.customerId) {
        map.set(t.customerId, t.customerName || t.customerId);
      }
    }
    for (const c of settingsCustomers) {
      if (!map.has(c.customerId)) {
        map.set(c.customerId, c.name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [trips, settingsCustomers]);

  // Auto-select first customer if none selected or selected is invalid
  useEffect(() => {
    if (customers.length > 0) {
      if (!selectedCustomerId || !customers.some(c => c.id === selectedCustomerId)) {
        setSelectedCustomerId(customers[0].id);
        setSelected([]);
      }
    } else {
      setSelectedCustomerId('');
      setSelected([]);
    }
  }, [customers, selectedCustomerId]);

  const displayedTrips = useMemo(() => {
    if (!selectedCustomerId) return [];
    return trips.filter(t => t.customerId === selectedCustomerId);
  }, [trips, selectedCustomerId]);

  const selectedTrips = useMemo(() => {
    return displayedTrips.filter(t => selected.includes(t.tripId));
  }, [displayedTrips, selected]);

  const selectedTotalSatang = useMemo(() => {
    return selectedTrips.reduce((sum, t) => sum + (getTripCustomerChargeSatang(t) ?? 0), 0);
  }, [selectedTrips]);

  const allSelected = displayedTrips.length > 0 && displayedTrips.every(t => selected.includes(t.tripId));

  const toggleSelectAll = () => {
    if (allSelected) {
      const displayedIds = new Set(displayedTrips.map(t => t.tripId));
      setSelected(prev => prev.filter(id => !displayedIds.has(id)));
    } else {
      const displayedIds = displayedTrips.map(t => t.tripId);
      setSelected(prev => Array.from(new Set([...prev, ...displayedIds])));
    }
  };

  // Open Invoice Modal
  const openInvoiceModal = () => {
    const today = getBangkokToday();
    setInvoiceIssueDate(today);
    setInvoiceDueDate(today);
    setInvoiceNote('');
    setInvoiceError('');
    setInvoiceModalOpen(true);
  };

  const submitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceIssueDate || !invoiceDueDate) {
      setInvoiceError('กรุณากรอกวันที่ออกใบวางบิลและวันครบกำหนด');
      return;
    }
    if (invoiceDueDate < invoiceIssueDate) {
      setInvoiceError('วันครบกำหนดต้องไม่น้อยกว่าวันที่ออกใบวางบิล');
      return;
    }
    const selectedTripIds = selectedTrips.map(t => t.tripId);
    if (selectedTripIds.length === 0) {
      setInvoiceError('กรุณาเลือกเที่ยววิ่งอย่างน้อย 1 เที่ยว');
      return;
    }
    try {
      const payload = {
        action: 'INVOICE',
        ...range,
        tripIds: selectedTripIds,
        issueDate: invoiceIssueDate,
        dueDate: invoiceDueDate,
        note: invoiceNote.trim() || undefined,
      };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setSelected([]);
      setInvoiceModalOpen(false);
      await load();
    } catch (err) {
      setInvoiceError(errMsg(err));
    }
  };

  // Open Receive Payment Modal
  const openReceiveModal = (invoice: any) => {
    setPayInvoice(invoice);
    setPayAmount((invoice.balanceSatang / 100).toFixed(2));
    setPayDate(getBangkokToday());
    setPayChannel('โอนเงิน');
    setPayReference('');
    setPayNote('');
    setPayError('');
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payInvoice) return;
    const amountTrimmed = payAmount.trim();
    if (!amountTrimmed || Number(amountTrimmed) <= 0) {
      setPayError('กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }
    let satang: number;
    try {
      satang = moneySatang(amountTrimmed);
    } catch {
      setPayError('รูปแบบจำนวนเงินไม่ถูกต้อง');
      return;
    }
    if (satang > payInvoice.balanceSatang) {
      setPayError(`ยอดรับชำระต้องไม่เกินยอดค้าง (${formatMoney(payInvoice.balanceSatang)} บาท)`);
      return;
    }
    if (!payDate) {
      setPayError('กรุณาระบุวันที่รับเงิน');
      return;
    }
    try {
      const payload = {
        action: 'PAYMENT',
        invoiceId: payInvoice.invoiceId,
        expectedRevision: payInvoice.revision,
        amountSatang: satang,
        paidDate: payDate,
        channel: payChannel.trim() || undefined,
        reference: payReference.trim() || undefined,
        note: payNote.trim() || undefined,
      };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setPayInvoice(null);
      await load();
    } catch (err) {
      setPayError(errMsg(err));
    }
  };

  // Open Void Payment Modal
  const openVoidPaymentModal = (invoice: any, payment: any) => {
    setVoidPaymentTarget({ invoice, payment });
    setVoidPaymentReason('');
    setVoidPaymentError('');
  };

  const submitVoidPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidPaymentTarget) return;
    if (!voidPaymentReason.trim()) {
      setVoidPaymentError('กรุณาระบุเหตุผลในการยกเลิก');
      return;
    }
    try {
      const payload = {
        action: 'VOID_PAYMENT',
        invoiceId: voidPaymentTarget.invoice.invoiceId,
        paymentId: voidPaymentTarget.payment.paymentId,
        expectedRevision: voidPaymentTarget.invoice.revision,
        reason: voidPaymentReason.trim(),
      };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setVoidPaymentTarget(null);
      await load();
    } catch (err) {
      setVoidPaymentError(errMsg(err));
    }
  };

  // Open Void Invoice Modal
  const openVoidInvoiceModal = (invoice: any) => {
    setVoidInvoiceTarget(invoice);
    setVoidInvoiceReason('');
    setVoidInvoiceError('');
  };

  const submitVoidInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidInvoiceTarget) return;
    if (!voidInvoiceReason.trim()) {
      setVoidInvoiceError('กรุณาระบุเหตุผลในการยกเลิก');
      return;
    }
    try {
      const payload = {
        action: 'VOID_INVOICE',
        invoiceId: voidInvoiceTarget.invoiceId,
        expectedRevision: voidInvoiceTarget.revision,
        reason: voidInvoiceReason.trim(),
      };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setVoidInvoiceTarget(null);
      await load();
    } catch (err) {
      setVoidInvoiceError(errMsg(err));
    }
  };

  const selectedCustomerName = customers.find(c => c.id === selectedCustomerId)?.name || selectedCustomerId;

  return (
    <main className={styles.stack} style={{ maxWidth: 1000, margin: '2rem auto', padding: '1rem' }}>
      <a href="/truck">กลับหน้ารถบรรทุก</a>
      <h1>วางบิลและรับชำระ</h1>
      <p className={styles.hint}>ช่วงที่แสดง: {month} · ค้นหาตามวันที่ออกเดินทาง รวมวันเริ่มและวันสิ้นสุด</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'end' }}>
        <div>
          <label>จากวันที่<input type="date" className={settings.formInput} value={start} max={end} onChange={e => setStart(e.target.value)} /></label>
        </div>
        <div><label>ถึงวันที่<input type="date" className={settings.formInput} value={end} min={start} onChange={e => setEnd(e.target.value)} /></label></div>
        <button type="button" className={settings.secondaryBtn} disabled={loading} onClick={search}>ค้นหาเที่ยววางบิล</button>
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>ลูกค้า</label>
          <select
            className={settings.formInput}
            value={selectedCustomerId}
            onChange={event => { setSelectedCustomerId(event.target.value); setSelected([]); }}
          >
            {customers.length === 0 && <option value="">-- ไม่พบลูกค้าที่มีเที่ยววิ่ง --</option>}
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p role="status">กำลังค้นหาเที่ยววางบิล</p>}
      {error && <p role="alert" style={{ color: 'var(--team-absent)' }}>{error}</p>}

      {legacyPricingReview.length > 0 && (
        <section className={styles.panel} role="status">
          <h2>เที่ยวที่ต้องตรวจราคาเดิม</h2>
          <p>เที่ยวเหล่านี้ยังไม่เข้ารายการวางบิลจนกว่าจะตรวจยอดเดิมและยืนยันราคาเหมา</p>
          {legacyPricingReview.map(trip => (
            <p key={trip.tripId}>{trip.departureDate} · {trip.plateNumberSnapshot} · {trip.fromLocation} → {trip.destinationName} · {trip.customerName}</p>
          ))}
          <a href="/truck/review">ไปหน้าตรวจข้อมูลเก่า</a>
        </section>
      )}

      <section className={styles.panel}>
        <h2>เที่ยวที่ยังไม่วางบิล</h2>
        {selectedCustomerId && displayedTrips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <button
              type="button"
              className={settings.secondaryBtn}
              onClick={toggleSelectAll}
            >
              {allSelected ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
            <span style={{ fontSize: '0.9rem', color: 'var(--team-muted)' }}>
              เลือกลูกค้า: <strong>{selectedCustomerName}</strong> (เลือกแล้ว {selectedTrips.length} / {displayedTrips.length} เที่ยว)
            </span>
          </div>
        )}

        {displayedTrips.map(trip => (
          <label key={trip.tripId} style={{ display: 'block', padding: '8px 0', borderBottom: '1px solid var(--team-border, #eee)' }}>
            <input
              type="checkbox"
              checked={selected.includes(trip.tripId)}
              onChange={event => setSelected(value => event.target.checked ? [...value, trip.tripId] : value.filter(id => id !== trip.tripId))}
            />{' '}
            {trip.departureDate || trip.accountingDate} · {trip.plateNumberSnapshot} · {trip.fromLocation} → {trip.destinationName} · {trip.customerName} · {formatMoney(getTripCustomerChargeSatang(trip) ?? 0)} บาท
          </label>
        ))}

        {!selectedCustomerId && customers.length > 0 && (
          <p className={styles.empty}>กรุณาเลือกลูกค้าเพื่อดูเที่ยววิ่งที่ยังไม่วางบิล</p>
        )}
        {selectedCustomerId && displayedTrips.length === 0 && (
          <p className={styles.empty}>ไม่มีเที่ยวพร้อมวางบิลสำหรับลูกค้ารายนี้ในช่วง {month}</p>
        )}
        {customers.length === 0 && (
          <p className={styles.empty}>ไม่มีเที่ยวพร้อมวางบิล</p>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <button
            type="button"
            className={settings.primaryBtn}
            disabled={!selectedTrips.length}
            onClick={openInvoiceModal}
          >
            ออกใบวางบิล {selectedTrips.length > 0 ? `(${selectedTrips.length} เที่ยว · ${formatMoney(selectedTotalSatang)} บาท)` : ''}
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>ใบวางบิล</h2>
        {invoices.map(invoice => (
          <article key={invoice.invoiceId} style={{ padding: '10px 0', borderBottom: '1px solid var(--team-border, #ddd)' }}>
            <div>
              <strong>{invoice.documentNo}</strong> · {invoice.customerName} · ยอด {formatMoney(invoice.totalSatang)} · รับแล้ว {formatMoney(invoice.paidSatang || 0)} · ค้าง {formatMoney(invoice.balanceSatang)}{' '}
              <button type="button" onClick={() => void download(`/api/truck/billing/${invoice.invoiceId}/pdf`, `${invoice.documentNo}.pdf`).catch(e => setError(errMsg(e)))}>PDF</button>{' '}
              {invoice.status === 'OPEN' && invoice.paidSatang === 0 && (
                <button type="button" onClick={() => openVoidInvoiceModal(invoice)}>ยกเลิกใบวางบิล</button>
              )}{' '}
              {invoice.status === 'OPEN' && invoice.balanceSatang > 0 && (
                <button type="button" onClick={() => openReceiveModal(invoice)}>บันทึกรับเงิน</button>
              )}
            </div>
            {invoice.payments?.map((payment: any) => (
              <div key={payment.paymentId} style={{ paddingLeft: '1rem', marginTop: '0.4rem', fontSize: '0.9rem', color: 'var(--team-muted)' }}>
                {payment.paidDate} · {formatMoney(payment.amountSatang)} บาท {payment.channel ? `(${payment.channel})` : ''} ·{' '}
                {payment.status === 'VOID' ? (
                  <span>ยกเลิกแล้ว: {payment.voidReason}</span>
                ) : (
                  <button type="button" style={{ fontSize: '0.85rem' }} onClick={() => openVoidPaymentModal(invoice, payment)}>
                    ยกเลิกรายการรับเงิน
                  </button>
                )}
              </div>
            ))}
          </article>
        ))}
        {invoices.length === 0 && <p className={styles.empty}>ยังไม่มีใบวางบิลในช่วงวันที่นี้</p>}
      </section>

      {/* Invoice Modal */}
      {invoiceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 120 }}>
          <form
            onSubmit={submitInvoice}
            data-app-dialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-modal-title"
            tabIndex={-1}
            style={{ width: 'min(32rem, 100%)', background: '#fff', borderRadius: 'var(--team-radius-card, 12px)', border: '1px solid var(--team-border)', padding: '1.25rem', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 id="invoice-modal-title" style={{ margin: '0 0 0.8rem', color: 'var(--team-primary-dark)' }}>ออกใบวางบิล</h3>
            <p style={{ margin: '0 0 0.5rem', color: 'var(--team-text)' }}>
              ลูกค้า: <strong>{selectedCustomerName}</strong>
            </p>
            <p style={{ margin: '0 0 1rem', color: 'var(--team-text)' }}>
              จำนวนเที่ยว: <strong>{selectedTrips.length} เที่ยว</strong> · ยอดรวม: <strong>{formatMoney(selectedTotalSatang)} บาท</strong>
            </p>

            <div style={{ display: 'grid', gap: '0.8rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>วันที่ออกใบวางบิล *</label>
                <input
                  type="date"
                  required
                  className={settings.formInput}
                  value={invoiceIssueDate}
                  onChange={e => {
                    setInvoiceIssueDate(e.target.value);
                    if (!invoiceDueDate || invoiceDueDate < e.target.value) setInvoiceDueDate(e.target.value);
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>วันครบกำหนดชำระ *</label>
                <input
                  type="date"
                  required
                  min={invoiceIssueDate}
                  className={settings.formInput}
                  value={invoiceDueDate}
                  onChange={e => setInvoiceDueDate(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>หมายเหตุ (ถ้ามี)</label>
                <textarea
                  className={settings.formInput}
                  rows={2}
                  value={invoiceNote}
                  placeholder="เช่น กำหนดชำระทุกวันศุกร์"
                  onChange={e => setInvoiceNote(e.target.value)}
                />
              </div>
            </div>

            {invoiceError && <p role="alert" style={{ color: 'var(--team-absent)', marginBottom: '0.8rem' }}>{invoiceError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" className={settings.secondaryBtn} onClick={() => setInvoiceModalOpen(false)}>ยกเลิก</button>
              <button type="submit" className={settings.primaryBtn}>ยืนยันออกใบวางบิล</button>
            </div>
          </form>
        </div>
      )}

      {/* Receive Payment Modal */}
      {payInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 120 }}>
          <form
            onSubmit={submitPayment}
            data-app-dialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-modal-title"
            tabIndex={-1}
            style={{ width: 'min(32rem, 100%)', background: '#fff', borderRadius: 'var(--team-radius-card, 12px)', border: '1px solid var(--team-border)', padding: '1.25rem', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 id="pay-modal-title" style={{ margin: '0 0 0.8rem', color: 'var(--team-primary-dark)' }}>บันทึกรับเงิน: {payInvoice.documentNo}</h3>
            <p style={{ margin: '0 0 0.4rem', color: 'var(--team-text)' }}>
              ลูกค้า: <strong>{payInvoice.customerName}</strong>
            </p>
            <p style={{ margin: '0 0 1rem', color: 'var(--team-muted)', fontSize: '0.9rem' }}>
              ยอดเต็ม {formatMoney(payInvoice.totalSatang)} · รับแล้ว {formatMoney(payInvoice.paidSatang || 0)} · <strong>ยอดค้าง {formatMoney(payInvoice.balanceSatang)} บาท</strong>
            </p>

            <div style={{ display: 'grid', gap: '0.8rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>ยอดรับชำระ (บาท) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  className={settings.formInput}
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>วันที่รับเงิน *</label>
                <input
                  type="date"
                  required
                  className={settings.formInput}
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>ช่องทางรับเงิน</label>
                <input
                  type="text"
                  placeholder="เช่น โอนเงิน, เงินสด, เช็ค"
                  className={settings.formInput}
                  value={payChannel}
                  onChange={e => setPayChannel(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>เลขอ้างอิง (ถ้ามี)</label>
                <input
                  type="text"
                  placeholder="เลขที่สลิป หรือ เช็ค"
                  className={settings.formInput}
                  value={payReference}
                  onChange={e => setPayReference(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>หมายเหตุ (ถ้ามี)</label>
                <input
                  type="text"
                  placeholder="หมายเหตุเพิ่มเติม"
                  className={settings.formInput}
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                />
              </div>
            </div>

            {payError && <p role="alert" style={{ color: 'var(--team-absent)', marginBottom: '0.8rem' }}>{payError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" className={settings.secondaryBtn} onClick={() => setPayInvoice(null)}>ยกเลิก</button>
              <button type="submit" className={settings.primaryBtn}>ยืนยันรับชำระ</button>
            </div>
          </form>
        </div>
      )}

      {/* Void Invoice Modal */}
      {voidInvoiceTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 120 }}>
          <form
            onSubmit={submitVoidInvoice}
            data-app-dialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-invoice-title"
            tabIndex={-1}
            style={{ width: 'min(30rem, 100%)', background: '#fff', borderRadius: 'var(--team-radius-card, 12px)', border: '1px solid var(--team-border)', padding: '1.25rem', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 id="void-invoice-title" style={{ margin: '0 0 0.8rem', color: 'var(--team-absent, #dc2626)' }}>ยกเลิกใบวางบิล</h3>
            <p style={{ margin: '0 0 0.4rem', color: 'var(--team-text)' }}>
              เลขที่เอกสาร: <strong>{voidInvoiceTarget.documentNo}</strong> ({voidInvoiceTarget.customerName})
            </p>
            <p style={{ margin: '0 0 0.8rem', color: 'var(--team-muted)', fontSize: '0.9rem' }}>
              ยอดรวม {formatMoney(voidInvoiceTarget.totalSatang)} บาท · เที่ยววิ่งจะกลับไปอยู่ในสถานะยังไม่วางบิล
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>เหตุผลในการยกเลิก *</label>
              <textarea
                required
                rows={3}
                className={settings.formInput}
                placeholder="ระบุเหตุผล เช่น ออกผิดลูกค้า, เปลี่ยนแปลงรายการเที่ยว"
                value={voidInvoiceReason}
                onChange={e => setVoidInvoiceReason(e.target.value)}
              />
            </div>

            {voidInvoiceError && <p role="alert" style={{ color: 'var(--team-absent)', marginBottom: '0.8rem' }}>{voidInvoiceError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" className={settings.secondaryBtn} onClick={() => setVoidInvoiceTarget(null)}>ยกเลิก</button>
              <button type="submit" className={settings.primaryBtn} style={{ background: 'var(--team-absent, #dc2626)', borderColor: 'var(--team-absent, #dc2626)' }}>ยืนยันยกเลิกใบวางบิล</button>
            </div>
          </form>
        </div>
      )}

      {/* Void Payment Modal */}
      {voidPaymentTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 120 }}>
          <form
            onSubmit={submitVoidPayment}
            data-app-dialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-payment-title"
            tabIndex={-1}
            style={{ width: 'min(30rem, 100%)', background: '#fff', borderRadius: 'var(--team-radius-card, 12px)', border: '1px solid var(--team-border)', padding: '1.25rem', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 id="void-payment-title" style={{ margin: '0 0 0.8rem', color: 'var(--team-absent, #dc2626)' }}>ยกเลิกรายการรับเงิน</h3>
            <p style={{ margin: '0 0 0.4rem', color: 'var(--team-text)' }}>
              ใบวางบิล: <strong>{voidPaymentTarget.invoice.documentNo}</strong> ({voidPaymentTarget.invoice.customerName})
            </p>
            <p style={{ margin: '0 0 0.8rem', color: 'var(--team-muted)', fontSize: '0.9rem' }}>
              วันที่รับเงิน: {voidPaymentTarget.payment.paidDate} · ยอด: <strong>{formatMoney(voidPaymentTarget.payment.amountSatang)} บาท</strong>
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>เหตุผลในการยกเลิกรายการรับเงิน *</label>
              <textarea
                required
                rows={3}
                className={settings.formInput}
                placeholder="ระบุเหตุผล เช่น บันทึกยอดเงินผิด, สลิปซ้ำ"
                value={voidPaymentReason}
                onChange={e => setVoidPaymentReason(e.target.value)}
              />
            </div>

            {voidPaymentError && <p role="alert" style={{ color: 'var(--team-absent)', marginBottom: '0.8rem' }}>{voidPaymentError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" className={settings.secondaryBtn} onClick={() => setVoidPaymentTarget(null)}>ยกเลิก</button>
              <button type="submit" className={settings.primaryBtn} style={{ background: 'var(--team-absent, #dc2626)', borderColor: 'var(--team-absent, #dc2626)' }}>ยืนยันยกเลิกรายการ</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}