'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { AppHeader } from '@/components/shell/AppHeader';
import { BottomNav, TabType } from '@/components/shell/BottomNav';
import { AttendanceTab } from '@/components/attendance/AttendanceTab';
import { ReportsTab } from '@/components/reports/ReportsTab';
import SettingsTab from '@/components/settings/SettingsTab';
import { getBangkokToday, getBangkokMonth } from '@/lib/payroll/dates';
import styles from '@/components/shell/shell.module.css';
import { DEFAULT_SHOP_NAME, displayShopName } from '@/lib/shop-name';

const MemoAttendanceTab = React.memo(AttendanceTab);
const MemoReportsTab = React.memo(ReportsTab);
const MemoSettingsTab = React.memo(SettingsTab);

export default function HomePage() {
  const { idToken } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('attendance');
  const [mountedTabs, setMountedTabs] = useState<Set<TabType>>(() => new Set(['attendance']));
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
  const changeTab = useCallback((tab: TabType) => {
    setMountedTabs(previous => previous.has(tab) ? previous : new Set([...previous, tab]));
    setActiveTab(tab);
  }, []);
  const navigateToSettings = useCallback(() => changeTab('settings'), [changeTab]);

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
          <MemoAttendanceTab
            initialDate={today}
            serverToday={today}
            onNavigateToSettings={navigateToSettings}
          />
        </div>
        <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }}>
          {mountedTabs.has('reports') && <MemoReportsTab initialMonth={month} serverToday={today} />}
        </div>
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          {mountedTabs.has('settings') && <MemoSettingsTab onUpdateShopName={setShopName} />}
        </div>
      </main>

      <BottomNav activeTab={activeTab} onChangeTab={changeTab} />
    </div>
  );
}

