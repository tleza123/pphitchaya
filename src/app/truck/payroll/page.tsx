'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MutationIntent } from '@/lib/client/mutation-intent';
import { download, errMsg, getJson, sendJson } from '@/components/truck/api';
import { formatMoney } from '@/lib/payroll/money';
import { formatThaiDate, getBangkokMonth, getBangkokToday } from '@/lib/payroll/dates';
import { useModalInteraction } from '@/components/shared/useModalInteraction';
import styles from '@/components/truck/truck.module.css';

export default function TruckPayrollPage() {
  const [workDate, setWorkDate] = useState(getBangkokToday());
  const [workDrivers, setWorkDrivers] = useState<any[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [workRevision, setWorkRevision] = useState(0);
  const workIntent = useRef(new MutationIntent());
  const payrollIntent = useRef(new MutationIntent());

  const loadWork = async () => {
    try {
      const [settings, days] = await Promise.all([
        getJson('/api/truck/settings'),
        getJson(`/api/truck/workdays?month=${workDate.slice(0, 7)}&date=${workDate}`),
      ]);
      setWorkDrivers(settings.truckDrivers || []);
      const day = days.workDays.find((d: any) => d.dateKey === workDate);
      setChosen((day?.drivers || []).map((d: any) => d.driverId));
      setWorkRevision(day?.revision || 0);
      setSuggested(days.suggestedDriverIds || []);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  useEffect(() => {
    void loadWork();
  }, [workDate]);

  const saveWork = async () => {
    try {
      const payload = { dateKey: workDate, driverIds: chosen, expectedRevision: workRevision };
      await sendJson('/api/truck/workdays', 'POST', payload, workIntent.current.requestId(payload));
      workIntent.current.complete();
      await loadWork();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const [month, setMonth] = useState(getBangkokMonth());
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  // Modals state
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
    try {
      const res = await getJson(`/api/truck/payroll?month=${month}`);
      setData(res);
      setError('');
    } catch (e) {
      setError(errMsg(e));
    }
  };

  useEffect(() => {
    void load();
  }, [month]);

  const action = async (act: string, extra: object = {}) => {
    try {
      const payload = { action: act, month, expectedRevision: data?.revision ?? 0, ...extra };
      await sendJson('/api/truck/payroll', 'POST', payload, payrollIntent.current.requestId(payload));
      payrollIntent.current.complete();
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const drivers = useMemo(() => {
    if (!data) return [];
    return data.state === 'CLOSED' ? (data.snapshot?.drivers || []) : (data.preview?.drivers || []);
  }, [data]);

  // Auto-select first driver if none selected or selected driver not in current list
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

  // Pay modal actions
  const openPayModal = (driver: any) => {
    setPayDriverTarget(driver);
    setPayDate(getBangkokToday());
    setPayNote('');
    setPayError('');
  };

  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDriverTarget) return;
    if (!payDate) {
      setPayError('กรุณากรอกวันที่จ่ายเงิน');
      return;
    }
    try {
      await action('PAY', {
        driverId: payDriverTarget.driverId,
        paidDate: payDate,
        note: payNote.trim() || undefined,
      });
      setPayDriverTarget(null);
    } catch (err) {
      setPayError(errMsg(err));
    }
  };

  // Void pay modal actions
  const openVoidPaymentModal = (driver: any) => {
    setVoidDriverTarget(driver);
    setVoidReason('');
    setVoidError('');
  };

  const submitVoidPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidDriverTarget) return;
    if (!voidReason.trim()) {
      setVoidError('กรุณาระบุเหตุผลในการยกเลิก');
      return;
    }
    try {
      await action('VOID_PAYMENT', {
        driverId: voidDriverTarget.driverId,
        reason: voidReason.trim(),
      });
      setVoidDriverTarget(null);
    } catch (err) {
      setVoidError(errMsg(err));
    }
  };

  // Reopen modal actions
  const openReopenModal = () => {
    setReopenReason('');
    setReopenError('');
    setReopenModalOpen(true);
  };

  const submitReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      setReopenError('กรุณาระบุเหตุผลในการเปิดรอบ');
      return;
    }
    try {
      await action('REOPEN', {
        reason: reopenReason.trim(),
      });
      setReopenModalOpen(false);
    } catch (err) {
      setReopenError(errMsg(err));
    }
  };

  return (
    <main className={styles.payrollPage}>
      <Link href="/truck/reports">กลับหน้ารายงาน</Link>
      <h1>รอบค่าแรงคนขับ</h1>

      {/* Workday confirmation section (retained first section for QA) */}
      <section className={styles.payrollSection}>
        <h2>ยืนยันวันทำงานคนขับ</h2>
        <label>วันที่ <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} /></label>
        <p>คำแนะนำจากเที่ยวที่ครอบคลุมวันนี้ ต้องตรวจสอบก่อนยืนยัน</p>
        {workDrivers.filter(d => d.status === 'ACTIVE' || chosen.includes(d.driverId)).map(d => (
          <label key={d.driverId} style={{ display: 'block' }}>
            <input type="checkbox" checked={chosen.includes(d.driverId)} onChange={e => setChosen(v => e.target.checked ? [...v, d.driverId] : v.filter(id => id !== d.driverId))} />
            {' '}{d.name} {suggested.includes(d.driverId) ? ' (แนะนำจากเที่ยว)' : ''}
          </label>
        ))}
        <button type="button" onClick={() => void saveWork()}>ยืนยันวันทำงาน</button>
      </section>

      {/* Month & Driver selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'end', marginTop: '0.5rem' }}>
        <label style={{ display: 'block' }}>
          <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>เดือนงาน</span>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>เลือกคนขับ</span>
          <select
            value={selectedDriverId}
            onChange={e => setSelectedDriverId(e.target.value)}
            style={{ width: '100%', minHeight: '48px', padding: '.6rem .75rem', border: '1px solid var(--team-border-strong)', borderRadius: 'var(--team-radius-small)', background: 'var(--team-surface)', color: 'var(--team-text)', fontSize: '16px' }}
          >
            {drivers.length === 0 && <option value="">-- ไม่พบข้อมูลคนขับในรอบนี้ --</option>}
            {drivers.map((d: any) => (
              <option key={d.driverId} value={d.driverId}>
                {d.driverName} (รวม {formatMoney(d.totalSatang)} บาท)
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert">{error}</p>}

      {data && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', padding: '0.5rem 0' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              สถานะรอบค่าแรง: {data.state === 'CLOSED' ? <strong style={{ color: 'var(--team-primary-dark)' }}>ปิดรอบแล้ว</strong> : <span style={{ color: 'var(--team-half, #d97706)' }}>ยังเปิดรอบ</span>}
            </p>
            {data.state === 'CLOSED' && (
              <button type="button" onClick={openReopenModal}>เปิดรอบแก้ไข</button>
            )}
          </div>

          {/* Driver specific details: Block 1, 2, 3 */}
          {selectedDriver ? (
            <div style={{ display: 'grid', gap: '1.25rem' }}>
              {/* Block 1: วันทำงานฐาน */}
              <section className={styles.payrollSection}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.4rem' }}>
                  Block 1: วันทำงานฐาน ({selectedDriver.days?.length || 0} วัน · รวม {formatMoney(selectedDriver.baseSatang || 0)} บาท)
                </h3>
                {(!selectedDriver.days || selectedDriver.days.length === 0) ? (
                  <p className={styles.hint}>ไม่มีวันทำงานฐานในเดือนนี้</p>
                ) : (
                  <div className={styles.tableWrap} style={{ marginTop: '0.5rem' }}>
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
                          <th className={styles.num} style={{ color: 'var(--team-primary-dark)' }}>{formatMoney(selectedDriver.baseSatang)} บาท</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              {/* Block 2: เที่ยววิ่ง */}
              <section className={styles.payrollSection}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.4rem' }}>
                  Block 2: เที่ยววิ่ง ({selectedDriver.trips?.length || 0} เที่ยว · รวม {formatMoney(selectedDriver.tripSatang || 0)} บาท)
                </h3>
                {(!selectedDriver.trips || selectedDriver.trips.length === 0) ? (
                  <p className={styles.hint}>ไม่มีเที่ยววิ่งในเดือนนี้</p>
                ) : (
                  <div className={styles.tableWrap} style={{ marginTop: '0.5rem' }}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>ลำดับ</th>
                          <th>วันที่เริ่มงาน</th>
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
                            <td>{trip.origin} → {trip.destination}</td>
                            <td className={styles.num}>{formatMoney(trip.driverPaySatang)} บาท</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={4} style={{ textAlign: 'right' }}>รวมค่าเที่ยว ({selectedDriver.trips.length} เที่ยว)</th>
                          <th className={styles.num} style={{ color: 'var(--team-primary-dark)' }}>{formatMoney(selectedDriver.tripSatang)} บาท</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              {/* Block 3: ยอดรวมสุทธิ */}
              <section className={styles.payrollSection}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.6rem' }}>
                  Block 3: ยอดรวมสุทธิและสถานะการจ่าย
                </h3>
                <div style={{ display: 'grid', gap: '0.6rem', background: 'var(--team-surface)', padding: '1rem', border: '1px solid var(--team-border)', borderRadius: 'var(--team-radius-card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ค่าแรงฐาน ({selectedDriver.days?.length || 0} วัน):</span>
                    <span>{formatMoney(selectedDriver.baseSatang || 0)} บาท</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ค่าเที่ยว ({selectedDriver.trips?.length || 0} เที่ยว):</span>
                    <span>{formatMoney(selectedDriver.tripSatang || 0)} บาท</span>
                  </div>
                  {selectedDriver.extraSatang > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>เงินเพิ่มเดิม:</span>
                      <span>{formatMoney(selectedDriver.extraSatang)} บาท</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid var(--team-primary)', paddingTop: '0.6rem', fontSize: '1.2rem', fontWeight: 700 }}>
                    <span style={{ color: 'var(--team-primary-dark)' }}>ยอดรวมสุทธิ:</span>
                    <span style={{ color: 'var(--team-primary-dark)' }}>{formatMoney(selectedDriver.totalSatang || 0)} บาท</span>
                  </div>

                  <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.8rem', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--team-border)', paddingTop: '0.75rem' }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>สถานะ: </span>
                      {data.state === 'OPEN' ? (
                        <span style={{ color: 'var(--team-half, #d97706)', fontWeight: 700 }}>ยังเปิดรอบ (รอปิดรอบค่าแรง)</span>
                      ) : payment?.status === 'PAID' ? (
                        <span style={{ color: 'var(--team-full, #16a34a)', fontWeight: 700 }}>
                          จ่ายแล้วเมื่อ {payment.paidDate} {payment.note ? `(${payment.note})` : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--team-absent, #dc2626)', fontWeight: 700 }}>รอจ่ายเงิน</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                      {data.state === 'CLOSED' && (
                        <button
                          type="button"
                          onClick={() => void download(`/api/truck/payroll/pdf?month=${month}&driverId=${encodeURIComponent(selectedDriver.driverId)}`, `payroll-${month}-${selectedDriver.driverName}.pdf`).catch(e => setError(errMsg(e)))}
                        >
                          ดาวน์โหลด PDF
                        </button>
                      )}

                      {data.state === 'CLOSED' && payment?.status === 'PAID' && (
                        <button type="button" onClick={() => openVoidPaymentModal(selectedDriver)}>
                          ยกเลิกบันทึกจ่าย
                        </button>
                      )}

                      {data.state === 'CLOSED' && payment?.status !== 'PAID' && (
                        <button type="button" onClick={() => openPayModal(selectedDriver)}>
                          บันทึกจ่าย
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <p className={styles.empty}>ไม่มีข้อมูลคนขับในรอบนี้</p>
          )}

          {/* Open state preview & close button (last button in main) */}
          {data.state === 'OPEN' && data.preview && (
            <section className={styles.payrollSection} aria-labelledby="payroll-preview-title" style={{ marginTop: '1.5rem' }}>
              <h2 id="payroll-preview-title">ตรวจสอบก่อนปิดรอบ</h2>
              {data.legacyReviewRequired && <p role="alert">มีใบงานเดิมที่ต้องตรวจและย้ายข้อมูลก่อนปิดรอบ</p>}
              {data.preview.pending.length > 0 && (
                <div role="alert">
                  <h3>เที่ยวค้าง {data.preview.pending.length} เที่ยว</h3>
                  {data.preview.pending.map((trip: any) => (
                    <p key={trip.tripId}>{trip.departureDate} · {trip.plate || 'ไม่ระบุรถ'} · {trip.origin} → {trip.destination}</p>
                  ))}
                </div>
              )}
              {data.preview.errors.length > 0 && (
                <div role="alert">
                  <p>ข้อมูลคนขับหรือค่าเที่ยวไม่ครบ {data.preview.errors.length} เที่ยว</p>
                  <p>รหัสเที่ยว: {data.preview.errors.join(', ')}</p>
                </div>
              )}
              <button
                type="button"
                disabled={!data.preview.canClose || data.legacyReviewRequired}
                onClick={() => void action('CLOSE')}
              >
                ปิดรอบค่าแรง
              </button>
            </section>
          )}
        </>
      )}

      {/* Pay Modal */}
      {payDriverTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 120 }}>
          <form
            onSubmit={submitPay}
            data-app-dialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-driver-title"
            tabIndex={-1}
            style={{ width: 'min(30rem, 100%)', background: '#fff', borderRadius: 'var(--team-radius-card, 12px)', border: '1px solid var(--team-border)', padding: '1.25rem', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 id="pay-driver-title" style={{ margin: '0 0 0.8rem', color: 'var(--team-primary-dark)' }}>บันทึกจ่ายค่าแรง</h3>
            <p style={{ margin: '0 0 0.4rem', color: 'var(--team-text)' }}>
              คนขับ: <strong>{payDriverTarget.driverName}</strong>
            </p>
            <p style={{ margin: '0 0 1rem', color: 'var(--team-muted)', fontSize: '0.9rem' }}>
              เดือน {month} · ยอดสุทธิ <strong>{formatMoney(payDriverTarget.totalSatang)} บาท</strong>
            </p>

            <div style={{ display: 'grid', gap: '0.8rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>วันที่จ่ายเงิน *</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  style={{ width: '100%', minHeight: '48px', padding: '.6rem .75rem', border: '1px solid var(--team-border-strong)', borderRadius: 'var(--team-radius-small)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>หมายเหตุการจ่าย (ถ้ามี)</label>
                <input
                  type="text"
                  placeholder="เช่น โอนเข้าบัญชี หรือ เงินสด"
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  style={{ width: '100%', minHeight: '48px', padding: '.6rem .75rem', border: '1px solid var(--team-border-strong)', borderRadius: 'var(--team-radius-small)' }}
                />
              </div>
            </div>

            {payError && <p role="alert" style={{ color: 'var(--team-absent)', marginBottom: '0.8rem' }}>{payError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" onClick={() => setPayDriverTarget(null)} style={{ background: 'var(--team-surface)', color: 'var(--team-text)', border: '1px solid var(--team-border-strong)' }}>ยกเลิก</button>
              <button type="submit">ยืนยันบันทึกจ่าย</button>
            </div>
          </form>
        </div>
      )}

      {/* Void Pay Modal */}
      {voidDriverTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 120 }}>
          <form
            onSubmit={submitVoidPayment}
            data-app-dialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-driver-title"
            tabIndex={-1}
            style={{ width: 'min(30rem, 100%)', background: '#fff', borderRadius: 'var(--team-radius-card, 12px)', border: '1px solid var(--team-border)', padding: '1.25rem', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 id="void-driver-title" style={{ margin: '0 0 0.8rem', color: 'var(--team-absent, #dc2626)' }}>ยกเลิกบันทึกจ่ายค่าแรง</h3>
            <p style={{ margin: '0 0 0.4rem', color: 'var(--team-text)' }}>
              คนขับ: <strong>{voidDriverTarget.driverName}</strong>
            </p>
            <p style={{ margin: '0 0 1rem', color: 'var(--team-muted)', fontSize: '0.9rem' }}>
              เดือน {month} · ยอดสุทธิ <strong>{formatMoney(voidDriverTarget.totalSatang)} บาท</strong>
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>เหตุผลยกเลิกการจ่าย *</label>
              <textarea
                required
                rows={3}
                placeholder="ระบุเหตุผลในการยกเลิกบันทึกจ่าย"
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                style={{ width: '100%', minHeight: '80px', padding: '.6rem .75rem', border: '1px solid var(--team-border-strong)', borderRadius: 'var(--team-radius-small)' }}
              />
            </div>

            {voidError && <p role="alert" style={{ color: 'var(--team-absent)', marginBottom: '0.8rem' }}>{voidError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" onClick={() => setVoidDriverTarget(null)} style={{ background: 'var(--team-surface)', color: 'var(--team-text)', border: '1px solid var(--team-border-strong)' }}>ยกเลิก</button>
              <button type="submit" style={{ background: 'var(--team-absent, #dc2626)', borderColor: 'var(--team-absent, #dc2626)' }}>ยืนยันยกเลิกการจ่าย</button>
            </div>
          </form>
        </div>
      )}

      {/* Reopen Modal */}
      {reopenModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 120 }}>
          <form
            onSubmit={submitReopen}
            data-app-dialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="reopen-modal-title"
            tabIndex={-1}
            style={{ width: 'min(30rem, 100%)', background: '#fff', borderRadius: 'var(--team-radius-card, 12px)', border: '1px solid var(--team-border)', padding: '1.25rem', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 id="reopen-modal-title" style={{ margin: '0 0 0.8rem', color: 'var(--team-primary-dark)' }}>เปิดรอบแก้ไขค่าแรง</h3>
            <p style={{ margin: '0 0 1rem', color: 'var(--team-text)' }}>
              เดือน <strong>{month}</strong> · การเปิดรอบแก้ไขจะอนุญาตให้แก้ไขวันทำงานและค่าเที่ยววิ่งได้
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem', fontWeight: 600 }}>เหตุผลที่เปิดรอบ *</label>
              <textarea
                required
                rows={3}
                placeholder="ระบุเหตุผล เช่น มีการเพิ่มเที่ยววิ่งย้อนหลัง, แก้ไขวันทำงาน"
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                style={{ width: '100%', minHeight: '80px', padding: '.6rem .75rem', border: '1px solid var(--team-border-strong)', borderRadius: 'var(--team-radius-small)' }}
              />
            </div>

            {reopenError && <p role="alert" style={{ color: 'var(--team-absent)', marginBottom: '0.8rem' }}>{reopenError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" onClick={() => setReopenModalOpen(false)} style={{ background: 'var(--team-surface)', color: 'var(--team-text)', border: '1px solid var(--team-border-strong)' }}>ยกเลิก</button>
              <button type="submit">ยืนยันเปิดรอบแก้ไข</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
