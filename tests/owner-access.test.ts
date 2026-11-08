import { describe, expect, it } from 'vitest';
import { isActiveOwnerProfile, isConfiguredActiveOwner } from '../src/lib/auth/owner-access';

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

describe('configured Owner identity policy', () => {
  const activeOwner = { role: 'owner', status: 'active' };

  it('requires the authenticated email to match the configured Owner identity', () => {
    expect(isConfiguredActiveOwner('mahinmhfd@gmail.com', 'mahinmhfd@gmail.com', activeOwner)).toBe(true);
    expect(isConfiguredActiveOwner('MAHINMHFD@gmail.com', 'mahinmhfd@gmail.com', activeOwner)).toBe(true);
  });

  it.each([
    ['mahimahfud@gmail.com', 'mahinmhfd@gmail.com', activeOwner],
    ['mahinmhfd@gmail.com', 'owner@example.com', activeOwner],
    ['mahinmhfd@gmail.com', undefined, activeOwner],
    ['not-an-email', 'mahinmhfd@gmail.com', activeOwner],
    ['mahinmhfd@gmail.com', 'mahinmhfd@gmail.com', { role: 'member', status: 'active' }],
    ['mahinmhfd@gmail.com', 'mahinmhfd@gmail.com', { role: 'owner', status: 'suspended' }],
  ])('rejects non-matching or inactive Owner identities', (userEmail, configuredEmail, profile) => {
    expect(isConfiguredActiveOwner(userEmail, configuredEmail, profile)).toBe(false);
  });
});
