'use client';
import { useCallback, useRef, useState } from 'react';

/** Keep mutations single-flight and show feedback before the network responds. */
export function usePendingAction() {
  const lock = useRef(false);
  const [pending, setPending] = useState('');
  const run = useCallback(async (label: string, action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setPending(label);
    try { await action(); }
    finally { lock.current = false; setPending(''); }
  }, []);
  return { pending, run };
}
