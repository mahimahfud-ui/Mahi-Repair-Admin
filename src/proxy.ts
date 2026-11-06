import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseCookieOptions } from '@/lib/supabase/cookie-options';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookieOptions: supabaseCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Validates/refreshes the Supabase session; authorization is checked again
  // against the active database Owner profile by protected layouts/actions.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!api/health|_next/static|_next/image|favicon.ico).*)'],
};
