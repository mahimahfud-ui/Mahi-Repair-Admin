import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseCookieOptions } from '@/lib/supabase/cookie-options';

export async function createClient() {
  const cookieStore = await cookies();
  // Dynamic access keeps Cloud Run runtime configuration from being inlined
  // into a browser bundle. These are publishable project values only.
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Admin authentication is temporarily unavailable.');

  return createServerClient(url, key, {
    cookieOptions: supabaseCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes sessions.
        }
      },
    },
  });
}
