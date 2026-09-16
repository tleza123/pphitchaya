'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { formatMoney } from '@/lib/payroll/money';
import { formatThaiDate, formatThaiMonth } from '@/lib/payroll/dates';
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
  initialMonth: string;
  serverToday: string;
}

export function ReportsTab({ initialMonth, serverToday }: ReportsTabProps) {
  const { idToken } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Detail View State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Modal States
  const [showCloseModal, setShowCloseModal] = useState<boolean>(false);
  const [closeStatus, setCloseStatus] = useState<any>(null);
  const [closeLoading, setCloseLoading] = useState<boolean>(false);
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [showExtrasModal, setShowExtrasModal] = useState<boolean>(false);
  const [extraType, setExtraType] = useState<'BONUS' | 'DEDUCTION'>('BONUS');
  const [newExtraLabel, setNewExtraLabel] = useState<string>('');
  const [newExtraAmount, setNewExtraAmount] = useState<string>('');

  const fetchMonthlyReport = useCallback(
    async (month: string) => {
      if (!idToken) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/reports?month=${month}`, {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        const json = await res.json();
        if (json.ok) {
          setReportData(json.data);
        } else {
          setErrorMsg(json.error?.message || 'โหลดรายงานไม่สำเร็จ');
        }
      } catch {
        setErrorMsg('ไม่สามารถเชื่อมต่อระบบได้');
      } finally {
        setLoading(false);
      }
    },
    [idToken]
  );

  const fetchEmployeeDetail = useCallback(
    async (empId: string, month: string) => {
      if (!idToken) return;
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/reports/${empId}?month=${month}`, {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        const json = await res.json();
        if (json.ok) {
          setDetailData(json.data);
        } else {
          alert(json.error?.message || 'โหลดรายละเอียดไม่สำเร็จ');
        }
      } catch {
        alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setDetailLoading(false);
      }
    },
    [idToken]
  );

  useEffect(() => {
    fetchMonthlyReport(selectedMonth);
  }, [selectedMonth, fetchMonthlyReport]);

  const handleOpenDetail = (empId: string) => {
    setSelectedEmployeeId(empId);
    fetchEmployeeDetail(empId, selectedMonth);
  };

  const handleBackToSummary = () => {
    setSelectedEmployeeId(null);
    setDetailData(null);
  };

  // Month Closing Workflow
  const handleStartClose = async () => {
    if (!idToken || !reportData) return;
    setCloseLoading(true);
    const requestId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/months/${selectedMonth}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          expectedRevision: reportData.isClosed ? 0 : 0, // revision of month
          requestId
        })
      });
      const json = await res.json();
      if (json.ok) {
        setCloseStatus(json.data);
        // Continue processing
        handleContinueClose(json.data.jobId);
      } else {
        alert(json.error?.message || 'ไม่สามารถเริ่มปิดเดือนได้');
        setCloseLoading(false);
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
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
          // Recursive continue next chunk
          handleContinueClose(jobId);
        } else if (json.data.status === 'COMPLETED') {
          setCloseLoading(false);
          alert('ปิดเดือนสำเร็จเรียบร้อย');
          setShowCloseModal(false);
          fetchMonthlyReport(selectedMonth);
        } else if (json.data.status === 'FAILED') {
          setCloseLoading(false);
        }
      } else {
        alert(json.error?.message || 'การปิดเดือนขัดข้อง');
        setCloseLoading(false);
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
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
        alert('ยกเลิกงานปิดเดือนเรียบร้อย');
        setShowCloseModal(false);
        setCloseStatus(null);
        fetchMonthlyReport(selectedMonth);
      }
    } catch {
      alert('ไม่สามารถยกเลิกงานปิดเดือนได้');
    }
  };

  // Reopen Month
  const handleReopen = async () => {
    if (!idToken || !reopenReason.trim()) {
      alert('กรุณาระบุเหตุผลในการเปิดเดือนเพื่อแก้ไข');
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
          expectedRevision: reportData?.isClosed ? 1 : 1,
          requestId
        })
      });
      const json = await res.json();
      if (json.ok) {
        alert('เปิดเดือนเพื่อแก้ไขเรียบร้อย');
        setShowReopenModal(false);
        setReopenReason('');
        fetchMonthlyReport(selectedMonth);
      } else {
        alert(json.error?.message || 'เปิดเดือนไม่สำเร็จ');
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  // Add Monthly Extra
  const handleAddMonthExtra = async () => {
    if (!idToken || !selectedEmployeeId || !newExtraLabel.trim() || !newExtraAmount.trim()) {
      alert('กรุณาระบุชื่อรายการและจำนวนเงิน');
      return;
    }
    const requestId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/months/${selectedMonth}/extras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          label: newExtraLabel.trim(),
          amount: newExtraAmount.trim(),
          type: extraType,
          requestId
        })
      });
      const json = await res.json();
      if (json.ok) {
        alert(extraType === 'DEDUCTION' ? 'บันทึกรายการหักเงินเดือนนี้เรียบร้อย' : 'บันทึกเงินพิเศษเดือนนี้เรียบร้อย');
        setShowExtrasModal(false);
        setNewExtraLabel('');
        setNewExtraAmount('');
        setExtraType('BONUS');
        fetchEmployeeDetail(selectedEmployeeId, selectedMonth);
        fetchMonthlyReport(selectedMonth);
      } else {
        alert(json.error?.message || 'บันทึกไม่สำเร็จ');
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  // Confirm Extra Review
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
        alert('ยืนยันตรวจสอบเงินพิเศษเรียบร้อย');
        fetchEmployeeDetail(selectedEmployeeId, selectedMonth);
      } else {
        alert(json.error?.message || 'ยืนยันไม่สำเร็จ');
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  // Detail view rendering
  if (selectedEmployeeId && detailData) {
    return (
      <div className={styles.detailContainer}>
        <button type="button" className={styles.backBtn} onClick={handleBackToSummary}>
          ← กลับหน้ารายงาน
        </button>

        <h2 className={styles.title}>{detailData.nickname || detailData.name}</h2>
        <p style={{ color: 'var(--team-muted)', margin: '0 0 1rem' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className={styles.sectionTitle}>รายละเอียดเงิน</h3>
                {!reportData?.isClosed && (
                  <button
                    type="button"
                    className={styles.backBtn}
                    onClick={() => {
                      setExtraType('BONUS');
                      setShowExtrasModal(true);
                    }}
                  >
                    + เพิ่มเงินพิเศษหรือรายการหัก
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
                  <span>หักเบิกเงินล่วงหน้ารวม</span>
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

              <div className={styles.lineItem} style={{ borderTop: '2px solid var(--team-border)', marginTop: '0.4rem', paddingTop: '0.8rem' }}>
                <strong>ยอดสุทธิทั้งสิ้น</strong>
                <strong style={{ fontSize: '1.4rem', color: 'var(--team-primary-dark)' }}>
                  {formatMoney(detailData.totalSatang)} บาท
                </strong>
              </div>

              {!reportData?.isClosed && (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  style={{ marginTop: '1rem' }}
                  onClick={handleConfirmReview}
                >
                  ยืนยันการตรวจสอบเงินพิเศษและรายการหัก
                </button>
              )}
            </section>
          </div>

          <div className={styles.detailRightCol}>
            <section className={styles.sectionCard}>
              <h3 className={styles.sectionTitle}>รายการเช็คชื่อรายวัน</h3>
              {detailData.days &&
                detailData.days.map((d: any) => {
                  let label = 'รอเช็ค';
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
                            <span style={{ color: '#dc2626', marginLeft: '0.5rem', fontWeight: 700 }}>
                              · หัก {formatMoney(d.deductionSatang)} บาท
                            </span>
                          )}
                        </span>
                      </div>
                      <span>{d.amountSatang === null ? '—' : `${formatMoney(d.amountSatang)} บาท`}</span>
                    </div>
                  );
                })}
            </section>
          </div>
        </div>

        {/* Add Month Extra Modal */}
        {showExtrasModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
              <h3 className={styles.modalTitle}>
                {extraType === 'DEDUCTION' ? 'เพิ่มรายการหักเงินเดือนนี้' : 'เพิ่มเงินพิเศษเดือนนี้'}
              </h3>
              <p style={{ color: 'var(--team-muted)', fontSize: 'var(--team-secondary)' }}>
                สำหรับ {detailData.nickname || detailData.name} เฉพาะเดือน {formatThaiMonth(selectedMonth)}
              </p>

              <div className={styles.typeSelector}>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${extraType === 'BONUS' ? styles.typeBtnActiveBonus : ''}`}
                  onClick={() => setExtraType('BONUS')}
                >
                  เงินเพิ่มพิเศษ
                </button>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${extraType === 'DEDUCTION' ? styles.typeBtnActiveDeduction : ''}`}
                  onClick={() => setExtraType('DEDUCTION')}
                >
                  รายการหักเงิน
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
                จำนวนเงิน บาท
                <input
                  type="text"
                  inputMode="decimal"
                  className={styles.monthSelect}
                  value={newExtraAmount}
                  onChange={e => setNewExtraAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>

              <div className={styles.modalActions}>
                <button type="button" className={styles.primaryBtn} onClick={handleAddMonthExtra}>
                  บันทึกรายการ
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowExtrasModal(false)}
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Summary View
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

      {errorMsg && <div className={styles.notice}>{errorMsg}</div>}

      {loading || !reportData ? (
        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>กำลังคำนวณยอดเงินเดือน...</p>
        </div>
      ) : (
        <>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>ยอดค่าจ้างสุทธิเดือนนี้</p>
            <p className={styles.summaryMoney}>{formatMoney(reportData.totals.total)} บาท</p>
            <p className={styles.summarySub}>
              ค่าแรงสะสม {formatMoney(reportData.totals.base)} บาท
              {reportData.totals.extra > 0 && ` + เงินพิเศษ ${formatMoney(reportData.totals.extra)} บาท`}
              {reportData.totals.advance > 0 && ` - หักเบิก ${formatMoney(reportData.totals.advance)} บาท`}
              {reportData.totals.deduction > 0 && ` - หักเงิน ${formatMoney(reportData.totals.deduction)} บาท`}
            </p>
          </div>

          {reportData.pendingTotal > 0 && (
            <div className={styles.notice}>
              <strong>ยังมีรายการค้างเช็คชื่อ {reportData.pendingTotal} รายการ</strong>
              <p style={{ margin: '0.2rem 0 0' }}>
                กรุณาตรวจสอบการเช็คชื่อให้ครบก่อนดำเนินการปิดรอบเดือน
              </p>
            </div>
          )}

          {reportData.isClosed && (
            <div
              className={styles.notice}
              style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac', color: '#166534' }}
            >
              <strong>เดือนนี้ปิดรอบบัญชีแล้ว</strong>
              <p style={{ margin: '0.2rem 0 0' }}>
                ข้อมูลถูกบันทึกเป็น Snapshot ถาวร ป้องกันการแก้ไขย้อนหลัง
              </p>
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
                    <span style={{ fontSize: 'var(--team-secondary)', color: 'var(--team-muted)' }}>
                      {emp.position}
                    </span>
                  </div>
                  <span style={{ fontSize: '1.2rem', color: 'var(--team-muted)' }}>›</span>
                </div>

                <div className={styles.rowMoney}>
                  {formatMoney(emp.totalSatang)} บาท
                  {emp.advanceSatang && emp.advanceSatang > 0 ? (
                    <span style={{ fontSize: 'var(--team-secondary)', color: 'var(--team-absent)', marginLeft: '0.6rem', fontWeight: 700 }}>
                      · หักเบิก {formatMoney(emp.advanceSatang)} บาท
                    </span>
                  ) : null}
                  {emp.deductionSatang && emp.deductionSatang > 0 ? (
                    <span style={{ fontSize: 'var(--team-secondary)', color: '#dc2626', marginLeft: '0.6rem', fontWeight: 700 }}>
                      · หัก {formatMoney(emp.deductionSatang)} บาท
                    </span>
                  ) : null}
                </div>

                <div className={styles.rowCounts}>
                  <span>เต็มวัน {emp.full} วัน</span>
                  <span>ครึ่งวัน {emp.half} วัน</span>
                  <span>ไม่มา {emp.absent} วัน</span>
                </div>

                {emp.pending > 0 && (
                  <div className={styles.pendingNotice}>ยังไม่เช็ค {emp.pending} วัน</div>
                )}
                {emp.error && <div className={styles.pendingNotice}>{emp.error}</div>}
              </button>
            ))}
          </div>

          <div className={styles.actionRow}>
            {!reportData.isClosed ? (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => {
                  setShowCloseModal(true);
                  handleStartClose();
                }}
              >
                ตรวจและปิดเดือน
              </button>
            ) : (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setShowReopenModal(true)}
              >
                เปิดเดือนเพื่อแก้ไข
              </button>
            )}

            <button type="button" className={styles.secondaryBtn} onClick={() => window.print()}>
              พิมพ์รายงาน
            </button>
          </div>
        </>
      )}

      {/* Close Month Modal */}
      {showCloseModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>ปิดรอบเดือน {formatThaiMonth(selectedMonth)}</h3>

            {closeLoading ? (
              <div>
                <p>กำลังประมวลผลข้อมูลและจัดเก็บ Snapshot...</p>
                {closeStatus && (
                  <p style={{ color: 'var(--team-muted)', fontSize: 'var(--team-secondary)' }}>
                    ความคืบหน้า: {closeStatus.cursor} จาก {closeStatus.totalEmployees} คน
                  </p>
                )}
              </div>
            ) : closeStatus?.errors && closeStatus.errors.length > 0 ? (
              <div>
                <div className={styles.notice} style={{ backgroundColor: 'var(--team-absent-bg)', borderColor: '#fca5a5', color: 'var(--team-absent)' }}>
                  <strong>ไม่สามารถปิดเดือนได้เนื่องจากพบข้อผิดพลาด:</strong>
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
                    {closeStatus.errors.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => handleCancelClose(closeStatus.jobId)}
                  >
                    ยกเลิกและกลับไปแก้ไข
                  </button>
                </div>
              </div>
            ) : (
              <p>กำลังเตรียมการปิดเดือน...</p>
            )}
          </div>
        </div>
      )}

      {/* Reopen Month Modal */}
      {showReopenModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>ยืนยันการเปิดเดือนเพื่อแก้ไข</h3>
            <p style={{ color: 'var(--team-muted)', fontSize: 'var(--team-secondary)' }}>
              การเปิดเดือนที่ปิดแล้วจะอนุญาตให้แก้ไขการเช็คชื่อหรือเงินพิเศษได้ชั่วคราว
              โดยข้อมูลเดิมจะถูกเก็บประวัติไว้ใน Audit Log
            </p>

            <label className={styles.monthLabel} style={{ marginTop: '1rem' }}>
              เหตุผลในการเปิดเดือน
              <textarea
                className={styles.monthSelect}
                style={{ minHeight: '5rem', resize: 'vertical' }}
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                placeholder="ระบุเหตุผล เช่น แก้ไขการเช็คชื่อพนักงานผิด..."
              />
            </label>

            <div className={styles.modalActions}>
              <button type="button" className={styles.primaryBtn} onClick={handleReopen}>
                ยืนยันเปิดเดือน
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  setShowReopenModal(false);
                  setReopenReason('');
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
