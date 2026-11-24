import { assertEquals } from 'jsr:@std/assert@1';
import { isValidMemberCode, isValidMemberPin } from '../_shared/member-credentials.ts';

Deno.test('member login accepts only canonical Member ID and 12-digit PIN shapes', () => {
  assertEquals(isValidMemberCode('MR-ABCDEFG2'), true);
  assertEquals(isValidMemberCode('mr-abcdefg2'), false);
  assertEquals(isValidMemberCode('MR-ABCDEFGHI'), false);
  assertEquals(isValidMemberPin('012345678901'), true);
  assertEquals(isValidMemberPin('123456'), false);
});
