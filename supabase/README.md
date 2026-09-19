# Supabase deployment

1. Create a Supabase project in the same region as the Vercel deployment.
2. In Authentication, enable Google and add `https://pphitchaya.vercel.app/auth/callback` to the redirect URLs.
3. Apply `migrations/202609190001_initial_attendance.sql` in the SQL editor.
4. Create the first Google user by signing in once. In SQL editor, run the following with the actual user UUID:

```sql
insert into public.shops (id, display_name) values ('main', 'DE TEAM') on conflict do nothing;
insert into public.shop_members (shop_id, user_id, role) values ('main', 'USER_UUID', 'owner');
```

5. In Vercel set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `OWNER_UID`, and `SHOP_ID=main`. Keep the secret key server-only. Remove all Firebase variables only after the next deployment is healthy.
