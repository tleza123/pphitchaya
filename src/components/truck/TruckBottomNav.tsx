'use client';
import { ChartNoAxesCombined, ClipboardList, Settings as SettingsIcon } from 'lucide-react';
import styles from '@/components/shell/shell.module.css';

export type TruckTab = 'record' | 'reports' | 'settings';

const NAV = [
  { tab: 'record', label: 'บันทึกงาน', Icon: ClipboardList },
  { tab: 'reports', label: 'รายงาน', Icon: ChartNoAxesCombined },
  { tab: 'settings', label: 'ตั้งค่า', Icon: SettingsIcon }
] as const;

export function TruckBottomNav({ activeTab, onChangeTab }: { activeTab: TruckTab; onChangeTab: (tab: TruckTab) => void }) {
  return (
    <nav className={styles.nav} aria-label="เมนูหลัก">
      {NAV.map(({ tab, label, Icon }) => (
        <button
          key={tab}
          type="button"
          aria-current={activeTab === tab ? 'page' : undefined}
          className={`${styles.navBtn} ${activeTab === tab ? styles.navBtnActive : ''}`}
          onClick={() => onChangeTab(tab)}
        >
          <Icon className={styles.navIcon} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
