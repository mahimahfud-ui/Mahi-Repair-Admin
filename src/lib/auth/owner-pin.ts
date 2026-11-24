/** Validate the private Owner PIN accepted by the server action. */
export function isValidOwnerPin(value: unknown): value is string {
  return typeof value === 'string' && /^\d{8,12}$/.test(value);
}
