'use client';

import React from 'react';
import { ClipboardCheck, ChartNoAxesCombined, Settings as SettingsIcon } from 'lucide-react';
import styles from './shell.module.css';

export type TabType = 'attendance' | 'reports' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onChangeTab }: BottomNavProps) {
  return (
    <nav className={styles.nav} aria-label="เมนูหลัก">
      <button
        type="button"
        className={`${styles.navBtn} ${activeTab === 'attendance' ? styles.navBtnActive : ''}`}
        aria-current={activeTab === 'attendance' ? 'page' : undefined}
        onClick={() => onChangeTab('attendance')}
      >
        <ClipboardCheck className={styles.navIcon} aria-hidden="true" />
        <span>เช็คชื่อ</span>
      </button>

      <button
        type="button"
        className={`${styles.navBtn} ${activeTab === 'reports' ? styles.navBtnActive : ''}`}
        aria-current={activeTab === 'reports' ? 'page' : undefined}
        onClick={() => onChangeTab('reports')}
      >
        <ChartNoAxesCombined className={styles.navIcon} aria-hidden="true" />
        <span>รายงาน</span>
      </button>

      <button
        type="button"
        className={`${styles.navBtn} ${activeTab === 'settings' ? styles.navBtnActive : ''}`}
        aria-current={activeTab === 'settings' ? 'page' : undefined}
        onClick={() => onChangeTab('settings')}
      >
        <SettingsIcon className={styles.navIcon} aria-hidden="true" />
        <span>ตั้งค่า</span>
      </button>
    </nav>
  );
}
