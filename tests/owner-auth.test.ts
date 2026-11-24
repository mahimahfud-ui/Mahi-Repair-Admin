import { describe, expect, it } from 'vitest';
import { isValidOwnerAuthEmail } from '../src/lib/auth/owner-auth';

describe('server-side Owner Auth identifier validation', () => {
  it('accepts a normal email identifier', () => {
    expect(isValidOwnerAuthEmail('owner@example.com')).toBe(true);
    expect(isValidOwnerAuthEmail('mahinmhfd@gmail.com')).toBe(true);
  });

  it('rejects malformed or oversized identifiers', () => {
    expect(isValidOwnerAuthEmail('')).toBe(false);
    expect(isValidOwnerAuthEmail('not-an-email')).toBe(false);
    expect(isValidOwnerAuthEmail('owner @example.com')).toBe(false);
    expect(isValidOwnerAuthEmail('a'.repeat(250) + '@example.com')).toBe(false);
    expect(isValidOwnerAuthEmail(null)).toBe(false);
  });
});
