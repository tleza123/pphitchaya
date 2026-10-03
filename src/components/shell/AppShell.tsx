'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/features/auth/AuthContext';
import { AppHeader } from '@/components/shell/AppHeader';
import { BottomNav, TabType } from '@/components/shell/BottomNav';
import { getBangkokToday, getBangkokMonth } from '@/lib/payroll/dates';
import styles from '@/components/shell/shell.module.css';
import { DEFAULT_SHOP_NAME, displayShopName } from '@/lib/shop-name';

const AttendanceTab = React.memo(dynamic(() => import('@/components/attendance/AttendanceTab').then(module => module.AttendanceTab)));
const ReportsTab = React.memo(dynamic(() => import('@/components/reports/ReportsTab').then(module => module.ReportsTab)));
const SettingsTab = React.memo(dynamic(() => import('@/components/settings/SettingsTab')));

const TAB_PATHS: Record<TabType, string> = {
  attendance: '/',
  reports: '/reports',
  settings: '/settings'
};

function tabFromPath(path: string): TabType {
  if (path === '/reports') return 'reports';
  if (path === '/settings') return 'settings';
  return 'attendance';
}

export default function AppShell({ initialTab }: { initialTab: TabType }) {
  const { idToken } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [mountedTabs, setMountedTabs] = useState<Set<TabType>>(() => new Set([initialTab]));
  const [shopName, setShopName] = useState<string>(DEFAULT_SHOP_NAME);

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
  const showTab = useCallback((tab: TabType) => {
    setMountedTabs(previous => previous.has(tab) ? previous : new Set([...previous, tab]));
    setActiveTab(tab);
  }, []);
  const changeTab = useCallback((tab: TabType) => {
    if (window.location.pathname !== TAB_PATHS[tab]) {
      window.history.pushState({}, '', TAB_PATHS[tab]);
    }
    showTab(tab);
  }, [showTab]);
  const navigateToSettings = useCallback(() => changeTab('settings'), [changeTab]);

  useEffect(() => {
    const restoreTab = () => showTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', restoreTab);
    return () => window.removeEventListener('popstate', restoreTab);
  }, [showTab]);

  return (
    <div className={styles.appContainer}>
      <AppHeader
        shopName={shopName}
        activeTab={activeTab}
        onChangeTab={changeTab}
      />

      <main className={styles.mainContent}>
        {/* In-memory tab display caching to preserve scroll and state without re-render lag */}
        <div style={{ display: activeTab === 'attendance' ? 'block' : 'none' }}>
          {mountedTabs.has('attendance') && <AttendanceTab
            initialDate={today}
            serverToday={today}
            onNavigateToSettings={navigateToSettings}
          />}
        </div>
        <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }}>
          {mountedTabs.has('reports') && <ReportsTab initialMonth={month} serverToday={today} />}
        </div>
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          {mountedTabs.has('settings') && <SettingsTab onUpdateShopName={setShopName} />}
        </div>
      </main>

      <BottomNav activeTab={activeTab} onChangeTab={changeTab} />
    </div>
  );
}

