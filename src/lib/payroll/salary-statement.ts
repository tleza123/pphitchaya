import { AnalyticsMonth } from './analytics';
import { formatMoney } from './money';
import { formatThaiDate } from './dates';

export interface SalaryLine { date: string; label: string; satang: number }
export function salaryLines(report: AnalyticsMonth) {
  const income: SalaryLine[] = [], advances: SalaryLine[] = [], deductions: SalaryLine[] = [];
  const groups = new Map<string, { count: number; amount: number; rate: number; half: boolean }>();
  for (const day of report.days) {
    if (day.status === 'FULL' || day.status === 'HALF') {
      const half = day.status === 'HALF', rate = day.dailySatang || 0, key = `${day.status}:${rate}`;
      const group = groups.get(key) || { count: 0, amount: 0, rate, half };
      group.count++; group.amount += day.amountSatang || 0; groups.set(key, group);
    }
    const date = formatThaiDate(day.dateKey, { day: 'numeric', month: 'short', year: 'numeric' });
    if (day.advanceSatang) advances.push({ date, label: 'เบิกเงินล่วงหน้า', satang: day.advanceSatang });
    if (day.deductionSatang) deductions.push({ date, label: 'หักเงินรายวัน', satang: day.deductionSatang });
  }
  for (const group of groups.values()) income.push({ date: 'ทั้งเดือน', label:
    `ค่าแรง${group.half ? 'ครึ่งวัน' : 'เต็มวัน'} ${group.count} วัน วันละ ${formatMoney(group.half ? Math.floor((group.rate + 1) / 2) : group.rate)}`, satang: group.amount });
  const sum = (rows: SalaryLine[]) => rows.reduce((total, row) => total + row.satang, 0);
  // Historical snapshots may retain authoritative totals without every dated detail.
  if (sum(income) !== report.baseSatang) {
    income.splice(0, income.length, { date: 'ทั้งเดือน', label: 'ค่าแรงตามยอดรายงาน', satang: report.baseSatang });
  }
  for (const extra of report.extras) (extra.type === 'DEDUCTION' ? deductions : income).push({
    date: 'ประจำเดือน', label: extra.label, satang: extra.amountSatang });
  const reconcile = (rows: SalaryLine[], total: number, label: string) => {
    if (!Number.isSafeInteger(total) || rows.some(row => !Number.isSafeInteger(row.satang) || row.satang < 0) || sum(rows) > total) throw new Error('รายละเอียดเงินไม่ตรงกับยอดรายงาน');
    if (sum(rows) < total) rows.push({ date: 'ไม่ระบุวันที่', label, satang: total - sum(rows) });
  };
  reconcile(income, report.grossSatang, 'เงินได้ที่ไม่มีรายละเอียดในรายงาน');
  reconcile(advances, report.advanceSatang, 'เงินเบิกที่ไม่มีรายละเอียดวันที่');
  reconcile(deductions, report.deductionSatang, 'เงินหักที่ไม่มีรายละเอียดวันที่');
  if (!Number.isSafeInteger(report.totalSatang) || report.totalSatang !== report.grossSatang - report.advanceSatang - report.deductionSatang) throw new Error('ยอดสุทธิไม่ตรงกับรายงาน');
  return { income, advances, deductions };
}
