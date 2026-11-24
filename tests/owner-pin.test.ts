import { describe, expect, it } from 'vitest';
import { isValidOwnerPin } from '../src/lib/auth/owner-pin';

describe('Owner PIN validation', () => {
  it('accepts only 8–12 numeric digits', () => {
    expect(isValidOwnerPin('12345678')).toBe(true);
    expect(isValidOwnerPin('123456789012')).toBe(true);
  });
  it('rejects short, long, blank, or nonnumeric values', () => {
    for (const value of ['', '1234567', '1234567890123', '1234abcd', ' 12345678']) {
      expect(isValidOwnerPin(value)).toBe(false);
    }
    expect(isValidOwnerPin(null)).toBe(false);
  });
});
