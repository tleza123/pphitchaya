import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/features/auth/AuthContext';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'เช็กชื่อพนักงานและบันทึกงานรถสิบล้อ',
  description: 'เช็กชื่อพนักงาน สรุปค่าจ้าง และบันทึกงานรถสิบล้อ'
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
