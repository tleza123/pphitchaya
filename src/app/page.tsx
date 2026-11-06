import Link from 'next/link';

export default function AttendancePage() {
  return <main style={{ maxWidth: 560, margin: '10vh auto', padding: 24 }}><h1>เลือกระบบ</h1><nav style={{ display: 'grid', gap: 16 }}><Link href="/attendance">เช็กชื่อพนักงาน</Link><Link href="/truck">ระบบรถบรรทุก</Link></nav></main>;
}
