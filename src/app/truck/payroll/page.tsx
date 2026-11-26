'use client';

import { tripLocationNames } from '@/lib/truck/location-names';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import reports from '@/components/reports/reports.module.css';
import { MutationIntent } from '@/lib/client/mutation-intent';
import { download, errMsg, getJson, sendJson } from '@/components/truck/api';
import { formatMoney } from '@/lib/payroll/money';
import { formatThaiDate, getBangkokMonth, getBangkokToday } from '@/lib/payroll/dates';
import { useModalInteraction } from '@/components/shared/useModalInteraction';
import styles from '@/components/truck/truck.module.css';
import docStyles from '@/components/truck/truck-documents.module.css';
import { ArrowLeft, Search, FileDown, Lock, LockOpen, Wallet } from 'lucide-react';

export default function TruckPayrollPage() {
  const payrollIntent = useRef(new MutationIntent());

  const [start, setStart] = useState(getBangkokMonth() + '-01');
  const [end, setEnd] = useState(getBangkokToday());
  const [range, setRange] = useState({ start, end });
  const [legacyMonth, setLegacyMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const loadSequence = useRef(0);
  const query = legacyMonth ? 'month=' + legacyMonth : new URLSearchParams(range).toString();
  const activeQuery = useRef(query); activeQuery.current = query;
  const month = legacyMonth || range.start + ' ถึง ' + range.end;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  const [payDriverTarget, setPayDriverTarget] = useState<any | null>(null);
  const [payDate, setPayDate] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payError, setPayError] = useState('');

  const [voidDriverTarget, setVoidDriverTarget] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');

  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState('');

  const isAnyModalOpen = Boolean(payDriverTarget || voidDriverTarget || reopenModalOpen);
  useModalInteraction(isAnyModalOpen, () => {
    setPayDriverTarget(null);
    setVoidDriverTarget(null);
    setReopenModalOpen(false);
  });

  const load = async () => {
    if (activeQuery.current !== query) return;
    const sequence = ++loadSequence.current;
    setLoading(true); setData(null);
    try {
      const res = await getJson(`/api/truck/payroll?${query}`);
      if (sequence === loadSequence.current) { setData(res); setError(''); }
    } catch (e) { if (sequence === loadSequence.current) setError(errMsg(e)); }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { ++loadSequence.current; }; }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = () => {
    if (!start || !end || start > end) { setError('เลือกช่วงวันที่ให้ถูกต้อง'); return; }
    if (!legacyMonth && range.start === start && range.end === end) { void load(); return; }
    setLegacyMonth(''); setRange({ start, end });
  };

  const action = async (act: string, extra: object = {}) => {
    if (loading || actionBusy || !data) return;
    setActionBusy(true);
    try {
      const payload = { action: act, ...(legacyMonth ? { month: legacyMonth } : range), expectedRevision: data.revision ?? 0, ...extra };
      await sendJson('/api/truck/payroll', 'POST', payload, payrollIntent.current.requestId(payload));
      payrollIntent.current.complete(); await load();
    } catch (e) { setError(errMsg(e)); throw e; }
    finally { setActionBusy(false); }
  };

  const drivers = useMemo(() => {
    if (!data) return [];
    return data.state === 'CLOSED' ? (data.snapshot?.drivers || []) : (data.preview?.drivers || []);
  }, [data]);

  useEffect(() => {
    if (drivers.length > 0) {
      if (!selectedDriverId || !drivers.some((d: any) => d.driverId === selectedDriverId)) {
        setSelectedDriverId(drivers[0].driverId);
      }
    } else {
      setSelectedDriverId('');
    }
  }, [drivers, selectedDriverId]);

  const selectedDriver = useMemo(() => {
    return drivers.find((d: any) => d.driverId === selectedDriverId) || null;
  }, [drivers, selectedDriverId]);

  const payment = data?.payments?.[selectedDriverId];
  const departureDates = [...new Set<string>((selectedDriver?.trips || []).map((trip: any) => trip.departureDate).filter(Boolean))].sort();
  const showLegacyBase = Boolean(data?.state === 'CLOSED' && data?.snapshot?.payBasis !== 'TRIPS_ONLY' && (selectedDriver?.days?.length || selectedDriver?.baseSatang > 0));

  const openPayModal = (driver: any) => {
    setPayDriverTarget(driver);
    setPayDate(getBangkokToday());
    setPayNote('');
    setPayError('');
  };

  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDriverTarget) return;
    if (!payDate) { setPayError('เลือกวันที่จ่ายเงิน'); return; }
    try {
      await action('PAY', {
        driverId: payDriverTarget.driverId,
        paidDate: payDate,
        note: payNote.trim() || undefined
      });
      setPayDriverTarget(null);
    } catch (err) {
      setPayError(errMsg(err));
    }
  };

  const openVoidPaymentModal = (driver: any) => {
    setVoidDriverTarget(driver);
    setVoidReason('');
    setVoidError('');
  };

  const submitVoidPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidDriverTarget) return;
    if (!voidReason.trim()) { setVoidError('ระบุเหตุผลที่ยกเลิก'); return; }
    try {
      await action('VOID_PAYMENT', {
        driverId: voidDriverTarget.driverId,
        reason: voidReason.trim()
      });
      setVoidDriverTarget(null);
    } catch (err) {
      setVoidError(errMsg(err));
    }
  };

  const openReopenModal = () => {
    setReopenReason('');
    setReopenError('');
    setReopenModalOpen(true);
  };

  const submitReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) { setReopenError('ระบุเหตุผลที่เปิดรอบ'); return; }
    try {
      await action('REOPEN', { reason: reopenReason.trim() });
      setReopenModalOpen(false);
    } catch (err) {
      setReopenError(errMsg(err));
    }
  };

  return (
    <main className={docStyles.page} data-app-theme="truck">
      <header className={docStyles.pageHeader}>
        <Link className="btn btn-secondary btn-sm" style={{ width: 'fit-content' }} href="/truck/reports">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>กลับหน้ารายงาน</span>
        </Link>
        <div>
          <h1>รอบค่าเที่ยวคนขับ</h1>
          <p className={docStyles.context}>สรุปค่าเที่ยวตามวันที่ออกรถและบันทึกการจ่ายเงิน</p>
        </div>
      </header>

      <section className={docStyles.block}>
        <h2>ค้นหารอบค่าเที่ยว</h2>
        <div className={docStyles.filterGrid}>
          <label>
            <span>จากวันที่</span>
            <input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} />
          </label>
          <label>
            <span>ถึงวันที่</span>
            <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} />
          </label>
          <label>
            <span>เลือกคนขับ</span>
            <select value={selectedDriverId} onChange={e => setSelectedDriverId(e.target.value)}>
              {drivers.length === 0 && <option value="">ไม่มีคนขับในรอบนี้</option>}
              {drivers.map((d: any) => (
                <option key={d.driverId} value={d.driverId}>
                  {d.driverName} (รวม {formatMoney(d.totalSatang)} บาท)
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" disabled={loading || actionBusy} onClick={search}>
            <Search size={19} aria-hidden="true" />
            <span>ค้นหารอบค่าเที่ยว</span>
          </button>
        </div>

        <p className={docStyles.context}>
          รอบที่แสดง {month} · {showLegacyBase ? 'แสดงยอดตามรอบเดิมที่ปิดไว้' : 'รวมเฉพาะค่าเที่ยวตามวันที่ออกรถ'}
        </p>

        {data?.periods?.length > 0 && (
          <label className={docStyles.savedPeriod}>
            <span>รอบที่บันทึกไว้</span>
            <select
              disabled={actionBusy || loading}
              value={data.periodId || legacyMonth || ''}
              onChange={e => {
                const period = data.periods.find((p: any) => p.id === e.target.value);
                if (!period) return;
                setStart(period.start); setEnd(period.end); setRange({ start: period.start, end: period.end });
                setLegacyMonth(/^20\d{2}-\d{2}$/.test(period.id) ? period.id : '');
              }}
            >
              <option value="">เลือกรอบเดิม</option>
              {data.periods.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.start} ถึง {p.end} · {p.state === 'CLOSED' ? 'ปิดแล้ว' : 'ยังเปิดรอบ'}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {loading && <div className="refreshStatus" role="status">กำลังค้นหารอบค่าเที่ยว</div>}
      {error && <p className="app-notice app-notice-danger" role="alert">{error}</p>}

      {data && (
        <>
          <div className={`${docStyles.block} ${docStyles.statusBlock}`}>
            <p style={{ fontWeight: 700 }}>
              สถานะรอบค่าแรง:{' '}
              {data.state === 'CLOSED'
                ? <strong style={{ color: 'var(--team-full)' }}>ปิดรอบแล้ว</strong>
                : <strong style={{ color: 'var(--team-half)' }}>ยังเปิดรอบ</strong>}
            </p>
            {data.state === 'CLOSED' && (
              <button type="button" className="btn btn-warning btn-sm" disabled={actionBusy} onClick={openReopenModal}>
                <LockOpen size={18} aria-hidden="true" />
                <span>เปิดรอบแก้ไข</span>
              </button>
            )}
          </div>

          {selectedDriver ? (
            <div className={docStyles.driverReport}>
              <section className={`${reports.summaryCard} ${docStyles.driverTotal}`} aria-label="ยอดรวมสุทธิ">
                <p className={reports.summaryLabel}>ยอดรวมสุทธิ · {selectedDriver.driverName}</p>
                <p className={reports.summaryMoney}>{formatMoney(selectedDriver.totalSatang || 0)} บาท</p>
                <p className={reports.summarySub}>{selectedDriver.trips?.length || 0} เที่ยว · ออกรถ {departureDates.length} วัน</p>
              </section>

              {showLegacyBase && (
                <section className={docStyles.block}>
                  <h3>วันทำงานฐาน ({selectedDriver.days?.length || 0} วัน · รวม {formatMoney(selectedDriver.baseSatang || 0)} บาท)</h3>
                  {(!selectedDriver.days || selectedDriver.days.length === 0) ? (
                    <p className={styles.hint}>ไม่มีวันทำงานฐานในช่วงนี้</p>
                  ) : (
                    <div className={styles.tableWrap} role="region" aria-label="ตารางค่าแรงฐาน" tabIndex={0}>
                      <p className={docStyles.tableHint}>เลื่อนตารางซ้าย-ขวาเพื่อดูข้อมูลครบ</p>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>ลำดับ</th>
                            <th>วันที่ทำงาน</th>
                            <th className={styles.num}>ค่าแรงรายวัน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDriver.days.map((day: any, idx: number) => (
                            <tr key={`${day.date}-${idx}`}>
                              <td>{idx + 1}</td>
                              <td>{formatThaiDate(day.date)} ({day.date})</td>
                              <td className={styles.num}>{formatMoney(day.baseSatang)} บาท</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th colSpan={2} style={{ textAlign: 'right' }}>รวมค่าแรงฐาน ({selectedDriver.days.length} วัน)</th>
                            <th className={styles.num}>{formatMoney(selectedDriver.baseSatang)} บาท</th>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </section>
              )}

              <section className={docStyles.block}>
                <h3>
                  เที่ยววิ่ง ({selectedDriver.trips?.length || 0} เที่ยว · ออกรถ {departureDates.length} วัน · รวม {formatMoney(selectedDriver.tripSatang || 0)} บาท)
                </h3>
                {(!selectedDriver.trips || selectedDriver.trips.length === 0) ? (
                  <p className={styles.hint}>ไม่มีเที่ยววิ่งในช่วงนี้</p>
                ) : (
                  <div className={styles.tableWrap} role="region" aria-label="ตารางรายละเอียดเที่ยววิ่ง" tabIndex={0}>
                    <p className={docStyles.tableHint}>เลื่อนตารางซ้าย-ขวาเพื่อดูข้อมูลครบ</p>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>ลำดับ</th>
                          <th>วันที่ออก</th>
                          <th>ทะเบียนรถ</th>
                          <th>เส้นทาง</th>
                          <th className={styles.num}>ค่าเที่ยวคนขับ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDriver.trips.map((trip: any, idx: number) => (
                          <tr key={trip.tripId || idx}>
                            <td>{idx + 1}</td>
                            <td>{trip.departureDate || '-'}</td>
                            <td>{trip.plate || 'ไม่ระบุ'}</td>
                            <td>{tripLocationNames(trip).origin} → {tripLocationNames(trip).destination}</td>
                            <td className={styles.num}><strong>{formatMoney(trip.driverPaySatang)} บาท</strong></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={4} style={{ textAlign: 'right' }}>รวมค่าเที่ยว ({selectedDriver.trips.length} เที่ยว)</th>
                          <th className={styles.num}>{formatMoney(selectedDriver.tripSatang)} บาท</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              <section className={docStyles.block}>
                <h3>สรุปยอดและสถานะการจ่าย</h3>
                <div className={docStyles.summary}>
                  {showLegacyBase && (
                    <div className={docStyles.summaryRow}>
                      <span>ค่าแรงฐาน ({selectedDriver.days?.length || 0} วัน)</span>
                      <strong>{formatMoney(selectedDriver.baseSatang || 0)} บาท</strong>
                    </div>
                  )}
                  <div className={docStyles.summaryRow}>
                    <span>วันที่ออกรถ</span>
                    <strong>{departureDates.length} วัน</strong>
                  </div>
                  <div className={docStyles.summaryRow}>
                    <span>ค่าเที่ยว ({selectedDriver.trips?.length || 0} เที่ยว)</span>
                    <strong>{formatMoney(selectedDriver.tripSatang || 0)} บาท</strong>
                  </div>
                  {selectedDriver.extraSatang > 0 && (
                    <div className={docStyles.summaryRow}>
                      <span>เงินเพิ่มเดิม</span>
                      <strong>{formatMoney(selectedDriver.extraSatang)} บาท</strong>
                    </div>
                  )}

                  <div className={docStyles.summaryFooter}>
                    <div>
                      <strong>สถานะ: </strong>
                      {data.state === 'OPEN' ? (
                        <strong style={{ color: 'var(--team-half)' }}>ยังเปิดรอบ (รอปิดรอบ)</strong>
                      ) : payment?.status === 'PAID' ? (
                        <strong style={{ color: 'var(--team-full)' }}>
                          จ่ายแล้วเมื่อ {payment.paidDate} {payment.note ? `(${payment.note})` : ''}
                        </strong>
                      ) : (
                        <strong style={{ color: 'var(--team-absent)' }}>รอจ่ายเงิน</strong>
                      )}
                    </div>

                    {data.state === 'CLOSED' && (
                      <div className={docStyles.paymentActions}>
                        {payment?.status === 'PAID' ? (
                          <button type="button" className="btn btn-danger" disabled={actionBusy} onClick={() => openVoidPaymentModal(selectedDriver)}>
                            ยกเลิกบันทึกจ่าย
                          </button>
                        ) : (
                          <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={() => openPayModal(selectedDriver)}>
                            <Wallet size={19} aria-hidden="true" />
                            <span>บันทึกจ่ายเงิน</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void download(`/api/truck/payroll/pdf?${query}&driverId=${encodeURIComponent(selectedDriver.driverId)}`, `payroll-${month}-${selectedDriver.driverName}.pdf`).catch(e => setError(errMsg(e)))}
                        >
                          <FileDown size={19} aria-hidden="true" />
                          <span>ดาวน์โหลด PDF</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <p className={styles.empty}>ไม่มีข้อมูลคนขับในรอบนี้</p>
          )}

          {data.state === 'OPEN' && data.preview && (
            <section className={`${docStyles.block} ${docStyles.closeBlock}`} aria-labelledby="payroll-preview-title">
              <h2 id="payroll-preview-title">ตรวจสอบก่อนปิดรอบ</h2>
              {data.legacyReviewRequired && <p className="app-notice app-notice-danger" role="alert" style={{ marginBottom: '0.85rem' }}>มีใบงานเดิมที่ต้องตรวจและยืนยันราคาก่อนปิดรอบ</p>}
              {data.preview.errors.length > 0 && (
                <div className="app-notice app-notice-danger" role="alert" style={{ marginBottom: '0.85rem' }}>
                  <p style={{ margin: 0 }}>ข้อมูลคนขับหรือค่าเที่ยวไม่ครบ {data.preview.errors.length} เที่ยว</p>
                  <p style={{ margin: '0.25rem 0 0' }}>รหัสเที่ยว: {data.preview.errors.join(', ')}</p>
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={actionBusy || loading || !data.preview.canClose || data.legacyReviewRequired}
                onClick={() => void action('CLOSE').catch(() => {})}
              >
                <Lock size={19} aria-hidden="true" />
                <span>ปิดรอบค่าแรง</span>
              </button>
            </section>
          )}
        </>
      )}

      {payDriverTarget && (
        <div className="app-modal-overlay">
          <form onSubmit={submitPay} data-app-dialog role="dialog" aria-modal="true" aria-labelledby="pay-driver-title" tabIndex={-1} className="app-modal-card">
            <h3 id="pay-driver-title" className="app-modal-title">บันทึกจ่ายค่าแรง</h3>
            <p style={{ margin: '0 0 0.3rem' }}>คนขับ: <strong>{payDriverTarget.driverName}</strong></p>
            <p className="app-modal-desc">รอบ {month} · ยอดสุทธิ <strong>{formatMoney(payDriverTarget.totalSatang)} บาท</strong></p>

            <div className={docStyles.modalFields}>
              <label>
                <span>วันที่จ่ายเงิน *</span>
                <input type="date" required value={payDate} onChange={e => setPayDate(e.target.value)} />
              </label>
              <label>
                <span>หมายเหตุการจ่าย (ถ้ามี)</span>
                <input type="text" placeholder="เช่น โอนเข้าบัญชี หรือ เงินสด" value={payNote} onChange={e => setPayNote(e.target.value)} />
              </label>
            </div>

            {payError && <p className="app-notice app-notice-danger" role="alert">{payError}</p>}

            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPayDriverTarget(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={actionBusy}>ยืนยันบันทึกจ่าย</button>
            </div>
          </form>
        </div>
      )}

      {voidDriverTarget && (
        <div className="app-modal-overlay">
          <form onSubmit={submitVoidPayment} data-app-dialog role="dialog" aria-modal="true" aria-labelledby="void-driver-title" tabIndex={-1} className="app-modal-card">
            <h3 id="void-driver-title" className="app-modal-title app-modal-title-danger">ยกเลิกบันทึกจ่ายค่าแรง</h3>
            <p style={{ margin: '0 0 0.3rem' }}>คนขับ: <strong>{voidDriverTarget.driverName}</strong></p>
            <p className="app-modal-desc">รอบ {month} · ยอดสุทธิ <strong>{formatMoney(voidDriverTarget.totalSatang)} บาท</strong></p>

            <div className={docStyles.modalFields}>
              <label>
                <span>เหตุผลยกเลิกการจ่าย *</span>
                <textarea required rows={3} placeholder="ระบุเหตุผลที่ยกเลิก" value={voidReason} onChange={e => setVoidReason(e.target.value)} />
              </label>
            </div>

            {voidError && <p className="app-notice app-notice-danger" role="alert">{voidError}</p>}

            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setVoidDriverTarget(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-danger-solid" disabled={actionBusy}>ยืนยันยกเลิกการจ่าย</button>
            </div>
          </form>
        </div>
      )}

      {reopenModalOpen && (
        <div className="app-modal-overlay">
          <form onSubmit={submitReopen} data-app-dialog role="dialog" aria-modal="true" aria-labelledby="reopen-modal-title" tabIndex={-1} className="app-modal-card">
            <h3 id="reopen-modal-title" className="app-modal-title app-modal-title-warning">เปิดรอบแก้ไขค่าแรง</h3>
            <p className="app-modal-desc">
              ช่วงวันที่ <strong>{month}</strong> · เปิดรอบเพื่อแก้ไขเที่ยววิ่ง แล้วปิดรอบใหม่ได้
            </p>

            <div className={docStyles.modalFields}>
              <label>
                <span>เหตุผลที่เปิดรอบ *</span>
                <textarea required rows={3} placeholder="เช่น เพิ่มเที่ยววิ่งย้อนหลัง หรือแก้ไขค่าเที่ยว" value={reopenReason} onChange={e => setReopenReason(e.target.value)} />
              </label>
            </div>

            {reopenError && <p className="app-notice app-notice-danger" role="alert">{reopenError}</p>}

            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setReopenModalOpen(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-warning-solid" disabled={actionBusy}>ยืนยันเปิดรอบ</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
