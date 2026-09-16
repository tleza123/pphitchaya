'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { formatThaiDate } from '@/lib/payroll/dates';
import styles from './attendance.module.css';

interface AttendanceItem {
  employee: {
    employeeId: string;
    name: string;
    nickname?: string;
    position: string;
    photo?: { version: number } | null;
  };
  attendance: {
    status: 'FULL' | 'HALF' | 'ABSENT' | 'UNMARKED';
    advanceSatang: number;
    deductionSatang: number;
    revision: number;
    updatedAt: string | null;
    notes?: string;
  };
}

interface AttendanceTabProps {
  initialDate: string;
  serverToday: string;
  onNavigateToSettings: () => void;
}

export function AttendanceTab({
  initialDate,
  serverToday,
  onNavigateToSettings
}: AttendanceTabProps) {
  const { idToken } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || serverToday);
  const [items, setItems] = useState<AttendanceItem[]>([]);
  const [advanceInputs, setAdvanceInputs] = useState<Record<string, string>>({});
  const [deductionInputs, setDeductionInputs] = useState<Record<string, string>>({});
  const [isWorkday, setIsWorkday] = useState<boolean>(true);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterUnchecked, setFilterUnchecked] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const [clearingId, setClearingId] = useState<string | null>(null);

  const fetchDayData = useCallback(
    async (date: string) => {
      if (!idToken) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/attendance?date=${date}`, {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        const json = await res.json();
        if (json.ok) {
          setItems(json.data.items);
          setIsWorkday(json.data.isWorkday);
          setIsClosed(json.data.isClosed);
          const advances: Record<string, string> = {};
          const deductions: Record<string, string> = {};
          json.data.items.forEach((it: AttendanceItem) => {
            if (it.attendance.advanceSatang) {
              advances[it.employee.employeeId] = (it.attendance.advanceSatang / 100).toFixed(2);
            }
            if (it.attendance.deductionSatang) {
              deductions[it.employee.employeeId] = (it.attendance.deductionSatang / 100).toFixed(2);
            }
          });
          setAdvanceInputs(advances);
          setDeductionInputs(deductions);
        } else {
          setErrorMsg(json.error?.message || 'โหลดข้อมูลไม่สำเร็จ');
        }
      } catch {
        setErrorMsg('ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    },
    [idToken]
  );

  useEffect(() => {
    fetchDayData(selectedDate);
  }, [selectedDate, fetchDayData]);

  const handleMark = async (
    employeeId: string,
    status: 'FULL' | 'HALF' | 'ABSENT' | 'UNMARKED',
    expectedRevision: number,
    customAdvanceSatang?: number,
    customDeductionSatang?: number
  ) => {
    if (!idToken || isClosed) return;
    setPendingMap(prev => ({ ...prev, [employeeId]: true }));
    const requestId = crypto.randomUUID();

    // Determine advanceSatang to send
    let advanceToSend = customAdvanceSatang;
    if (advanceToSend === undefined) {
      const inputVal = advanceInputs[employeeId];
      if (inputVal !== undefined && inputVal.trim() !== '') {
        const num = parseFloat(inputVal);
        if (!isNaN(num) && num >= 0) {
          advanceToSend = Math.round(num * 100);
        }
      }
    }

    // Determine deductionSatang to send
    let deductionToSend = customDeductionSatang;
    if (deductionToSend === undefined) {
      const inputVal = deductionInputs[employeeId];
      if (inputVal !== undefined && inputVal.trim() !== '') {
        const num = parseFloat(inputVal);
        if (!isNaN(num) && num >= 0) {
          deductionToSend = Math.round(num * 100);
        }
      }
    }

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          dateKey: selectedDate,
          employeeId,
          status,
          advanceSatang: advanceToSend,
          deductionSatang: deductionToSend,
          expectedRevision,
          requestId
        })
      });

      const json = await res.json();
      if (json.ok) {
        setItems(prev =>
          prev.map(item =>
            item.employee.employeeId === employeeId
              ? {
                  ...item,
                  attendance: {
                    status: json.data.status,
                    advanceSatang: json.data.advanceSatang || 0,
                    deductionSatang: json.data.deductionSatang || 0,
                    revision: json.data.revision,
                    updatedAt: json.data.updatedAt,
                    notes: ''
                  }
                }
              : item
          )
        );
        if (json.data.advanceSatang) {
          setAdvanceInputs(prev => ({ ...prev, [employeeId]: (json.data.advanceSatang / 100).toFixed(2) }));
        } else if (advanceToSend === 0) {
          setAdvanceInputs(prev => ({ ...prev, [employeeId]: '' }));
        }

        if (json.data.deductionSatang) {
          setDeductionInputs(prev => ({ ...prev, [employeeId]: (json.data.deductionSatang / 100).toFixed(2) }));
        } else if (deductionToSend === 0) {
          setDeductionInputs(prev => ({ ...prev, [employeeId]: '' }));
        }
      } else {
        alert(json.error?.message || 'บันทึกไม่สำเร็จ');
        fetchDayData(selectedDate);
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาตรวจสอบอีกครั้ง');
    } finally {
      setPendingMap(prev => ({ ...prev, [employeeId]: false }));
      setClearingId(null);
    }
  };

  const handleSaveAdvance = (
    employeeId: string,
    currentStatus: 'FULL' | 'HALF' | 'ABSENT' | 'UNMARKED',
    expectedRevision: number
  ) => {
    const rawVal = (advanceInputs[employeeId] || '').trim();
    let satang = 0;
    if (rawVal !== '') {
      const num = parseFloat(rawVal);
      if (isNaN(num) || num < 0) {
        alert('กรุณากรอกจำนวนเงินเบิกเป็นตัวเลขที่ถูกต้อง');
        return;
      }
      satang = Math.round(num * 100);
    }
    handleMark(employeeId, currentStatus, expectedRevision, satang, undefined);
  };

  const handleSaveDeduction = (
    employeeId: string,
    currentStatus: 'FULL' | 'HALF' | 'ABSENT' | 'UNMARKED',
    expectedRevision: number
  ) => {
    const rawVal = (deductionInputs[employeeId] || '').trim();
    let satang = 0;
    if (rawVal !== '') {
      const num = parseFloat(rawVal);
      if (isNaN(num) || num < 0) {
        alert('กรุณากรอกจำนวนเงินหักเป็นตัวเลขที่ถูกต้อง');
        return;
      }
      satang = Math.round(num * 100);
    }
    handleMark(employeeId, currentStatus, expectedRevision, undefined, satang);
  };

  const handleAddWorkday = async () => {
    if (!idToken || isClosed) return;
    const requestId = crypto.randomUUID();
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          type: 'OVERRIDE',
          dateKey: selectedDate,
          kind: 'WORKDAY',
          note: 'เพิ่มวันทำงานพิเศษ',
          requestId
        })
      });
      const json = await res.json();
      if (json.ok) {
        fetchDayData(selectedDate);
      } else {
        alert(json.error?.message || 'ไม่สามารถเพิ่มวันทำงานได้');
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  const filteredItems = items
    .filter(item => {
      if (filterUnchecked && item.attendance.status !== 'UNMARKED') return false;
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.trim().toLowerCase();
        const matchName = item.employee.name.toLowerCase().includes(query);
        const matchNick = item.employee.nickname?.toLowerCase().includes(query);
        const matchPos = item.employee.position.toLowerCase().includes(query);
        return matchName || matchNick || matchPos;
      }
      return true;
    });

  const checkedCount = items.filter(item => item.attendance.status !== 'UNMARKED').length;

  return (
    <div>
      <h2 className={styles.title}>เช็คชื่อ</h2>

      <div className={styles.controlsBar}>
        <div className={styles.controlsTopRow}>
          <div className={styles.dateGroup}>
            <label className={styles.dateLabel} htmlFor="attendance-date-picker">
              วันที่
            </label>
            <div className={styles.dateRow}>
              <input
                id="attendance-date-picker"
                type="date"
                className={styles.dateInput}
                value={selectedDate}
                max={serverToday}
                onChange={e => {
                  if (e.target.value && e.target.value <= serverToday) {
                    setSelectedDate(e.target.value);
                  }
                }}
              />
              {selectedDate !== serverToday && (
                <button
                  type="button"
                  className={styles.todayBtn}
                  onClick={() => setSelectedDate(serverToday)}
                >
                  วันนี้
                </button>
              )}
            </div>
            <div className={styles.thaiDateDisplay}>{formatThaiDate(selectedDate)}</div>
          </div>

          <div className={styles.toolbar}>
            <p className={styles.checkedCount}>
              เช็คแล้ว {checkedCount} จาก {items.length} คน
            </p>
            <button
              type="button"
              className={`${styles.filterBtn} ${filterUnchecked ? styles.filterBtnActive : ''}`}
              onClick={() => setFilterUnchecked(!filterUnchecked)}
            >
              {filterUnchecked ? 'ดูทั้งหมด' : 'ดูที่ยังไม่เช็ค'}
            </button>
          </div>
        </div>

        {items.length > 8 && (
          <input
            type="search"
            placeholder="ค้นหาชื่อพนักงาน หรือตำแหน่ง..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        )}
      </div>

      {errorMsg && <div className={styles.notice}>{errorMsg}</div>}

      {!isWorkday && (
        <div className={styles.notice}>
          <strong>วันหยุดตามตาราง</strong>
          <span>หากพนักงานมาทำงานจริง กรุณากดบันทึกวันทำงานเพิ่มก่อนเริ่มเช็คชื่อ</span>
          {!isClosed && (
            <button type="button" className={styles.noticeBtn} onClick={handleAddWorkday}>
              บันทึกวันทำงานเพิ่ม
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className={styles.cardGrid}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      ) : items.length === 0 ? (
        <div className={styles.notice}>
          <strong>ยังไม่มีรายชื่อพนักงาน</strong>
          <p>กรุณาเพิ่มพนักงานในแท็บตั้งค่าเพื่อเริ่มใช้งาน</p>
          <button type="button" className={styles.noticeBtn} onClick={onNavigateToSettings}>
            เพิ่มพนักงาน
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--team-muted)', margin: '2rem 0' }}>
          {filterUnchecked ? 'เช็คชื่อครบทุกคนแล้ว' : 'ไม่พบรายชื่อที่ตรงกับการค้นหา'}
        </p>
      ) : (
        <div className={styles.cardGrid}>
          {filteredItems.map(item => {
          const emp = item.employee;
          const att = item.attendance;
          const isPending = Boolean(pendingMap[emp.employeeId]);
          const isClearing = clearingId === emp.employeeId;

          let statusLabel = 'ยังไม่เช็ค';
          if (att.status === 'FULL') statusLabel = 'เต็มวัน';
          if (att.status === 'HALF') statusLabel = 'ครึ่งวัน';
          if (att.status === 'ABSENT') statusLabel = 'ไม่มา';

          return (
            <article key={emp.employeeId} className={styles.personCard}>
              <div className={styles.personHead}>
                <div className={styles.avatar}>
                  {emp.photo ? (
                    <img
                      src={`/api/employees/${emp.employeeId}/photo?v=${emp.photo.version}`}
                      alt={`รูป ${emp.nickname || emp.name}`}
                    />
                  ) : (
                    (emp.nickname || emp.name).slice(0, 1)
                  )}
                </div>
                <div className={styles.personInfo}>
                  <h3 className={styles.personName}>
                    {emp.nickname ? emp.nickname : emp.name}
                  </h3>
                  <p className={styles.personPosition}>
                    {emp.position}
                    {emp.name && emp.nickname && emp.name !== emp.nickname && ` · ${emp.name}`}
                  </p>
                </div>
              </div>

              <div
                className={styles.statusGrid}
                role="group"
                aria-label={`เช็คชื่อ ${emp.nickname || emp.name}`}
              >
                <button
                  type="button"
                  className={`${styles.statusBtn} ${
                    att.status === 'FULL' ? styles.statusBtnFullSelected : ''
                  }`}
                  aria-pressed={att.status === 'FULL'}
                  disabled={isPending || isClosed}
                  onClick={() => handleMark(emp.employeeId, 'FULL', att.revision)}
                >
                  เต็มวัน
                </button>

                <button
                  type="button"
                  className={`${styles.statusBtn} ${
                    att.status === 'HALF' ? styles.statusBtnHalfSelected : ''
                  }`}
                  aria-pressed={att.status === 'HALF'}
                  disabled={isPending || isClosed}
                  onClick={() => handleMark(emp.employeeId, 'HALF', att.revision)}
                >
                  ครึ่งวัน
                </button>

                <button
                  type="button"
                  className={`${styles.statusBtn} ${
                    att.status === 'ABSENT' ? styles.statusBtnAbsentSelected : ''
                  }`}
                  aria-pressed={att.status === 'ABSENT'}
                  disabled={isPending || isClosed}
                  onClick={() => handleMark(emp.employeeId, 'ABSENT', att.revision)}
                >
                  ไม่มา
                </button>
              </div>

              {/* Advance Salary Input directly following attendance status */}
              <div className={styles.advanceSection}>
                <label className={styles.advanceLabel} htmlFor={`advance-${emp.employeeId}`}>
                  เบิกเงินล่วงหน้า บาท
                </label>
                <div className={styles.advanceRow}>
                  <input
                    id={`advance-${emp.employeeId}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className={styles.advanceInput}
                    placeholder="ระบุจำนวนเงิน เช่น 200"
                    value={advanceInputs[emp.employeeId] ?? (att.advanceSatang ? (att.advanceSatang / 100).toFixed(2) : '')}
                    onChange={e => {
                      const val = e.target.value;
                      setAdvanceInputs(prev => ({ ...prev, [emp.employeeId]: val }));
                    }}
                    disabled={isPending || isClosed}
                  />
                  <button
                    type="button"
                    className={styles.advanceSaveBtn}
                    disabled={isPending || isClosed}
                    onClick={() => handleSaveAdvance(emp.employeeId, att.status, att.revision)}
                  >
                    บันทึกเบิก
                  </button>
                </div>
                {att.advanceSatang > 0 && (
                  <div className={styles.advanceBadge}>
                    บันทึกเบิกแล้ว {(att.advanceSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                  </div>
                )}
              </div>

              {/* Deduction Input directly following advance */}
              <div className={styles.deductionSection}>
                <label className={styles.deductionLabel} htmlFor={`deduction-${emp.employeeId}`}>
                  หักเงิน บาท
                </label>
                <div className={styles.advanceRow}>
                  <input
                    id={`deduction-${emp.employeeId}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className={styles.advanceInput}
                    placeholder="ระบุจำนวนเงิน เช่น 100"
                    value={deductionInputs[emp.employeeId] ?? (att.deductionSatang ? (att.deductionSatang / 100).toFixed(2) : '')}
                    onChange={e => {
                      const val = e.target.value;
                      setDeductionInputs(prev => ({ ...prev, [emp.employeeId]: val }));
                    }}
                    disabled={isPending || isClosed}
                  />
                  <button
                    type="button"
                    className={styles.deductionSaveBtn}
                    disabled={isPending || isClosed}
                    onClick={() => handleSaveDeduction(emp.employeeId, att.status, att.revision)}
                  >
                    บันทึกหัก
                  </button>
                </div>
                {att.deductionSatang > 0 && (
                  <div className={styles.deductionBadge}>
                    หักเงินแล้ว {(att.deductionSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                  </div>
                )}
              </div>

              <div className={styles.cardFooter}>
                <span className={styles.statusText}>
                  {isPending
                    ? 'กำลังบันทึก...'
                    : att.status !== 'UNMARKED'
                    ? `${statusLabel} · บันทึกแล้ว`
                    : att.advanceSatang > 0 && att.deductionSatang > 0
                    ? 'บันทึกเบิกและหักเงินแล้ว'
                    : att.advanceSatang > 0
                    ? 'บันทึกเบิกเงินแล้ว'
                    : att.deductionSatang > 0
                    ? 'บันทึกหักเงินแล้ว'
                    : 'ยังไม่เช็ค'}
                </span>

                {(att.status !== 'UNMARKED' || att.advanceSatang > 0 || att.deductionSatang > 0) && !isClosed && (
                  <div>
                    {isClearing ? (
                      <div className={styles.confirmBox}>
                        <span>ยืนยันล้างข้อมูล</span>
                        <button
                          type="button"
                          className={styles.textBtn}
                          disabled={isPending}
                          onClick={() => handleMark(emp.employeeId, 'UNMARKED', att.revision, 0, 0)}
                        >
                          ยืนยัน
                        </button>
                        <button
                          type="button"
                          className={styles.textBtn}
                          onClick={() => setClearingId(null)}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.textBtn}
                        onClick={() => setClearingId(emp.employeeId)}
                      >
                        ล้างรายการ
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
        </div>
      )}
    </div>
  );
}
