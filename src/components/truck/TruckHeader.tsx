'use client';
import { ChartNoAxesCombined, ClipboardList, Settings as SettingsIcon, Truck } from 'lucide-react';
import styles from '@/components/shell/shell.module.css';

export type TruckTab = 'record' | 'reports' | 'settings';

const NAV = [
  { tab: 'record', label: 'บันทึกงาน', Icon: ClipboardList },
  { tab: 'reports', label: 'รายงาน', Icon: ChartNoAxesCombined },
  { tab: 'settings', label: 'ตั้งค่า', Icon: SettingsIcon }
] as const;

export function TruckHeader({ name, activeTab, onChangeTab }: { name: string; activeTab: TruckTab; onChangeTab: (tab: TruckTab) => void }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.headerLeft}>
          <div className={styles.shopName}>
            <Truck size={20} aria-hidden="true" style={{ marginRight: '.5rem', verticalAlign: '-3px' }} />
            {name}
          </div>
        </div>
        <nav className={styles.desktopNav} aria-label="เมนูหลักสำหรับคอมพิวเตอร์">
          {NAV.map(({ tab, label, Icon }) => (
            <button
              key={tab}
              type="button"
              aria-current={activeTab === tab ? 'page' : undefined}
              className={`${styles.desktopNavBtn} ${activeTab === tab ? styles.desktopNavBtnActive : ''}`}
              onClick={() => onChangeTab(tab)}
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
