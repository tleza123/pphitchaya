'use client';
import { useHistoryState } from '@/components/shared/useHistoryState';
import { usePendingAction } from '@/components/shared/usePendingAction';
import { matchesReportSelection } from '@/lib/client/navigation';
import { useModalInteraction } from '@/components/shared/useModalInteraction';
import { MutationIntent } from '@/lib/client/mutation-intent';
import { notifyDataChanged } from '@/lib/client/data-events';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, ChartNoAxesCombined, ChevronRight, FileArchive, FileDown, Lock, LockOpen, Plus } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { formatMoney } from '@/lib/payroll/money';
import { formatThaiDate, formatThaiMonth } from '@/lib/payroll/dates';
import { LineSendButton } from '@/components/shared/LineSendButton';
import styles from './reports.module.css';

interface EmployeeReportSummary {
  employeeId: string;
  name: string;
  nickname?: string;
  position: string;
  full: number;
  half: number;
  absent: number;
  workedDays: number;
  paidDayUnits: number;
  pending: number;
  baseSatang: number;
  extraSatang: number;
  advanceSatang?: number;
  deductionSatang?: number;
  grossSatang?: number;
  totalSatang: number;
  error?: string;
}

interface ReportsTabProps {
  active: boolean;
  attendanceVersion: number;
  initialMonth: string;
  serverToday: string;
  onOpenDetailedReports: () => void;
}

export function ReportsTab({ active, attendanceVersion, initialMonth, serverToday, onOpenDetailedReports }: ReportsTabProps) {
  const { idToken } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedEmployeeId, setSelectedEmployeeId] = useHistoryState<string | null>('report-person', null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState('');
  const currentSelection = useRef({ employeeId: selectedEmployeeId, month: selectedMonth });
  currentSelection.current = { employeeId: selectedEmployeeId, month: selectedMonth };
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const { pending: reportPending, run: runReportAction } = usePendingAction();
  const exportLock = useRef(false);
  const extraIntent = useRef(new MutationIntent());

  const exportSalary = async (employeeId?: string) => {
    if (!idToken || exportLock.current) return;
    exportLock.current = true; setExporting(true); setExportError('');
    const month = selectedMonth;
    try {
      const query = new URLSearchParams({ month, ...(employeeId ? { employeeId } : {}) });
      const response = await fetch(`/api/reports/export?${query}`, { headers: { Authorization: `Bearer ${idToken}` } });
      if (!response.ok) {
        const json = await response.json(); throw new Error(json.error?.message || 'ส่งออกไม่สำเร็จ');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `เงินเดือน-${month}${employeeId ? `-${detailData?.nickname || detailData?.name || employeeId}.pdf` : '-ทุกคน.zip'}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { setExportError(error instanceof Error ? error.message : 'ส่งออกไม่สำเร็จ'); }
    finally { exportLock.current = false; setExporting(false); }
  };

  const [showCloseModal, setShowCloseModal] = useHistoryState<boolean>('close-month', false);
  const [closeStatus, setCloseStatus] = useState<any>(null);
  const [closeLoading, setCloseLoading] = useState<boolean>(false);
  const [showReopenModal, setShowReopenModal] = useHistoryState<boolean>('reopen-month', false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [showExtrasModal, setShowExtrasModal] = useHistoryState<boolean>('report-extras', false);
  const [extraType, setExtraType] = useState<'BONUS' | 'DEDUCTION'>('BONUS');
  const [newExtraLabel, setNewExtraLabel] = useState<string>('');
  const [newExtraAmount, setNewExtraAmount] = useState<string>('');
  useModalInteraction(active && (showCloseModal || showReopenModal || showExtrasModal), () => {
    if (showExtrasModal) setShowExtrasModal(false);
    else if (showReopenModal) setShowReopenModal(false);
    else setShowCloseModal(false);
  });
  const reportFetchSequence = useRef(0);
  const detailFetchSequence = useRef(0);
  const reportController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);

  const fetchMonthlyReport = useCallback(
    async (month: string) => {
      if (!idToken || currentSelection.current.month !== month) return;
      const sequence = ++reportFetchSequence.current;
      reportController.current?.abort();
      const controller = new AbortController(); reportController.current = controller;
      setLoading(true);
      setErrorMsg(null);
      setReportData((previous: any) => previous?.month === month ? previous : null);
      try {
        const res = await fetch(`/api/reports?month=${month}`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${idToken}` }
        });
        const json = await res.json();
        if (sequence !== reportFetchSequence.current || currentSelection.current.month !== month) return;
        if (json.ok) {
          setReportData(json.data);
        } else {
          setReportData(null);
          setErrorMsg(json.error?.message || 'โหลดรายงานไม่สำเร็จ');
        }
      } catch {
        if (sequence === reportFetchSequence.current && !controller.signal.aborted) {
          setReportData(null);
          setErrorMsg('เชื่อมต่อไม่ได้');
        }
      } finally {
        if (sequence === reportFetchSequence.current) setLoading(false);
      }
    },
    [idToken]
  );

  const fetchEmployeeDetail = useCallback(
    async (empId: string, month: string) => {
      if (!idToken || !matchesReportSelection(currentSelection.current, empId, month)) return;
      const sequence = ++detailFetchSequence.current;
      detailController.current?.abort();
      const controller = new AbortController(); detailController.current = controller;
      setDetailData((previous: any) => previous?.employeeId === empId && previous?.month === month ? previous : null);
      setDetailLoading(true);
      setDetailError('');
      try {
        const res = await fetch(`/api/reports/${empId}?month=${month}`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${idToken}` }
        });
        const json = await res.json();
        if (sequence !== detailFetchSequence.current || !matchesReportSelection(currentSelection.current, empId, month)) return;
        if (json.ok) {
          setDetailData(json.data);
        } else {
          setDetailError(json.error?.message || 'โหลดรายละเอียดไม่สำเร็จ');
        }
      } catch {
        if (sequence === detailFetchSequence.current && !controller.signal.aborted && matchesReportSelection(currentSelection.current, empId, month)) setDetailError('โหลดรายละเอียดไม่สำเร็จ');
      } finally {
        if (sequence === detailFetchSequence.current) setDetailLoading(false);
      }
    },
    [idToken]
  );

  useEffect(() => {
    if (active) fetchMonthlyReport(selectedMonth);
  }, [active, attendanceVersion, selectedMonth, fetchMonthlyReport]);
  useEffect(() => () => { reportController.current?.abort(); detailController.current?.abort(); }, []);

  useEffect(() => {
    if (active && selectedEmployeeId) {
      fetchEmployeeDetail(selectedEmployeeId, selectedMonth);
    }
  }, [active, attendanceVersion, selectedEmployeeId, selectedMonth, fetchEmployeeDetail]);

  const handleOpenDetail = (empId: string) => {
    window.history.pushState({ ...window.history.state, attendanceParent: '/reports', attendanceNavigation: {} }, '', '/reports/detailed');
    setSelectedEmployeeId(empId);
    window.history.replaceState(window.history.state, '', '/reports');
  };

  const handleBackToDetailedReports = () => {
    detailController.current?.abort(); ++detailFetchSequence.current;
    setDetailLoading(false);
    if (window.history.state?.attendanceOwner === 'report-person') { window.history.back(); return; }
    setSelectedEmployeeId(null);
    setDetailData(null);
    onOpenDetailedReports();
  };

  const handleStartClose = async () => {
    if (!idToken || !reportData || closeLoading) return;
    setCloseLoading(true);
    setCloseStatus(null);
    const requestId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/months/${selectedMonth}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          expectedRevision: reportData.revision,
          requestId
        })
      });
      const json = await res.json();
      if (json.ok) {
        setCloseStatus(json.data);
        handleContinueClose(json.data.jobId);
      } else {
        alert(json.error?.message || 'ปิดรอบเดือนไม่สำเร็จ');
        setCloseLoading(false);
      }
    } catch {
      alert('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง');
      setCloseLoading(false);
    }
  };

  const handleContinueClose = async (jobId: string) => {
    if (!idToken) return;
    try {
      const res = await fetch(`/api/close-jobs/${jobId}/continue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const json = await res.json();
      if (json.ok) {
        setCloseStatus(json.data);
        if (json.data.status === 'IN_PROGRESS') {
          handleContinueClose(jobId);
        } else if (json.data.status === 'COMPLETED') {
          setCloseLoading(false);
          alert('ปิดรอบเดือนแล้ว');
          setShowCloseModal(false);
          notifyDataChanged();
        } else if (json.data.status === 'FAILED') {
          setCloseLoading(false);
        }
      } else {
        alert(json.error?.message || 'ปิดรอบเดือนขัดข้อง');
        setCloseLoading(false);
      }
    } catch {
      alert('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง');
      setCloseLoading(false);
    }
  };

  const handleCancelClose = async (jobId: string) => {
    if (!idToken) return;
    try {
      const res = await fetch(`/api/close-jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const json = await res.json();
      if (json.ok) {
        alert('ยกเลิกการปิดเดือนแล้ว');
        setShowCloseModal(false);
        setCloseStatus(null);
        notifyDataChanged();
      } else {
        alert(json.error?.message || 'ยกเลิกไม่สำเร็จ');
      }
    } catch {
      alert('ยกเลิกไม่สำเร็จ');
    }
  };

  const handleReopen = async () => {
    if (!idToken || !reopenReason.trim()) {
      alert('ระบุเหตุผลก่อนเปิดรอบเดือน');
      return;
    }
    const requestId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/months/${selectedMonth}/reopen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          reason: reopenReason.trim(),
          expectedRevision: reportData?.revision,
          requestId
        })
      });
      const json = await res.json();
      if (json.ok) {
        alert('เปิดรอบเดือนแล้ว');
        setShowReopenModal(false);
        setReopenReason('');
        notifyDataChanged();
      } else {
        alert(json.error?.message || 'เปิดรอบเดือนไม่สำเร็จ');
      }
    } catch {
      alert('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง');
    }
  };

  const handleAddMonthExtra = async () => {
    if (!idToken || !selectedEmployeeId || !newExtraLabel.trim() || !newExtraAmount.trim()) {
      alert('กรอกชื่อรายการและจำนวนเงินให้ครบ');
      return;
    }
    const payload = { employeeId: selectedEmployeeId, label: newExtraLabel.trim(), amount: newExtraAmount.trim(), type: extraType };
    const requestId = extraIntent.current.requestId({ month: selectedMonth, ...payload });
    try {
      const res = await fetch(`/api/months/${selectedMonth}/extras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          ...payload,
          requestId
        })
      });
      const json = await res.json();
      if (json.ok) {
        extraIntent.current.complete();
        alert(extraType === 'DEDUCTION' ? 'บันทึกรายการหักแล้ว' : 'บันทึกเงินพิเศษแล้ว');
        setShowExtrasModal(false);
        setNewExtraLabel('');
        setNewExtraAmount('');
        setExtraType('BONUS');
        notifyDataChanged();
      } else {
        alert(json.error?.message || 'บันทึกไม่สำเร็จ');
      }
    } catch {
      alert('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง');
    }
  };

  const handleConfirmReview = async () => {
    if (!idToken || !selectedEmployeeId) return;
    const requestId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/months/${selectedMonth}/review-extras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          requestId
        })
      });
      const json = await res.json();
      if (json.ok) {
        alert('ยืนยันรายการแล้ว');
        notifyDataChanged();
      } else {
        alert(json.error?.message || 'ยืนยันไม่สำเร็จ');
      }
    } catch {
      alert('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง');
    }
  };

  if (selectedEmployeeId && (!detailData || detailData.employeeId !== selectedEmployeeId || detailData.month !== selectedMonth)) {
    if (detailError) {
      return (
        <div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }} onClick={handleBackToDetailedReports}>
            <ArrowLeft size={18} aria-hidden="true" />
            <span>กลับรายงานละเอียด</span>
          </button>
          <p role="alert" className="app-notice app-notice-danger">{detailError}</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => fetchEmployeeDetail(selectedEmployeeId, selectedMonth)}>
            ลองใหม่
          </button>
        </div>
      );
    }
    return (
      <div aria-busy="true" aria-label="กำลังโหลดรายละเอียดรายงาน">
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }} onClick={handleBackToDetailedReports}>
          <ArrowLeft size={18} aria-hidden="true" />
          <span>กลับรายงานละเอียด</span>
        </button>
        <div className="refreshStatus" role="status">กำลังโหลดรายงานรายบุคคล</div>
        <div className="loadingCard"><span className="loadingLine" /><span className="loadingLine" /></div>
        <div className={styles.reportsGrid}>
          {[0, 1, 2].map(index => <div className="loadingCard" key={index}><span className="loadingLine" /><span className="loadingLine" /></div>)}
        </div>
      </div>
    );
  }

  if (selectedEmployeeId && detailData) {
    return (
      <div className={styles.detailContainer}>
        {detailError && (
          <div className="app-notice app-notice-danger" role="alert" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>{detailError}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fetchEmployeeDetail(selectedEmployeeId, selectedMonth)}>ลองใหม่</button>
          </div>
        )}
        {(detailLoading || reportPending) && <div className="refreshStatus" role="status">{reportPending || 'กำลังอัปเดตรายงาน'}</div>}

        <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }} onClick={handleBackToDetailedReports}>
          <ArrowLeft size={18} aria-hidden="true" />
          <span>กลับรายงานละเอียด</span>
        </button>

        <h2 className={styles.title}>{detailData.nickname || detailData.name}</h2>
        <p className={styles.detailSub}>
          {formatThaiMonth(selectedMonth)} · {detailData.position}
          {detailData.name && detailData.nickname && detailData.name !== detailData.nickname && ` · ${detailData.name}`}
        </p>

        <div className={styles.detailGrid}>
          <div className={styles.detailLeftCol}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>ยอดค่าจ้างเดือนนี้</p>
              <p className={styles.summaryMoney}>{formatMoney(detailData.totalSatang)} บาท</p>
            </div>

            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>เต็มวัน</span>
                <span className={styles.kpiValue}>{detailData.full} วัน</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>ครึ่งวัน</span>
                <span className={styles.kpiValue}>{detailData.half} วัน</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>ไม่มา</span>
                <span className={styles.kpiValue}>{detailData.absent} วัน</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>วันคิดค่าจ้าง</span>
                <span className={styles.kpiValue}>{detailData.paidDayUnits} วัน</span>
              </div>
            </div>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeading}>
                <h3 className={styles.sectionTitle}>รายละเอียดเงิน</h3>
                {!reportData?.isClosed && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={Boolean(reportPending)}
                    onClick={() => {
                      setExtraType('BONUS');
                      setShowExtrasModal(true);
                    }}
                  >
                    <Plus size={18} aria-hidden="true" />
                    <span>เพิ่มเงินพิเศษ / หักเงิน</span>
                  </button>
                )}
              </div>

              <div className={styles.lineItem}>
                <span>ค่าแรงรวม</span>
                <strong>{formatMoney(detailData.baseSatang)} บาท</strong>
              </div>

              {detailData.extras && detailData.extras.length > 0 ? (
                detailData.extras.map((x: any, i: number) => {
                  const isDeduction = x.type === 'DEDUCTION';
                  return (
                    <div key={i} className={`${styles.lineItem} ${isDeduction ? styles.deductionItem : ''}`}>
                      <span>{x.label}</span>
                      <strong>{isDeduction ? `-${formatMoney(x.amountSatang)}` : `+${formatMoney(x.amountSatang)}`} บาท</strong>
                    </div>
                  );
                })
              ) : (
                <div className={styles.lineItem}>
                  <span style={{ color: 'var(--team-muted)' }}>ไม่มีเงินพิเศษหรือรายการหักเพิ่มเติม</span>
                  <span>0.00 บาท</span>
                </div>
              )}

              {detailData.advanceSatang > 0 && (
                <div className={`${styles.lineItem} ${styles.deductionItem}`}>
                  <span>หักเบิกล่วงหน้ารวม</span>
                  <strong>-{formatMoney(detailData.advanceSatang)} บาท</strong>
                </div>
              )}

              {(() => {
                const dailyDeductions = detailData.days?.reduce((sum: number, d: any) => sum + (d.deductionSatang || 0), 0) || 0;
                if (dailyDeductions > 0) {
                  return (
                    <div className={`${styles.lineItem} ${styles.deductionItem}`}>
                      <span>หักเงินรายวันรวม</span>
                      <strong>-{formatMoney(dailyDeductions)} บาท</strong>
                    </div>
                  );
                }
                return null;
              })()}

              <div className={`${styles.lineItem} ${styles.lineItemTotal}`}>
                <strong>ยอดสุทธิ</strong>
                <strong className={styles.lineItemTotalValue}>
                  {formatMoney(detailData.totalSatang)} บาท
                </strong>
              </div>

              {!reportData?.isClosed && (
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: '1rem' }}
                  onClick={() => runReportAction('กำลังยืนยันรายการเงิน', handleConfirmReview)}
                  disabled={Boolean(reportPending) || detailLoading}
                >
                  ยืนยันตรวจสอบเงินพิเศษและรายการหัก
                </button>
              )}
            </section>
          </div>

          <div className={styles.detailRightCol}>
            <section className={styles.sectionCard}>
              <h3 className={styles.sectionTitle}>รายการเช็กชื่อรายวัน</h3>
              {detailData.days &&
                detailData.days.map((d: any) => {
                  let label = 'รอเช็กชื่อ';
                  if (d.status === 'FULL') label = 'เต็มวัน';
                  if (d.status === 'HALF') label = 'ครึ่งวัน';
                  if (d.status === 'ABSENT') label = 'ไม่มา';
                  if (d.status === 'HOLIDAY') label = 'วันหยุด';

                  return (
                    <div key={d.dateKey} className={styles.lineItem}>
                      <div>
                        <span>{formatThaiDate(d.dateKey)}</span>
                        <br />
                        <span style={{ fontSize: 'var(--team-secondary)', color: 'var(--team-muted)' }}>
                          {label}
                          {d.advanceSatang > 0 && (
                            <span style={{ color: 'var(--team-absent)', marginLeft: '0.5rem', fontWeight: 700 }}>
                              · เบิก {formatMoney(d.advanceSatang)} บาท
                            </span>
                          )}
                          {d.deductionSatang > 0 && (
                            <span style={{ color: 'var(--team-absent)', marginLeft: '0.5rem', fontWeight: 700 }}>
                              · หัก {formatMoney(d.deductionSatang)} บาท
                            </span>
                          )}
                        </span>
                      </div>
                      <strong>{d.amountSatang === null ? '—' : `${formatMoney(d.amountSatang)} บาท`}</strong>
                    </div>
                  );
                })}
            </section>
          </div>
        </div>

        <div className={styles.detailActions}>
          <button type="button" className="btn btn-primary btn-block" disabled={exporting || detailLoading} onClick={() => exportSalary(selectedEmployeeId)}>
            <FileDown size={20} aria-hidden="true" />
            <span>{exporting ? 'กำลังสร้าง PDF…' : 'ดาวน์โหลดใบเงินเดือน (PDF)'}</span>
          </button>
          <LineSendButton scope="attendance" />
        </div>
        {exporting && <div className="refreshStatus" role="status">กำลังสร้างใบเงินเดือน</div>}
        {exportError && <p className="app-notice app-notice-danger" role="alert" style={{ marginTop: '0.75rem' }}>{exportError}</p>}

        {showExtrasModal && (
          <div className="app-modal-overlay">
            <div className="app-modal-card" data-app-dialog role="dialog" aria-modal="true" aria-label="รายการเงินเพิ่มเติม" tabIndex={-1}>
              <h3 className="app-modal-title">
                {extraType === 'DEDUCTION' ? 'เพิ่มรายการหักเงินเดือนนี้' : 'เพิ่มเงินพิเศษเดือนนี้'}
              </h3>
              <p className="app-modal-desc">
                {detailData.nickname || detailData.name} · {formatThaiMonth(selectedMonth)}
              </p>

              <div className={styles.typeSelector}>
                <button
                  type="button"
                  className={`btn btn-sm ${extraType === 'BONUS' ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={extraType === 'BONUS'}
                  onClick={() => setExtraType('BONUS')}
                >
                  เงินพิเศษ
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${extraType === 'DEDUCTION' ? 'btn-danger-solid' : 'btn-secondary'}`}
                  aria-pressed={extraType === 'DEDUCTION'}
                  onClick={() => setExtraType('DEDUCTION')}
                >
                  หักเงิน
                </button>
              </div>

              <label className={styles.monthLabel} style={{ marginTop: '0.6rem' }}>
                {extraType === 'DEDUCTION' ? 'ชื่อรายการหัก' : 'ชื่อรายการพิเศษ'}
                <input
                  className={styles.monthSelect}
                  value={newExtraLabel}
                  onChange={e => setNewExtraLabel(e.target.value)}
                  placeholder={extraType === 'DEDUCTION' ? 'เช่น ค่าของเสียหาย, ค่าปรับมาสาย' : 'เช่น ค่าเดินทาง, ค่าอาหาร, ค่าตำแหน่ง'}
                />
              </label>

              <label className={styles.monthLabel} style={{ marginTop: '0.8rem' }}>
                จำนวนเงิน (บาท)
                <input
                  type="text"
                  inputMode="decimal"
                  className={styles.monthSelect}
                  value={newExtraAmount}
                  onChange={e => setNewExtraAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>

              <div className="app-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowExtrasModal(false)}
                  disabled={Boolean(reportPending)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={`btn ${extraType === 'DEDUCTION' ? 'btn-danger-solid' : 'btn-primary'}`}
                  disabled={Boolean(reportPending)}
                  onClick={() => runReportAction('กำลังบันทึกรายการเงิน', handleAddMonthExtra)}
                >
                  {reportPending ? <span className="busyInline">กำลังบันทึก</span> : 'บันทึกรายการ'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className={styles.title}>รายงาน</h2>

      <div className={styles.monthControlsBar}>
        <div className={styles.monthSelectGroup}>
          <label className={styles.monthLabel} htmlFor="report-month-select">
            เลือกเดือน
          </label>
          <input
            id="report-month-select"
            disabled={Boolean(reportPending) || closeLoading}
            type="month"
            className={styles.monthSelect}
            value={selectedMonth}
            max={serverToday.slice(0, 7)}
            onChange={e => {
              if (e.target.value) setSelectedMonth(e.target.value);
            }}
          />
        </div>
      </div>

      {errorMsg && <div className="app-notice app-notice-danger" role="alert" style={{ marginBottom: '1rem' }}>{errorMsg}</div>}
      {(loading || reportPending) && <div className="refreshStatus" role="status">{reportPending || 'กำลังโหลดรายงาน'}</div>}

      {!loading && errorMsg && !reportData ? null : !reportData ? (
        <div aria-busy="true" aria-label="กำลังโหลดรายงาน">
          <div className="loadingCard"><span className="loadingLine" /><span className="loadingLine" /></div>
          <div className={styles.reportsGrid}>
            {[0, 1, 2].map(index => <div className="loadingCard" key={index}><span className="loadingLine" /><span className="loadingLine" /></div>)}
          </div>
        </div>
      ) : (
        <>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>ยอดค่าจ้างสุทธิเดือนนี้</p>
            <p className={styles.summaryMoney}>{formatMoney(reportData.totals.total)} บาท</p>
            <p className={styles.summarySub}>
              ค่าแรงสะสม {formatMoney(reportData.totals.base)} บาท
              {reportData.totals.extra > 0 && ` + เงินพิเศษ ${formatMoney(reportData.totals.extra)} บาท`}
              {reportData.totals.advance > 0 && ` - เบิก ${formatMoney(reportData.totals.advance)} บาท`}
              {reportData.totals.deduction > 0 && ` - หัก ${formatMoney(reportData.totals.deduction)} บาท`}
            </p>
          </div>

          {reportData.pendingTotal > 0 && (
            <div className={styles.notice}>
              <strong>ค้างเช็กชื่อ {reportData.pendingTotal} รายการ</strong>
              <p>เช็กชื่อให้ครบก่อนปิดรอบเดือน</p>
            </div>
          )}

          {reportData.isClosed && (
            <div className="app-notice app-notice-success" style={{ marginBottom: '1rem' }}>
              <strong>ปิดรอบเดือนแล้ว</strong>
              <p style={{ margin: '0.2rem 0 0' }}>เก็บยอด ณ วันปิดรอบไว้เรียบร้อย</p>
            </div>
          )}

          <div className={styles.reportsGrid}>
            {reportData.employees.map((emp: EmployeeReportSummary) => (
              <button
                key={emp.employeeId}
                type="button"
                className={styles.reportRow}
                onClick={() => handleOpenDetail(emp.employeeId)}
              >
                <div className={styles.reportRowHead}>
                  <div>
                    <h3 className={styles.rowName}>{emp.nickname || emp.name}</h3>
                    <span className={styles.rowPosition}>{emp.position}</span>
                  </div>
                  <ChevronRight size={22} color="var(--team-muted)" aria-hidden="true" />
                </div>

                <div className={styles.rowMoney}>
                  {formatMoney(emp.totalSatang)} บาท
                  {emp.advanceSatang && emp.advanceSatang > 0 ? (
                    <span className={styles.rowDeduction}>· เบิก {formatMoney(emp.advanceSatang)}</span>
                  ) : null}
                  {emp.deductionSatang && emp.deductionSatang > 0 ? (
                    <span className={styles.rowDeduction}>· หัก {formatMoney(emp.deductionSatang)}</span>
                  ) : null}
                </div>

                <div className={styles.rowCounts}>
                  <span>เต็มวัน {emp.full} วัน</span>
                  <span>ครึ่งวัน {emp.half} วัน</span>
                  <span>ไม่มา {emp.absent} วัน</span>
                </div>

                {emp.pending > 0 && (
                  <div className={styles.pendingNotice}>ยังไม่เช็กชื่อ {emp.pending} วัน</div>
                )}
                {emp.error && <div className={styles.pendingNotice}>{emp.error}</div>}
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.summaryActions}>
        <button type="button" className={`btn btn-primary btn-block ${styles.fullWidthAction}`} onClick={onOpenDetailedReports}>
          <ChartNoAxesCombined size={20} aria-hidden="true" />
          <span>ดูรายงานละเอียดและกราฟ</span>
        </button>

        {reportData && (
          !reportData.isClosed ? (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={loading}
              onClick={() => {
                setShowCloseModal(true);
                handleStartClose();
              }}
            >
              <Lock size={20} aria-hidden="true" />
              <span>ตรวจและปิดรอบเดือน</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-warning btn-block"
              onClick={() => setShowReopenModal(true)}
              disabled={loading}
            >
              <LockOpen size={20} aria-hidden="true" />
              <span>เปิดรอบเดือนแก้ไข</span>
            </button>
          )
        )}

        <div>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={exporting || loading || !reportData?.employees?.length}
            onClick={() => exportSalary()}
          >
            <FileArchive size={20} aria-hidden="true" />
            <span>{exporting ? 'กำลังสร้างไฟล์ทุกคน…' : 'ส่งออกใบเงินเดือนทุกคน (ZIP)'}</span>
          </button>
          {exporting && <div className="refreshStatus" role="status">กำลังสร้าง PDF แยกรายบุคคล</div>}
          {exportError && <p className="app-notice app-notice-danger" role="alert" style={{ marginTop: '0.5rem' }}>{exportError}</p>}
        </div>

        <div className={styles.fullWidthAction}>
          <LineSendButton scope="attendance" />
        </div>
      </div>

      {showCloseModal && (
        <div className="app-modal-overlay">
          <div className="app-modal-card" data-app-dialog role="dialog" aria-modal="true" aria-label="ปิดรอบเดือน" tabIndex={-1}>
            <h3 className="app-modal-title">ปิดรอบเดือน {formatThaiMonth(selectedMonth)}</h3>

            {closeLoading ? (
              <div>
                <p className="busyInline" role="status">กำลังปิดรอบเดือน</p>
                {closeStatus && (
                  <p className="app-modal-desc">
                    ตรวจแล้ว {closeStatus.cursor} จาก {closeStatus.totalEmployees} คน
                  </p>
                )}
              </div>
            ) : closeStatus?.errors && closeStatus.errors.length > 0 ? (
              <div>
                <div className="app-notice app-notice-danger">
                  <strong>ปิดรอบเดือนไม่สำเร็จ</strong>
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
                    {closeStatus.errors.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => runReportAction('กำลังยกเลิกการปิดเดือน', () => handleCancelClose(closeStatus.jobId))}
                    disabled={Boolean(reportPending)}
                  >
                    ยกเลิกและกลับไปแก้ไข
                  </button>
                </div>
              </div>
            ) : (
              <p className="busyInline" role="status">กำลังเตรียมปิดรอบเดือน</p>
            )}
          </div>
        </div>
      )}

      {showReopenModal && (
        <div className="app-modal-overlay">
          <div className="app-modal-card" data-app-dialog role="dialog" aria-modal="true" aria-label="เปิดรอบเดือนแก้ไข" tabIndex={-1}>
            <h3 className="app-modal-title app-modal-title-warning">เปิดรอบเดือนแก้ไข</h3>
            <p className="app-modal-desc">
              เปิดรอบเพื่อแก้เช็กชื่อหรือเงินพิเศษชั่วคราว และเก็บประวัติการแก้ไขไว้
            </p>

            <label className={styles.monthLabel}>
              เหตุผลที่เปิดรอบเดือน
              <textarea
                className={styles.monthSelect}
                style={{ minHeight: '5rem', resize: 'vertical' }}
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                placeholder="เช่น แก้ไขวันเช็กชื่อ"
              />
            </label>

            <div className="app-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowReopenModal(false);
                  setReopenReason('');
                }}
              >
                ยกเลิก
              </button>
              <button type="button" className="btn btn-warning-solid" disabled={Boolean(reportPending)} onClick={() => runReportAction('กำลังเปิดรอบเดือน', handleReopen)}>
                {reportPending ? <span className="busyInline">กำลังเปิดรอบ</span> : 'ยืนยันเปิดรอบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
