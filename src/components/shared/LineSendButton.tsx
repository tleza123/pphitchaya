'use client';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { errMsg, sendJson } from '@/components/truck/api';

// Sends today's summary for ONE site; scope keeps each web's button from messaging the other site.
export function LineSendButton({ scope, className }: { scope: 'attendance' | 'truck'; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ err: boolean; text: string } | null>(null);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await sendJson('/api/line/notify', 'POST', { scope });
      setStatus({ err: false, text: 'ส่งสรุปวันนี้เข้า LINE แล้ว' });
    } catch (e) {
      setStatus({ err: true, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" className={className} onClick={send} disabled={busy} aria-busy={busy}>
        <Send size={18} aria-hidden="true" style={{ marginRight: '.5rem', verticalAlign: '-3px' }} />
        {busy ? 'กำลังส่ง...' : 'ส่งสรุปวันนี้เข้า LINE'}
      </button>
      <div role="status" style={{ minHeight: '1.5rem', fontSize: 'var(--team-secondary)', color: status?.err ? 'var(--team-absent)' : 'var(--team-full)' }}>
        {status?.text}
      </div>
    </div>
  );
}
