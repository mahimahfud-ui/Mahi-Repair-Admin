import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit, audit } from '../_shared/http.ts';
import { generateMemberCode, generateMemberPin, isValidMemberCode } from '../_shared/member-credentials.ts';

const Input = z.object({ user_id: z.string().uuid() }).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `member-credential-reset:${user.id}`, 20, 3600);

    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) return respond(req, { error: { code: 'INVALID_MEMBER', issues: parsed.error.issues } }, 422);

    const { data: member, error: lookupError } = await admin.from('profiles')
      .select('id,role,status,display_name,member_code')
      .eq('id', parsed.data.user_id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!member || member.role !== 'member') {
      return respond(req, { error: { code: 'MEMBER_NOT_FOUND', message: 'Member account not found.' } }, 404);
    }

    let memberCode = member.member_code;
    if (!isValidMemberCode(memberCode)) {
      let assigned = false;
      for (let attempt = 0; attempt < 4 && !assigned; attempt += 1) {
        memberCode = generateMemberCode();
        const { error } = await admin.from('profiles').update({ member_code: memberCode }).eq('id', member.id);
        if (!error) assigned = true;
        else if (!/duplicate|unique/i.test(error.message)) throw error;
      }
      if (!assigned) throw new Error('Could not allocate a unique Member ID. Try again.');
    }

    const pin = generateMemberPin();
    // Only the password changes on an existing Auth identity. No email is sent,
    // changed, requested, or used as a user-facing identifier.
    const { error: authError } = await admin.auth.admin.updateUserById(member.id, { password: pin });
    if (authError) throw authError;

    await audit(admin, user.id, 'member.credentials.reset', 'member', member.id, {
      member_code: memberCode,
      sign_in_method: 'member_id_pin',
    });

    return respond(req, {
      data: {
        member_code: memberCode,
        pin,
        display_name: member.display_name || 'Member',
      },
    });
  } catch (error) {
    return handleError(req, error);
  }
});
