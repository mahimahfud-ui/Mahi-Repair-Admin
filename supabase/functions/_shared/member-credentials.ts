const MEMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MEMBER_CODE_PATTERN = /^MR-[A-HJ-NP-Z2-9]{8}$/;

function randomIndex(max: number): number {
  const ceiling = Math.floor(256 / max) * max;
  const byte = new Uint8Array(1);
  do {
    crypto.getRandomValues(byte);
  } while (byte[0] >= ceiling);
  return byte[0] % max;
}

export function isValidMemberCode(value: unknown): value is string {
  return typeof value === 'string' && MEMBER_CODE_PATTERN.test(value);
}

export function isValidMemberPin(value: unknown): value is string {
  return typeof value === 'string' && /^\d{12}$/.test(value);
}

export function generateMemberCode(): string {
  let suffix = '';
  for (let index = 0; index < 8; index += 1) {
    suffix += MEMBER_ALPHABET[randomIndex(MEMBER_ALPHABET.length)];
  }
  return `MR-${suffix}`;
}

export function generateMemberPin(): string {
  let pin = '';
  for (let index = 0; index < 12; index += 1) pin += String(randomIndex(10));
  return pin;
}
