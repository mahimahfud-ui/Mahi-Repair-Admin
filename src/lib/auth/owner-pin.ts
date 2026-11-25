export const OWNER_PIN_MIN_LENGTH = 8;
export const OWNER_PIN_MAX_LENGTH = 12;

/**
 * The Owner PIN is the existing Owner Supabase Auth password.
 * Require 8–12 digits and preserve leading zeroes.
 */
export function isValidOwnerPin(value: unknown): value is string {
  return typeof value === 'string' && /^\d{8,12}$/.test(value);
}

/** Validate the server-only Auth identifier, not user-submitted login input. */
export function isValidOwnerAuthEmail(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
