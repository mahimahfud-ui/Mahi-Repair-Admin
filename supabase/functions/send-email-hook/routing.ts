export type OwnerMagicLinkRoute = {
  action: string;
  redirectTo: string;
  adminOrigin: string;
};

/** Only the standalone Admin callback receives a clickable Owner Magic Link. */
export function isOwnerMagicLinkRoute({ action, redirectTo, adminOrigin }: OwnerMagicLinkRoute): boolean {
  if (action.trim().toLowerCase() !== 'magiclink' || !redirectTo || !adminOrigin) return false;
  try {
    const target = new URL(redirectTo);
    const admin = new URL(adminOrigin);
    return target.origin === admin.origin && target.pathname === '/auth/callback';
  } catch {
    return false;
  }
}
