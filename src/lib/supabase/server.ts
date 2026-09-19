import 'server-only';
import { createClient } from '@supabase/supabase-js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/** Server-only client. The secret key bypasses RLS and must never reach the browser. */
export function getSupabaseAdmin() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Missing SUPABASE_SECRET_KEY');
  return createClient(required('NEXT_PUBLIC_SUPABASE_URL'), secret, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export function getSupabaseAuthClient(accessToken: string) {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } }
  );
}
