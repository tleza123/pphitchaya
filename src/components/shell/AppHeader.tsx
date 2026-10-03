'use client';

import React from 'react';
import { ClipboardCheck, ChartNoAxesCombined, Settings as SettingsIcon } from 'lucide-react';
import { TabType } from './BottomNav';
import styles from './shell.module.css';
import { DEFAULT_SHOP_NAME, displayShopName } from '@/lib/shop-name';

interface AppHeaderProps {
  shopName?: string;
  isClosed?: boolean;
  activeTab?: TabType;
  onChangeTab?: (tab: TabType) => void;
  onPrepareTab?: (tab: TabType) => void;
}

export function AppHeader({
  shopName = DEFAULT_SHOP_NAME,
  isClosed = false,
  activeTab = 'attendance',
  onChangeTab,
  onPrepareTab
}: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.headerLeft}>
          <div className={styles.shopName}>
            {displayShopName(shopName)}
            {isClosed && ' · ปิดรอบเดือนแล้ว'}
          </div>
        </div>

        {onChangeTab && (
          <nav className={styles.desktopNav} aria-label="เมนูหลักสำหรับคอมพิวเตอร์">
            <button
              type="button"
              className={`${styles.desktopNavBtn} ${activeTab === 'attendance' ? styles.desktopNavBtnActive : ''}`}
              onClick={() => onChangeTab('attendance')}
              onPointerEnter={() => onPrepareTab?.('attendance')}
              onPointerDown={() => onPrepareTab?.('attendance')}
              onFocus={() => onPrepareTab?.('attendance')}
            >
              <ClipboardCheck className={styles.desktopNavIcon} aria-hidden="true" />
              <span>เช็คชื่อ</span>
            </button>
            <button
              type="button"
              className={`${styles.desktopNavBtn} ${activeTab === 'reports' ? styles.desktopNavBtnActive : ''}`}
              onClick={() => onChangeTab('reports')}
              onPointerEnter={() => onPrepareTab?.('reports')}
              onPointerDown={() => onPrepareTab?.('reports')}
              onFocus={() => onPrepareTab?.('reports')}
            >
              <ChartNoAxesCombined className={styles.desktopNavIcon} aria-hidden="true" />
              <span>รายงาน</span>
            </button>
            <button
              type="button"
              className={`${styles.desktopNavBtn} ${activeTab === 'settings' ? styles.desktopNavBtnActive : ''}`}
              onClick={() => onChangeTab('settings')}
              onPointerEnter={() => onPrepareTab?.('settings')}
              onPointerDown={() => onPrepareTab?.('settings')}
              onFocus={() => onPrepareTab?.('settings')}
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
