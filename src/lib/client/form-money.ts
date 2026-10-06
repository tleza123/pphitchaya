import { moneySatang } from '@/lib/payroll/money';

export function optionalMoney(text: string): number {
  return text.trim() === '' ? 0 : moneySatang(text.trim());
}

export function employeeExtraTemplates(rows: Array<{ name: string; amount: string }>) {
  return rows.filter(row => row.name.trim() || row.amount.trim()).map(row => {
    if (!row.name.trim()) throw new Error('กรุณาระบุชื่อรายการเงินพิเศษ');
    const amountSatang = moneySatang(row.amount.trim());
    if (amountSatang === 0) throw new Error('จำนวนเงินพิเศษต้องมากกว่า 0');
    return { name: row.name.trim(), label: row.name.trim(), amountSatang };
  });
}
