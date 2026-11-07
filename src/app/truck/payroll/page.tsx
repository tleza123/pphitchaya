'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MutationIntent } from '@/lib/client/mutation-intent';
import { useRef } from 'react';
import { download, errMsg, getJson, sendJson } from '@/components/truck/api';
import { formatMoney } from '@/lib/payroll/money';
import { getBangkokMonth } from '@/lib/payroll/dates';
import styles from '@/components/truck/truck.module.css';

export default function TruckPayrollPage() {
  const [workDate,setWorkDate]=useState(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'}));
  const [workDrivers,setWorkDrivers]=useState<any[]>([]); const [chosen,setChosen]=useState<string[]>([]); const [suggested,setSuggested]=useState<string[]>([]); const [workRevision,setWorkRevision]=useState(0); const workIntent=useRef(new MutationIntent());
  const loadWork=async()=>{try {const [settings,days]=await Promise.all([getJson('/api/truck/settings'),getJson(`/api/truck/workdays?month=${workDate.slice(0,7)}&date=${workDate}`)]); setWorkDrivers(settings.truckDrivers || []); const day=days.workDays.find((d:any)=>d.dateKey===workDate); setChosen((day?.drivers || []).map((d:any)=>d.driverId)); setWorkRevision(day?.revision || 0); setSuggested(days.suggestedDriverIds || []); } catch(e) {setError(errMsg(e));}};
  useEffect(()=>{void loadWork();},[workDate]);
  const saveWork=async()=>{try {const payload={dateKey:workDate,driverIds:chosen,expectedRevision:workRevision}; await sendJson('/api/truck/workdays','POST',payload,workIntent.current.requestId(payload)); workIntent.current.complete(); await loadWork();}catch(e){setError(errMsg(e));}};
  const [month,setMonth]=useState(getBangkokMonth());
  const [data,setData]=useState<any>(null); const [error,setError]=useState('');
  const load=async()=>{try{setData(await getJson(`/api/truck/payroll?month=${month}`));setError('');}catch(e){setError(errMsg(e));}};
  useEffect(()=>{void load();},[month]);
  const action=async(action:string, extra:object={})=>{try{await sendJson('/api/truck/payroll','POST',{action,month,expectedRevision:data.revision,...extra});await load();}catch(e){setError(errMsg(e));}};
  return (
    <main className={styles.payrollPage}>
      <Link href="/truck/reports">กลับหน้ารายงาน</Link>
      <h1>รอบค่าแรงคนขับ</h1>
      <section className={styles.payrollSection}>
        <h2>ยืนยันวันทำงานคนขับ</h2>
        <label>วันที่ <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} /></label>
        <p>คำแนะนำจากเที่ยวที่ครอบคลุมวันนี้ ต้องตรวจสอบก่อนยืนยัน</p>
        {workDrivers.filter(d => d.status === 'ACTIVE' || chosen.includes(d.driverId)).map(d => (
          <label key={d.driverId} style={{ display: 'block' }}>
            <input type="checkbox" checked={chosen.includes(d.driverId)} onChange={e => setChosen(v => e.target.checked ? [...v, d.driverId] : v.filter(id => id !== d.driverId))} />
            {' '}{d.name} {suggested.includes(d.driverId) ? ' (แนะนำจากเที่ยว)' : ''}
          </label>
        ))}
        <button type="button" onClick={() => void saveWork()}>ยืนยันวันทำงาน</button>
      </section>
      <label>เดือนงาน <input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>สถานะ: {data.state === 'CLOSED' ? 'ปิดรอบแล้ว' : 'ยังเปิดรอบ'}</p>
          {data.state === 'OPEN' && data.preview && (
            <section className={styles.payrollSection} aria-labelledby="payroll-preview-title">
              <h2 id="payroll-preview-title">ตรวจสอบก่อนปิดรอบ</h2>
              {data.legacyReviewRequired && <p role="alert">มีใบงานเดิมที่ต้องตรวจและย้ายข้อมูลก่อนปิดรอบ</p>}
              {data.preview.pending.length > 0 && (
                <div role="alert">
                  <h3>เที่ยวค้าง {data.preview.pending.length} เที่ยว</h3>
                  {data.preview.pending.map((trip: any) => <p key={trip.tripId}>{trip.departureDate} · {trip.plate || 'ไม่ระบุรถ'} · {trip.origin} → {trip.destination}</p>)}
                </div>
              )}
              {data.preview.errors.length > 0 && <div role="alert"><p>ข้อมูลคนขับหรือค่าเที่ยวไม่ครบ {data.preview.errors.length} เที่ยว</p><p>รหัสเที่ยว: {data.preview.errors.join(', ')}</p></div>}
              {data.preview.drivers.map((driver: any) => (
                <section className={styles.payrollRow} key={driver.driverId}>
                  <h3>{driver.driverName}</h3>
                  <p>วันทำงาน {driver.days.length} วัน · เที่ยว {driver.trips.length} เที่ยว</p>
                  <p>ค่าแรงฐาน {formatMoney(driver.baseSatang)} · ค่าเที่ยว {formatMoney(driver.tripSatang)} · เงินเพิ่ม {formatMoney(driver.extraSatang)} · รวม {formatMoney(driver.totalSatang)} บาท</p>
                </section>
              ))}
              <button type="button" disabled={!data.preview.canClose || data.legacyReviewRequired} onClick={() => void action('CLOSE')}>ปิดรอบค่าแรง</button>
            </section>
          )}
          {data.state === 'CLOSED' && (
            <>
              <button type="button" onClick={() => { const reason = prompt('เหตุผลที่เปิดรอบ'); if (reason) void action('REOPEN', { reason }); }}>เปิดรอบแก้ไข</button>
              {data.snapshot.drivers.map((driver: any) => (
                <section className={styles.payrollRow} key={driver.driverId}>
                  <h2>{driver.driverName}</h2>
                  <p>วันทำงาน {driver.days.length} วัน · เที่ยว {driver.trips.length} เที่ยว · ยอด {formatMoney(driver.totalSatang)} บาท</p>
                  <button type="button" onClick={() => void download(`/api/truck/payroll/pdf?month=${month}&driverId=${encodeURIComponent(driver.driverId)}`, `payroll-${month}.pdf`).catch(e => setError(errMsg(e)))}>ดาวน์โหลด PDF</button>
                  {data.payments?.[driver.driverId]?.status === 'PAID' ? (
                    <button type="button" onClick={() => { const reason = prompt('เหตุผลยกเลิกการจ่าย'); if (reason) void action('VOID_PAYMENT', { driverId: driver.driverId, reason }); }}>ยกเลิกบันทึกจ่าย</button>
                  ) : (
                    <button type="button" onClick={() => { const paidDate = prompt('วันที่จ่าย YYYY-MM-DD'); if (paidDate) { const note = prompt('หมายเหตุการจ่าย (ถ้ามี)') || ''; void action('PAY', { driverId: driver.driverId, paidDate, note }); } }}>บันทึกจ่าย</button>
                  )}
                </section>
              ))}
            </>
          )}
        </>
      )}
    </main>
  );
}
