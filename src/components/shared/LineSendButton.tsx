'use client';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { errMsg, sendJson } from '@/components/truck/api';

// Sends today's summary for ONE site; scope keeps each web's button from messaging the other site.
export function LineSendButton({ scope, className = '' }: { scope: 'attendance' | 'truck'; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ err: boolean; text: string } | null>(null);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await sendJson('/api/line/notify', 'POST', { scope });
      setStatus({ err: false, text: 'ส่งสรุปวันนี้ทาง LINE แล้ว' });
    } catch (e) {
      setStatus({ err: true, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        className={`btn btn-line btn-block ${className}`.trim()}
        onClick={send}
        disabled={busy}
        aria-busy={busy}
      >
        <Send size={19} aria-hidden="true" />
        <span>{busy ? 'กำลังส่ง…' : 'ส่งสรุปวันนี้ทาง LINE'}</span>
      </button>
      {status?.text && (
        <div
          role="status"
          style={{
            fontSize: 'var(--team-secondary)',
            color: status.err ? 'var(--team-absent)' : 'var(--team-full)',
            fontWeight: 700,
            marginTop: '0.4rem'
          }}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}
