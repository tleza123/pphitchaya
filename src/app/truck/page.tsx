import TruckShell from '@/components/truck/TruckShell';
import Link from 'next/link';

export default function TruckPage() {
  return <><div style={{display:'flex',gap:12,justifyContent:'flex-end',padding:'10px 20px'}}><Link href="/truck/billing">วางบิลและรับชำระ</Link></div><TruckShell initialTab="record" /></>;
}
