'use client';

import React from 'react';
import { ClipboardCheck, ChartNoAxesCombined, Settings as SettingsIcon } from 'lucide-react';
import { TabType } from './BottomNav';
import styles from './shell.module.css';

interface AppHeaderProps {
  shopName?: string;
  isClosed?: boolean;
  activeTab?: TabType;
  onChangeTab?: (tab: TabType) => void;
}

export function AppHeader({
  shopName = 'DE TEAM',
  isClosed = false,
  activeTab = 'attendance',
  onChangeTab
}: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.headerLeft}>
          <div className={styles.brand}>
            DE <span>TEAM</span>
          </div>
          <div className={styles.shopName}>
            {shopName}
            {isClosed && ' · ปิดรอบเดือนแล้ว'}
          </div>
        </div>

        {onChangeTab && (
          <nav className={styles.desktopNav} aria-label="เมนูหลักสำหรับคอมพิวเตอร์">
            <button
              type="button"
              className={`${styles.desktopNavBtn} ${activeTab === 'attendance' ? styles.desktopNavBtnActive : ''}`}
              onClick={() => onChangeTab('attendance')}
            >
              <ClipboardCheck className={styles.desktopNavIcon} aria-hidden="true" />
              <span>เช็คชื่อ</span>
            </button>
            <button
              type="button"
              className={`${styles.desktopNavBtn} ${activeTab === 'reports' ? styles.desktopNavBtnActive : ''}`}
              onClick={() => onChangeTab('reports')}
            >
              <ChartNoAxesCombined className={styles.desktopNavIcon} aria-hidden="true" />
              <span>รายงาน</span>
            </button>
            <button
              type="button"
              className={`${styles.desktopNavBtn} ${activeTab === 'settings' ? styles.desktopNavBtnActive : ''}`}
              onClick={() => onChangeTab('settings')}
            >
              <SettingsIcon className={styles.desktopNavIcon} aria-hidden="true" />
              <span>ตั้งค่า</span>
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
