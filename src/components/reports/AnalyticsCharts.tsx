'use client';

import React, { useMemo, useState } from 'react';
import { Info, TrendingUp, Users } from 'lucide-react';
import { AnalyticsEmployee, ReportBucket, ReportPeriod } from '@/lib/payroll/analytics';
import {
  bucketAttendanceRate,
  EmployeeInsight,
  formatBucketLabel,
  HeatmapCell,
  PositionBreakdown,
  WeekdayPattern
} from '@/lib/payroll/hr-insights';
import { formatMoney } from '@/lib/payroll/money';
import styles from './detailed-reports.module.css';

export type MeterTone = 'primary' | 'good' | 'warn' | 'danger';

/** 36-segment tick progress bar inspired by 21st-8 KPI cards. */
export function SegmentedMeter({
  percent,
  tone = 'primary',
  segments = 36,
  ariaLabel
}: {
  percent: number;
  tone?: MeterTone;
  segments?: number;
  ariaLabel: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const filledCount = clamped <= 0 ? 0 : Math.max(1, Math.round((clamped / 100) * segments));
  const toneClass =
    tone === 'good'
      ? styles.meterTickGood
      : tone === 'warn'
        ? styles.meterTickWarn
        : tone === 'danger'
          ? styles.meterTickDanger
          : styles.meterTickPrimary;

  return (
    <div
      className={styles.meterTrack}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className={`${styles.meterTick} ${index < filledCount ? toneClass : styles.meterTickEmpty}`}
        />
      ))}
    </div>
  );
}

function shortTagOf(name: string, maxGraphemes = 4): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const firstWord = trimmed.split(/\s+/)[0] || trimmed;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
    const segments = Array.from(segmenter.segment(firstWord), s => s.segment);
    if (segments.length <= maxGraphemes) return firstWord;
    return segments.slice(0, maxGraphemes).join('');
  }
  return firstWord.length <= maxGraphemes ? firstWord : firstWord.slice(0, maxGraphemes);
}

function formatCompactBaht(satang: number): string {
  const baht = satang / 100;
  const abs = Math.abs(baht);
  if (abs >= 1_000_000) return `${(baht / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(baht / 1_000).toFixed(1)}K`;
  if (abs >= 1_000) return `${(baht / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(baht);
}

/** Monotone cubic spline path through points (prevents overshoot between points). */
function smoothSplinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const n = points.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    dy.push(points[i + 1].y - points[i].y);
    m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }

  const tangents: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push((m[i - 1] + m[i]) / 2);
    }
  }
  tangents.push(m[n - 2]);

  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / m[i];
      const b = tangents[i + 1] / m[i];
      const hypot = Math.hypot(a, b);
      if (hypot > 3) {
        const scale = 3 / hypot;
        tangents[i] = scale * a * m[i];
        tangents[i + 1] = scale * b * m[i];
      }
    }
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const seg = dx[i] / 3;
    const cp1x = points[i].x + seg;
    const cp1y = points[i].y + tangents[i] * seg;
    const cp2x = points[i + 1].x - seg;
    const cp2y = points[i + 1].y - tangents[i + 1] * seg;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${points[i + 1].x.toFixed(2)} ${points[i + 1].y.toFixed(2)}`;
  }
  return d;
}

export function ActivityHeatmapCard({
  period,
  cells,
  weekdays,
  employees,
  selectedEmployeeId,
  peakLabel,
  lowestLabel,
  onSelectEmployee
}: {
  period: ReportPeriod;
  cells: HeatmapCell[];
  weekdays: WeekdayPattern[];
  employees: AnalyticsEmployee[];
  selectedEmployeeId: string;
  peakLabel: string | null;
  lowestLabel: string | null;
  onSelectEmployee: (employeeId: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'overview' | 'matrix'>('overview');
  const [showInfo, setShowInfo] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const canShowMatrix = selectedEmployeeId === 'all' && employees.length > 0 && cells.length > 0;
  const effectiveView = canShowMatrix ? viewMode : 'overview';

  const activeCell = useMemo(() => {
    if (!cells.length) return null;
    if (activeKey) {
      const found = cells.find(c => c.key === activeKey);
      if (found) return found;
    }
    const lastActive = [...cells].reverse().find(c => c.scheduledSlots > 0);
    return lastActive || cells[cells.length - 1];
  }, [cells, activeKey]);

  const activeWeekdays = useMemo(
    () => weekdays.filter(w => w.scheduledSlots > 0),
    [weekdays]
  );

  // Calendar grid for day mode: 7 rows (Mon..Sun) x N weeks
  const calendarWeeks = useMemo(() => {
    if (period !== 'day' || !cells.length) return [];
    const maxWeek = Math.max(...cells.map(c => c.weekIndex));
    const grid: Array<Array<HeatmapCell | null>> = Array.from({ length: maxWeek + 1 }, () =>
      Array.from({ length: 7 }, () => null)
    );
    for (const cell of cells) {
      if (cell.weekday === null) continue;
      const row = cell.weekday === 0 ? 6 : cell.weekday - 1;
      grid[cell.weekIndex][row] = cell;
    }
    return grid;
  }, [period, cells]);

  const matrixKeys = useMemo(() => cells.map(c => c.key), [cells]);

  const cellLevelClass = (cell: HeatmapCell) => {
    if (cell.isHolidayOnly) return styles.heatCellHoliday;
    if (cell.scheduledSlots > 0 && cell.attendanceRate < 50) return styles.heatCellRisk;
    switch (cell.level) {
      case 4:
        return styles.heatCellL4;
      case 3:
        return styles.heatCellL3;
      case 2:
        return styles.heatCellL2;
      case 1:
        return styles.heatCellL1;
      default:
        return styles.heatCellL0;
    }
  };

  return (
    <section className={styles.card} aria-label="ความสม่ำเสมอการมาทำงาน">
      <div className={styles.cardHead}>
        <div className={styles.cardHeadText}>
          <div className={styles.cardTitleRow}>
            <h3>ความสม่ำเสมอการมาทำงาน</h3>
            <button
              type="button"
              className={styles.infoIconBtn}
              aria-label="อธิบายวิธีอ่านแผนที่ความหนาแน่น"
              aria-expanded={showInfo}
              onClick={() => setShowInfo(v => !v)}
            >
              <Info size={16} aria-hidden="true" />
            </button>
          </div>
          <p className={styles.cardSub}>
            {peakLabel ? (
              <>
                <span>สูงสุด: {peakLabel}</span>
                {lowestLabel && <span className={styles.subDivider}>·</span>}
                {lowestLabel && <span>ต่ำสุด: {lowestLabel}</span>}
              </>
            ) : (
              'ยังไม่มีวันทำงานในช่วงเวลาที่เลือก'
            )}
          </p>
        </div>

        {canShowMatrix && (
          <div className={styles.pillSwitch} role="group" aria-label="มุมมองแผนที่ความสม่ำเสมอ">
            <button
              type="button"
              className={`${styles.pillSwitchBtn} ${effectiveView === 'overview' ? styles.pillSwitchBtnActive : ''}`}
              aria-pressed={effectiveView === 'overview'}
              onClick={() => setViewMode('overview')}
            >
              {period === 'day' ? 'ปฏิทินทีม' : 'ภาพรวมช่วงเวลา'}
            </button>
            <button
              type="button"
              className={`${styles.pillSwitchBtn} ${effectiveView === 'matrix' ? styles.pillSwitchBtnActive : ''}`}
              aria-pressed={effectiveView === 'matrix'}
              onClick={() => setViewMode('matrix')}
            >
              รายบุคคล
            </button>
          </div>
        )}
      </div>

      {showInfo && (
        <p className={styles.inlineHint}>
          ความเข้มของสีสะท้อนอัตราการมาทำงานจริง (เต็มวันนับ 1, ครึ่งวันนับ 0.5 หารด้วยวันทำงานตามตาราง) สีแดงอ่อนหมายถึงวันที่มาทำงานต่ำกว่า 50% และสีเทาอ่อนคือวันหยุดร้าน แตะหรือเลื่อนเมาส์ที่ช่องเพื่อดูรายละเอียด
        </p>
      )}

      {cells.length === 0 ? (
        <p className={styles.emptyCardNote}>ไม่มีข้อมูลการมาทำงานในช่วงที่เลือก</p>
      ) : effectiveView === 'matrix' ? (
        <div className={styles.matrixScroll} tabIndex={0} role="region" aria-label="ตารางสีความสม่ำเสมอรายบุคคล">
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th scope="col" className={styles.matrixNameCol}>พนักงาน</th>
                {cells.map(cell => (
                  <th key={cell.key} scope="col" className={styles.matrixDateCol} title={cell.label}>
                    {cell.shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const byKey = new Map(emp.buckets.map(b => [b.key, b]));
                return (
                  <tr key={emp.employeeId}>
                    <th scope="row" className={styles.matrixNameCol}>
                      <button
                        type="button"
                        className={styles.matrixPersonLink}
                        onClick={() => onSelectEmployee(emp.employeeId)}
                      >
                        {emp.nickname || emp.name}
                      </button>
                    </th>
                    {matrixKeys.map(key => {
                      const b = byKey.get(key);
                      const scheduled = b ? b.full + b.half + b.absent : 0;
                      const rate = b ? bucketAttendanceRate(b) : 0;
                      let cls = styles.heatCellL0;
                      let tip = `${emp.nickname || emp.name} · ${formatBucketLabel(key, period)}: ไม่มีข้อมูล`;
                      if (b) {
                        if (scheduled === 0 && b.holiday > 0) {
                          cls = styles.heatCellHoliday;
                          tip = `${emp.nickname || emp.name} · ${formatBucketLabel(key, period)}: วันหยุดร้าน`;
                        } else if (period === 'day') {
                          if (b.full > 0) {
                            cls = styles.heatCellL4;
                            tip = `${emp.nickname || emp.name} · ${formatBucketLabel(key, period)}: เต็มวัน`;
                          } else if (b.half > 0) {
                            cls = styles.matrixDotHalf;
                            tip = `${emp.nickname || emp.name} · ${formatBucketLabel(key, period)}: ครึ่งวัน`;
                          } else if (b.absent > 0) {
                            cls = styles.matrixDotAbsent;
                            tip = `${emp.nickname || emp.name} · ${formatBucketLabel(key, period)}: ไม่มาทำงาน`;
                          }
                        } else if (scheduled > 0) {
                          cls = rate >= 95 ? styles.heatCellL4 : rate >= 80 ? styles.heatCellL3 : rate >= 55 ? styles.heatCellL2 : styles.matrixDotAbsent;
                          tip = `${emp.nickname || emp.name} · ${formatBucketLabel(key, period)}: มาทำงาน ${rate}% (เต็ม ${b.full}, ครึ่ง ${b.half}, ขาด ${b.absent})`;
                        }
                      }
                      return (
                        <td key={key} className={styles.matrixCellTd}>
                          <button
                            type="button"
                            className={`${styles.matrixDot} ${cls}`}
                            aria-label={tip}
                            title={tip}
                            onMouseEnter={() => setActiveKey(key)}
                            onFocus={() => setActiveKey(key)}
                            onClick={() => setActiveKey(key)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : period === 'day' ? (
        <div className={styles.dayHeatLayout}>
          <div className={styles.calendarWrap}>
            <div className={styles.calendarGrid} role="grid" aria-label="ปฏิทินอัตราการมาทำงานรายวัน">
              <div className={styles.calendarDayLabels} aria-hidden="true">
                {['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'].map(label => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className={styles.calendarWeeks}>
                {calendarWeeks.map((week, wIdx) => (
                  <div key={wIdx} className={styles.calendarWeekCol}>
                    {week.map((cell, dIdx) =>
                      cell ? (
                        <button
                          key={cell.key}
                          type="button"
                          className={`${styles.heatSquare} ${cellLevelClass(cell)} ${activeCell?.key === cell.key ? styles.heatSquareSelected : ''}`}
                          onMouseEnter={() => setActiveKey(cell.key)}
                          onFocus={() => setActiveKey(cell.key)}
                          onClick={() => setActiveKey(cell.key)}
                          aria-label={`${cell.label}: มาทำงาน ${cell.attendanceRate}%`}
                        >
                          <span>{cell.shortLabel}</span>
                        </button>
                      ) : (
                        <span key={`empty-${wIdx}-${dIdx}`} className={styles.heatSquareSpacer} aria-hidden="true" />
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {activeWeekdays.length > 0 && (
            <div className={styles.weekdayRail} aria-label="อัตราการมาทำงานแยกตามวันในสัปดาห์">
              <div className={styles.weekdayRailTitle}>อัตราการมาทำงานตามวันในสัปดาห์</div>
              <div className={styles.weekdayBars}>
                {activeWeekdays.map(wd => (
                  <div key={wd.weekday} className={styles.weekdayRow}>
                    <span className={styles.weekdayName}>{wd.shortLabel}</span>
                    <div className={styles.weekdayTrack}>
                      <div
                        className={`${styles.weekdayFill} ${wd.attendanceRate < 80 ? styles.weekdayFillRisk : wd.attendanceRate < 90 ? styles.weekdayFillWarn : styles.weekdayFillGood}`}
                        style={{ width: `${Math.min(100, wd.attendanceRate)}%` }}
                      />
                    </div>
                    <span className={styles.weekdayVal}>{wd.attendanceRate}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.periodStrip} role="list" aria-label="ความสม่ำเสมอตามช่วงเวลา">
          {cells.map(cell => (
            <button
              key={cell.key}
              type="button"
              role="listitem"
              className={`${styles.periodTile} ${cellLevelClass(cell)} ${activeCell?.key === cell.key ? styles.heatSquareSelected : ''}`}
              onMouseEnter={() => setActiveKey(cell.key)}
              onFocus={() => setActiveKey(cell.key)}
              onClick={() => setActiveKey(cell.key)}
            >
              <span className={styles.periodTileLabel}>{cell.shortLabel}</span>
              <strong className={styles.periodTileRate}>
                {cell.scheduledSlots > 0 ? `${cell.attendanceRate}%` : '—'}
              </strong>
            </button>
          ))}
        </div>
      )}

      <div className={styles.heatFooter}>
        <div className={styles.heatLegend} aria-label="คำอธิบายระดับสี">
          {effectiveView === 'matrix' && period === 'day' ? (
            <>
              <span className={`${styles.legendDot} ${styles.heatCellL4}`} />
              <span>เต็มวัน</span>
              <span className={`${styles.legendDot} ${styles.matrixDotHalf}`} />
              <span>ครึ่งวัน</span>
              <span className={`${styles.legendDot} ${styles.matrixDotAbsent}`} />
              <span>ไม่มา</span>
              <span className={`${styles.legendDot} ${styles.heatCellHoliday}`} />
              <span>วันหยุด</span>
            </>
          ) : (
            <>
              <span>น้อย</span>
              <span className={`${styles.legendDot} ${styles.heatCellL0}`} />
              <span className={`${styles.legendDot} ${styles.heatCellL1}`} />
              <span className={`${styles.legendDot} ${styles.heatCellL2}`} />
              <span className={`${styles.legendDot} ${styles.heatCellL3}`} />
              <span className={`${styles.legendDot} ${styles.heatCellL4}`} />
              <span>มาก</span>
              <span className={styles.legendSep} />
              <span className={`${styles.legendDot} ${styles.matrixDotAbsent}`} />
              <span>ขาด/ต่ำกว่า 50%</span>
              <span className={`${styles.legendDot} ${styles.heatCellHoliday}`} />
              <span>วันหยุด</span>
            </>
          )}
        </div>

        {activeCell && (
          <div className={styles.heatReadout} aria-live="polite">
            <strong>{activeCell.label}</strong>
            {activeCell.isHolidayOnly ? (
              <span>วันหยุดตามตารางร้าน</span>
            ) : activeCell.scheduledSlots > 0 ? (
              <span>
                มาทำงาน {activeCell.attendanceRate}% · เต็ม {activeCell.full} · ครึ่ง {activeCell.half} · ขาด {activeCell.absent} · ค่าแรง {formatMoney(activeCell.grossSatang)} บาท
              </span>
            ) : (
              <span>ยังไม่มีรายการทำงาน</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export type TrendMetric = 'grossSatang' | 'totalSatang' | 'advanceSatang' | 'deductionSatang' | 'attendanceRate' | 'workedDays';

const TREND_OPTIONS: Array<{ key: TrendMetric; label: string; isMoney: boolean; unit: string }> = [
  { key: 'grossSatang', label: 'ค่าแรงรวมเงินพิเศษ', isMoney: true, unit: 'บาท' },
  { key: 'totalSatang', label: 'ค่าจ้างสุทธิ', isMoney: true, unit: 'บาท' },
  { key: 'advanceSatang', label: 'เงินเบิกล่วงหน้า', isMoney: true, unit: 'บาท' },
  { key: 'deductionSatang', label: 'เงินหัก', isMoney: true, unit: 'บาท' },
  { key: 'attendanceRate', label: 'อัตราการมาทำงาน (%)', isMoney: false, unit: '%' },
  { key: 'workedDays', label: 'จำนวนวันมาทำงาน', isMoney: false, unit: 'วัน' }
];

export function SmoothTrendChartCard({
  rows,
  period,
  divisor
}: {
  rows: ReportBucket[];
  period: ReportPeriod;
  divisor: number;
}) {
  const [metric, setMetric] = useState<TrendMetric>('grossSatang');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const meta = TREND_OPTIONS.find(o => o.key === metric) || TREND_OPTIONS[0];

  const series = useMemo(() => {
    const filteredRows =
      period === 'day'
        ? rows.filter(row => {
            const scheduled = row.full + row.half + row.absent;
            const isPureHoliday =
              scheduled === 0 &&
              row.holiday > 0 &&
              row.grossSatang === 0 &&
              row.advanceSatang === 0 &&
              row.deductionSatang === 0;
            return !isPureHoliday;
          })
        : rows;
    const sourceRows = filteredRows.length > 0 ? filteredRows : rows;

    return sourceRows.map(row => {
      let value = 0;
      if (metric === 'attendanceRate') {
        value = bucketAttendanceRate(row);
      } else if (metric === 'workedDays') {
        value = Math.round((row.workedDays / Math.max(1, divisor)) * 100) / 100;
      } else {
        value = row[metric];
      }
      return {
        key: row.key,
        label: formatBucketLabel(row.key, period),
        shortLabel: formatBucketLabel(row.key, period, true),
        value,
        hasActivity: row.full + row.half + row.absent > 0 || row.grossSatang !== 0 || row.advanceSatang !== 0
      };
    });
  }, [rows, period, metric, divisor]);

  const activeSeriesValues = useMemo(() => {
    const active = series.filter(s => s.hasActivity);
    return active.length > 0 ? active.map(s => s.value) : series.map(s => s.value);
  }, [series]);

  const avgValue = useMemo(() => {
    if (!activeSeriesValues.length) return 0;
    const sum = activeSeriesValues.reduce((acc, v) => acc + v, 0);
    return sum / activeSeriesValues.length;
  }, [activeSeriesValues]);

  const width = 540;
  const height = 248;
  const padLeft = 58;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const rawMax = Math.max(metric === 'attendanceRate' ? 100 : 1, ...series.map(s => s.value));
  const rawMin = Math.min(0, ...series.map(s => s.value));
  const yMax = metric === 'attendanceRate' ? 100 : rawMax * 1.12;
  const yMin = rawMin < 0 ? rawMin * 1.12 : 0;
  const range = Math.max(1, yMax - yMin);

  const xAt = (index: number) =>
    series.length <= 1 ? padLeft + plotW / 2 : padLeft + (index / (series.length - 1)) * plotW;
  const yAt = (val: number) => padTop + ((yMax - val) / range) * plotH;

  const points = series.map((item, idx) => ({ x: xAt(idx), y: yAt(item.value) }));
  const lineD = smoothSplinePath(points);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => yMin + range * f);
  const labelEvery = series.length > 16 ? Math.ceil(series.length / 7) : series.length > 9 ? 2 : 1;

  const focusedIdx = hoverIndex !== null && hoverIndex < series.length ? hoverIndex : series.length - 1;
  const focusedPoint = series[focusedIdx];

  const strokeColor =
    metric === 'advanceSatang'
      ? '#b45309'
      : metric === 'deductionSatang'
        ? '#b91c1c'
        : metric === 'attendanceRate' || metric === 'workedDays'
          ? '#15803d'
          : '#003566';

  const formatMetricVal = (v: number) => {
    if (meta.isMoney) return `${formatMoney(Math.round(v))} บาท`;
    if (metric === 'attendanceRate') return `${Math.round(v * 10) / 10}%`;
    return `${new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(v)} วัน`;
  };

  const formatAxisVal = (v: number) => {
    if (meta.isMoney) return formatCompactBaht(v);
    if (metric === 'attendanceRate') return `${Math.round(v)}%`;
    return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(v);
  };

  return (
    <section className={`${styles.card} ${styles.chartCard}`} aria-label="กราฟเส้นแนวโน้ม">
      <div className={styles.cardHead}>
        <div className={styles.cardHeadText}>
          <div className={styles.cardTitleRow}>
            <TrendingUp size={18} className={styles.cardTitleIcon} aria-hidden="true" />
            <h3>แนวโน้มรายช่วงเวลา</h3>
          </div>
          <p className={styles.cardSub}>
            เฉลี่ย {formatMetricVal(avgValue)} / {period === 'day' ? 'วันทำงาน' : period === 'month' ? 'เดือน' : 'ปี'}
          </p>
        </div>
        <select
          className={styles.compactSelect}
          aria-label="เลือกตัวชี้วัดกราฟแนวโน้ม"
          value={metric}
          onChange={e => {
            setMetric(e.target.value as TrendMetric);
            setHoverIndex(null);
          }}
        >
          {TREND_OPTIONS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </div>

      {series.length === 0 ? (
        <p className={styles.emptyCardNote}>ยังไม่มีข้อมูลสำหรับแสดงกราฟแนวโน้ม</p>
      ) : (
        <>
          <div className={styles.svgChartBox}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className={styles.responsiveSvg}
              role="img"
              aria-label={`กราฟเส้นแนวโน้ม${meta.label}`}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {yTicks.map((tick, idx) => (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    x2={width - padRight}
                    y1={yAt(tick)}
                    y2={yAt(tick)}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 8}
                    y={yAt(tick) + 4}
                    textAnchor="end"
                    fontSize="11.5"
                    fill="#475569"
                  >
                    {formatAxisVal(tick)}
                  </text>
                </g>
              ))}

              {/* Target or Average reference dashed line */}
              {metric === 'attendanceRate' ? (
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={yAt(90)}
                  y2={yAt(90)}
                  stroke="#15803d"
                  strokeOpacity="0.45"
                  strokeDasharray="4 4"
                  strokeWidth="1.25"
                />
              ) : avgValue !== 0 ? (
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={yAt(avgValue)}
                  y2={yAt(avgValue)}
                  stroke={strokeColor}
                  strokeOpacity="0.3"
                  strokeDasharray="4 4"
                  strokeWidth="1.25"
                />
              ) : null}

              {/* Smooth spline curve */}
              <path
                d={lineD}
                fill="none"
                stroke={strokeColor}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Hover vertical cursor and active dot */}
              {focusedPoint && points[focusedIdx] && (
                <g>
                  <line
                    x1={points[focusedIdx].x}
                    x2={points[focusedIdx].x}
                    y1={padTop}
                    y2={height - padBottom}
                    stroke="#94a8be"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <circle
                    cx={points[focusedIdx].x}
                    cy={points[focusedIdx].y}
                    r="6.5"
                    fill={strokeColor}
                    fillOpacity="0.18"
                  />
                  <circle
                    cx={points[focusedIdx].x}
                    cy={points[focusedIdx].y}
                    r="3.8"
                    fill="#ffffff"
                    stroke={strokeColor}
                    strokeWidth="2.2"
                  />
                </g>
              )}

              {/* X-axis labels */}
              {series.map((item, idx) => {
                const show = idx === 0 || idx === series.length - 1 || idx % labelEvery === 0;
                if (!show) return null;
                return (
                  <text
                    key={item.key}
                    x={xAt(idx)}
                    y={height - 10}
                    textAnchor="middle"
                    fontSize="11.5"
                    fill={idx === focusedIdx ? '#001d3d' : '#475569'}
                    fontWeight={idx === focusedIdx ? '700' : '400'}
                  >
                    {item.shortLabel}
                  </text>
                );
              })}

              {/* Invisible hit bands for smooth mouse & tap scrubbing */}
              {series.map((item, idx) => {
                const stepW = series.length <= 1 ? plotW : plotW / Math.max(1, series.length - 1);
                const left = Math.max(padLeft, xAt(idx) - stepW / 2);
                const right = Math.min(width - padRight, xAt(idx) + stepW / 2);
                return (
                  <rect
                    key={`hit-${item.key}`}
                    x={left}
                    y={padTop}
                    width={Math.max(8, right - left)}
                    height={plotH}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoverIndex(idx)}
                    onClick={() => setHoverIndex(idx)}
                  >
                    <title>{`${item.label}: ${formatMetricVal(item.value)}`}</title>
                  </rect>
                );
              })}
            </svg>
          </div>

          {focusedPoint && (
            <div className={styles.chartFooterReadout} aria-live="polite">
              <span className={styles.readoutSwatch} style={{ backgroundColor: strokeColor }} />
              <strong>{focusedPoint.label}</strong>
              <span className={styles.readoutSep}>:</span>
              <span className={styles.readoutVal}>{formatMetricVal(focusedPoint.value)}</span>
              {avgValue > 0 && (
                <span className={styles.readoutMuted}>
                  ({focusedPoint.value >= avgValue ? '+' : ''}
                  {Math.round(((focusedPoint.value - avgValue) / avgValue) * 100)}% เทียบค่าเฉลี่ย)
                </span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

type BarMode = 'emp_gross' | 'emp_attendance' | 'emp_advance' | 'position_gross' | 'status_days';

interface BarItem {
  id: string;
  label: string;
  marker: string;
  value: number;
  displayValue: string;
  shareText: string;
  color?: string;
  employeeId?: string;
}

export function ComparisonBarChartCard({
  employees,
  positions,
  singleEmployee,
  onSelectEmployee
}: {
  employees: EmployeeInsight[];
  positions: PositionBreakdown[];
  singleEmployee: EmployeeInsight | null;
  onSelectEmployee: (employeeId: string) => void;
}) {
  const [teamMode, setTeamMode] = useState<BarMode>('emp_gross');
  const [soloMode, setSoloMode] = useState<'money' | 'days'>('money');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const items: BarItem[] = useMemo(() => {
    if (singleEmployee) {
      const t = singleEmployee.totals;
      if (soloMode === 'days') {
        const total = Math.max(1, t.full + t.half + t.absent + t.holiday);
        return [
          { id: 'full', label: 'เต็มวัน', marker: 'เต็ม', value: t.full, displayValue: `${t.full} วัน`, shareText: `${Math.round((t.full / total) * 100)}% ของช่วงเวลา`, color: '#15803d' },
          { id: 'half', label: 'ครึ่งวัน', marker: 'ครึ่ง', value: t.half, displayValue: `${t.half} วัน`, shareText: `${Math.round((t.half / total) * 100)}% ของช่วงเวลา`, color: '#b45309' },
          { id: 'absent', label: 'ไม่มา', marker: 'ขาด', value: t.absent, displayValue: `${t.absent} วัน`, shareText: `${Math.round((t.absent / total) * 100)}% ของช่วงเวลา`, color: '#b91c1c' },
          { id: 'holiday', label: 'วันหยุด', marker: 'หยุด', value: t.holiday, displayValue: `${t.holiday} วัน`, shareText: `${Math.round((t.holiday / total) * 100)}% ของช่วงเวลา`, color: '#64748b' }
        ];
      }
      const base = Math.max(1, t.grossSatang);
      return [
        { id: 'base', label: 'ค่าแรงสะสม', marker: 'แรง', value: t.baseSatang, displayValue: `${formatMoney(t.baseSatang)} บาท`, shareText: `${Math.round((t.baseSatang / base) * 100)}% ของค่าแรงรวม`, color: '#003566' },
        { id: 'extra', label: 'เงินพิเศษ', marker: 'พิเศษ', value: t.extraSatang, displayValue: `${formatMoney(t.extraSatang)} บาท`, shareText: `${Math.round((t.extraSatang / base) * 100)}% ของค่าแรงรวม`, color: '#15803d' },
        { id: 'adv', label: 'เงินเบิก', marker: 'เบิก', value: t.advanceSatang, displayValue: `${formatMoney(t.advanceSatang)} บาท`, shareText: `${singleEmployee.advanceRatio}% ของค่าแรงรวม`, color: '#b45309' },
        { id: 'ded', label: 'เงินหัก', marker: 'หัก', value: t.deductionSatang, displayValue: `${formatMoney(t.deductionSatang)} บาท`, shareText: `${singleEmployee.deductionRatio}% ของค่าแรงรวม`, color: '#b91c1c' },
        { id: 'net', label: 'ค่าจ้างสุทธิ', marker: 'สุทธิ', value: Math.max(0, t.totalSatang), displayValue: `${formatMoney(t.totalSatang)} บาท`, shareText: t.totalSatang < 0 ? 'ยอดสุทธิติดลบ' : `${Math.round((t.totalSatang / base) * 100)}% คงเหลือจ่ายจริง`, color: t.totalSatang < 0 ? '#b91c1c' : '#0369a1' }
      ];
    }

    if (teamMode === 'position_gross') {
      return positions.slice(0, 10).map(pos => ({
        id: `pos-${pos.position}`,
        label: pos.position,
        marker: shortTagOf(pos.position, 5),
        value: pos.grossSatang,
        displayValue: `${formatMoney(pos.grossSatang)} บาท`,
        shareText: `${pos.payrollShare}% ของงบ · ${pos.headcount} คน · มา ${pos.attendanceRate}%`
      }));
    }

    if (teamMode === 'status_days') {
      const sum = employees.reduce(
        (acc, e) => ({
          full: acc.full + e.totals.full,
          half: acc.half + e.totals.half,
          absent: acc.absent + e.totals.absent,
          holiday: acc.holiday + e.totals.holiday
        }),
        { full: 0, half: 0, absent: 0, holiday: 0 }
      );
      const total = Math.max(1, sum.full + sum.half + sum.absent + sum.holiday);
      return [
        { id: 'full', label: 'เต็มวัน', marker: 'เต็ม', value: sum.full, displayValue: `${sum.full} คน-วัน`, shareText: `${Math.round((sum.full / total) * 100)}% ของทั้งหมด`, color: '#15803d' },
        { id: 'half', label: 'ครึ่งวัน', marker: 'ครึ่ง', value: sum.half, displayValue: `${sum.half} คน-วัน`, shareText: `${Math.round((sum.half / total) * 100)}% ของทั้งหมด`, color: '#b45309' },
        { id: 'absent', label: 'ไม่มาทำงาน', marker: 'ขาด', value: sum.absent, displayValue: `${sum.absent} คน-วัน`, shareText: `${Math.round((sum.absent / total) * 100)}% ของทั้งหมด`, color: '#b91c1c' },
        { id: 'holiday', label: 'วันหยุดร้าน', marker: 'หยุด', value: sum.holiday, displayValue: `${sum.holiday} คน-วัน`, shareText: `${Math.round((sum.holiday / total) * 100)}% ของทั้งหมด`, color: '#64748b' }
      ];
    }

    if (teamMode === 'emp_attendance') {
      return [...employees]
        .sort((a, b) => b.attendanceRate - a.attendanceRate || a.displayName.localeCompare(b.displayName, 'th'))
        .slice(0, 12)
        .map(emp => ({
          id: emp.employeeId,
          label: `${emp.displayName} (${emp.position})`,
          marker: shortTagOf(emp.displayName, 4),
          value: emp.attendanceRate,
          displayValue: `${emp.attendanceRate}%`,
          shareText: `เต็ม ${emp.totals.full} · ครึ่ง ${emp.totals.half} · ขาด ${emp.totals.absent}`,
          color: emp.attendanceRate < 80 ? '#b91c1c' : emp.attendanceRate < 90 ? '#b45309' : undefined,
          employeeId: emp.employeeId
        }));
    }

    if (teamMode === 'emp_advance') {
      const totalAdv = Math.max(1, employees.reduce((acc, e) => acc + e.totals.advanceSatang, 0));
      return [...employees]
        .sort((a, b) => b.totals.advanceSatang - a.totals.advanceSatang || a.displayName.localeCompare(b.displayName, 'th'))
        .slice(0, 12)
        .map(emp => ({
          id: emp.employeeId,
          label: `${emp.displayName} (${emp.position})`,
          marker: shortTagOf(emp.displayName, 4),
          value: emp.totals.advanceSatang,
          displayValue: `${formatMoney(emp.totals.advanceSatang)} บาท`,
          shareText: `${emp.advanceRatio}% ของค่าแรงตนเอง · ${Math.round((emp.totals.advanceSatang / totalAdv) * 100)}% ของยอดเบิกทีม`,
          color: emp.isCashWatch ? '#b45309' : undefined,
          employeeId: emp.employeeId
        }));
    }

    return employees.slice(0, 12).map(emp => ({
      id: emp.employeeId,
      label: `${emp.displayName} (${emp.position})`,
      marker: shortTagOf(emp.displayName, 4),
      value: emp.totals.grossSatang,
      displayValue: `${formatMoney(emp.totals.grossSatang)} บาท`,
      shareText: `${emp.payrollShare}% ของงบทีม · มาทำงาน ${emp.attendanceRate}%`,
      employeeId: emp.employeeId
    }));
  }, [employees, positions, singleEmployee, teamMode, soloMode]);

  const isMoneyAxis = singleEmployee
    ? soloMode === 'money'
    : teamMode === 'emp_gross' || teamMode === 'emp_advance' || teamMode === 'position_gross';
  const isPercentAxis = !singleEmployee && teamMode === 'emp_attendance';

  const maxVal = Math.max(isPercentAxis ? 100 : 1, ...items.map(i => i.value));
  const leaderId = useMemo(() => {
    if (!items.length) return null;
    return items.reduce((best, cur) => (cur.value > best.value ? cur : best), items[0]).id;
  }, [items]);

  const activeItem = useMemo(() => {
    if (!items.length) return null;
    if (hoveredId) {
      const found = items.find(i => i.id === hoveredId);
      if (found) return found;
    }
    return items.find(i => i.id === leaderId) || items[0];
  }, [items, hoveredId, leaderId]);

  const avgVal = items.length ? items.reduce((acc, i) => acc + i.value, 0) / items.length : 0;

  const width = 540;
  const height = 248;
  const padLeft = 56;
  const padRight = 16;
  const padTop = 36;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const yMax = isPercentAxis ? 100 : maxVal * 1.15;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => yMax * f);
  const slotW = plotW / Math.max(1, items.length);
  const barW = Math.min(34, Math.max(16, slotW * 0.48));

  const formatAxis = (v: number) => {
    if (isMoneyAxis) return formatCompactBaht(v);
    if (isPercentAxis) return `${Math.round(v)}%`;
    return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(v);
  };

  const subtitle = isMoneyAxis
    ? `เฉลี่ย ${formatMoney(Math.round(avgVal))} บาท`
    : isPercentAxis
      ? `เฉลี่ย ${Math.round(avgVal * 10) / 10}%`
      : `รวม ${new Intl.NumberFormat('th-TH').format(items.reduce((s, i) => s + i.value, 0))} วัน`;

  return (
    <section className={`${styles.card} ${styles.chartCard}`} aria-label="กราฟแท่งเปรียบเทียบ">
      <div className={styles.cardHead}>
        <div className={styles.cardHeadText}>
          <div className={styles.cardTitleRow}>
            <Users size={18} className={styles.cardTitleIcon} aria-hidden="true" />
            <h3>{singleEmployee ? 'โครงสร้างค่าตอบแทนและเวลา' : 'เปรียบเทียบกำลังคนและงบ'}</h3>
          </div>
          <p className={styles.cardSub}>{subtitle}</p>
        </div>

        {singleEmployee ? (
          <div className={styles.pillSwitch} role="group" aria-label="มุมมองรายบุคคล">
            <button
              type="button"
              className={`${styles.pillSwitchBtn} ${soloMode === 'money' ? styles.pillSwitchBtnActive : ''}`}
              aria-pressed={soloMode === 'money'}
              onClick={() => { setSoloMode('money'); setHoveredId(null); }}
            >
              โครงสร้างเงิน
            </button>
            <button
              type="button"
              className={`${styles.pillSwitchBtn} ${soloMode === 'days' ? styles.pillSwitchBtnActive : ''}`}
              aria-pressed={soloMode === 'days'}
              onClick={() => { setSoloMode('days'); setHoveredId(null); }}
            >
              วันทำงาน
            </button>
          </div>
        ) : (
          <select
            className={styles.compactSelect}
            aria-label="เลือกมุมมองเปรียบเทียบ"
            value={teamMode}
            onChange={e => { setTeamMode(e.target.value as BarMode); setHoveredId(null); }}
          >
            <option value="emp_gross">รายคน · ค่าแรงรวม</option>
            <option value="emp_attendance">รายคน · อัตราการมา %</option>
            <option value="emp_advance">รายคน · เงินเบิก</option>
            <option value="position_gross">ตามตำแหน่ง · งบค่าแรง</option>
            <option value="status_days">สัดส่วนสถานะวันทำงาน</option>
          </select>
        )}
      </div>

      {items.length === 0 ? (
        <p className={styles.emptyCardNote}>ยังไม่มีข้อมูลสำหรับเปรียบเทียบ</p>
      ) : (
        <>
          <div className={styles.svgChartBox}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className={styles.responsiveSvg}
              role="img"
              aria-label="กราฟแท่งเปรียบเทียบข้อมูลพนักงาน"
              onMouseLeave={() => setHoveredId(null)}
            >
              {yTicks.map((tick, idx) => {
                const yPos = padTop + plotH - (tick / Math.max(1, yMax)) * plotH;
                return (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      x2={width - padRight}
                      y1={yPos}
                      y2={yPos}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                    <text x={padLeft - 8} y={yPos + 4} textAnchor="end" fontSize="11.5" fill="#475569">
                      {formatAxis(tick)}
                    </text>
                  </g>
                );
              })}

              {items.map((item, idx) => {
                const cx = padLeft + idx * slotW + slotW / 2;
                const barH = Math.max(item.value > 0 ? 4 : 0, (item.value / Math.max(1, yMax)) * plotH);
                const yTop = padTop + plotH - barH;
                const isHighlighted = activeItem?.id === item.id;
                const isLeader = item.id === leaderId;
                const fill = item.color
                  ? isHighlighted
                    ? item.color
                    : `${item.color}cc`
                  : isHighlighted || (hoveredId === null && isLeader)
                    ? '#003566'
                    : '#94a8be';

                return (
                  <g
                    key={item.id}
                    style={{ cursor: item.employeeId ? 'pointer' : 'default' }}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onClick={() => {
                      setHoveredId(item.id);
                      if (item.employeeId) onSelectEmployee(item.employeeId);
                    }}
                  >
                    {/* Top rounded pill marker floating above bar (21st-8 Usage by Model motif, Thai-safe) */}
                    {(() => {
                      const pillW = Math.min(Math.max(32, item.marker.length * 7.5 + 12), Math.max(34, slotW - 6));
                      const pillY = Math.max(4, yTop - 27);
                      return (
                        <>
                          <rect
                            x={cx - pillW / 2}
                            y={pillY}
                            width={pillW}
                            height="21"
                            rx="10.5"
                            fill={isHighlighted ? '#003566' : '#e8f0f8'}
                            stroke={isHighlighted ? '#003566' : '#b6c6d8'}
                            strokeWidth="1"
                          />
                          <text
                            x={cx}
                            y={pillY + 14.5}
                            textAnchor="middle"
                            fontSize="10.5"
                            fontWeight="700"
                            fill={isHighlighted ? '#ffffff' : '#003566'}
                          >
                            {item.marker}
                          </text>
                        </>
                      );
                    })()}

                    <rect
                      x={cx - barW / 2}
                      y={yTop}
                      width={barW}
                      height={barH}
                      rx="6"
                      fill={fill}
                    >
                      <title>{`${item.label}: ${item.displayValue} (${item.shareText})`}</title>
                    </rect>
                  </g>
                );
              })}
            </svg>
          </div>

          {activeItem && (
            <div className={styles.chartFooterReadout} aria-live="polite">
              <span className={styles.readoutBadge}>{activeItem.marker}</span>
              <strong>{activeItem.label}</strong>
              <span className={styles.readoutSep}>:</span>
              <span className={styles.readoutVal}>{activeItem.displayValue}</span>
              <span className={styles.readoutMuted}>({activeItem.shareText})</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
