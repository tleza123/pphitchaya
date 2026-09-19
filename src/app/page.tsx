'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { AppHeader } from '@/components/shell/AppHeader';
import { BottomNav, TabType } from '@/components/shell/BottomNav';
import { AttendanceTab } from '@/components/attendance/AttendanceTab';
import { ReportsTab } from '@/components/reports/ReportsTab';
import SettingsTab from '@/components/settings/SettingsTab';
import { getBangkokToday, getBangkokMonth } from '@/lib/payroll/dates';
import styles from '@/components/shell/shell.module.css';

export default function HomePage() {
  const { idToken, user, loading, signIn } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('attendance');
  const [shopName, setShopName] = useState<string>('DE TEAM');

  useEffect(() => {
    fetch('/api/bootstrap', {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}
    })
      .then(res => res.json())
      .then(json => {
        const data = json.data || json;
        const profile = data.profile || data.shop;
        if (profile?.shopName || profile?.displayName) {
          setShopName(profile.shopName || profile.displayName);
        }
      })
      .catch(() => {});
  }, [idToken]);

  const today = getBangkokToday();
  const month = getBangkokMonth();

  if (loading) {
    return <main className={styles.appContainer} aria-busy="true" />;
  }

  if (!user) {
    return (
      <main className={styles.appContainer}>
        <section className={styles.mainContent} style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
          <div>
            <h1>DE TEAM</h1>
            <p>เข้าสู่ระบบเพื่อใช้งานระบบเช็คชื่อและสรุปค่าจ้าง</p>
            <button type="button" onClick={() => void signIn()}>เข้าสู่ระบบด้วย Google</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.appContainer}>
      <AppHeader
        shopName={shopName}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
      />

      <main className={styles.mainContent}>
        {/* In-memory tab display caching to preserve scroll and state without re-render lag */}
        <div style={{ display: activeTab === 'attendance' ? 'block' : 'none' }}>
          <AttendanceTab
            initialDate={today}
            serverToday={today}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        </div>
        <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }}>
          <ReportsTab initialMonth={month} serverToday={today} />
        </div>
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          <SettingsTab onUpdateShopName={setShopName} />
        </div>
      </main>

      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </div>
  );
}

