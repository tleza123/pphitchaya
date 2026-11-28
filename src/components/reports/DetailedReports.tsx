'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Info,
  Printer,
  RefreshCw,
  ShieldAlert,
  Wallet
} from 'lucide-react';
import { useHistoryState } from '@/components/shared/useHistoryState';
import { useAuth } from '@/features/auth/AuthContext';
import { AnalyticsReport, ReportPeriod } from '@/lib/payroll/analytics';
import { formatMoney } from '@/lib/payroll/money';
import { formatThaiMonth, getBangkokToday } from '@/lib/payroll/dates';
import {
  bucketAttendanceRate,
  computeHrInsights,
  EmployeeSegmentFilter,
  formatBucketLabel
} from '@/lib/payroll/hr-insights';
import {
  ActivityHeatmapCard,
  ComparisonBarChartCard,
  SegmentedMeter,
  SmoothTrendChartCard
} from './AnalyticsCharts';
import styles from './detailed-reports.module.css';

const periodLabels: Record<ReportPeriod, string> = {
  day: 'รายวัน',
  month: 'รายเดือน',
  year: 'รายปี'
};

export default function DetailedReports({
  active,
  attendanceVersion,
  onBack
}: {
  active: boolean;
  attendanceVersion: number;
  onBack: () => void;
}) {
  const { idToken } = useAuth();
  const today = getBangkokToday();
  const currentYear = today.slice(0, 4);

  const [period, setPeriod] = useState<ReportPeriod>('day');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(currentYear);
  const [fromYear, setFromYear] = useState(String(Math.max(2026, Number(currentYear) - 4)));
  const [toYear, setToYear] = useState(currentYear);
  const [employeeId, setEmployeeId] = useHistoryState<string>('detailed-person', 'all');
  const [segmentFilter, setSegmentFilter] = useState<EmployeeSegmentFilter>('all');

  const [storedData, setData] = useState<AnalyticsReport | null>(null);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const lastQuery = useRef('');
  const peopleSectionRef = useRef<HTMLElement | null>(null);
  const tableSectionRef = useRef<HTMLElement | null>(null);

  const query = useMemo(
    () =>
      new URLSearchParams(
        period === 'day'
          ? { period, month }
          : period === 'month'
            ? { period, year }
            : { period, fromYear, toYear }
      ).toString(),
    [period, month, year, fromYear, toYear]
  );

  const data = loadedQuery === query && storedData?.period === period ? storedData : null;

  useEffect(() => {
    if (!active || !idToken) return;
    const controller = new AbortController();
    if (lastQuery.current !== query) setData(null);
    lastQuery.current = query;
    setLoading(true);
    setError('');
    fetch(`/api/reports/analytics?${query}`, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: controller.signal
    })
      .then(async response => {
        const json = await response.json();
        if (!json.ok) throw new Error(json.error?.message || 'โหลดรายงานไม่สำเร็จ');
        return json.data as AnalyticsReport;
      })
      .then(report => {
        if (!controller.signal.aborted) {
          setLoadedQuery(query);
          setData(report);
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setError(err.message || 'เชื่อมต่อไม่ได้');
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, attendanceVersion, query, idToken, refresh]);

  const selected = data?.employees.find(employee => employee.employeeId === employeeId);
  const rows = selected?.buckets || (employeeId === 'all' ? data?.buckets || [] : []);
  const totals = selected?.totals || (employeeId === 'all' ? data?.totals : undefined);

  const insights = useMemo(
    () => (data && totals ? computeHrInsights(data, employeeId) : null),
    [data, totals, employeeId]
  );

  const adjustments = useMemo(
    () =>
      (selected ? [selected] : employeeId === 'all' ? data?.employees || [] : []).flatMap(employee =>
        employee.adjustments.map(extra => ({
          ...extra,
          name: employee.nickname || employee.name,
          employeeId: employee.employeeId
        }))
      ),
    [selected, employeeId, data]
  );

  const filteredEmployees = useMemo(() => {
    if (!insights) return [];
    if (selected || segmentFilter === 'all') return insights.employees;
    if (segmentFilter === 'reliable') return insights.employees.filter(e => e.isReliable);
    if (segmentFilter === 'attendance_watch') return insights.employees.filter(e => e.isAttendanceWatch);
    return insights.employees.filter(e => e.isCashWatch);
  }, [insights, selected, segmentFilter]);

  const years = Array.from(
    { length: Math.max(1, Number(currentYear) - 2026 + 1) },
    (_, index) => String(Number(currentYear) - index)
  );

  const rangeText =
    period === 'day'
      ? formatThaiMonth(month)
      : period === 'month'
        ? `ปี ${Number(year) + 543}`
        : `ปี ${Number(fromYear) + 543}–${Number(toYear) + 543}`;

  const scrollToSection = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const singleEmployeeInsight = selected && insights ? insights.employees[0] || null : null;
  const employeeCount = selected ? 1 : Math.max(1, data?.employees.length || 1);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <button
            type="button"
            className={`btn btn-secondary btn-sm ${styles.backBtn}`}
            onClick={() => {
              if (employeeId !== 'all') {
                setEmployeeId('all');
                setSegmentFilter('all');
              } else {
                onBack();
              }
            }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>{employeeId !== 'all' ? 'กลับภาพรวมทุกคน' : 'กลับหน้ารายงาน'}</span>
          </button>
        </div>

        <div className={styles.topBarRow}>
          <div className={styles.titleGroup}>
            <div className={styles.titleLine}>
              <h2>{selected ? `วิเคราะห์รายบุคคล: ${selected.nickname || selected.name}` : 'ภาพรวมวิเคราะห์บุคลากร'}</h2>
              {insights && (
                <span
                  className={`${styles.healthPill} ${
                    insights.summary.healthStatus === 'healthy'
                      ? styles.healthPillHealthy
                      : insights.summary.healthStatus === 'watch'
                        ? styles.healthPillWatch
                        : styles.healthPillRisk
                  }`}
                >
                  <span className={styles.healthDot} aria-hidden="true" />
                  <span>{insights.summary.healthLabel}</span>
                </span>
              )}
            </div>
            <p className={styles.subtitleLine}>
              {selected ? `${selected.position} · ` : data ? `พนักงาน ${data.employees.length} คน · ` : ''}
              {rangeText}
              {insights ? ` · ${insights.summary.healthNote}` : ''}
            </p>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setRefresh(value => value + 1)}
              disabled={loading}
            >
              <RefreshCw size={18} aria-hidden="true" />
              <span>อัปเดต</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => window.print()}
              disabled={loading || !data || !totals || Boolean(error)}
            >
              <Printer size={18} aria-hidden="true" />
              <span>พิมพ์รายงาน</span>
            </button>
          </div>
        </div>
      </div>

      <section className={`${styles.card} ${styles.filterBar}`} aria-label="ตัวกรองรายงาน">
        <div className={styles.periods} role="group" aria-label="ช่วงเวลารายงาน">
          {(['day', 'month', 'year'] as ReportPeriod[]).map(value => (
            <button
              key={value}
              type="button"
              className={`${styles.periodBtn} ${period === value ? styles.periodBtnActive : ''}`}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {periodLabels[value]}
            </button>
          ))}
        </div>

        <div className={styles.fields}>
          {period === 'day' ? (
            <label className={styles.fieldLabel}>
              <span>เดือน</span>
              <input
                type="month"
                className={styles.fieldControl}
                value={month}
                max={today.slice(0, 7)}
                min="2026-08"
                onChange={event => {
                  if (event.target.value) setMonth(event.target.value);
                }}
              />
            </label>
          ) : period === 'month' ? (
            <label className={styles.fieldLabel}>
              <span>ปี</span>
              <select
                className={styles.fieldControl}
                value={year}
                onChange={event => setYear(event.target.value)}
              >
                {years.map(value => (
                  <option value={value} key={value}>
                    {Number(value) + 543}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className={styles.fieldLabel}>
                <span>ตั้งแต่ปี</span>
                <select
                  className={styles.fieldControl}
                  value={fromYear}
                  onChange={event => setFromYear(event.target.value)}
                >
                  {years
                    .filter(value => value <= toYear && Number(toYear) - Number(value) < 5)
                    .map(value => (
                      <option value={value} key={value}>
                        {Number(value) + 543}
                      </option>
                    ))}
                </select>
              </label>
              <label className={styles.fieldLabel}>
                <span>ถึงปี</span>
                <select
                  className={styles.fieldControl}
                  value={toYear}
                  onChange={event => {
                    setToYear(event.target.value);
                    if (fromYear > event.target.value || Number(event.target.value) - Number(fromYear) >= 5) {
                      setFromYear(event.target.value);
                    }
                  }}
                >
                  {years
                    .filter(value => value >= fromYear)
                    .map(value => (
                      <option value={value} key={value}>
                        {Number(value) + 543}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}

          <label className={styles.fieldLabel}>
            <span>พนักงาน</span>
            <select
              className={styles.fieldControl}
              value={employeeId}
              onChange={event => {
                setEmployeeId(event.target.value);
                setSegmentFilter('all');
              }}
            >
              <option value="all">พนักงานทุกคน</option>
              {employeeId !== 'all' && !data?.employees.some(employee => employee.employeeId === employeeId) && (
                <option value={employeeId} disabled>
                  ไม่มีข้อมูลในช่วงนี้
                </option>
              )}
              {data?.employees.map(employee => (
                <option key={employee.employeeId} value={employee.employeeId}>
                  {employee.nickname || employee.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loading && (
        <div className="refreshStatus" role="status">
          กำลังโหลดรายงานวิเคราะห์บุคลากร
        </div>
      )}

      {error && (
        <div className={styles.notice} role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRefresh(value => value + 1)}
          >
            ลองใหม่
          </button>
        </div>
      )}

      {loading && !data ? (
        <div aria-busy="true" aria-label="กำลังโหลดรายงานละเอียด">
          <div className={styles.kpiRow}>
            {[0, 1, 2].map(index => (
              <div className="loadingCard" key={index}>
                <span className="loadingLine" />
                <span className="loadingLine" />
              </div>
            ))}
          </div>
          <div className={styles.skeletonCard} style={{ marginTop: '1rem' }}>
            <span className="loadingLine" />
            <span className="loadingLine" />
          </div>
          <div className={styles.chartsRow} style={{ marginTop: '1rem' }}>
            {[0, 1].map(index => (
              <div className={styles.skeletonCard} key={index}>
                <span className="loadingLine" />
                <span className="loadingLine" />
              </div>
            ))}
          </div>
        </div>
      ) : data && totals && insights ? (
        <>
          {/* Row 1: 3 Executive KPI Cards with 36-Segment Tick Meters (21st-8 Signature) */}
          <section className={styles.kpiRow} aria-label="ตัวชี้วัดหลักบริหารบุคลากร">
            <article className={styles.kpiCard}>
              <div className={styles.kpiHead}>
                <span className={styles.kpiTitle}>
                  <CalendarCheck size={16} aria-hidden="true" />
                  <span>อัตราการมาทำงาน</span>
                </span>
                <button
                  type="button"
                  className={styles.kpiActionBtn}
                  aria-label="ดูรายละเอียดรายบุคคล"
                  onClick={() => scrollToSection(peopleSectionRef)}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.kpiValueLine}>
                <strong className={styles.kpiMainVal}>{insights.summary.attendanceRate}%</strong>
                <span className={styles.kpiDenom}>
                  / เป้าหมาย {insights.summary.targetAttendanceRate}% ({totals.paidDayUnits} หน่วยวัน)
                </span>
              </div>
              <SegmentedMeter
                percent={insights.summary.attendanceRate}
                tone={
                  insights.summary.attendanceRate >= 90
                    ? 'good'
                    : insights.summary.attendanceRate >= 80
                      ? 'warn'
                      : 'danger'
                }
                ariaLabel={`อัตราการมาทำงาน ${insights.summary.attendanceRate} เปอร์เซ็นต์`}
              />
              <p className={styles.kpiFoot}>
                เต็มวัน {totals.full} · ครึ่งวัน {totals.half} · ขาด {totals.absent} · หยุดร้าน {totals.holiday}
              </p>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHead}>
                <span className={styles.kpiTitle}>
                  <Banknote size={16} aria-hidden="true" />
                  <span>ค่าจ้างสุทธิเทียบต้นทุนรวม</span>
                </span>
                <button
                  type="button"
                  className={styles.kpiActionBtn}
                  aria-label="ดูตารางรายละเอียด"
                  onClick={() => scrollToSection(tableSectionRef)}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.kpiValueLine}>
                <strong
                  className={`${styles.kpiMainVal} ${totals.totalSatang < 0 ? styles.kpiMainValDanger : ''}`}
                >
                  ฿{formatMoney(totals.totalSatang)}
                </strong>
                <span className={styles.kpiDenom}>/ ต้นทุนรวม ฿{formatMoney(totals.grossSatang)}</span>
              </div>
              <SegmentedMeter
                percent={insights.summary.netToGrossRatio}
                tone={totals.totalSatang < 0 ? 'danger' : 'primary'}
                ariaLabel={`สัดส่วนค่าจ้างสุทธิ ${insights.summary.netToGrossRatio} เปอร์เซ็นต์ของต้นทุนรวม`}
              />
              <p className={styles.kpiFoot}>
                เฉลี่ย ฿{formatMoney(insights.summary.avgCostPerShopWorkdaySatang)}/วันเปิดร้าน · ฿{formatMoney(insights.summary.effectiveCostPerPaidUnitSatang)}/วันคิดค่าแรง
              </p>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHead}>
                <span className={styles.kpiTitle}>
                  <Wallet size={16} aria-hidden="true" />
                  <span>สัดส่วนเงินเบิกล่วงหน้า</span>
                </span>
                <button
                  type="button"
                  className={styles.kpiActionBtn}
                  aria-label="กรองพนักงานที่เบิกสูง"
                  onClick={() => {
                    if (!selected) setSegmentFilter('cash_watch');
                    scrollToSection(peopleSectionRef);
                  }}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.kpiValueLine}>
                <strong
                  className={`${styles.kpiMainVal} ${
                    insights.summary.advanceRatio >= 30 ? styles.kpiMainValDanger : ''
                  }`}
                >
                  {insights.summary.advanceRatio}%
                </strong>
                <span className={styles.kpiDenom}>
                  / เกณฑ์ปลอดภัย ≤ {insights.summary.safeAdvanceThreshold}%
                </span>
              </div>
              <SegmentedMeter
                percent={Math.min(100, insights.summary.advanceRatio)}
                tone={
                  insights.summary.advanceRatio >= 30
                    ? 'danger'
                    : insights.summary.advanceRatio >= 20
                      ? 'warn'
                      : 'primary'
                }
                ariaLabel={`สัดส่วนเงินเบิกล่วงหน้า ${insights.summary.advanceRatio} เปอร์เซ็นต์`}
              />
              <p className={styles.kpiFoot}>
                เบิก ฿{formatMoney(totals.advanceSatang)} · หัก ฿{formatMoney(totals.deductionSatang)} · เงินพิเศษ ฿{formatMoney(totals.extraSatang)}
              </p>
            </article>
          </section>

          {(period === 'day' && adjustments.length > 0) || data.closedMonths.length > 0 ? (
            <div className={styles.notice} role="status">
              <span>
                {period === 'day' && adjustments.length > 0
                  ? 'ยอดรวมนับรวมเงินพิเศษและเงินหักประจำเดือนแล้ว ส่วนกราฟรายวันแสดงเฉพาะรายการที่มีวันที่'
                  : ''}
                {period === 'day' && adjustments.length > 0 && data.closedMonths.length > 0 ? ' · ' : ''}
                {data.closedMonths.length > 0 ? 'เดือนที่ปิดรอบแล้วแสดงตามยอดที่บันทึกตอนปิดเดือน' : ''}
              </span>
            </div>
          ) : null}

          {/* Row 2: Full-Width Activity Heatmap (21st-8 Activity Grid + Weekday Ops Insight) */}
          <ActivityHeatmapCard
            period={period}
            cells={insights.heatmapCells}
            weekdays={insights.weekdays}
            employees={data.employees}
            selectedEmployeeId={employeeId}
            peakLabel={
              insights.summary.peakBucket
                ? `${insights.summary.peakBucket.attendanceRate}% · ฿${formatMoney(insights.summary.peakBucket.grossSatang)} (${insights.summary.peakBucket.label})`
                : null
            }
            lowestLabel={
              insights.summary.lowestBucket
                ? `${insights.summary.lowestBucket.attendanceRate}% (${insights.summary.lowestBucket.label})`
                : null
            }
            onSelectEmployee={id => {
              setEmployeeId(id);
              setSegmentFilter('all');
            }}
          />

          {/* Row 3: Dual 2-Column Analytical Charts (Smooth Spline + Highlighted Vertical Bars) */}
          <div className={styles.chartsRow}>
            <SmoothTrendChartCard rows={rows} period={period} divisor={employeeCount} />
            <ComparisonBarChartCard
              employees={insights.employees}
              positions={insights.positions}
              singleEmployee={singleEmployeeInsight}
              onSelectEmployee={id => {
                setEmployeeId(id);
                setSegmentFilter('all');
              }}
            />
          </div>

          {/* Row 4: Quick Actions & Workforce Segmentation Bar (21st-8 Quick Actions Motif) */}
          <section className={`${styles.card} ${styles.quickBar}`} aria-label="ตัวกรองกลุ่มพนักงานและการดำเนินการด่วน">
            <div className={styles.quickBarHead}>
              <h3>กลุ่มวิเคราะห์พนักงานและการดำเนินการ</h3>
              <p className={styles.contextNote}>
                ค่าจ้างสุทธิ = ค่าแรงสะสม + เงินพิเศษ − เงินเบิก − เงินหัก
              </p>
            </div>
            <div className={styles.quickBarContent}>
              {!selected ? (
                <div className={styles.segmentChips} role="group" aria-label="กรองพนักงานตามกลุ่มพฤติกรรม">
                  {(
                    [
                      ['all', 'พนักงานทั้งหมด'],
                      ['reliable', 'สม่ำเสมอสูง ≥95%'],
                      ['attendance_watch', 'ติดตามเวลาทำงาน'],
                      ['cash_watch', 'เบิกสูง ≥30%']
                    ] as Array<[EmployeeSegmentFilter, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.segmentChip} ${segmentFilter === key ? styles.segmentChipActive : ''}`}
                      aria-pressed={segmentFilter === key}
                      onClick={() => {
                        setSegmentFilter(key);
                        scrollToSection(peopleSectionRef);
                      }}
                    >
                      <span>{label}</span>
                      <span className={styles.segmentCount}>{insights.segmentCounts[key]}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.segmentChips}>
                  <button
                    type="button"
                    className={styles.segmentChip}
                    onClick={() => scrollToSection(tableSectionRef)}
                  >
                    <span>ดูตารางสรุป{periodLabels[period]}</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              )}

              <div className={styles.actions}>
                {selected ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setEmployeeId('all');
                      setSegmentFilter('all');
                    }}
                  >
                    ดูภาพรวมพนักงานทุกคน
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => scrollToSection(tableSectionRef)}
                  >
                    ดูตารางตัวเลขทั้งหมด
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Row 5: Dual Strategic Management Cards (Actionable Alerts + Position & Full Ledger) */}
          <div className={styles.insightsRow}>
            <section className={styles.card} aria-label="สัญญาณที่ควรบริหารจัดการ">
              <div className={styles.splitCardHead}>
                <div className={styles.cardTitleRow}>
                  <ShieldAlert size={18} className={styles.cardTitleIcon} aria-hidden="true" />
                  <h3>สัญญาณที่ควรนำไปบริหารจัดการต่อ</h3>
                </div>
                <p className={styles.cardSub}>
                  สรุปจุดเสี่ยงสภาพคล่อง เวลาทำงาน และจุดแข็งทีมจากข้อมูลจริงในช่วงนี้
                </p>
              </div>

              {insights.alerts.length === 0 ? (
                <p className={styles.emptyCardNote}>
                  ยังไม่พบสัญญาณผิดปกติในช่วงเวลานี้ อัตราการมาทำงานและยอดเงินเบิกอยู่ในเกณฑ์ปกติ
                </p>
              ) : (
                <div className={styles.alertList}>
                  {insights.alerts.map(alert => {
                    const iconCls =
                      alert.severity === 'danger'
                        ? styles.alertDanger
                        : alert.severity === 'warning'
                          ? styles.alertWarning
                          : alert.severity === 'positive'
                            ? styles.alertPositive
                            : styles.alertInfo;

                    const Icon =
                      alert.severity === 'danger' || alert.severity === 'warning'
                        ? AlertTriangle
                        : alert.severity === 'positive'
                          ? CheckCircle2
                          : Info;

                    const inner = (
                      <>
                        <div className={styles.alertItemMain}>
                          <span className={`${styles.alertIconWrap} ${iconCls}`} aria-hidden="true">
                            <Icon size={16} />
                          </span>
                          <div className={styles.alertBody}>
                            <p className={styles.alertTitle}>{alert.title}</p>
                            <p className={styles.alertDesc}>{alert.detail}</p>
                          </div>
                        </div>
                        <span className={styles.alertTrail}>
                          <span>{alert.metricText}</span>
                          {alert.employeeId && <ChevronRight size={16} aria-hidden="true" />}
                        </span>
                      </>
                    );

                    return alert.employeeId ? (
                      <button
                        key={alert.id}
                        type="button"
                        className={styles.alertItem}
                        onClick={() => setEmployeeId(alert.employeeId!)}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div key={alert.id} className={styles.alertItem}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={styles.card} aria-label="โครงสร้างต้นทุนตามตำแหน่งและยอดสรุป">
              <div className={styles.splitCardHead}>
                <div className={styles.cardTitleRow}>
                  <Briefcase size={18} className={styles.cardTitleIcon} aria-hidden="true" />
                  <h3>โครงสร้างต้นทุนตามตำแหน่งและยอดสรุป</h3>
                </div>
                <p className={styles.cardSub}>
                  สัดส่วนงบค่าแรงต่อตำแหน่งและตัวเลขทางบัญชีครบถ้วน
                </p>
              </div>

              {insights.positions.length > 0 && (
                <div className={styles.positionList}>
                  {insights.positions.map(pos => (
                    <div key={pos.position} className={styles.positionItem}>
                      <div className={styles.positionTop}>
                        <span className={styles.positionName}>
                          {pos.position} ({pos.headcount} คน)
                        </span>
                        <span className={styles.positionMoney}>฿{formatMoney(pos.grossSatang)}</span>
                      </div>
                      <div className={styles.posBarTrack}>
                        <div
                          className={styles.posBarFill}
                          style={{ width: `${Math.max(4, Math.min(100, pos.payrollShare))}%` }}
                        />
                      </div>
                      <div className={styles.positionMeta}>
                        <span>สัดส่วนงบ {pos.payrollShare}% · มาทำงาน {pos.attendanceRate}%</span>
                        <span>เฉลี่ย ฿{formatMoney(pos.avgDailyCostSatang)}/วันคิดค่าแรง</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.ledgerGrid} aria-label="สรุปตัวเลขค่าจ้างและวันทำงานทั้งหมด">
                <div className={styles.ledgerCell}>
                  <span>ค่าแรงสะสม</span>
                  <strong>฿{formatMoney(totals.baseSatang)}</strong>
                </div>
                <div className={styles.ledgerCell}>
                  <span>เงินพิเศษ ({insights.summary.bonusShare}%)</span>
                  <strong>฿{formatMoney(totals.extraSatang)}</strong>
                </div>
                <div className={styles.ledgerCell}>
                  <span>รวมค่าแรงและพิเศษ</span>
                  <strong>฿{formatMoney(totals.grossSatang)}</strong>
                </div>
                <div className={styles.ledgerCell}>
                  <span>เงินเบิกล่วงหน้า</span>
                  <strong>฿{formatMoney(totals.advanceSatang)}</strong>
                </div>
                <div className={styles.ledgerCell}>
                  <span>เงินหักรวม</span>
                  <strong>฿{formatMoney(totals.deductionSatang)}</strong>
                </div>
                <div className={styles.ledgerCell}>
                  <span>ค่าแรงฐานเฉลี่ย/วันร้าน</span>
                  <strong>฿{formatMoney(insights.summary.avgBasePerShopWorkdaySatang)}</strong>
                </div>
              </div>
            </section>
          </div>

          {/* Row 6: Employee Performance Directory */}
          <section className={styles.card} ref={peopleSectionRef} aria-label="สรุปรายบุคคล">
            <div className={styles.cardHead}>
              <div className={styles.cardHeadText}>
                <h3>
                  รายบุคคล
                  {!selected && segmentFilter !== 'all' ? ` (แสดง ${filteredEmployees.length} จาก ${insights.employees.length} คน)` : ''}
                </h3>
                <p className={styles.cardSub}>
                  กดเลือกพนักงานเพื่อดูกราฟแนวโน้ม โครงสร้างรายได้ และสถิติรายวันเฉพาะบุคคล
                </p>
              </div>
              {!selected && segmentFilter !== 'all' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSegmentFilter('all')}
                >
                  ล้างตัวกรองกลุ่ม
                </button>
              )}
            </div>

            {filteredEmployees.length === 0 ? (
              <p className={styles.emptyCardNote}>ไม่มีพนักงานในกลุ่มที่เลือก</p>
            ) : (
              <div className={styles.people}>
                {filteredEmployees.map(emp => {
                  const badgeCls =
                    emp.primaryBadge.tone === 'good'
                      ? styles.badgeGood
                      : emp.primaryBadge.tone === 'warn'
                        ? styles.badgeWarn
                        : emp.primaryBadge.tone === 'danger'
                          ? styles.badgeDanger
                          : '';

                  return (
                    <article className={styles.person} key={emp.employeeId}>
                      <div>
                        <div className={styles.personHead}>
                          <div>
                            <h4>{emp.displayName}</h4>
                            <p className={styles.personPos}>{emp.position}</p>
                          </div>
                          <span className={`${styles.badge} ${badgeCls}`}>{emp.primaryBadge.label}</span>
                        </div>

                        <div className={styles.personMetrics} style={{ marginTop: '0.75rem' }}>
                          <div className={styles.personMiniBox}>
                            <span>อัตราการมา</span>
                            <strong>{emp.attendanceRate}%</strong>
                          </div>
                          <div className={styles.personMiniBox}>
                            <span>สัดส่วนเงินเบิก</span>
                            <strong>{emp.advanceRatio}%</strong>
                          </div>
                        </div>

                        <dl style={{ marginTop: '0.65rem' }}>
                          <div>
                            <dt>เต็มวัน / ครึ่งวัน / ไม่มา</dt>
                            <dd>
                              {emp.totals.full} / {emp.totals.half} / {emp.totals.absent}
                            </dd>
                          </div>
                          <div>
                            <dt>ค่าแรงรวมเงินพิเศษ</dt>
                            <dd>{formatMoney(emp.totals.grossSatang)} บาท</dd>
                          </div>
                          <div>
                            <dt>เงินเบิก / เงินหัก</dt>
                            <dd>
                              {formatMoney(emp.totals.advanceSatang)} / {formatMoney(emp.totals.deductionSatang)}
                            </dd>
                          </div>
                          <div>
                            <dt>ค่าจ้างสุทธิ</dt>
                            <dd>{formatMoney(emp.totals.totalSatang)} บาท</dd>
                          </div>
                          {period === 'day' && emp.longestStreak > 0 && (
                            <div>
                              <dt>มาเต็มวันต่อเนื่องสูงสุด</dt>
                              <dd>{emp.longestStreak} วัน</dd>
                            </div>
                          )}
                        </dl>
                      </div>

                      {!selected && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm btn-block"
                          onClick={() => setEmployeeId(emp.employeeId)}
                        >
                          ดูกราฟและรายการของคนนี้
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Row 7: Detailed Period Table */}
          <section className={styles.card} ref={tableSectionRef} aria-label={`ตารางรายละเอียด${periodLabels[period]}`}>
            <div className={styles.cardHead}>
              <div className={styles.cardHeadText}>
                <h3>รายละเอียด {periodLabels[period]}</h3>
                <p className={styles.cardSub}>ตัวเลขตรวจสอบย้อนหลังครบทุกช่องทางบัญชีและวันทำงาน</p>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className={styles.emptyCardNote}>ไม่มีข้อมูลในช่วงที่เลือก</p>
            ) : (
              <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="ตารางรายละเอียดรายงาน">
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th scope="col">ช่วงเวลา</th>
                      {selected && period === 'day' && <th scope="col">ค่าแรง/วัน</th>}
                      <th scope="col">อัตราการมา</th>
                      <th scope="col">เต็มวัน</th>
                      <th scope="col">ครึ่งวัน</th>
                      <th scope="col">ไม่มา</th>
                      <th scope="col">วันหยุด</th>
                      <th scope="col">ค่าแรง</th>
                      <th scope="col">เงินพิเศษ</th>
                      <th scope="col">เงินเบิก</th>
                      <th scope="col">เงินหัก</th>
                      <th scope="col">สุทธิ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const scheduled = row.full + row.half + row.absent;
                      return (
                        <tr key={row.key}>
                          <th scope="row">{formatBucketLabel(row.key, period)}</th>
                          {selected && period === 'day' && (
                            <td>{row.dailyRateSatang === undefined ? '—' : formatMoney(row.dailyRateSatang)}</td>
                          )}
                          <td>{scheduled > 0 ? `${bucketAttendanceRate(row)}%` : '—'}</td>
                          <td>{row.full}</td>
                          <td>{row.half}</td>
                          <td>{row.absent}</td>
                          <td>{row.holiday}</td>
                          <td>{formatMoney(row.baseSatang)}</td>
                          <td>{formatMoney(row.extraSatang)}</td>
                          <td>{formatMoney(row.advanceSatang)}</td>
                          <td>{formatMoney(row.deductionSatang)}</td>
                          <td>{formatMoney(row.totalSatang)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {adjustments.length > 0 && (
            <section className={styles.card} aria-label="เงินพิเศษและเงินหักประจำเดือน">
              <div className={styles.cardHead}>
                <div className={styles.cardHeadText}>
                  <h3>เงินพิเศษและเงินหักประจำเดือน</h3>
                  <p className={styles.cardSub}>รายการปรับยอดเพิ่มเติมทั้งหมดในช่วงเวลาที่เลือก</p>
                </div>
              </div>
              <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="รายการปรับยอดประจำเดือน">
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th scope="col">เดือน</th>
                      <th scope="col">พนักงาน</th>
                      <th scope="col">รายการ</th>
                      <th scope="col">ประเภท</th>
                      <th scope="col">จำนวนเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.map((extra, index) => (
                      <tr key={`${extra.month}-${extra.employeeId}-${extra.extraId}-${index}`}>
                        <td>{formatThaiMonth(extra.month)}</td>
                        <td>{extra.name}</td>
                        <td>{extra.label}</td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              extra.type === 'DEDUCTION' ? styles.badgeDanger : styles.badgeGood
                            }`}
                          >
                            {extra.type === 'DEDUCTION' ? 'หักเงิน' : 'เงินพิเศษ'}
                          </span>
                        </td>
                        <td>{formatMoney(extra.amountSatang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : !loading && data ? (
        <div className={styles.notice}>
          <span>ไม่มีข้อมูลของพนักงานในช่วงที่เลือก</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEmployeeId('all')}
          >
            ดูพนักงานทุกคน
          </button>
        </div>
      ) : null}
    </div>
  );
}
