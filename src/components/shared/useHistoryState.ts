'use client';

import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';

// Only navigation identifiers belong in history; payroll data and form values stay in memory.
export function useHistoryState<T extends string | boolean | null>(key: string, initial: T, memoryOnly = false) {
  const [value, setValue] = useState<T>(initial);
  const current = useRef(value);
  const draft = useRef<string | null>(null);
  current.current = value;
  useEffect(() => {
    const restore = () => {
      const state = window.history.state;
      const next = memoryOnly && state?.attendanceDrafts?.[key] !== draft.current
        ? initial : state?.attendanceNavigation?.[key] ?? initial;
      current.current = next;
      setValue(next);
    };
    restore();
    window.addEventListener('popstate', restore);
    window.addEventListener('attendance-navigation', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('attendance-navigation', restore);
    };
  }, [key, initial, memoryOnly]);

  const change = useCallback((action: SetStateAction<T>) => {
    const next = typeof action === 'function' ? action(current.current) : action;
    if (memoryOnly && next === initial) draft.current = null;
    if (next === current.current) return;
    current.current = next;
    setValue(next);
    const state = window.history.state || {};
    const navigation = state.attendanceNavigation || {};
    // A completed async save must not change the page the user has since navigated to.
    if (next === initial && !(key in navigation)) return;
    const updated = { ...state, attendanceOwner: key, attendanceNavigation: { ...navigation, [key]: next } };
    if (memoryOnly && next !== initial) {
      draft.current = crypto.randomUUID();
      updated.attendanceDrafts = { ...state.attendanceDrafts, [key]: draft.current };
    }
    if (next === initial) {
      window.history.replaceState(updated, '');
      if (state.attendanceOwner === key) window.history.back();
    } else if (state.attendanceOwner === key && navigation[key] !== initial && key in navigation) {
      // Changing the person within a detail page is one navigation level, not a new Back step.
      window.history.replaceState(updated, '');
    } else window.history.pushState(updated, '');
  }, [key, initial, memoryOnly]);
  return [value, change] as const;
}
