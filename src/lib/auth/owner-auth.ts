/** Validate the server-only configured Owner Auth identifier. */
export function isValidOwnerAuthEmail(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
}
