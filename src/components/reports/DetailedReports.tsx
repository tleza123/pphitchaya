'use client';

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

function Chart({ rows, period, metric, title, money, individualDaily = false }: { rows: ReportBucket[]; period: ReportPeriod; metric: keyof ReportTotals; title: string; money: boolean; individualDaily?: boolean }) {
  const points = rows.map(row => {
    const halfDay = individualDaily && !money && period === 'day' && row.half > 0 && (metric === 'workedDays' || metric === 'half');
    return { row, value: halfDay ? 0.5 : row[metric], halfDay };
  });
  const values = points.map(point => point.value);
  const high = Math.max(1, ...values);
  const low = Math.min(0, ...values);
  const width = Math.max(480, rows.length * 38 + 80);
  const top = 22, bottom = 205;
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const zero = y(0);
  const step = (width - 90) / Math.max(1, rows.length);
  return <figure className={styles.figure}>
    <div className={styles.chartScroll}>
      <svg viewBox={`0 0 ${width} 245`} className={styles.chart} style={{ minWidth: `${width / 20}rem` }} role="img" aria-label={`${title} ${periodLabels[period]}`}>
        {[low, (high + low) / 2, high].map((value, index) => <g key={index}>
          <line x1="65" x2={width - 15} y1={y(value)} y2={y(value)} stroke="#d7e0ea" strokeDasharray="3 4" />
          <text x="58" y={y(value) + 4} textAnchor="end" fontSize="11" fill="#526277">{new Intl.NumberFormat('th-TH', { maximumFractionDigits: money ? 0 : 1 }).format(money ? value / 100 : value)}</text>
        </g>)}
        {points.map(({ row, value, halfDay }, index) => <g key={row.key}>
          <rect x={70 + index * step + step * 0.12} y={Math.min(zero, y(value))} width={step * 0.7}
            height={Math.max(value === 0 ? 0 : 1, Math.abs(y(value) - zero))} rx="3"
            fill={halfDay ? '#ffc300' : value < 0 ? '#991b1b' : money ? '#003566' : '#166534'}>
            <title>{periodLabel(row.key, period)}: {money ? formatMoney(value) + ' บาท' : value + ' วัน'}</title>
          </rect>
          <text x={70 + index * step + step * 0.47} y="232" textAnchor="middle" fontSize="12" fill="#526277">{periodLabel(row.key, period, true)}</text>
        </g>)}
      </svg>
    </div>
    <figcaption>{money ? 'จำนวนเงินเป็นบาท' : 'จำนวนวันรวมของพนักงาน'}</figcaption>
  </figure>;
}

function Totals({ totals }: { totals: ReportTotals }) {
  const tiles: Array<[string, string, boolean?]> = [
    ['ค่าแรงสะสม', formatMoney(totals.baseSatang), true], ['เงินพิเศษ', formatMoney(totals.extraSatang), true],
    ['ค่าแรงรวมเงินพิเศษ', formatMoney(totals.grossSatang), true], ['เงินเบิก', formatMoney(totals.advanceSatang), true],
    ['เงินหัก', formatMoney(totals.deductionSatang), true], ['ค่าจ้างสุทธิ', formatMoney(totals.totalSatang), true],
    ['มาทำงาน', String(totals.workedDays)], ['เต็มวัน', String(totals.full)], ['ครึ่งวัน', String(totals.half)],
    ['ไม่มาทำงาน', String(totals.absent)], ['วันหยุดตามตาราง', String(totals.holiday)], ['วันคิดค่าแรง', String(totals.paidDayUnits)]
  ];
  return <div className={styles.totals}>{tiles.map(([label, value, money]) => <article className={styles.tile} key={label}>
    <span>{label}</span><strong>{value}</strong><span>{money ? 'บาท' : 'วัน'}</span>
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
  const [employeeId, setEmployeeId] = useState('all');
  const [moneyMetric, setMoneyMetric] = useState<MoneyMetric>('grossSatang');
  const [attendanceMetric, setAttendanceMetric] = useState<AttendanceMetric>('workedDays');
  const [storedData, setData] = useState<AnalyticsReport | null>(null);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const lastQuery = useRef('');
  const query = useMemo(() => new URLSearchParams(period === 'day' ? { period, month } : period === 'month' ? { period, year } : { period, fromYear, toYear }).toString(), [period, month, year, fromYear, toYear]);
  // A period switch must never format daily keys as months while its new request is starting.
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
      .catch(err => { if (!controller.signal.aborted) { setError(err.message || 'ไม่สามารถเชื่อมต่อระบบได้'); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, attendanceVersion, query, idToken, refresh]);
  const selected = data?.employees.find(employee => employee.employeeId === employeeId);
  const rows = selected?.buckets || (employeeId === 'all' ? data?.buckets || [] : []);
  const totals = selected?.totals || (employeeId === 'all' ? data?.totals : undefined);
  const adjustments = (selected ? [selected] : employeeId === 'all' ? data?.employees || [] : []).flatMap(employee => employee.adjustments.map(extra => ({ ...extra, name: employee.nickname || employee.name, employeeId: employee.employeeId })));
  const years = Array.from({ length: Math.max(1, Number(currentYear) - 2026 + 1) }, (_, index) => String(Number(currentYear) - index));
  return <div className={styles.page}>
    <button className={styles.back} onClick={onBack}><ArrowLeft size={20} aria-hidden="true" />กลับหน้ารายงาน</button>
    <div className={styles.heading}><h2>รายงานละเอียด</h2><div className={styles.actions}>
      <button onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={18} aria-hidden="true" />อัปเดต</button>
      <button onClick={() => window.print()} disabled={loading || !data}><Printer size={18} aria-hidden="true" />พิมพ์</button>
    </div></div>
    <section className={styles.filters} aria-label="ตัวกรองรายงาน">
      <div className={styles.periods}>{(['day', 'month', 'year'] as ReportPeriod[]).map(value => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{periodLabels[value]}</button>)}</div>
      <div className={styles.fields}>
        {period === 'day' ? <label>เดือน<input type="month" value={month} max={today.slice(0, 7)} min="2026-08" onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label>
          : period === 'month' ? <label>ปี<select value={year} onChange={event => setYear(event.target.value)}>{years.map(value => <option value={value} key={value}>{Number(value) + 543}</option>)}</select></label>
          : <><label>ตั้งแต่ปี<select value={fromYear} onChange={event => setFromYear(event.target.value)}>{years.filter(value => value <= toYear && Number(toYear) - Number(value) < 5).map(value => <option value={value} key={value}>{Number(value) + 543}</option>)}</select></label>
            <label>ถึงปี<select value={toYear} onChange={event => { setToYear(event.target.value); if (fromYear > event.target.value || Number(event.target.value) - Number(fromYear) >= 5) setFromYear(event.target.value); }}>{years.filter(value => value >= fromYear).map(value => <option value={value} key={value}>{Number(value) + 543}</option>)}</select></label></>}
        <label>พนักงาน<select value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="all">พนักงานทุกคน</option>{employeeId !== 'all' && !data?.employees.some(employee => employee.employeeId === employeeId) && <option value={employeeId} disabled>พนักงานที่เลือกไม่มีข้อมูลในช่วงนี้</option>}{data?.employees.map(employee => <option key={employee.employeeId} value={employee.employeeId}>{employee.nickname || employee.name}</option>)}</select></label>
      </div>
    </section>
    {loading && data && <div className="refreshStatus" role="status">กำลังอัปเดตรายงาน</div>}
    {error && <div className={styles.notice} role="alert">{error}<button onClick={() => setRefresh(value => value + 1)}>ลองใหม่</button></div>}
    {loading && !data ? <div aria-busy="true" aria-label="กำลังโหลดรายงานละเอียด"><div className={styles.totals}>{Array.from({ length: 6 }, (_, index) => <div className="loadingCard" key={index}><span className="loadingLine" /><span className="loadingLine" /></div>)}</div><div className={styles.chartSkeleton}><span className="loadingLine" /></div></div>
      : data && totals ? <>
        <p className={styles.context}>{selected ? selected.nickname || selected.name : 'พนักงานทุกคน'} · {period === 'day' ? formatThaiMonth(month) : period === 'month' ? `ปี ${Number(year) + 543}` : `ปี ${Number(fromYear) + 543}–${Number(toYear) + 543}`}</p>
        <Totals totals={totals} />
        <p className={styles.context}>ค่าจ้างสุทธิ = ค่าแรงสะสม + เงินพิเศษ − เงินเบิก − เงินหัก</p>
        {period === 'day' && adjustments.length > 0 && <p className={styles.notice}>ยอดรวมรวมเงินพิเศษและเงินหักประจำเดือน ส่วนกราฟรายวันแสดงเฉพาะรายการที่ระบุวันที่</p>}
        {data.closedMonths.length > 0 && <p className={styles.context}>เดือนที่ปิดบัญชีใช้ยอดที่บันทึกไว้ตอนปิดเดือน</p>}
        <div className={styles.charts}>
          <section className={styles.panel}><h3>จำนวนเงิน {periodLabels[period]}</h3><label>ประเภทเงิน<select value={moneyMetric} onChange={event => setMoneyMetric(event.target.value as MoneyMetric)}>{Object.entries(moneyMetrics).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><Chart rows={rows} period={period} metric={moneyMetric} title={moneyMetrics[moneyMetric]} money /></section>
          <section className={styles.panel}><h3>การทำงานและหยุดงาน {periodLabels[period]}</h3><label>สถานะ<select value={attendanceMetric} onChange={event => setAttendanceMetric(event.target.value as AttendanceMetric)}>{Object.entries(attendanceMetrics).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><Chart rows={rows} period={period} metric={attendanceMetric} title={attendanceMetrics[attendanceMetric]} money={false} individualDaily={Boolean(selected) && period === 'day'} /></section>
        </div>
        <section className={styles.panel}><h3>รายละเอียด {periodLabels[period]}</h3>
          {rows.length === 0 ? <p>ไม่มีข้อมูลในช่วงที่เลือก</p> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="ตารางรายละเอียดรายงาน"><table><thead><tr><th scope="col">ช่วงเวลา</th>{selected && period === 'day' && <th scope="col">ค่าแรงต่อวัน</th>}<th scope="col">เต็มวัน</th><th scope="col">ครึ่งวัน</th><th scope="col">ไม่มา</th><th scope="col">วันหยุด</th><th scope="col">ค่าแรง</th><th scope="col">เงินพิเศษ</th><th scope="col">เงินเบิก</th><th scope="col">เงินหัก</th><th scope="col">สุทธิ</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><th scope="row">{periodLabel(row.key, period)}</th>{selected && period === 'day' && <td>{row.dailyRateSatang === undefined ? '—' : formatMoney(row.dailyRateSatang)}</td>}<td>{row.full}</td><td>{row.half}</td><td>{row.absent}</td><td>{row.holiday}</td><td>{formatMoney(row.baseSatang)}</td><td>{formatMoney(row.extraSatang)}</td><td>{formatMoney(row.advanceSatang)}</td><td>{formatMoney(row.deductionSatang)}</td><td>{formatMoney(row.totalSatang)}</td></tr>)}</tbody></table></div>}
        </section>
        <section className={styles.panel}><h3>รายบุคคล</h3><div className={styles.people}>{data.employees.filter(employee => employeeId === 'all' || employee.employeeId === employeeId).map(employee => <article className={styles.person} key={employee.employeeId}><h4>{employee.nickname || employee.name}</h4><p>{employee.position}</p><dl><div><dt>มาทำงาน</dt><dd>{employee.totals.workedDays} วัน</dd></div><div><dt>เต็มวัน / ครึ่งวัน / ไม่มา</dt><dd>{employee.totals.full} / {employee.totals.half} / {employee.totals.absent}</dd></div><div><dt>ค่าแรงรวมเงินพิเศษ</dt><dd>{formatMoney(employee.totals.grossSatang)} บาท</dd></div><div><dt>เงินเบิก</dt><dd>{formatMoney(employee.totals.advanceSatang)} บาท</dd></div><div><dt>เงินหัก</dt><dd>{formatMoney(employee.totals.deductionSatang)} บาท</dd></div><div><dt>ค่าจ้างสุทธิ</dt><dd>{formatMoney(employee.totals.totalSatang)} บาท</dd></div></dl><button onClick={() => { setEmployeeId(employee.employeeId); }}>ดูกราฟและรายการของคนนี้</button></article>)}</div></section>
        {adjustments.length > 0 && <section className={styles.panel}><h3>เงินพิเศษและเงินหักประจำเดือน</h3><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="รายการปรับยอดประจำเดือน"><table><thead><tr><th scope="col">เดือน</th><th scope="col">พนักงาน</th><th scope="col">รายการ</th><th scope="col">ประเภท</th><th scope="col">จำนวนเงิน</th></tr></thead><tbody>{adjustments.map((extra, index) => <tr key={`${extra.month}-${extra.employeeId}-${extra.extraId}-${index}`}><td>{formatThaiMonth(extra.month)}</td><td>{extra.name}</td><td>{extra.label}</td><td>{extra.type === 'DEDUCTION' ? 'หักเงิน' : 'เงินพิเศษ'}</td><td>{formatMoney(extra.amountSatang)}</td></tr>)}</tbody></table></div></section>}
      </> : !loading && data ? <p className={styles.notice}>ไม่มีข้อมูลของพนักงานในช่วงที่เลือก<button onClick={() => setEmployeeId('all')}>ดูพนักงานทุกคน</button></p> : null}
  </div>;
}
