# Supabase deployment

1. Create a Supabase project in the same region as the Vercel deployment.
2. Apply `migrations/202609190001_initial_attendance.sql` in the SQL editor.
3. Run `insert into public.shops (id, display_name) values ('main', 'DE TEAM') on conflict do nothing;` in the SQL editor.
4. In Vercel set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `SHOP_ID=main`. Keep the secret key server-only. Enable Vercel Password Protection before deployment. Remove Firebase variables only after the next deployment is healthy.
