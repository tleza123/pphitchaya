'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { errMsg, getJson, sendJson } from '@/components/truck/api';
import styles from '@/components/settings/settings.module.css';

interface LineProfile {
  channelAccessTokenMasked: string;
  defaultTargetId: string;
  attendanceTargetId: string;
  truckTargetId: string;
  dailySummaryEnabled: boolean;
  revision: number;
}

// One LINE config document is shared by both sites, so this section is identical in both settings tabs.
export function LineSettings() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<LineProfile | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ err: boolean; text: string } | null>(null);

  const load = () => getJson('/api/line/settings').then(d => setProfile(d.profile)).catch(e => setStatus({ err: true, text: errMsg(e) }));
  useEffect(() => { if (open && !profile) void load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof LineProfile>(key: K, value: LineProfile[K]) => setProfile(p => (p ? { ...p, [key]: value } : p));

  const run = async (fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      setStatus({ err: false, text: await fn() });
    } catch (e) {
      setStatus({ err: true, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(async () => {
    if (!profile) return '';
    // An empty token field means "keep the stored token"; sending '' would erase it server-side.
    await sendJson('/api/line/settings', 'PATCH', {
      ...(token.trim() ? { channelAccessToken: token.trim() } : {}),
      defaultTargetId: profile.defaultTargetId,
      attendanceTargetId: profile.attendanceTargetId,
      truckTargetId: profile.truckTargetId,
      dailySummaryEnabled: profile.dailySummaryEnabled,
      expectedRevision: profile.revision
    });
    setToken('');
    await load();
    return 'บันทึกการตั้งค่า LINE แล้ว';
  });

  const test = () => run(async () => {
    await sendJson('/api/line/notify', 'POST', { scope: 'both', isTest: true });
    return 'ส่งข้อความทดสอบเข้า LINE แล้ว';
  });

  return (
    <div className={styles.collapsibleSection}>
      <button type="button" aria-expanded={open} className={styles.sectionHeader} onClick={() => setOpen(!open)}>
        <span>การแจ้งเตือน LINE รายวัน</span>
        {open ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
      </button>
      {open && (
        <div className={styles.sectionBody}>
          {!profile ? <p role="status">{status?.text || 'กำลังโหลด...'}</p> : (
            <>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="line-token">Channel Access Token</label>
                <input id="line-token" type="password" autoComplete="off" className={styles.formInput} value={token}
                  placeholder={profile.channelAccessTokenMasked || 'วางโทเคนจาก LINE Developers'} onChange={e => setToken(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="line-default">User ID / Group ID ปลายทาง (ใช้ร่วมกัน)</label>
                <input id="line-default" className={styles.formInput} value={profile.defaultTargetId} onChange={e => set('defaultTargetId', e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="line-att">ปลายทางเฉพาะเช็คชื่อ (ไม่บังคับ)</label>
                <input id="line-att" className={styles.formInput} value={profile.attendanceTargetId} onChange={e => set('attendanceTargetId', e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="line-truck">ปลายทางเฉพาะรถสิบล้อ (ไม่บังคับ)</label>
                <input id="line-truck" className={styles.formInput} value={profile.truckTargetId} onChange={e => set('truckTargetId', e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', minHeight: '2.75rem' }}>
                  <input type="checkbox" style={{ width: '1.4rem', height: '1.4rem' }} checked={profile.dailySummaryEnabled}
                    onChange={e => set('dailySummaryEnabled', e.target.checked)} />
                  ส่งสรุปอัตโนมัติทุกวัน 19:00 น.
                </label>
              </div>
              <div style={{ display: 'grid', gap: '.6rem' }}>
                <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy} aria-busy={busy}>บันทึกการตั้งค่า LINE</button>
                <button type="button" className={styles.secondaryBtn} onClick={test} disabled={busy}>ทดสอบส่งข้อความ</button>
              </div>
              <div role="status" style={{ minHeight: '1.6rem', marginTop: '.5rem', color: status?.err ? 'var(--team-absent)' : 'var(--team-full)', fontSize: 'var(--team-secondary)' }}>
                {status?.text}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
