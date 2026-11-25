import { describe, expect, it } from 'vitest';
import { isValidOwnerAuthEmail, isValidOwnerPin } from '../src/lib/auth/owner-pin';

describe('Owner PIN validation', () => {
  it('accepts 8–12 numeric digits, including leading zeroes', () => {
    expect(isValidOwnerPin('01234567')).toBe(true);
    expect(isValidOwnerPin('012345678901')).toBe(true);
  });

  it('rejects short, long, non-numeric, whitespace-containing and non-string PINs', () => {
    for (const value of ['1234567', '1234567890123', '1234abcd', ' 12345678', '12345678 ', '', null, 12345678]) {
      expect(isValidOwnerPin(value)).toBe(false);
    }
  });
});

describe('server-side Owner Auth identifier validation', () => {
  it('accepts a normal email identifier', () => {
    expect(isValidOwnerAuthEmail('owner@example.com')).toBe(true);
  });

  it('rejects malformed or oversized identifiers', () => {
    expect(isValidOwnerAuthEmail('')).toBe(false);
    expect(isValidOwnerAuthEmail('not-an-email')).toBe(false);
    expect(isValidOwnerAuthEmail('owner @example.com')).toBe(false);
    expect(isValidOwnerAuthEmail('a'.repeat(250) + '@example.com')).toBe(false);
  });
});
