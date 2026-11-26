'use client';
import { usePendingAction } from '@/components/shared/usePendingAction';
import { optionalMoney } from '@/lib/client/form-money';
import { DATA_CHANGED_EVENT } from '@/lib/client/data-events';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CalendarOff, CalendarPlus } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { formatThaiDate } from '@/lib/payroll/dates';
import { LineSendButton } from '@/components/shared/LineSendButton';
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
    automatic?: boolean;
    advanceSatang: number;
    deductionSatang: number;
    revision: number;
    updatedAt: string | null;
    notes?: string;
  };
}

interface AttendanceTabProps {
  active: boolean;
  initialDate: string;
  serverToday: string;
  onNavigateToSettings: () => void;
  onAttendanceChanged: () => void;
}

export function AttendanceTab({
  active,
  initialDate,
  serverToday,
  onNavigateToSettings,
  onAttendanceChanged
}: AttendanceTabProps) {
  const { idToken } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || serverToday);
  const [items, setItems] = useState<AttendanceItem[]>([]);
  const [advanceInputs, setAdvanceInputs] = useState<Record<string, string>>({});
  const [deductionInputs, setDeductionInputs] = useState<Record<string, string>>({});
  const [isWorkday, setIsWorkday] = useState<boolean>(true);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const { pending: calendarPending, run: runCalendarAction } = usePendingAction();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterExceptions, setFilterExceptions] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const [clearingId, setClearingId] = useState<string | null>(null);
  const fetchSequence = useRef(0);
  const dayController = useRef<AbortController | null>(null);
  const loadedDate = useRef<string | null>(null);
  const currentDate = useRef(selectedDate);
  currentDate.current = selectedDate;
  const pendingWrites = useRef(new Set<string>());
  const refreshAfterSave = useRef(false);

  const fetchDayData = useCallback(
    async (date: string) => {
      if (!idToken) return;
      if (pendingWrites.current.size > 0) {
        refreshAfterSave.current = true;
        setLoading(true);
        return;
      }
      const sequence = ++fetchSequence.current;
      dayController.current?.abort();
      const controller = new AbortController(); dayController.current = controller;
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/attendance?date=${date}`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${idToken}` }
        });
        const json = await res.json();
        if (sequence !== fetchSequence.current) return;
        if (json.ok) {
          loadedDate.current = date;
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
          setItems([]);
          setErrorMsg(json.error?.message || 'โหลดข้อมูลไม่สำเร็จ');
        }
      } catch {
        if (sequence === fetchSequence.current && !controller.signal.aborted) {
          setItems([]);
          setErrorMsg('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง');
        }
      } finally {
        if (sequence === fetchSequence.current) setLoading(false);
      }
    },
    [idToken]
  );

  useEffect(() => {
    if (active) fetchDayData(currentDate.current);
  }, [active, selectedDate, fetchDayData]);
  useEffect(() => () => dayController.current?.abort(), []);
  useEffect(() => {
    const refresh = () => { if (active) void fetchDayData(currentDate.current); };
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, [active, fetchDayData]);

  const handleMark = async (
    employeeId: string,
    status: 'FULL' | 'HALF' | 'ABSENT' | 'UNMARKED',
    expectedRevision: number,
    customAdvanceSatang?: number,
    customDeductionSatang?: number
  ) => {
    if (!idToken || isClosed || loading || loadedDate.current !== selectedDate || pendingWrites.current.has(employeeId)) return;
    const saveDate = selectedDate;
    pendingWrites.current.add(employeeId);
    ++fetchSequence.current;
    setPendingMap(prev => ({ ...prev, [employeeId]: true }));
    setItems(prev => prev.map(item => item.employee.employeeId === employeeId
      ? { ...item, attendance: {
          ...item.attendance,
          status: status === 'UNMARKED' && isWorkday ? 'FULL' : status,
          automatic: status === 'UNMARKED' && isWorkday
        } }
      : item));
    const requestId = crypto.randomUUID();

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
          advanceSatang: customAdvanceSatang,
          deductionSatang: customDeductionSatang,
          expectedRevision,
          requestId
        })
      });

      const json = await res.json();
      if (json.ok) {
        onAttendanceChanged();
        if (currentDate.current !== saveDate) {
          refreshAfterSave.current = true;
          return;
        }
        setItems(prev =>
          prev.map(item =>
            item.employee.employeeId === employeeId
              ? {
                  ...item,
                  attendance: {
                    status: json.data.status === 'UNMARKED' && isWorkday ? 'FULL' : json.data.status,
                    automatic: json.data.status === 'UNMARKED' && isWorkday,
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
        if (customAdvanceSatang !== undefined && json.data.advanceSatang) {
          setAdvanceInputs(prev => ({ ...prev, [employeeId]: (json.data.advanceSatang / 100).toFixed(2) }));
        } else if (customAdvanceSatang === 0) {
          setAdvanceInputs(prev => ({ ...prev, [employeeId]: '' }));
        }

        if (customDeductionSatang !== undefined && json.data.deductionSatang) {
          setDeductionInputs(prev => ({ ...prev, [employeeId]: (json.data.deductionSatang / 100).toFixed(2) }));
        } else if (customDeductionSatang === 0) {
          setDeductionInputs(prev => ({ ...prev, [employeeId]: '' }));
        }
      } else {
        alert(json.error?.message || 'บันทึกไม่สำเร็จ');
        fetchDayData(currentDate.current);
      }
    } catch {
      alert('ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
      fetchDayData(currentDate.current);
    } finally {
      pendingWrites.current.delete(employeeId);
      setPendingMap(prev => ({ ...prev, [employeeId]: false }));
      setClearingId(null);
      if (pendingWrites.current.size === 0 && refreshAfterSave.current) {
        refreshAfterSave.current = false;
        fetchDayData(currentDate.current);
      }
    }
  };

  const handleSaveAdvance = (
    employeeId: string,
    currentStatus: 'FULL' | 'HALF' | 'ABSENT' | 'UNMARKED',
    expectedRevision: number
  ) => {
    try { handleMark(employeeId, currentStatus, expectedRevision, optionalMoney(advanceInputs[employeeId] || ''), undefined); }
    catch { alert('กรอกเงินเบิกเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'); }
  };

  const handleSaveDeduction = (
    employeeId: string,
    currentStatus: 'FULL' | 'HALF' | 'ABSENT' | 'UNMARKED',
    expectedRevision: number
  ) => {
    try { handleMark(employeeId, currentStatus, expectedRevision, undefined, optionalMoney(deductionInputs[employeeId] || '')); }
    catch { alert('กรอกเงินหักเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'); }
  };

  const handleAddWorkday = async (kind: 'WORKDAY' | 'HOLIDAY' = 'WORKDAY') => {
    if (!idToken || isClosed || loading || pendingWrites.current.size > 0) return;
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
          kind,
          note: kind === 'HOLIDAY' ? 'วันหยุดร้านเฉพาะกิจ' : 'เพิ่มวันทำงานพิเศษ',
          requestId
        })
      });
      const json = await res.json();
      if (json.ok) {
        onAttendanceChanged();
        fetchDayData(currentDate.current);
      } else {
        alert(json.error?.message || 'บันทึกวันทำงานไม่สำเร็จ');
      }
    } catch {
      alert('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง');
    }
  };

  const { fullCount, halfCount, absentCount } = useMemo(() => {
    let full = 0, half = 0, absent = 0;
    for (const item of items) {
      if (item.attendance.status === 'FULL') full++;
      else if (item.attendance.status === 'HALF') half++;
      else if (item.attendance.status === 'ABSENT') absent++;
    }
    return { fullCount: full, halfCount: half, absentCount: absent };
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter(item => {
      if (filterExceptions && !['HALF', 'ABSENT'].includes(item.attendance.status)) return false;
      if (query) {
        return (
          item.employee.name.toLowerCase().includes(query) ||
          Boolean(item.employee.nickname?.toLowerCase().includes(query)) ||
          item.employee.position.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [items, filterExceptions, searchQuery]);

  const hasAnyPending = Object.values(pendingMap).some(Boolean);

  return (
    <div>
      <h2 className={styles.title}>เช็กชื่อ</h2>

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
                  className="btn btn-secondary"
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
              {isWorkday ? `เต็มวัน ${fullCount} · ครึ่งวัน ${halfCount} · ไม่มา ${absentCount}` : 'วันหยุดตามตาราง'}
            </p>
            <button
              type="button"
              className={`btn btn-sm ${filterExceptions ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={filterExceptions}
              onClick={() => setFilterExceptions(!filterExceptions)}
            >
              {filterExceptions ? 'ดูทั้งหมด' : 'ดูครึ่งวันและไม่มา'}
            </button>
          </div>
        </div>

        {items.length > 8 && (
          <input
            type="search"
            placeholder="ค้นหาชื่อหรือตำแหน่งพนักงาน"
            className={styles.searchInput}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        )}
      </div>

      {errorMsg && <div className="app-notice app-notice-danger" role="alert" style={{ marginBottom: '1rem' }}>{errorMsg}</div>}

      {!isWorkday && (
        <div className={styles.notice}>
          <strong>วันหยุดตามตาราง</strong>
          <p>หากเปิดร้านวันนี้ ให้เพิ่มวันทำงานก่อนเช็กชื่อ</p>
          {!isClosed && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={loading || Boolean(calendarPending)}
              onClick={() => runCalendarAction('กำลังเพิ่มวันทำงาน', () => handleAddWorkday())}
              aria-busy={Boolean(calendarPending)}
            >
              <CalendarPlus size={20} aria-hidden="true" />
              <span>บันทึกวันทำงานเพิ่ม</span>
            </button>
          )}
        </div>
      )}

      {(loading || calendarPending) && <div className="refreshStatus" role="status">{calendarPending || 'กำลังโหลดข้อมูลเช็กชื่อ'}</div>}
      {loading && loadedDate.current !== selectedDate ? (
        <div className={styles.cardGrid} aria-busy="true" aria-label="กำลังโหลดข้อมูลเช็กชื่อ">
          {[0, 1, 2].map(index => <div className={styles.skeletonCard} key={index}>
            <span className="loadingLine" /><span className="loadingLine" /><span className="loadingLine" />
          </div>)}
        </div>
      ) : errorMsg && items.length === 0 ? null : items.length === 0 ? (
        <div className={styles.notice}>
          <strong>ยังไม่มีรายชื่อพนักงาน</strong>
          <p>เพิ่มพนักงานในเมนูตั้งค่าเพื่อเริ่มเช็กชื่อ</p>
          <button type="button" className="btn btn-primary btn-block" onClick={onNavigateToSettings}>
            ไปหน้าตั้งค่าเพิ่มพนักงาน
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <p className={styles.emptyText}>
          {filterExceptions ? 'ไม่มีรายการครึ่งวันหรือไม่มา' : 'ไม่พบรายชื่อที่ค้นหา'}
        </p>
      ) : (
        <div className={styles.cardGrid}>
          {filteredItems.map(item => {
            const emp = item.employee;
            const att = item.attendance;
            const isPending = Boolean(pendingMap[emp.employeeId]);
            const isClearing = clearingId === emp.employeeId;
            const disabled = loading || isPending || isClosed || !isWorkday;

            let statusLabel = 'วันหยุด';
            if (att.status === 'FULL') statusLabel = 'เต็มวัน';
            if (att.status === 'HALF') statusLabel = 'ครึ่งวัน';
            if (att.status === 'ABSENT') statusLabel = 'ไม่มา';

            return (
              <article key={emp.employeeId} className={styles.personCard} aria-busy={isPending}>
                <div>
                  <div className="saveStatusSlot" role="status">{isPending && <span className="busyInline">กำลังบันทึก</span>}</div>
                  <div className={styles.personHead}>
                    <div className={styles.avatar}>
                      {emp.photo ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={`/api/employees/${emp.employeeId}/photo?v=${emp.photo.version}`}
                          alt={`รูป ${emp.nickname || emp.name}`}
                        />
                      ) : (
                        (emp.nickname || emp.name).slice(0, 1)
                      )}
                    </div>
                    <div className={styles.personInfo}>
                      <h3 className={styles.personName}>{emp.nickname || emp.name}</h3>
                      <p className={styles.personPosition}>
                        {emp.position}
                        {emp.name && emp.nickname && emp.name !== emp.nickname && ` · ${emp.name}`}
                      </p>
                    </div>
                  </div>

                  <div
                    className={styles.statusGrid}
                    role="group"
                    aria-label={`เช็กชื่อ ${emp.nickname || emp.name}`}
                  >
                    <button
                      type="button"
                      className={`${styles.statusBtn} ${att.status === 'FULL' ? styles.statusBtnFullSelected : ''}`}
                      aria-pressed={att.status === 'FULL'}
                      disabled={disabled}
                      onClick={() => handleMark(emp.employeeId, 'FULL', att.revision)}
                    >
                      เต็มวัน
                    </button>

                    <button
                      type="button"
                      className={`${styles.statusBtn} ${att.status === 'HALF' ? styles.statusBtnHalfSelected : ''}`}
                      aria-pressed={att.status === 'HALF'}
                      disabled={disabled}
                      onClick={() => handleMark(emp.employeeId, 'HALF', att.revision)}
                    >
                      ครึ่งวัน
                    </button>

                    <button
                      type="button"
                      className={`${styles.statusBtn} ${att.status === 'ABSENT' ? styles.statusBtnAbsentSelected : ''}`}
                      aria-pressed={att.status === 'ABSENT'}
                      disabled={disabled}
                      onClick={() => handleMark(emp.employeeId, 'ABSENT', att.revision)}
                    >
                      ไม่มา
                    </button>
                  </div>

                  <div className={styles.moneySection}>
                    <label className={styles.advanceLabel} htmlFor={`advance-${emp.employeeId}`}>
                      เบิกเงินล่วงหน้า (บาท)
                    </label>
                    <div className={styles.moneyRow}>
                      <input
                        id={`advance-${emp.employeeId}`}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        className={styles.moneyInput}
                        placeholder="เช่น 200"
                        value={advanceInputs[emp.employeeId] ?? (att.advanceSatang ? (att.advanceSatang / 100).toFixed(2) : '')}
                        onChange={e => setAdvanceInputs(prev => ({ ...prev, [emp.employeeId]: e.target.value }))}
                        disabled={disabled}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={disabled}
                        onClick={() => handleSaveAdvance(emp.employeeId, att.status, att.revision)}
                      >
                        บันทึกเบิก
                      </button>
                    </div>
                    {att.advanceSatang > 0 && (
                      <div className={styles.moneyBadge}>
                        เบิกแล้ว {(att.advanceSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                      </div>
                    )}
                  </div>

                  <div className={styles.moneySection}>
                    <label className={styles.deductionLabel} htmlFor={`deduction-${emp.employeeId}`}>
                      หักเงิน (บาท)
                    </label>
                    <div className={styles.moneyRow}>
                      <input
                        id={`deduction-${emp.employeeId}`}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        className={styles.moneyInput}
                        placeholder="เช่น 100"
                        value={deductionInputs[emp.employeeId] ?? (att.deductionSatang ? (att.deductionSatang / 100).toFixed(2) : '')}
                        onChange={e => setDeductionInputs(prev => ({ ...prev, [emp.employeeId]: e.target.value }))}
                        disabled={disabled}
                      />
                      <button
                        type="button"
                        className="btn btn-danger-solid btn-sm"
                        disabled={disabled}
                        onClick={() => handleSaveDeduction(emp.employeeId, att.status, att.revision)}
                      >
                        บันทึกหัก
                      </button>
                    </div>
                    {att.deductionSatang > 0 && (
                      <div className={styles.moneyBadge}>
                        หักแล้ว {(att.deductionSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <span className={styles.statusText}>
                    {isPending
                      ? 'กำลังบันทึก…'
                      : att.automatic
                      ? 'เต็มวัน · ค่าเริ่มต้น'
                      : att.status !== 'UNMARKED'
                      ? `${statusLabel} · บันทึกแล้ว`
                      : att.advanceSatang > 0 && att.deductionSatang > 0
                      ? 'บันทึกเบิกและหักแล้ว'
                      : att.advanceSatang > 0
                      ? 'บันทึกเบิกแล้ว'
                      : att.deductionSatang > 0
                      ? 'บันทึกหักแล้ว'
                      : 'วันหยุด'}
                  </span>

                  {(!att.automatic && (att.status !== 'UNMARKED' || att.advanceSatang > 0 || att.deductionSatang > 0)) && !isClosed && (
                    <div>
                      {isClearing ? (
                        <div className={styles.confirmBox}>
                          <span>ล้างรายการ?</span>
                          <button
                            type="button"
                            className="btn btn-danger-solid btn-sm"
                            disabled={isPending}
                            onClick={() => handleMark(emp.employeeId, 'UNMARKED', att.revision, 0, 0)}
                          >
                            ยืนยัน
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setClearingId(null)}
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
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

      <div className={styles.bottomActions}>
        <button
          type="button"
          className="btn btn-warning btn-block"
          disabled={loading || isClosed || !isWorkday || Boolean(calendarPending) || hasAnyPending}
          onClick={() => {
            if (window.confirm(`กำหนดวันที่ ${formatThaiDate(selectedDate)} เป็นวันหยุดร้านหรือไม่\n\nวันนี้จะไม่นับค่าแรงตามตาราง แต่ข้อมูลเช็กชื่อยังอยู่ และเปลี่ยนกลับเป็นวันทำงานได้`)) {
              void runCalendarAction('กำลังบันทึกวันหยุดร้าน', () => handleAddWorkday('HOLIDAY'));
            }
          }}
        >
          <CalendarOff size={20} aria-hidden="true" />
          <span>{!isWorkday ? 'วันนี้เป็นวันหยุดร้านแล้ว' : 'วันหยุดร้านเฉพาะกิจ'}</span>
        </button>
        <LineSendButton scope="attendance" />
      </div>
    </div>
  );
}
