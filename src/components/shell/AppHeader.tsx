'use client';

import React from 'react';
import { ATTENDANCE_NAV, TabType } from './BottomNav';
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
          <nav className={styles.desktopNav} aria-label="เมนูหลัก">
            {ATTENDANCE_NAV.map(({ tab, label, Icon }) => (
              <button
                key={tab}
                type="button"
                aria-current={activeTab === tab ? 'page' : undefined}
                className={`${styles.desktopNavBtn} ${activeTab === tab ? styles.desktopNavBtnActive : ''}`}
                onClick={() => onChangeTab(tab)}
                onPointerEnter={() => onPrepareTab?.(tab)}
                onPointerDown={() => onPrepareTab?.(tab)}
                onFocus={() => onPrepareTab?.(tab)}
              >
                <Icon className={styles.desktopNavIcon} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
