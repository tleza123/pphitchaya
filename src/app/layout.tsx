import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/features/auth/AuthContext';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'DE TEAM — ระบบเช็คชื่อและสรุปค่าจ้าง',
  description: 'ระบบเช็คชื่อพนักงานและคำนวณค่าจ้างรายเดือนสำหรับเจ้าของกิจการ'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
