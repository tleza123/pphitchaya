'use client';
import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ReceiptText, Wallet } from 'lucide-react';
import styles from '@/components/shell/shell.module.css';
import { TabLoading } from '@/components/shared/TabLoading';
import truckStyles from './truck.module.css';
import { TruckDestinationDoc, TruckDoc, TruckOriginDoc } from '@/lib/truck/types';
import { errMsg, getJson } from './api';
import { TruckBottomNav, TruckTab } from './TruckBottomNav';
import { TruckHeader } from './TruckHeader';

export type { TruckTab };

const loadRecord = () => import('./TruckRecordTab').then(m => m.TruckRecordTab);
const loadReports = () => import('./TruckReportsTab').then(m => m.TruckReportsTab);
const loadDetailed = () => import('./TruckDetailedReports').then(m => m.TruckDetailedReports);
const loadSettings = () => import('./TruckSettingsTab').then(m => m.TruckSettingsTab);

const TruckRecordTab = React.memo(dynamic(loadRecord, { loading: TabLoading }));
const TruckReportsTab = React.memo(dynamic(loadReports, { loading: TabLoading }));
const TruckDetailedReports = React.memo(dynamic(loadDetailed, { loading: TabLoading }));
const TruckSettingsTab = React.memo(dynamic(loadSettings, { loading: TabLoading }));

const TRUCK_LOADERS: Record<TruckTab, () => Promise<unknown>> = {
  record: loadRecord,
  reports: loadReports,
  settings: loadSettings
};

export interface TruckBoot {
  truckProfile: { companyName: string; revision: number; address?: string; phone?: string; taxId?: string };
  trucks: TruckDoc[];
  truckOrigins: TruckOriginDoc[];
  truckDestinations: TruckDestinationDoc[];
  truckDrivers: { driverId: string; name: string; status: string; baseWageSatang?: number; revision?: number }[];
  truckCustomers: { customerId: string; name: string; status: string }[];
  truckLocations: { locationId: string; code: string; name: string; status: string; isShop?: boolean }[];
  truckTariffs: { tariffId: string; originId: string; destinationId: string; customerId: string | null; driverPaySatang: number | null; customerRateSatang: number | null; status: string; generated?: boolean }[];
  serverToday: string;
  monthKey: string;
}

const PATHS: Record<TruckTab, string> = { record: '/truck', reports: '/truck/reports', settings: '/truck/settings' };

function fromPath(path: string): { tab: TruckTab; detailed: boolean } {
  if (path.startsWith('/truck/reports')) return { tab: 'reports', detailed: path === '/truck/reports/detailed' };
  if (path === '/truck/settings') return { tab: 'settings', detailed: false };
  return { tab: 'record', detailed: false };
}

export default function TruckShell({ initialTab, initialDetailed = false }: { initialTab: TruckTab; initialDetailed?: boolean }) {
  const [tab, setTab] = useState<TruckTab>(initialTab);
  const [detailed, setDetailed] = useState(initialDetailed);
  const [visited, setVisited] = useState<Set<TruckTab>>(() => new Set([initialTab]));
  const [mountedDetailed, setMountedDetailed] = useState(initialDetailed);
  const [boot, setBoot] = useState<TruckBoot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [editTarget, setEditTarget] = useState<{ dateKey: string; truckId: string; nonce: number } | null>(null);

  const loadBoot = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([getJson('/api/truck/bootstrap'), getJson('/api/truck/settings')]);
      setBoot({ ...b, ...s });
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => { void loadBoot(); }, [loadBoot]);

  const show = useCallback((next: TruckTab, isDetailed: boolean) => {
    setVisited(v => (v.has(next) ? v : new Set([...v, next])));
    setTab(next);
    setDetailed(isDetailed);
    if (isDetailed) setMountedDetailed(true);
  }, []);

  const go = useCallback((next: TruckTab, isDetailed = false) => {
    const path = isDetailed ? '/truck/reports/detailed' : PATHS[next];
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    show(next, isDetailed);
  }, [show]);

  const prepareTab = useCallback((next: TruckTab) => {
    void TRUCK_LOADERS[next]().catch(() => {});
  }, []);

  useEffect(() => {
    const onPop = () => { const s = fromPath(window.location.pathname); show(s.tab, s.detailed); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [show]);

  const edit = useCallback((dateKey: string, truckId: string) => {
    setEditTarget({ dateKey, truckId, nonce: Date.now() });
    go('record');
  }, [go]);
  const openDetailed = useCallback(() => go('reports', true), [go]);
  const backToReports = useCallback(() => go('reports'), [go]);
  const saved = useCallback(() => setVersion(v => v + 1), []);
  const name = boot?.truckProfile.companyName || 'ระบบบันทึกงานรถสิบล้อ';

  return (
    <div className={styles.appContainer} data-app-theme="truck">
      <TruckHeader name={name} activeTab={tab} onChangeTab={next => go(next)} onPrepareTab={prepareTab} />

      <main className={styles.mainContent}>
        <nav className={truckStyles.docNav} aria-label="เอกสารรถบรรทุก">
          <a className="btn btn-secondary btn-sm" href="/truck/payroll">
            <Wallet size={18} aria-hidden="true" />
            <span>สรุปและปิดรอบค่าเที่ยว</span>
          </a>
          <a className="btn btn-secondary btn-sm" href="/truck/billing">
            <ReceiptText size={18} aria-hidden="true" />
            <span>วางบิลและรับเงิน</span>
          </a>
        </nav>

        {error && (
          <div role="alert" className="app-notice app-notice-danger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span>{error}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadBoot()}>ลองใหม่</button>
          </div>
        )}

        {!boot && !error && <TabLoading />}

        {boot && (
          <>
            <div hidden={tab !== 'record'}>
              {visited.has('record') && <TruckRecordTab active={tab === 'record'} boot={boot} editTarget={editTarget} onSaved={saved} />}
            </div>
            <div hidden={tab !== 'reports'}>
              <div hidden={detailed}>
                {visited.has('reports') && <TruckReportsTab active={tab === 'reports' && !detailed} boot={boot} version={version} onEdit={edit} onOpenDetailed={openDetailed} />}
              </div>
              <div hidden={!detailed}>
                {mountedDetailed && <TruckDetailedReports active={tab === 'reports' && detailed} boot={boot} onBack={backToReports} />}
              </div>
            </div>
            <div hidden={tab !== 'settings'}>
              {visited.has('settings') && <TruckSettingsTab active={tab === 'settings'} boot={boot} onChanged={loadBoot} />}
            </div>
          </>
        )}
      </main>

      <TruckBottomNav activeTab={tab} onChangeTab={next => go(next)} onPrepareTab={prepareTab} />
    </div>
  );
}
