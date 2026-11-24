import { assert, assertEquals } from 'jsr:@std/assert@1';
import { generateMemberCode, generateMemberPin, isValidMemberCode, isValidMemberPin } from './member-credentials.ts';

Deno.test('Member codes use the public MR identifier format', () => {
  const code = generateMemberCode();
  assert(isValidMemberCode(code));
  assertEquals(code.length, 11);
});

Deno.test('Member PINs are exactly twelve numeric digits', () => {
  const pin = generateMemberPin();
  assert(isValidMemberPin(pin));
  assertEquals(pin.length, 12);
  assert(/^\d{12}$/.test(pin));
});

Deno.test('invalid member credentials are rejected', () => {
  assert(!isValidMemberCode(''));
  assert(!isValidMemberCode('member123'));
  assert(!isValidMemberPin('123456'));
  assert(!isValidMemberPin('12345678901x'));
});
