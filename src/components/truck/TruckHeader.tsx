'use client';
import { Truck } from 'lucide-react';
import styles from '@/components/shell/shell.module.css';
import { TRUCK_NAV, TruckTab } from './TruckBottomNav';

export type { TruckTab };

export function TruckHeader({
  name,
  activeTab,
  onChangeTab,
  onPrepareTab
}: {
  name: string;
  activeTab: TruckTab;
  onChangeTab: (tab: TruckTab) => void;
  onPrepareTab?: (tab: TruckTab) => void;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.headerLeft}>
          <div className={styles.shopName}>
            <Truck size={22} aria-hidden="true" />
            <span>{name}</span>
          </div>
        </div>
        <nav className={styles.desktopNav} aria-label="เมนูหลัก">
          {TRUCK_NAV.map(({ tab, label, Icon }) => (
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
      </div>
    </header>
  );
}
