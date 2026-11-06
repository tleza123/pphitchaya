'use client';
import { useCallback, useEffect, useState } from 'react';
import { ChartNoAxesCombined, ClipboardList, Settings as SettingsIcon, Truck } from 'lucide-react';
import styles from '@/components/shell/shell.module.css';
import { TruckDestinationDoc, TruckDoc, TruckOriginDoc } from '@/lib/truck/types';
import { errMsg, getJson } from './api';
import { TruckDetailedReports } from './TruckDetailedReports';
import { TruckRecordTab } from './TruckRecordTab';
import { TruckReportsTab } from './TruckReportsTab';
import { TruckSettingsTab } from './TruckSettingsTab';

export type TruckTab = 'record' | 'reports' | 'settings';

export interface TruckBoot {
  truckProfile: { companyName: string; revision: number };
  trucks: TruckDoc[];
  truckOrigins: TruckOriginDoc[];
  truckDestinations: TruckDestinationDoc[];
  serverToday: string;
  monthKey: string;
}

const PATHS: Record<TruckTab, string> = { record: '/truck', reports: '/truck/reports', settings: '/truck/settings' };
const NAV = [
  { tab: 'record', label: 'บันทึกงาน', Icon: ClipboardList },
  { tab: 'reports', label: 'รายงาน', Icon: ChartNoAxesCombined },
  { tab: 'settings', label: 'ตั้งค่า', Icon: SettingsIcon }
] as const;

function fromPath(path: string): { tab: TruckTab; detailed: boolean } {
  if (path.startsWith('/truck/reports')) return { tab: 'reports', detailed: path === '/truck/reports/detailed' };
  if (path === '/truck/settings') return { tab: 'settings', detailed: false };
  return { tab: 'record', detailed: false };
}

export default function TruckShell({ initialTab, initialDetailed = false }: { initialTab: TruckTab; initialDetailed?: boolean }) {
  const [tab, setTab] = useState<TruckTab>(initialTab);
  const [detailed, setDetailed] = useState(initialDetailed);
  const [visited, setVisited] = useState<Set<TruckTab>>(() => new Set([initialTab]));
  const [boot, setBoot] = useState<TruckBoot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [editTarget, setEditTarget] = useState<{ dateKey: string; truckId: string; nonce: number } | null>(null);

  const loadBoot = useCallback(async () => {
    try { setBoot(await getJson('/api/truck/bootstrap')); setError(null); } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { void loadBoot(); }, [loadBoot]);

  const show = useCallback((next: TruckTab, isDetailed: boolean) => {
    setVisited(v => (v.has(next) ? v : new Set([...v, next])));
    setTab(next);
    setDetailed(isDetailed);
  }, []);
  // Own history entries only: this shell never touches the attendance app's navigation state.
  const go = useCallback((next: TruckTab, isDetailed = false) => {
    const path = isDetailed ? '/truck/reports/detailed' : PATHS[next];
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    show(next, isDetailed);
  }, [show]);
  useEffect(() => {
    const onPop = () => { const s = fromPath(window.location.pathname); show(s.tab, s.detailed); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [show]);

  const edit = (dateKey: string, truckId: string) => { setEditTarget({ dateKey, truckId, nonce: Date.now() }); go('record'); };
  const saved = useCallback(() => setVersion(v => v + 1), []);
  const name = boot?.truckProfile.companyName || 'ระบบบันทึกงานรถสิบล้อ';

  return (
    <div className={styles.appContainer} data-app-theme="truck">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <div className={styles.shopName}><Truck size={20} aria-hidden="true" style={{ marginRight: '.5rem', verticalAlign: '-3px' }} />{name}</div>
          </div>
          <nav className={styles.desktopNav} aria-label="เมนูหลักสำหรับคอมพิวเตอร์">
            {NAV.map(({ tab: t, label, Icon }) => (
              <button key={t} type="button" aria-current={tab === t ? 'page' : undefined} className={`${styles.desktopNavBtn} ${tab === t ? styles.desktopNavBtnActive : ''}`} onClick={() => go(t)}>
                <Icon className={styles.desktopNavIcon} aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className={styles.mainContent}>
        {error && <div role="alert" style={{ color: 'var(--team-absent)' }}>{error} <button type="button" onClick={() => void loadBoot()}>ลองใหม่</button></div>}
        {!boot && !error && (
          <div aria-busy="true" aria-label="กำลังเปิดหน้า" className="tabLoading">
            {[0, 1, 2].map(i => <div className="loadingCard" key={i}><span className="loadingLine" /><span className="loadingLine" /></div>)}
          </div>
        )}
        {boot && (
          <>
            <div hidden={tab !== 'record'}>
              {visited.has('record') && <TruckRecordTab active={tab === 'record'} boot={boot} editTarget={editTarget} onSaved={saved} />}
            </div>
            <div hidden={tab !== 'reports'}>
              <div hidden={detailed}>
                {visited.has('reports') && <TruckReportsTab active={tab === 'reports' && !detailed} boot={boot} version={version} onEdit={edit} onOpenDetailed={() => go('reports', true)} />}
              </div>
              <div hidden={!detailed}>
                {visited.has('reports') && <TruckDetailedReports active={tab === 'reports' && detailed} boot={boot} onBack={() => go('reports')} />}
              </div>
            </div>
            <div hidden={tab !== 'settings'}>
              {visited.has('settings') && <TruckSettingsTab active={tab === 'settings'} boot={boot} onChanged={loadBoot} />}
            </div>
          </>
        )}
      </main>

      <nav className={styles.nav} aria-label="เมนูหลัก">
        {NAV.map(({ tab: t, label, Icon }) => (
          <button key={t} type="button" aria-current={tab === t ? 'page' : undefined} className={`${styles.navBtn} ${tab === t ? styles.navBtnActive : ''}`} onClick={() => go(t)}>
            <Icon className={styles.navIcon} aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
