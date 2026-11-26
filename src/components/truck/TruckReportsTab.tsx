'use client';
import { useEffect, useState } from 'react';
import { FileDown, FileSpreadsheet, ChartNoAxesCombined, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import reports from '@/components/reports/reports.module.css';
import { LineSendButton } from '@/components/shared/LineSendButton';
import { useModalInteraction } from '@/components/shared/useModalInteraction';
import { formatMoney } from '@/lib/payroll/money';
import { formatThaiDate, formatThaiMonth } from '@/lib/payroll/dates';
import { TruckDailyRecordDoc, TruckMonthlyReport } from '@/lib/truck/types';
import { getTripDriverChargeSatang } from '@/lib/truck/pricing';
import { download, errMsg, getJson, sendJson } from './api';
import { PhotoLightbox } from './PhotoLightbox';
import type { TruckBoot } from './TruckShell';
import styles from './truck.module.css';

interface Props {
  active: boolean;
  boot: TruckBoot;
  version: number;
  onEdit: (dateKey: string, truckId: string) => void;
  onOpenDetailed: () => void;
}

export function TruckReportsTab({ active, boot, version, onEdit, onOpenDetailed }: Props) {
  const [month, setMonth] = useState(boot.monthKey);
  const [truckId, setTruckId] = useState('');
  const [report, setReport] = useState<TruckMonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<TruckDailyRecordDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useModalInteraction(active && Boolean(toDelete), () => setToDelete(null));

  useEffect(() => {
    if (!active || !/^\d{4}-\d{2}$/.test(month)) return;
    let stale = false;
    setLoading(true);
    setError(null);
    getJson(`/api/truck/reports?month=${month}${truckId ? `&truckId=${encodeURIComponent(truckId)}` : ''}`)
      .then(d => { if (!stale) setReport(d); })
      .catch(e => { if (!stale) setError(errMsg(e)); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [active, month, truckId, version, reload]);

  const exportFile = (format: 'pdf' | 'csv') => {
    const q = `month=${month}&format=${format}${truckId ? `&truckId=${encodeURIComponent(truckId)}` : ''}`;
    setExportError(null);
    setBusy(true);
    download(`/api/truck/reports/export?${q}`, `truck-${month}.${format}`).catch(e => setExportError(errMsg(e))).finally(() => setBusy(false));
  };

  const confirmDelete = async () => {
    if (!toDelete || busy) return;
    setBusy(true);
    try {
      await sendJson(`/api/truck/records/${toDelete.recordId}`, 'DELETE', { expectedRevision: toDelete.revision });
      setToDelete(null);
      setReload(n => n + 1);
    } catch (e) {
      setError(errMsg(e));
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const totals = report?.totals;
  const savedIds = new Set(report?.savedRecords?.map(record => record.recordId) || []);
  const history = report ? [...(report.savedRecords || []), ...report.records.filter(record => !savedIds.has(record.recordId))] : [];

  return (
    <div className={styles.stack} aria-busy={loading}>
      <h2 className={`${reports.title} ${styles.reportTitle}`}>รายงานรถสิบล้อ</h2>
      <div className={`${reports.monthControlsBar} ${styles.reportFilters}`}>
        <div className={styles.row2}>
          <div>
            <label className={reports.monthLabel} htmlFor="trr-month">เลือกเดือน</label>
            <input id="trr-month" type="month" className={reports.monthSelect} value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
          </div>
          <div>
            <label className={reports.monthLabel} htmlFor="trr-truck">รถสิบล้อ</label>
            <select id="trr-truck" className={reports.monthSelect} value={truckId} onChange={e => setTruckId(e.target.value)}>
              <option value="">ทุกคัน</option>
              {boot.trucks.map(t => <option key={t.truckId} value={t.truckId}>{t.plateNumber}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="app-notice app-notice-danger" role="alert">{error}</div>}
      {loading && <div className="refreshStatus" role="status">กำลังโหลดรายงาน</div>}

      {report && totals && (
        <div className={`${reports.summaryCard} ${styles.reportSummary}`}>
          <p className={reports.summaryLabel}>ค่าเที่ยวคนขับรวม</p>
          <p className={reports.summaryMoney}>{formatMoney(totals.totalDriverPaySatang)} บาท</p>
          <p className={reports.summarySub}>{formatThaiMonth(report.monthKey)} · {totals.totalTrips} เที่ยว · นับตามวันที่ออกรถ</p>
        </div>
      )}

      {Boolean(report?.unpricedTripCount) && (
        <p className="app-notice">ยังไม่ได้ตั้งค่าเที่ยวคนขับ {report?.unpricedTripCount} เที่ยว ยอดรวมแสดงเฉพาะเที่ยวที่มีราคา</p>
      )}

      {report && report.perTruck.length > 0 && (
        <div className={styles.panel}>
          <h3 className={reports.sectionTitle}>สรุปแยกตามรถ</h3>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="สรุปแยกตามรถ">
            <table className={styles.table}>
              <thead><tr><th>ทะเบียน</th><th>คนขับ</th><th className={styles.num}>เที่ยว</th><th className={styles.num}>ค่าเที่ยว (บาท)</th></tr></thead>
              <tbody>
                {report.perTruck.map(r => (
                  <tr key={r.truckId}>
                    <td><strong>{r.plateNumber}</strong></td>
                    <td>{r.driverName || '-'}</td>
                    <td className={styles.num}>{r.tripCount}</td>
                    <td className={styles.num}><strong>{formatMoney(r.totalDriverPaySatang)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className={`${styles.panel} ${styles.historyPanel}`} aria-label="ประวัติใบงานรายวัน">
        <h3 className={reports.sectionTitle}>ประวัติใบงานรายวัน</h3>
        {report && history.length === 0 && <p className={styles.historyEmpty}>ไม่มีใบงานในเดือนที่เลือก</p>}
        {history.map(r => (
          <details className={styles.rec} key={`${r.recordId}-${r.dateKey}-${r.trips[0]?.tripId || 'legacy'}`}>
            <summary className={styles.recHead}>
              <span>
                <strong>{formatThaiDate(r.dateKey)} · {r.plateNumberSnapshot}</strong>
                <span className={styles.recMeta}>{r.trips.length} เที่ยว · {formatMoney(r.totalDriverPaySatang)} บาท</span>
              </span>
              <ChevronDown size={20} aria-hidden="true" />
            </summary>
            <div className={styles.recBody}>
              {r.trips.map(t => (
                <div className={styles.recTrip} key={t.tripIndex}>
                  <span>{t.tripIndex}. {t.fromLocation || 'ไม่ระบุต้นทาง'} - {t.destinationName}{t.note ? ` (${t.note})` : ''} · {t.status === 'CANCELLED' ? 'ยกเลิก' : 'บันทึกแล้ว'}</span>
                  <span className={styles.pay}>{t.driverPaySatang == null ? 'ยังไม่ได้ตั้งราคา' : `${formatMoney(getTripDriverChargeSatang(t))} บาท`}</span>
                </div>
              ))}
              <p className={styles.recMeta}>บันทึกแล้ว{r.revision ? ` (ครั้งที่ ${r.revision})` : ''}</p>
              {r.photos.length > 0 && (
                <div className={styles.thumbs}>
                  {r.photos.map(p => (
                    <div className={styles.thumb} key={p.photoId}>
                      <button type="button" onClick={() => setViewPhoto(p.photoId)} aria-label="ดูรูปหลักฐานขนาดใหญ่"><img src={`/api/truck/photos/${p.photoId}`} alt="รูปหลักฐาน" loading="lazy" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.itemActions}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(r.sourceDateKey || r.dateKey, r.truckId)} aria-label={`แก้ไขใบงาน ${r.dateKey} ${r.plateNumberSnapshot}`}>
                  <Pencil size={18} aria-hidden="true" />
                  <span>แก้ไข</span>
                </button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setToDelete(r)} aria-label={`ลบใบงาน ${r.dateKey} ${r.plateNumberSnapshot}`}>
                  <Trash2 size={18} aria-hidden="true" />
                  <span>ลบ</span>
                </button>
              </div>
            </div>
          </details>
        ))}
      </section>

      <section className={styles.reportActions} aria-label="ดูรายละเอียดและส่งออกรายงาน">
        <button type="button" className={`btn btn-primary btn-block ${styles.reportDetailsButton}`} onClick={onOpenDetailed}>
          <ChartNoAxesCombined size={20} aria-hidden="true" />
          <span>ดูรายงานละเอียดและกราฟ</span>
        </button>
        <button type="button" className="btn btn-secondary btn-block" disabled={busy || loading} onClick={() => exportFile('pdf')}>
          <FileDown size={20} aria-hidden="true" />
          <span>ดาวน์โหลด PDF</span>
        </button>
        <button type="button" className="btn btn-secondary btn-block" disabled={busy || loading} onClick={() => exportFile('csv')}>
          <FileSpreadsheet size={20} aria-hidden="true" />
          <span>ส่งออก Excel (CSV)</span>
        </button>
        <div className={styles.reportDetailsButton}>
          <LineSendButton scope="truck" />
        </div>
        {exportError && <p className={`app-notice app-notice-danger ${styles.exportError}`} role="alert">{exportError}</p>}
      </section>

      {toDelete && (
        <div className="app-modal-overlay">
          <div className="app-modal-card" data-app-dialog role="dialog" aria-modal="true" aria-labelledby="trr-del" tabIndex={-1}>
            <h3 id="trr-del" className="app-modal-title app-modal-title-danger">ลบใบงาน</h3>
            <p className="app-modal-desc">
              ลบใบงานวันที่ {formatThaiDate(toDelete.dateKey)} ของรถ {toDelete.plateNumberSnapshot} หรือไม่ เมื่อลบแล้วกู้คืนไม่ได้
            </p>
            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setToDelete(null)} disabled={busy}>ยกเลิก</button>
              <button type="button" className="btn btn-danger-solid" onClick={confirmDelete} disabled={busy} aria-busy={busy}>
                {busy ? <span className="busyInline">กำลังลบ</span> : 'ยืนยันลบใบงาน'}
              </button>
            </div>
          </div>
        </div>
      )}
      <PhotoLightbox photoId={viewPhoto} onClose={() => setViewPhoto(null)} />
    </div>
  );
}
