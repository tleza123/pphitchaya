import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ระบบบันทึกงานรถสิบล้อ',
  description: 'บันทึกเที่ยววิ่ง สรุปค่าเที่ยว วางบิล และรายงานรถสิบล้อ'
};

export default function TruckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
