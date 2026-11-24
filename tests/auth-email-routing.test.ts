import { describe, expect, it } from 'vitest';
import { isOwnerMagicLinkRoute } from '../supabase/functions/send-email-hook/routing';

const adminOrigin = 'https://mahi-repair-admin-yy7c.onrender.com';

describe('Owner email delivery routing', () => {
  it('uses a clickable link only for the Owner Admin callback', () => {
    expect(isOwnerMagicLinkRoute({
      action: 'magiclink',
      redirectTo: adminOrigin + '/auth/callback',
      adminOrigin,
    })).toBe(true);
  });

  it.each([
    { action: 'magiclink', redirectTo: 'mahirepair://auth/callback', adminOrigin },
    { action: 'magiclink', redirectTo: 'https://attacker.example/auth/callback', adminOrigin },
    { action: 'invite', redirectTo: adminOrigin + '/auth/callback', adminOrigin },
    { action: 'magiclink', redirectTo: adminOrigin + '/login', adminOrigin },
    { action: 'magiclink', redirectTo: adminOrigin + '/auth/callback', adminOrigin: '' },
  ])('keeps Member OTP / non-Owner requests out of the Owner-link route %#', (input) => {
    expect(isOwnerMagicLinkRoute(input)).toBe(false);
  });
});
