'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import styles from '@/components/truck/truck.module.css';
import docStyles from '@/components/truck/truck-documents.module.css';
import { ArrowLeft, Search, FileDown, Wallet, ReceiptText } from 'lucide-react';
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
      // Customer list falls back to trips.
    }
  };

  useEffect(() => { void loadSettings(); }, []);

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
  useEffect(() => { void load(); return () => { ++sequence.current; }; }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = () => {
    if (!start || !end || start > end) { setError('เลือกช่วงวันที่ให้ถูกต้อง'); return; }
    if (range.start === start && range.end === end) { void load(); return; }
    setRange({ start, end });
  };

  const customers = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trips) {
      if (t.customerId) map.set(t.customerId, t.customerName || t.customerId);
    }
    for (const c of settingsCustomers) {
      if (!map.has(c.customerId)) map.set(c.customerId, c.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [trips, settingsCustomers]);

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
    if (!invoiceIssueDate || !invoiceDueDate) { setInvoiceError('กรอกวันที่ออกใบวางบิลและวันครบกำหนด'); return; }
    if (invoiceDueDate < invoiceIssueDate) { setInvoiceError('วันครบกำหนดต้องไม่น้อยกว่าวันที่ออกใบวางบิล'); return; }
    const selectedTripIds = selectedTrips.map(t => t.tripId);
    if (selectedTripIds.length === 0) { setInvoiceError('เลือกเที่ยววิ่งอย่างน้อย 1 เที่ยว'); return; }
    try {
      const payload = {
        action: 'INVOICE',
        ...range,
        tripIds: selectedTripIds,
        issueDate: invoiceIssueDate,
        dueDate: invoiceDueDate,
        note: invoiceNote.trim() || undefined
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
    if (!amountTrimmed || Number(amountTrimmed) <= 0) { setPayError('ระบุจำนวนเงินให้ถูกต้อง'); return; }
    let satang: number;
    try { satang = moneySatang(amountTrimmed); }
    catch { setPayError('กรอกจำนวนเงินเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'); return; }
    if (satang > payInvoice.balanceSatang) { setPayError(`ยอดรับชำระต้องไม่เกินยอดค้าง (${formatMoney(payInvoice.balanceSatang)} บาท)`); return; }
    if (!payDate) { setPayError('เลือกวันที่รับเงิน'); return; }
    try {
      const payload = {
        action: 'PAYMENT',
        invoiceId: payInvoice.invoiceId,
        expectedRevision: payInvoice.revision,
        amountSatang: satang,
        paidDate: payDate,
        channel: payChannel.trim() || undefined,
        reference: payReference.trim() || undefined,
        note: payNote.trim() || undefined
      };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setPayInvoice(null);
      await load();
    } catch (err) {
      setPayError(errMsg(err));
    }
  };

  const openVoidPaymentModal = (invoice: any, payment: any) => {
    setVoidPaymentTarget({ invoice, payment });
    setVoidPaymentReason('');
    setVoidPaymentError('');
  };

  const submitVoidPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidPaymentTarget) return;
    if (!voidPaymentReason.trim()) { setVoidPaymentError('ระบุเหตุผลที่ยกเลิก'); return; }
    try {
      const payload = {
        action: 'VOID_PAYMENT',
        invoiceId: voidPaymentTarget.invoice.invoiceId,
        paymentId: voidPaymentTarget.payment.paymentId,
        expectedRevision: voidPaymentTarget.invoice.revision,
        reason: voidPaymentReason.trim()
      };
      await sendJson('/api/truck/billing', 'POST', payload, intent.current.requestId(payload));
      intent.current.complete();
      setVoidPaymentTarget(null);
      await load();
    } catch (err) {
      setVoidPaymentError(errMsg(err));
    }
  };

  const openVoidInvoiceModal = (invoice: any) => {
    setVoidInvoiceTarget(invoice);
    setVoidInvoiceReason('');
    setVoidInvoiceError('');
  };

  const submitVoidInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidInvoiceTarget) return;
    if (!voidInvoiceReason.trim()) { setVoidInvoiceError('ระบุเหตุผลที่ยกเลิก'); return; }
    try {
      const payload = {
        action: 'VOID_INVOICE',
        invoiceId: voidInvoiceTarget.invoiceId,
        expectedRevision: voidInvoiceTarget.revision,
        reason: voidInvoiceReason.trim()
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
    <main className={docStyles.page} data-app-theme="truck">
      <header className={docStyles.pageHeader}>
        <Link className="btn btn-secondary btn-sm" style={{ width: 'fit-content' }} href="/truck/reports">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>กลับหน้ารายงาน</span>
        </Link>
        <div>
          <h1>วางบิลและรับเงิน</h1>
          <p className={docStyles.context}>ออกใบวางบิลตามช่วงวันที่และติดตามยอดรับชำระ</p>
        </div>
      </header>

      <section className={docStyles.block}>
        <h2>ค้นหาเที่ยววิ่ง</h2>
        <div className={docStyles.filterGrid}>
          <label>
            <span>จากวันที่</span>
            <input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} />
          </label>
          <label>
            <span>ถึงวันที่</span>
            <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} />
          </label>
          <label htmlFor="billing-customer">
            <span>ลูกค้า</span>
            <select
              id="billing-customer"
              value={selectedCustomerId}
              onChange={event => { setSelectedCustomerId(event.target.value); setSelected([]); }}
            >
              {customers.length === 0 && <option value="">ไม่มีลูกค้าที่มีเที่ยววิ่ง</option>}
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" disabled={loading} onClick={search}>
            <Search size={19} aria-hidden="true" />
            <span>ค้นหาเที่ยววิ่ง</span>
          </button>
        </div>

        <p className={docStyles.context}>ช่วงที่แสดง {month} · นับตามวันที่ออกรถ</p>
      </section>

      {loading && <div className="refreshStatus" role="status">กำลังค้นหาเที่ยววิ่ง</div>}
      {error && <p className="app-notice app-notice-danger" role="alert">{error}</p>}

      {legacyPricingReview.length > 0 && (
        <section className={`${docStyles.block} ${docStyles.closeBlock}`}>
          <h2>เที่ยวที่ต้องตรวจราคาเดิม</h2>
          <p style={{ margin: '0 0 0.65rem' }}>ตรวจยอดเดิมและยืนยันราคาเหมาก่อนวางบิล</p>
          {legacyPricingReview.map(trip => (
            <p key={trip.tripId} style={{ margin: '0.25rem 0' }}>{trip.departureDate} · {trip.plateNumberSnapshot} · {trip.fromLocation} → {trip.destinationName} · {trip.customerName}</p>
          ))}
          <div className={docStyles.buttonRow}>
            <a className="btn btn-warning btn-sm" href="/truck/review">ไปตรวจราคาเดิม</a>
          </div>
        </section>
      )}

      <section className={docStyles.block}>
        <h2>เที่ยวที่ยังไม่วางบิล</h2>
        {selectedCustomerId && displayedTrips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.85rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={toggleSelectAll}>
              {allSelected ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
            <span style={{ fontSize: 'var(--team-secondary)', color: 'var(--team-muted)' }}>
              ลูกค้า <strong>{selectedCustomerName}</strong> · เลือกแล้ว {selectedTrips.length} / {displayedTrips.length} เที่ยว
            </span>
          </div>
        )}

        {displayedTrips.map(trip => (
          <label key={trip.tripId} className={docStyles.tripChoice}>
            <input
              type="checkbox"
              checked={selected.includes(trip.tripId)}
              onChange={event => setSelected(value => event.target.checked ? [...value, trip.tripId] : value.filter(id => id !== trip.tripId))}
            />
            <span className={docStyles.tripInfo}>
              <strong>{trip.fromLocation} → {trip.destinationName}</strong>
              <span>{trip.departureDate || trip.accountingDate} · {trip.plateNumberSnapshot} · {trip.customerName}</span>
              <strong>{formatMoney(getTripCustomerChargeSatang(trip) ?? 0)} บาท</strong>
            </span>
          </label>
        ))}

        {!selectedCustomerId && customers.length > 0 && (
          <p className={styles.empty}>เลือกลูกค้าเพื่อดูเที่ยวที่ยังไม่วางบิล</p>
        )}
        {selectedCustomerId && displayedTrips.length === 0 && (
          <p className={styles.empty}>ไม่มีเที่ยวพร้อมวางบิลของลูกค้ารายนี้ในช่วง {month}</p>
        )}
        {customers.length === 0 && (
          <p className={styles.empty}>ไม่มีเที่ยวพร้อมวางบิล</p>
        )}

        <div className={docStyles.buttonRow}>
          <button type="button" className="btn btn-primary" disabled={!selectedTrips.length} onClick={openInvoiceModal}>
            <ReceiptText size={20} aria-hidden="true" />
            <span>ออกใบวางบิล {selectedTrips.length > 0 ? `(${selectedTrips.length} เที่ยว · ${formatMoney(selectedTotalSatang)} บาท)` : ''}</span>
          </button>
        </div>
      </section>

      <section className={docStyles.block}>
        <h2>ใบวางบิลและประวัติรับชำระ</h2>
        <div className={docStyles.invoiceList}>
          {invoices.map(invoice => (
            <article key={invoice.invoiceId} className={docStyles.invoice}>
              <div className={docStyles.invoiceTitle}>
                <strong>{invoice.documentNo}</strong>
                <span>{invoice.customerName} · {invoice.status === 'VOID' ? 'ยกเลิกแล้ว' : invoice.balanceSatang === 0 ? 'รับชำระครบแล้ว' : 'รอรับชำระ'}</span>
              </div>
              <div className={docStyles.metrics}>
                <div><span>ยอดวางบิล</span><strong>{formatMoney(invoice.totalSatang)} บาท</strong></div>
                <div><span>รับเงินแล้ว</span><strong>{formatMoney(invoice.paidSatang || 0)} บาท</strong></div>
                <div className={docStyles.balance}><span>ยอดคงเหลือ</span><strong>{formatMoney(invoice.balanceSatang)} บาท</strong></div>
              </div>
              {invoice.payments?.map((payment: any) => (
                <div key={payment.paymentId} className={docStyles.paymentRow}>
                  <span>{payment.paidDate} · <strong>{formatMoney(payment.amountSatang)} บาท</strong> {payment.channel ? `(${payment.channel})` : ''}</span>
                  {payment.status === 'VOID' ? (
                    <span style={{ color: 'var(--team-absent)' }}>ยกเลิกแล้ว: {payment.voidReason}</span>
                  ) : (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => openVoidPaymentModal(invoice, payment)}>
                      ยกเลิกรับเงิน
                    </button>
                  )}
                </div>
              ))}
              <div className={docStyles.buttonRow}>
                {invoice.status === 'OPEN' && invoice.balanceSatang > 0 && (
                  <button type="button" className="btn btn-primary" onClick={() => openReceiveModal(invoice)}>
                    <Wallet size={19} aria-hidden="true" />
                    <span>บันทึกรับเงิน</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void download(`/api/truck/billing/${invoice.invoiceId}/pdf`, `${invoice.documentNo}.pdf`).catch(e => setError(errMsg(e)))}
                >
                  <FileDown size={19} aria-hidden="true" />
                  <span>ดาวน์โหลด PDF</span>
                </button>
                {invoice.status === 'OPEN' && invoice.paidSatang === 0 && (
                  <button type="button" className="btn btn-danger" onClick={() => openVoidInvoiceModal(invoice)}>
                    ยกเลิกใบวางบิล
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {invoices.length === 0 && <p className={styles.empty}>ไม่มีใบวางบิลในช่วงที่เลือก</p>}
      </section>

      {invoiceModalOpen && (
        <div className="app-modal-overlay">
          <form onSubmit={submitInvoice} data-app-dialog role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title" tabIndex={-1} className="app-modal-card">
            <h3 id="invoice-modal-title" className="app-modal-title">ออกใบวางบิล</h3>
            <p style={{ margin: '0 0 0.3rem' }}>ลูกค้า: <strong>{selectedCustomerName}</strong></p>
            <p className="app-modal-desc">
              {selectedTrips.length} เที่ยว · ยอดรวม <strong>{formatMoney(selectedTotalSatang)} บาท</strong>
            </p>

            <div className={docStyles.modalFields}>
              <label>
                <span>วันที่ออกใบวางบิล *</span>
                <input
                  type="date"
                  required
                  value={invoiceIssueDate}
                  onChange={e => {
                    setInvoiceIssueDate(e.target.value);
                    if (!invoiceDueDate || invoiceDueDate < e.target.value) setInvoiceDueDate(e.target.value);
                  }}
                />
              </label>
              <label>
                <span>วันครบกำหนดชำระ *</span>
                <input type="date" required min={invoiceIssueDate} value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)} />
              </label>
              <label>
                <span>หมายเหตุ (ถ้ามี)</span>
                <textarea rows={2} value={invoiceNote} placeholder="เช่น กำหนดชำระทุกวันศุกร์" onChange={e => setInvoiceNote(e.target.value)} />
              </label>
            </div>

            {invoiceError && <p className="app-notice app-notice-danger" role="alert">{invoiceError}</p>}

            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setInvoiceModalOpen(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">ยืนยันออกใบวางบิล</button>
            </div>
          </form>
        </div>
      )}

      {payInvoice && (
        <div className="app-modal-overlay">
          <form onSubmit={submitPayment} data-app-dialog role="dialog" aria-modal="true" aria-labelledby="pay-modal-title" tabIndex={-1} className="app-modal-card">
            <h3 id="pay-modal-title" className="app-modal-title">บันทึกรับเงิน: {payInvoice.documentNo}</h3>
            <p style={{ margin: '0 0 0.3rem' }}>ลูกค้า: <strong>{payInvoice.customerName}</strong></p>
            <p className="app-modal-desc">
              ยอดเต็ม {formatMoney(payInvoice.totalSatang)} · รับแล้ว {formatMoney(payInvoice.paidSatang || 0)} · คงเหลือ <strong>{formatMoney(payInvoice.balanceSatang)} บาท</strong>
            </p>

            <div className={docStyles.modalFields}>
              <label>
                <span>ยอดรับชำระ (บาท) *</span>
                <input type="number" step="0.01" min="0.01" required value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </label>
              <label>
                <span>วันที่รับเงิน *</span>
                <input type="date" required value={payDate} onChange={e => setPayDate(e.target.value)} />
              </label>
              <label>
                <span>ช่องทางรับเงิน</span>
                <input type="text" placeholder="เช่น โอนเงิน เงินสด หรือเช็ค" value={payChannel} onChange={e => setPayChannel(e.target.value)} />
              </label>
              <label>
                <span>เลขอ้างอิง (ถ้ามี)</span>
                <input type="text" placeholder="เลขสลิปหรือเลขเช็ค" value={payReference} onChange={e => setPayReference(e.target.value)} />
              </label>
              <label>
                <span>หมายเหตุ (ถ้ามี)</span>
                <input type="text" placeholder="หมายเหตุเพิ่มเติม" value={payNote} onChange={e => setPayNote(e.target.value)} />
              </label>
            </div>

            {payError && <p className="app-notice app-notice-danger" role="alert">{payError}</p>}

            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPayInvoice(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">ยืนยันรับชำระ</button>
            </div>
          </form>
        </div>
      )}

      {voidInvoiceTarget && (
        <div className="app-modal-overlay">
          <form onSubmit={submitVoidInvoice} data-app-dialog role="dialog" aria-modal="true" aria-labelledby="void-invoice-title" tabIndex={-1} className="app-modal-card">
            <h3 id="void-invoice-title" className="app-modal-title app-modal-title-danger">ยกเลิกใบวางบิล</h3>
            <p style={{ margin: '0 0 0.3rem' }}>เลขที่เอกสาร: <strong>{voidInvoiceTarget.documentNo}</strong> ({voidInvoiceTarget.customerName})</p>
            <p className="app-modal-desc">
              ยอดรวม {formatMoney(voidInvoiceTarget.totalSatang)} บาท · เที่ยววิ่งจะกลับไปเป็นรายการที่ยังไม่วางบิล
            </p>

            <div className={docStyles.modalFields}>
              <label>
                <span>เหตุผลที่ยกเลิก *</span>
                <textarea required rows={3} placeholder="เช่น เลือกลูกค้าผิดหรือเปลี่ยนรายการเที่ยว" value={voidInvoiceReason} onChange={e => setVoidInvoiceReason(e.target.value)} />
              </label>
            </div>

            {voidInvoiceError && <p className="app-notice app-notice-danger" role="alert">{voidInvoiceError}</p>}

            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setVoidInvoiceTarget(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-danger-solid">ยืนยันยกเลิกใบวางบิล</button>
            </div>
          </form>
        </div>
      )}

      {voidPaymentTarget && (
        <div className="app-modal-overlay">
          <form onSubmit={submitVoidPayment} data-app-dialog role="dialog" aria-modal="true" aria-labelledby="void-payment-title" tabIndex={-1} className="app-modal-card">
            <h3 id="void-payment-title" className="app-modal-title app-modal-title-danger">ยกเลิกรายการรับเงิน</h3>
            <p style={{ margin: '0 0 0.3rem' }}>ใบวางบิล: <strong>{voidPaymentTarget.invoice.documentNo}</strong> ({voidPaymentTarget.invoice.customerName})</p>
            <p className="app-modal-desc">
              วันที่รับเงิน {voidPaymentTarget.payment.paidDate} · ยอด <strong>{formatMoney(voidPaymentTarget.payment.amountSatang)} บาท</strong>
            </p>

            <div className={docStyles.modalFields}>
              <label>
                <span>เหตุผลที่ยกเลิก *</span>
                <textarea required rows={3} placeholder="เช่น บันทึกยอดผิดหรือใช้สลิปซ้ำ" value={voidPaymentReason} onChange={e => setVoidPaymentReason(e.target.value)} />
              </label>
            </div>

            {voidPaymentError && <p className="app-notice app-notice-danger" role="alert">{voidPaymentError}</p>}

            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setVoidPaymentTarget(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-danger-solid">ยืนยันยกเลิกรับเงิน</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
