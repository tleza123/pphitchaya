'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, LockKeyhole, Truck } from 'lucide-react';
import styles from './entry.module.css';

const systems = [
  { path: '/attendance', label: 'เช็กชื่อพนักงาน', Icon: ClipboardList },
  { path: '/truck', label: 'ระบบรถบรรทุก', Icon: Truck }
] as const;

export default function HomePage() {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (destination) input.current?.focus(); }, [destination]);

  const enter = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/system-entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, password })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message || 'ไม่สามารถเข้าสู่ระบบได้');
      setPassword(''); router.push(result.data.destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่');
      setPassword(''); input.current?.focus();
    } finally { setBusy(false); }
  };

  return <main className={styles.page}>
    <h1>เลือกระบบ</h1>
    <p className={styles.hint}>เลือกระบบที่ต้องการใช้งาน แล้วกรอกรหัสเข้าใช้งาน</p>
    <nav className={styles.systems} aria-label="เลือกระบบใช้งาน">
      {systems.map(({ path, label, Icon }) => <button key={path} type="button" disabled={busy} aria-pressed={destination === path} className={styles.system} onClick={() => { setDestination(path); setPassword(''); setError(''); }}>
        <Icon size={25} aria-hidden="true" /><span>{label}</span><LockKeyhole size={18} aria-hidden="true" />
      </button>)}
    </nav>
    {destination && <section className={styles.panel} aria-labelledby="entry-title">
      <h2 id="entry-title">เข้า{systems.find(system => system.path === destination)?.label}</h2>
      <form onSubmit={enter} aria-busy={busy}>
        <label htmlFor="entry-password">รหัสเข้าใช้งาน</label>
        <input ref={input} id="entry-password" type="password" inputMode="numeric" autoComplete="current-password" maxLength={128} required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'entry-error' : undefined} />
        {error && <p id="entry-error" className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button className={styles.submit} type="submit" disabled={busy || !password}>{busy ? 'กำลังตรวจสอบ…' : 'เข้าใช้งาน'}</button>
          <button type="button" disabled={busy} onClick={() => { setDestination(''); setPassword(''); setError(''); }}>ยกเลิก</button>
        </div>
      </form>
    </section>}
  </main>;
}
