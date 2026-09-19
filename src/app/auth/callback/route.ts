import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Preserve the PKCE code so the browser Supabase client can exchange it for a session.
  const destination = new URL('/', request.url);
  const code = request.nextUrl.searchParams.get('code');
  if (code) destination.searchParams.set('code', code);
  return NextResponse.redirect(destination);
}
