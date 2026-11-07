'use client';
import { useEffect, useState } from 'react';
import settings from '@/components/settings/settings.module.css';
import reports from '@/components/reports/reports.module.css';
import { formatMoney } from '@/lib/payroll/money';
import { TruckAnalyticsBucket, TruckAnalyticsResult, TruckReportPeriod } from '@/lib/truck/types';
import { errMsg, getJson } from './api';
import type { TruckBoot } from './TruckShell';
import styles from './truck.module.css';

type Metric = 'tripCount' | 'driverPaySatang';
const METRICS: { key: Metric; label: string }[] = [
  { key: 'tripCount', label: 'เที่ยววิ่ง' },
  { key: 'driverPaySatang', label: 'ค่าเที่ยว' }
];
const PERIODS: { key: TruckReportPeriod; label: string }[] = [{ key: 'day', label: 'รายวัน' }, { key: 'month', label: 'รายเดือน' }, { key: 'year', label: 'รายปี' }];
const fmt = (m: Metric, v: number) => (m === 'tripCount' ? String(v) : formatMoney(v));

// Plain SVG bars: no chart dependency, same approach as the attendance detailed report.
function Chart({ rows, metric }: { rows: TruckAnalyticsBucket[]; metric: Metric }) {
  const max = Math.max(1, ...rows.map(r => r[metric]));
  const step = 38;
  const width = Math.max(480, rows.length * step + 80);
  const top = 20, base = 205;
  return (
    <div className={styles.chartScroll}>
      <svg width={width} height={245} viewBox={`0 0 ${width} 245`} role="img" aria-label="กราฟเปรียบเทียบ">
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={70} x2={width - 10} y1={base - f * (base - top)} y2={base - f * (base - top)} stroke="var(--team-border-strong)" strokeDasharray="3 4" />
            <text x={64} y={base - f * (base - top) + 4} textAnchor="end" fontSize="11" fill="var(--team-muted)">{fmt(metric, Math.round(max * f))}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const h = (r[metric] / max) * (base - top);
          return (
            <g key={r.key}>
              <rect x={70 + i * step + step * 0.12} y={base - h} width={step * 0.7} height={h} rx={3} fill="var(--team-primary)">
                <title>{`${r.key}: ${fmt(metric, r[metric])}`}</title>
              </rect>
              <text x={70 + i * step + step * 0.47} y={225} textAnchor="middle" fontSize="11" fill="var(--team-muted)">{period2label(r.key)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
const period2label = (key: string) => (key.length === 10 ? key.slice(8) : key.length === 7 ? key.slice(5) : key);

export function TruckDetailedReports({ active, boot, onBack }: { active: boolean; boot: TruckBoot; onBack: () => void }) {
  const [period, setPeriod] = useState<TruckReportPeriod>('day');
  const [month, setMonth] = useState(boot.monthKey);
  const [year, setYear] = useState(boot.monthKey.slice(0, 4));
  const [metric, setMetric] = useState<Metric>('driverPaySatang');
  const [truckId, setTruckId] = useState('');
  const [data, setData] = useState<TruckAnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const to = Number(year);
    const q = period === 'day' ? `period=day&month=${month}` : period === 'month' ? `period=month&year=${year}` : `period=year&fromYear=${to - 2}&toYear=${to}`;
    let stale = false;
    setError(null);
    getJson(`/api/truck/reports/analytics?${q}`).then(d => { if (!stale) setData(d); }).catch(e => { if (!stale) setError(errMsg(e)); });
    return () => { stale = true; };
  }, [active, period, month, year]);

  // Truck filter is applied client-side from the single payload, so switching trucks never refetches.
  const sel = truckId ? data?.trucks.find(t => t.truckId === truckId) : null;
  const rows = (sel ? sel.buckets : data?.buckets) || [];
  const totals = sel ? sel.totals : data?.totals;

  return (
    <div className={styles.stack}>
      <button type="button" className={reports.backBtn} onClick={onBack}>กลับไปหน้ารายงาน</button>
      <h2 className={reports.title}>รายงานละเอียดและกราฟ</h2>
      <div className={styles.panel}>
        <div className={styles.segmented} role="group" aria-label="ช่วงเวลา">
          {PERIODS.map(p => (
            <button key={p.key} type="button" aria-pressed={period === p.key} className={`${styles.seg} ${period === p.key ? styles.segActive : ''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
        <div className={styles.row2} style={{ marginTop: '.8rem' }}>
          <div className={settings.formGroup}>
            {period === 'day' ? (
              <>
                <label className={settings.formLabel} htmlFor="trd-month">เดือน</label>
                <input id="trd-month" type="month" className={settings.formInput} value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
              </>
            ) : (
              <>
                <label className={settings.formLabel} htmlFor="trd-year">{period === 'month' ? 'ปี' : 'ปีสุดท้าย (ย้อนหลัง 3 ปี)'}</label>
                <input id="trd-year" inputMode="numeric" maxLength={4} className={settings.formInput} value={year} onChange={e => setYear(e.target.value.replace(/\D/g, ''))} />
              </>
            )}
          </div>
          <div className={settings.formGroup}>
            <label className={settings.formLabel} htmlFor="trd-truck">รถสิบล้อ</label>
            <select id="trd-truck" className={settings.formInput} value={truckId} onChange={e => setTruckId(e.target.value)}>
              <option value="">ทุกคัน</option>
              {boot.trucks.map(t => <option key={t.truckId} value={t.truckId}>{t.plateNumber}</option>)}
            </select>
          </div>
        </div>
        <div className={styles.segmented} role="group" aria-label="ตัวชี้วัด">
          {METRICS.map(m => (
            <button key={m.key} type="button" aria-pressed={metric === m.key} className={`${styles.seg} ${metric === m.key ? styles.segActive : ''}`} onClick={() => setMetric(m.key)}>{m.label}</button>
          ))}
        </div>
      </div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {totals && (
        <div className={styles.panel}>
          <div className={styles.figures}>
            <div className={styles.fig}><small>เที่ยววิ่ง</small><strong>{totals.tripCount}</strong></div>
            <div className={styles.fig}><small>ค่าเที่ยว (บาท)</small><strong>{formatMoney(totals.driverPaySatang)}</strong></div>
          </div>
        </div>
      )}
      <div className={styles.panel}>
        {rows.length === 0 ? <p className={styles.empty}>ไม่มีข้อมูลในช่วงที่เลือก</p> : (
          <>
            <Chart rows={rows} metric={metric} />
            <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="ตารางข้อมูล">
              <table className={styles.table}>
                <thead><tr><th>ช่วง</th><th className={styles.num}>เที่ยว</th><th className={styles.num}>ค่าเที่ยว</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.key}>
                      <td>{r.key}</td><td className={styles.num}>{r.tripCount}</td>
                      <td className={styles.num}>{formatMoney(r.driverPaySatang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <button type="button" className={settings.secondaryBtn} style={{ marginTop: '1rem' }} onClick={() => window.print()}>พิมพ์รายงาน</button>
      </div>
    </div>
  );
}
