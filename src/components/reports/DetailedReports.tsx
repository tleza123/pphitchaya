'use client';
import { useHistoryState } from '@/components/shared/useHistoryState';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Printer } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { AnalyticsReport, ReportBucket, ReportPeriod, ReportTotals } from '@/lib/payroll/analytics';
import { formatMoney } from '@/lib/payroll/money';
import { formatThaiDate, formatThaiMonth, getBangkokToday } from '@/lib/payroll/dates';
import styles from './detailed-reports.module.css';

type MoneyMetric = 'grossSatang' | 'advanceSatang' | 'deductionSatang' | 'totalSatang';
type AttendanceMetric = 'workedDays' | 'full' | 'half' | 'absent' | 'holiday';
const moneyMetrics: Record<MoneyMetric, string> = { grossSatang: 'ค่าแรงรวมเงินพิเศษ', advanceSatang: 'เงินเบิก', deductionSatang: 'เงินหัก', totalSatang: 'ค่าจ้างสุทธิ' };
const attendanceMetrics: Record<AttendanceMetric, string> = { workedDays: 'มาทำงาน', full: 'เต็มวัน', half: 'ครึ่งวัน', absent: 'ไม่มาทำงาน', holiday: 'วันหยุดตามตาราง' };
const periodLabels = { day: 'รายวัน', month: 'รายเดือน', year: 'รายปี' };

function periodLabel(key: string, period: ReportPeriod, short = false) {
  if (period === 'year') return String(Number(key) + 543);
  if (period === 'month') return short ? formatThaiDate(`${key}-01`, { month: 'short' }) : formatThaiMonth(key);
  return formatThaiDate(key, short ? { day: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

function Chart({ rows, period, metric, title, money, individualDaily = false, divisor = 1 }: { rows: ReportBucket[]; period: ReportPeriod; metric: keyof ReportTotals; title: string; money: boolean; individualDaily?: boolean; divisor?: number }) {
  const points = rows.map(row => {
    const halfDay = individualDaily && !money && period === 'day' && row.half > 0 && (metric === 'workedDays' || metric === 'half');
    return { row, value: halfDay ? 0.5 : row[metric] / Math.max(1, divisor), halfDay };
  });
  const values = points.map(point => point.value);
  const high = Math.max(1, ...values);
  const low = Math.min(0, ...values);
  const width = Math.max(480, rows.length * 42 + 88);
  const top = 26, bottom = 205;
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const zero = y(0);
  const step = (width - 96) / Math.max(1, rows.length);
  return <figure className={styles.figure}>
    <div className={styles.chartScroll}>
      <svg viewBox={`0 0 ${width} 248`} className={styles.chart} style={{ minWidth: `${width / 18}rem` }} role="img" aria-label={`${title} ${periodLabels[period]}`}>
        {Array.from({ length: 5 }, (_, index) => low + (high - low) * index / 4).map((value, index) => <g key={index}>
          <line x1="72" x2={width - 15} y1={y(value)} y2={y(value)} stroke="#cbd5e1" strokeDasharray="3 4" />
          <text x="64" y={y(value) + 4} textAnchor="end" fontSize="13" fill="#475569">{new Intl.NumberFormat('th-TH', { maximumFractionDigits: money ? 0 : 1 }).format(money ? value / 100 : value)}</text>
        </g>)}
        {points.map(({ row, value, halfDay }, index) => <g key={row.key}>
          <rect x={76 + index * step + step * 0.12} y={Math.min(zero, y(value))} width={step * 0.72}
            height={Math.max(value === 0 ? 0 : 1, Math.abs(y(value) - zero))} rx="4"
            fill={halfDay || metric === 'half' ? '#b45309' : value < 0 || metric === 'absent' ? '#b91c1c' : metric === 'holiday' ? '#64748b' : money ? '#0369a1' : '#15803d'}>
            <title>{periodLabel(row.key, period)}: {money ? formatMoney(value) + ' บาท' : new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(value) + ' วัน'}</title>
          </rect>
          <text x={76 + index * step + step * 0.48} y={Math.max(16, Math.min(zero, y(value)) - 6)} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#003566">{new Intl.NumberFormat('th-TH', { maximumFractionDigits: money ? 0 : 2, notation: money ? 'compact' : 'standard' }).format(money ? value / 100 : value)}</text>
          <text x={76 + index * step + step * 0.48} y="234" textAnchor="middle" fontSize="13" fill="#475569">{periodLabel(row.key, period, true)}</text>
        </g>)}
      </svg>
    </div>
    <figcaption>{title} · {money ? 'หน่วยเป็นบาท' : divisor > 1 ? 'วันเฉลี่ยต่อคน' : 'จำนวนวัน'}</figcaption>
  </figure>;
}

function Totals({ totals, employeeCount, workdayCount, average }: { totals: ReportTotals; employeeCount: number; workdayCount: number; average: boolean }) {
  const days = (value: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(value / Math.max(1, employeeCount));
  const label = (value: string) => average ? value + ' (เฉลี่ย/คน)' : value;
  const tiles: Array<[string, string, boolean?]> = [
    ['ค่าแรงสะสม', formatMoney(totals.baseSatang), true], ['เงินพิเศษ', formatMoney(totals.extraSatang), true],
    ['รวมค่าแรงและเงินพิเศษ', formatMoney(totals.grossSatang), true], ['เงินเบิก', formatMoney(totals.advanceSatang), true],
    ['เงินหัก', formatMoney(totals.deductionSatang), true], ['ค่าจ้างสุทธิ', formatMoney(totals.totalSatang), true],
    [label('มาทำงาน'), days(totals.workedDays)], [label('เต็มวัน'), days(totals.full)], [label('ครึ่งวัน'), days(totals.half)],
    [label('ไม่มา'), days(totals.absent)], [label('วันหยุดร้าน'), days(totals.holiday)], [label('วันคิดค่าแรง'), days(totals.paidDayUnits)],
    ['ค่าแรงเฉลี่ยต่อวันทำงาน', formatMoney(workdayCount ? Math.round(totals.baseSatang / workdayCount) : 0), true]
  ];
  return <div className={styles.totals}>{tiles.map(([tileLabel, value, money]) => <article className={styles.tile} key={tileLabel}>
    <span>{tileLabel}</span><strong>{value}</strong><span>{money ? 'บาท' : 'วัน'}</span>
  </article>)}</div>;
}

export default function DetailedReports({ active, attendanceVersion, onBack }: { active: boolean; attendanceVersion: number; onBack: () => void }) {
  const { idToken } = useAuth();
  const today = getBangkokToday();
  const currentYear = today.slice(0, 4);
  const [period, setPeriod] = useState<ReportPeriod>('day');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(currentYear);
  const [fromYear, setFromYear] = useState(String(Math.max(2026, Number(currentYear) - 4)));
  const [toYear, setToYear] = useState(currentYear);
  const [employeeId, setEmployeeId] = useHistoryState<string>('detailed-person', 'all');
  const [moneyMetric, setMoneyMetric] = useState<MoneyMetric>('grossSatang');
  const [attendanceMetric, setAttendanceMetric] = useState<AttendanceMetric>('workedDays');
  const [storedData, setData] = useState<AnalyticsReport | null>(null);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const lastQuery = useRef('');
  const query = useMemo(() => new URLSearchParams(period === 'day' ? { period, month } : period === 'month' ? { period, year } : { period, fromYear, toYear }).toString(), [period, month, year, fromYear, toYear]);
  const data = loadedQuery === query && storedData?.period === period ? storedData : null;

  useEffect(() => {
    if (!active || !idToken) return;
    const controller = new AbortController();
    if (lastQuery.current !== query) setData(null);
    lastQuery.current = query;
    setLoading(true); setError('');
    fetch(`/api/reports/analytics?${query}`, { headers: { Authorization: `Bearer ${idToken}` }, signal: controller.signal })
      .then(async response => { const json = await response.json(); if (!json.ok) throw new Error(json.error?.message || 'โหลดรายงานไม่สำเร็จ'); return json.data as AnalyticsReport; })
      .then(report => { if (!controller.signal.aborted) { setLoadedQuery(query); setData(report); } })
      .catch(err => { if (!controller.signal.aborted) { setError(err.message || 'เชื่อมต่อไม่ได้'); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, attendanceVersion, query, idToken, refresh]);

  const selected = data?.employees.find(employee => employee.employeeId === employeeId);
  const rows = selected?.buckets || (employeeId === 'all' ? data?.buckets || [] : []);
  const totals = selected?.totals || (employeeId === 'all' ? data?.totals : undefined);
  const adjustments = (selected ? [selected] : employeeId === 'all' ? data?.employees || [] : []).flatMap(employee => employee.adjustments.map(extra => ({ ...extra, name: employee.nickname || employee.name, employeeId: employee.employeeId })));
  const years = Array.from({ length: Math.max(1, Number(currentYear) - 2026 + 1) }, (_, index) => String(Number(currentYear) - index));

  return <div className={styles.page}>
    <button type="button" className={`btn btn-secondary btn-sm ${styles.back}`} onClick={() => { if (employeeId !== 'all') setEmployeeId('all'); else onBack(); }}>
      <ArrowLeft size={20} aria-hidden="true" />
      <span>{employeeId !== 'all' ? 'กลับรายงานละเอียด' : 'กลับหน้ารายงาน'}</span>
    </button>
    <div className={styles.heading}>
      <h2>{employeeId !== 'all' ? 'รายงานรายบุคคล' : 'รายงานละเอียด'}</h2>
      <div className={styles.actions}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRefresh(value => value + 1)} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" />
          <span>อัปเดต</span>
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()} disabled={loading || !data || !totals || Boolean(error)}>
          <Printer size={18} aria-hidden="true" />
          <span>พิมพ์รายงาน</span>
        </button>
      </div>
    </div>
    <section className={styles.filters} aria-label="ตัวกรองรายงาน">
      <div className={styles.periods}>
        {(['day', 'month', 'year'] as ReportPeriod[]).map(value => (
          <button
            key={value}
            type="button"
            className={`btn btn-sm ${period === value ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {periodLabels[value]}
          </button>
        ))}
      </div>
      <div className={styles.fields}>
        {period === 'day' ? <label>เดือน<input type="month" value={month} max={today.slice(0, 7)} min="2026-08" onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label>
          : period === 'month' ? <label>ปี<select value={year} onChange={event => setYear(event.target.value)}>{years.map(value => <option value={value} key={value}>{Number(value) + 543}</option>)}</select></label>
          : <><label>ตั้งแต่ปี<select value={fromYear} onChange={event => setFromYear(event.target.value)}>{years.filter(value => value <= toYear && Number(toYear) - Number(value) < 5).map(value => <option value={value} key={value}>{Number(value) + 543}</option>)}</select></label>
            <label>ถึงปี<select value={toYear} onChange={event => { setToYear(event.target.value); if (fromYear > event.target.value || Number(event.target.value) - Number(fromYear) >= 5) setFromYear(event.target.value); }}>{years.filter(value => value >= fromYear).map(value => <option value={value} key={value}>{Number(value) + 543}</option>)}</select></label></>}
        <label>พนักงาน<select value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="all">พนักงานทุกคน</option>{employeeId !== 'all' && !data?.employees.some(employee => employee.employeeId === employeeId) && <option value={employeeId} disabled>ไม่มีข้อมูลในช่วงนี้</option>}{data?.employees.map(employee => <option key={employee.employeeId} value={employee.employeeId}>{employee.nickname || employee.name}</option>)}</select></label>
      </div>
    </section>
    {loading && <div className="refreshStatus" role="status">กำลังโหลดรายงานละเอียด</div>}
    {error && <div className={styles.notice} role="alert"><span>{error}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => setRefresh(value => value + 1)}>ลองใหม่</button></div>}
    {loading && !data ? <div aria-busy="true" aria-label="กำลังโหลดรายงานละเอียด"><div className={styles.totals}>{Array.from({ length: 12 }, (_, index) => <div className="loadingCard" key={index}><span className="loadingLine" /><span className="loadingLine" /></div>)}</div><div className={styles.charts}>{[0, 1].map(index => <div className={styles.chartSkeleton} key={index}><span className="loadingLine" /><span className="loadingLine" /></div>)}</div></div>
      : data && totals ? <>
        <p className={styles.context}><strong>{selected ? selected.nickname || selected.name : 'พนักงานทุกคน'}</strong> · {period === 'day' ? formatThaiMonth(month) : period === 'month' ? `ปี ${Number(year) + 543}` : `ปี ${Number(fromYear) + 543}–${Number(toYear) + 543}`}</p>
        <Totals totals={totals} employeeCount={selected ? 1 : data.employees.length} workdayCount={(selected || data).workdayCount || 0} average={!selected} />
        <p className={styles.context}>ค่าจ้างสุทธิ = ค่าแรงสะสม + เงินพิเศษ − เงินเบิก − เงินหัก · วันเฉลี่ยคำนวณจากวันรวมหารจำนวนพนักงาน</p>
        {period === 'day' && adjustments.length > 0 && <p className={styles.notice}>ยอดรวมนับรวมเงินพิเศษและเงินหักประจำเดือนแล้ว ส่วนกราฟรายวันแสดงเฉพาะรายการที่มีวันที่</p>}
        {data.closedMonths.length > 0 && <p className={styles.context}>เดือนที่ปิดรอบแล้วแสดงตามยอดที่บันทึกตอนปิดเดือน</p>}
        <div className={styles.charts}>
          <section className={styles.panel}><h3>จำนวนเงิน ({periodLabels[period]})</h3><label>ประเภทเงิน<select value={moneyMetric} onChange={event => setMoneyMetric(event.target.value as MoneyMetric)}>{Object.entries(moneyMetrics).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><Chart rows={rows} period={period} metric={moneyMetric} title={moneyMetrics[moneyMetric]} money /></section>
          <section className={styles.panel}><h3>วันทำงานและวันหยุด ({periodLabels[period]})</h3><label>สถานะ<select value={attendanceMetric} onChange={event => setAttendanceMetric(event.target.value as AttendanceMetric)}>{Object.entries(attendanceMetrics).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><Chart rows={rows} period={period} metric={attendanceMetric} title={attendanceMetrics[attendanceMetric]} money={false} divisor={selected ? 1 : data.employees.length} individualDaily={Boolean(selected) && period === 'day'} /></section>
        </div>
        <section className={styles.panel}><h3>รายละเอียด {periodLabels[period]}</h3>
          {rows.length === 0 ? <p>ไม่มีข้อมูลในช่วงที่เลือก</p> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="ตารางรายละเอียดรายงาน"><table><thead><tr><th scope="col">ช่วงเวลา</th>{selected && period === 'day' && <th scope="col">ค่าแรง/วัน</th>}<th scope="col">เต็มวัน</th><th scope="col">ครึ่งวัน</th><th scope="col">ไม่มา</th><th scope="col">วันหยุด</th><th scope="col">ค่าแรง</th><th scope="col">เงินพิเศษ</th><th scope="col">เงินเบิก</th><th scope="col">เงินหัก</th><th scope="col">สุทธิ</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><th scope="row">{periodLabel(row.key, period)}</th>{selected && period === 'day' && <td>{row.dailyRateSatang === undefined ? '—' : formatMoney(row.dailyRateSatang)}</td>}<td>{row.full}</td><td>{row.half}</td><td>{row.absent}</td><td>{row.holiday}</td><td>{formatMoney(row.baseSatang)}</td><td>{formatMoney(row.extraSatang)}</td><td>{formatMoney(row.advanceSatang)}</td><td>{formatMoney(row.deductionSatang)}</td><td>{formatMoney(row.totalSatang)}</td></tr>)}</tbody></table></div>}
        </section>
        <section className={styles.panel}><h3>รายบุคคล</h3><div className={styles.people}>{data.employees.filter(employee => employeeId === 'all' || employee.employeeId === employeeId).map(employee => <article className={styles.person} key={employee.employeeId}><div><h4>{employee.nickname || employee.name}</h4><p>{employee.position}</p><dl><div><dt>มาทำงาน</dt><dd>{employee.totals.workedDays} วัน</dd></div><div><dt>เต็มวัน / ครึ่งวัน / ไม่มา</dt><dd>{employee.totals.full} / {employee.totals.half} / {employee.totals.absent}</dd></div><div><dt>ค่าแรงรวมเงินพิเศษ</dt><dd>{formatMoney(employee.totals.grossSatang)} บาท</dd></div><div><dt>เงินเบิก</dt><dd>{formatMoney(employee.totals.advanceSatang)} บาท</dd></div><div><dt>เงินหัก</dt><dd>{formatMoney(employee.totals.deductionSatang)} บาท</dd></div><div><dt>ค่าจ้างสุทธิ</dt><dd>{formatMoney(employee.totals.totalSatang)} บาท</dd></div></dl></div><button type="button" className="btn btn-secondary btn-sm btn-block" onClick={() => setEmployeeId(employee.employeeId)}>ดูกราฟและรายการของคนนี้</button></article>)}</div></section>
        {adjustments.length > 0 && <section className={styles.panel}><h3>เงินพิเศษและเงินหักประจำเดือน</h3><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="รายการปรับยอดประจำเดือน"><table><thead><tr><th scope="col">เดือน</th><th scope="col">พนักงาน</th><th scope="col">รายการ</th><th scope="col">ประเภท</th><th scope="col">จำนวนเงิน</th></tr></thead><tbody>{adjustments.map((extra, index) => <tr key={`${extra.month}-${extra.employeeId}-${extra.extraId}-${index}`}><td>{formatThaiMonth(extra.month)}</td><td>{extra.name}</td><td>{extra.label}</td><td>{extra.type === 'DEDUCTION' ? 'หักเงิน' : 'เงินพิเศษ'}</td><td>{formatMoney(extra.amountSatang)}</td></tr>)}</tbody></table></div></section>}
      </> : !loading && data ? <div className={styles.notice}><span>ไม่มีข้อมูลของพนักงานในช่วงที่เลือก</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => setEmployeeId('all')}>ดูพนักงานทุกคน</button></div> : null}
  </div>;
}
