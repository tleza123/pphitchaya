import { createClient } from '@supabase/supabase-js';

export function getSupabaseBrowserClient() {
  return createClient(
    // Next prerenders client components during a build. Placeholders keep that
    // build deterministic; deployment configuration is still required to sign in.
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://unconfigured.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'unconfigured',
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
}
