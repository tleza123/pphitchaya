'use client';

import React from 'react';
import { ClipboardCheck, ChartNoAxesCombined, Settings as SettingsIcon } from 'lucide-react';
import styles from './shell.module.css';

export type TabType = 'attendance' | 'reports' | 'settings';

export const ATTENDANCE_NAV = [
  { tab: 'attendance', label: 'เช็กชื่อ', Icon: ClipboardCheck },
  { tab: 'reports', label: 'รายงาน', Icon: ChartNoAxesCombined },
  { tab: 'settings', label: 'ตั้งค่า', Icon: SettingsIcon }
] as const;

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  onPrepareTab?: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onChangeTab, onPrepareTab }: BottomNavProps) {
  return (
    <nav className={styles.nav} aria-label="เมนูหลัก">
      {ATTENDANCE_NAV.map(({ tab, label, Icon }) => (
        <button
          key={tab}
          type="button"
          className={`${styles.navBtn} ${activeTab === tab ? styles.navBtnActive : ''}`}
          aria-current={activeTab === tab ? 'page' : undefined}
          onClick={() => onChangeTab(tab)}
          onPointerEnter={() => onPrepareTab?.(tab)}
          onPointerDown={() => onPrepareTab?.(tab)}
          onFocus={() => onPrepareTab?.(tab)}
        >
          <Icon className={styles.navIcon} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
