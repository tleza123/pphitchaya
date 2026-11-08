'use client';
import { useEffect, useState } from 'react';
import { FileDown, FileSpreadsheet, ChartNoAxesCombined, Pencil, Trash2 } from 'lucide-react';
import settings from '@/components/settings/settings.module.css';
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
    setBusy(true);
    download(`/api/truck/reports/export?${q}`, `truck-${month}.${format}`).catch(e => setError(errMsg(e))).finally(() => setBusy(false));
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
      <h2 className={reports.title}>รายงานงานรถสิบล้อ</h2>
      <div className={styles.panel}>
        <div className={styles.row2}>
          <div className={settings.formGroup}>
            <label className={settings.formLabel} htmlFor="trr-month">เดือน</label>
            <input id="trr-month" type="month" className={settings.formInput} value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
          </div>
          <div className={settings.formGroup}>
            <label className={settings.formLabel} htmlFor="trr-truck">รถสิบล้อ</label>
            <select id="trr-truck" className={settings.formInput} value={truckId} onChange={e => setTruckId(e.target.value)}>
              <option value="">ทุกคัน</option>
              {boot.trucks.map(t => <option key={t.truckId} value={t.truckId}>{t.plateNumber}</option>)}
            </select>
          </div>
        </div>
        <div className={styles.toolbar}>
          <button type="button" className={settings.secondaryBtn} disabled={busy} onClick={() => exportFile('pdf')}><FileDown size={18} aria-hidden="true" style={{ marginRight: '.4rem', verticalAlign: '-3px' }} />ดาวน์โหลด PDF</button>
          <button type="button" className={settings.secondaryBtn} disabled={busy} onClick={() => exportFile('csv')}><FileSpreadsheet size={18} aria-hidden="true" style={{ marginRight: '.4rem', verticalAlign: '-3px' }} />ส่งออก Excel (CSV)</button>
          <button type="button" className={settings.secondaryBtn} onClick={onOpenDetailed}><ChartNoAxesCombined size={18} aria-hidden="true" style={{ marginRight: '.4rem', verticalAlign: '-3px' }} />รายละเอียดและกราฟ</button>
          <LineSendButton scope="truck" className={settings.secondaryBtn} />
        </div>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}

      {totals && (
        <div className={styles.panel}>
          <p className={styles.hint} style={{ marginTop: 0 }}>{formatThaiMonth(month)} · ยอดสรุปจากเที่ยวที่บันทึกแล้ว ตามเดือนวันที่ออก ไม่ต้องระบุวันที่ถึง</p>
          <div className={styles.figures}>
            <div className={styles.fig}><small>เที่ยววิ่งรวม</small><strong>{totals.totalTrips}</strong></div>
            <div className={styles.fig}><small>ค่าเที่ยวคนขับ (บาท)</small><strong>{formatMoney(totals.totalDriverPaySatang)}</strong></div>
          </div>
        </div>
      )}

      {Boolean(report?.unpricedTripCount) && <p className={styles.hint}>ยังไม่ตั้งค่าเที่ยวคนขับ {report?.unpricedTripCount} เที่ยว · นับจำนวนเที่ยวแล้ว แต่ยังไม่รวมเงินของเที่ยวเหล่านี้</p>}

      {report && report.perTruck.length > 0 && (
        <div className={styles.panel}>
          <h3 className={reports.sectionTitle}>สรุปแยกตามรถ</h3>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="สรุปแยกตามรถ">
            <table className={styles.table}>
              <thead><tr><th>ทะเบียน</th><th>คนขับ</th><th className={styles.num}>เที่ยว</th><th className={styles.num}>ค่าเที่ยว</th></tr></thead>
              <tbody>
                {report.perTruck.map(r => (
                  <tr key={r.truckId}>
                    <td>{r.plateNumber}</td><td>{r.driverName || '-'}</td>
                    <td className={styles.num}>{r.tripCount}</td>
                    <td className={styles.num}>{formatMoney(r.totalDriverPaySatang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={styles.panel}>
        <h3 className={reports.sectionTitle}>ประวัติใบงานรายวัน</h3>
        <p className={styles.hint}>บันทึกใบงานแล้วนับเที่ยวทันที วันที่ถึงเป็นข้อมูลเพิ่มเติมเท่านั้น รายการที่ยังไม่ตั้งราคาจะยังไม่มียอดเงินรวม</p>
        {report && history.length === 0 && <p className={styles.empty}>ไม่มีใบงานในเดือนที่เลือก</p>}
        {history.map(r => (
          <div className={styles.rec} key={`${r.recordId}-${r.dateKey}-${r.trips[0]?.tripId || "legacy"}`}>
            <div className={styles.recHead}>
              <span>{formatThaiDate(r.dateKey)} - {r.plateNumberSnapshot}</span>
              <span className={styles.itemActions}>
                <button type="button" className={styles.iconBtn} onClick={() => onEdit(r.sourceDateKey || r.dateKey, r.truckId)} aria-label={`แก้ไขใบงาน ${r.dateKey} ${r.plateNumberSnapshot}`}><Pencil size={18} aria-hidden="true" /> แก้ไข</button>
                <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => setToDelete(r)} aria-label={`ลบใบงาน ${r.dateKey} ${r.plateNumberSnapshot}`}><Trash2 size={18} aria-hidden="true" /></button>
              </span>
            </div>
            {r.trips.map(t => (
              <div className={styles.recTrip} key={t.tripIndex}>
                <span>{t.tripIndex}. {t.fromLocation || 'ไม่ระบุต้นทาง'} - {t.destinationName}{t.note ? ` (${t.note})` : ''} · {t.status === 'CANCELLED' ? 'ยกเลิก' : 'บันทึกแล้ว'}</span>
                <span className={styles.pay}>{t.driverPaySatang == null ? 'ยังไม่ได้ตั้งราคา' : formatMoney(getTripDriverChargeSatang(t))}</span>
              </div>
            ))}
            <div className={styles.recMeta}>ค่าเที่ยวตามใบงาน {formatMoney(r.totalDriverPaySatang)} บาท · บันทึกแล้ว{r.revision ? ` (รุ่นที่ ${r.revision})` : ''}</div>
            {r.photos.length > 0 && (
              <div className={styles.thumbs}>
                {r.photos.map(p => (
                  <div className={styles.thumb} key={p.photoId}>
                    <button type="button" onClick={() => setViewPhoto(p.photoId)} aria-label="ดูรูปหลักฐานขนาดใหญ่"><img src={`/api/truck/photos/${p.photoId}`} alt="รูปหลักฐาน" loading="lazy" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {toDelete && (
        <div className={reports.modalOverlay}>
          <div className={reports.modalCard} data-app-dialog role="dialog" aria-modal="true" aria-labelledby="trr-del" tabIndex={-1}>
            <h3 id="trr-del" className={reports.sectionTitle}>ลบใบงาน</h3>
            <p>ลบใบงานวันที่ {formatThaiDate(toDelete.dateKey)} ของ {toDelete.plateNumberSnapshot} ใช่หรือไม่ การลบไม่สามารถย้อนกลับได้</p>
            <div style={{ display: 'grid', gap: '.6rem' }}>
              <button type="button" className={settings.primaryBtn} onClick={confirmDelete} disabled={busy} aria-busy={busy}>ยืนยันการลบ</button>
              <button type="button" className={settings.secondaryBtn} onClick={() => setToDelete(null)} disabled={busy}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
      <PhotoLightbox photoId={viewPhoto} onClose={() => setViewPhoto(null)} />
    </div>
  );
}
