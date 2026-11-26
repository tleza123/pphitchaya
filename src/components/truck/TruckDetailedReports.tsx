'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import settings from '@/components/settings/settings.module.css';
import reports from '@/components/reports/reports.module.css';
import { formatMoney } from '@/lib/payroll/money';
import { TruckAnalyticsBucket, TruckAnalyticsResult, TruckReportPeriod } from '@/lib/truck/types';
import { errMsg, getJson } from './api';
import type { TruckBoot } from './TruckShell';
import styles from './truck.module.css';
import documentStyles from './truck-documents.module.css';

type Metric = 'tripCount' | 'driverPaySatang';
const METRICS: { key: Metric; label: string }[] = [
  { key: 'tripCount', label: 'เที่ยววิ่ง' },
  { key: 'driverPaySatang', label: 'ค่าเที่ยว' }
];
const PERIODS: { key: TruckReportPeriod; label: string }[] = [
  { key: 'day', label: 'รายวัน' },
  { key: 'month', label: 'รายเดือน' },
  { key: 'year', label: 'รายปี' }
];
const fmt = (m: Metric, v: number) => (m === 'tripCount' ? String(v) : formatMoney(v));

function Chart({ rows, metric }: { rows: TruckAnalyticsBucket[]; metric: Metric }) {
  const max = Math.max(1, ...rows.map(r => r[metric]));
  const step = 42;
  const width = Math.max(480, rows.length * step + 88);
  const top = 24, base = 205;
  return (
    <div className={styles.chartScroll}>
      <svg width={width} height={248} viewBox={`0 0 ${width} 248`} role="img" aria-label="กราฟเปรียบเทียบ">
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={74} x2={width - 12} y1={base - f * (base - top)} y2={base - f * (base - top)} stroke="#cbd5e1" strokeDasharray="3 4" />
            <text x={66} y={base - f * (base - top) + 4} textAnchor="end" fontSize="13" fill="#475569">{fmt(metric, Math.round(max * f))}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const h = (r[metric] / max) * (base - top);
          return (
            <g key={r.key}>
              <rect x={78 + i * step + step * 0.12} y={base - h} width={step * 0.72} height={h} rx={4} fill="var(--team-primary)">
                <title>{`${r.key}: ${fmt(metric, r[metric])}`}</title>
              </rect>
              <text x={78 + i * step + step * 0.48} y={230} textAnchor="middle" fontSize="13" fill="#475569">{period2label(r.key)}</text>
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

  const sel = truckId ? data?.trucks.find(t => t.truckId === truckId) : null;
  const rows = (sel ? sel.buckets : data?.buckets) || [];
  const totals = sel ? sel.totals : data?.totals;

  return (
    <div className={styles.stack}>
      <header className={documentStyles.pageHeader}>
        <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'fit-content' }} onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />
          <span>กลับหน้ารายงาน</span>
        </button>
        <h2 className={`${reports.title} ${styles.reportTitle}`}>รายงานละเอียดและกราฟ</h2>
      </header>

      <div className={styles.panel}>
        <div className={styles.segmented} role="group" aria-label="ช่วงเวลา">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              className={`btn btn-sm ${period === p.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className={styles.row2} style={{ marginTop: '0.9rem' }}>
          <div className={settings.formGroup}>
            {period === 'day' ? (
              <>
                <label className={settings.formLabel} htmlFor="trd-month">เดือน</label>
                <input id="trd-month" type="month" className={settings.formInput} value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
              </>
            ) : (
              <>
                <label className={settings.formLabel} htmlFor="trd-year">{period === 'month' ? 'ปี (ค.ศ.)' : 'ปีสุดท้าย (ย้อนหลัง 3 ปี)'}</label>
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
            <button
              key={m.key}
              type="button"
              aria-pressed={metric === m.key}
              className={`btn btn-sm ${metric === m.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="app-notice app-notice-danger" role="alert">{error}</div>}

      {totals && (
        <div className={styles.panel}>
          <div className={styles.figures}>
            <div className={styles.fig}><small>เที่ยววิ่ง</small><strong>{totals.tripCount} เที่ยว</strong></div>
            <div className={styles.fig}><small>ค่าเที่ยวคนขับรวม</small><strong>{formatMoney(totals.driverPaySatang)} บาท</strong></div>
          </div>
        </div>
      )}

      <div className={styles.panel}>
        {rows.length === 0 ? <p className={styles.empty}>ไม่มีข้อมูลในช่วงที่เลือก</p> : (
          <>
            <Chart rows={rows} metric={metric} />
            <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="ตารางข้อมูล" style={{ marginTop: '0.85rem' }}>
              <table className={styles.table}>
                <thead><tr><th>ช่วง</th><th className={styles.num}>เที่ยว</th><th className={styles.num}>ค่าเที่ยว (บาท)</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.key}>
                      <td>{r.key}</td>
                      <td className={styles.num}>{r.tripCount}</td>
                      <td className={styles.num}><strong>{formatMoney(r.driverPaySatang)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: '1rem' }} onClick={() => window.print()}>
          <Printer size={19} aria-hidden="true" />
          <span>พิมพ์รายงาน</span>
        </button>
      </div>
    </div>
  );
}
