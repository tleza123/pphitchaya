'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/features/auth/AuthContext';
import { AppHeader } from '@/components/shell/AppHeader';
import { BottomNav, TabType } from '@/components/shell/BottomNav';
import { getBangkokToday, getBangkokMonth } from '@/lib/payroll/dates';
import styles from '@/components/shell/shell.module.css';
import { DEFAULT_SHOP_NAME, displayShopName } from '@/lib/shop-name';

const loadAttendance = () => import('@/components/attendance/AttendanceTab').then(module => module.AttendanceTab);
const loadReports = () => import('@/components/reports/ReportsTab').then(module => module.ReportsTab);
const loadSettings = () => import('@/components/settings/SettingsTab');
const DetailedReports = React.memo(dynamic(() => import('@/components/reports/DetailedReports'), { loading: TabLoading }));
function TabLoading() {
  return <div aria-busy="true" aria-label="กำลังเปิดหน้า" className="tabLoading">
    {[0, 1, 2].map(index => <div className="loadingCard" key={index}><span className="loadingLine" /><span className="loadingLine" /></div>)}
  </div>;
}
const AttendanceTab = React.memo(dynamic(loadAttendance, { loading: TabLoading }));
const ReportsTab = React.memo(dynamic(loadReports, { loading: TabLoading }));
const SettingsTab = React.memo(dynamic(loadSettings, { loading: TabLoading }));
const TAB_LOADERS = { attendance: loadAttendance, reports: loadReports, settings: loadSettings };

const TAB_PATHS: Record<TabType, string> = {
  attendance: '/',
  reports: '/reports',
  settings: '/settings'
};

function tabFromPath(path: string): TabType {
  if (path === '/reports' || path === '/reports/detailed') return 'reports';
  if (path === '/settings') return 'settings';
  return 'attendance';
}

export default function AppShell({ initialTab, initialDetailedReports = false }: { initialTab: TabType; initialDetailedReports?: boolean }) {
  const { idToken } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [mountedTabs, setMountedTabs] = useState<Set<TabType>>(() => new Set([initialTab]));
  const [shopName, setShopName] = useState<string>(DEFAULT_SHOP_NAME);
  const [attendanceVersion, setAttendanceVersion] = useState(0);
  const [detailedReports, setDetailedReports] = useState(initialDetailedReports);
  const [mountedDetailedReports, setMountedDetailedReports] = useState(initialDetailedReports);

  useEffect(() => {
    fetch('/api/settings', {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}
    })
      .then(res => res.json())
      .then(json => {
        const data = json.data || json;
        const profile = data.profile || data.shop;
        if (profile?.shopName || profile?.displayName) {
          setShopName(displayShopName(profile.shopName || profile.displayName));
        }
      })
      .catch(() => {});
  }, [idToken]);

  const today = getBangkokToday();
  const month = getBangkokMonth();
  const showTab = useCallback((tab: TabType, detailed = false) => {
    setMountedTabs(previous => previous.has(tab) ? previous : new Set([...previous, tab]));
    setActiveTab(tab);
    setDetailedReports(detailed);
    if (detailed) setMountedDetailedReports(true);
  }, []);
  const changeTab = useCallback((tab: TabType) => {
    if (window.location.pathname !== TAB_PATHS[tab] || Object.values(window.history.state?.attendanceNavigation || {}).some(Boolean)) {
      window.history.pushState({}, '', TAB_PATHS[tab]);
    }
    window.dispatchEvent(new Event('attendance-navigation'));
    showTab(tab);
  }, [showTab]);
  const prepareTab = useCallback((tab: TabType) => {
    // Load code on interaction intent without reading or caching financial data.
    void TAB_LOADERS[tab]().catch(() => {});
  }, []);
  const navigateToSettings = useCallback(() => changeTab('settings'), [changeTab]);
  const notifyAttendanceChanged = useCallback(() => setAttendanceVersion(version => version + 1), []);
  const openDetailedReports = useCallback(() => {
    if (window.location.pathname !== '/reports/detailed') window.history.pushState({ attendanceParent: window.location.pathname }, '', '/reports/detailed');
    window.dispatchEvent(new Event('attendance-navigation'));
    showTab('reports', true);
  }, [showTab]);
  const backToReports = useCallback(() => {
    if (window.history.state?.attendanceParent === '/reports') window.history.back();
    else changeTab('reports');
  }, [changeTab]);

  useEffect(() => {
    // Transient forms cannot be restored on reload without their in-memory drafts.
    window.history.replaceState({ ...window.history.state, attendanceNavigation: {} }, '');
    window.dispatchEvent(new Event('attendance-navigation'));
    const restoreTab = () => showTab(tabFromPath(window.location.pathname), window.location.pathname === '/reports/detailed');
    window.addEventListener('popstate', restoreTab);
    return () => window.removeEventListener('popstate', restoreTab);
  }, [showTab]);

  return (
    <div className={styles.appContainer}>
      <AppHeader
        shopName={shopName}
        activeTab={activeTab}
        onChangeTab={changeTab}
        onPrepareTab={prepareTab}
      />

      <main className={styles.mainContent}>
        {/* In-memory tab display caching to preserve scroll and state without re-render lag */}
        <div style={{ display: activeTab === 'attendance' ? 'block' : 'none' }}>
          {mountedTabs.has('attendance') && <AttendanceTab
            active={activeTab === 'attendance'}
            initialDate={today}
            serverToday={today}
            onNavigateToSettings={navigateToSettings}
            onAttendanceChanged={notifyAttendanceChanged}
          />}
        </div>
        <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }}>
          <div style={{ display: detailedReports ? 'none' : 'block' }}>
            {mountedTabs.has('reports') && <ReportsTab active={activeTab === 'reports' && !detailedReports} attendanceVersion={attendanceVersion} initialMonth={month} serverToday={today} onOpenDetailedReports={openDetailedReports} />}
          </div>
          <div style={{ display: detailedReports ? 'block' : 'none' }}>
            {mountedDetailedReports && <DetailedReports active={activeTab === 'reports' && detailedReports} attendanceVersion={attendanceVersion} onBack={backToReports} />}
          </div>
        </div>
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          {mountedTabs.has('settings') && <SettingsTab active={activeTab === 'settings'} onUpdateShopName={setShopName} />}
        </div>
      </main>

      <BottomNav activeTab={activeTab} onChangeTab={changeTab} onPrepareTab={prepareTab} />
    </div>
  );
}

