/**
 * The Admin Panel uses server actions for sign-in, so auth cookies need not be
 * readable by browser JavaScript. Scope them to this host and application path.
 */
export const supabaseCookieOptions = {
  path: '/',
  sameSite: 'lax' as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
};
