import { describe, expect, it } from 'vitest';
import { isActiveOwnerProfile } from '../src/lib/auth/owner-access';

describe('active Owner access policy', () => {
  it('accepts only an active Owner profile', () => {
    expect(isActiveOwnerProfile({ role: 'owner', status: 'active' })).toBe(true);
  });

  it.each([
    { role: 'member', status: 'active' },
    { role: 'owner', status: 'suspended' },
    { role: 'owner', status: 'revoked' },
    { role: null, status: 'active' },
    null,
    undefined,
  ])('rejects non-Owner or inactive profile %#', (profile) => {
    expect(isActiveOwnerProfile(profile)).toBe(false);
  });
});
