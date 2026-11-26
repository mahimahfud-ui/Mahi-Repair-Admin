import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit, audit } from '../_shared/http.ts';
import { generateMemberCode, generateMemberPin, isValidMemberCode } from '../_shared/member-credentials.ts';

const Input = z.object({ user_id: z.string().uuid() }).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `member-pin-reset:${user.id}`, 10, 3600);

    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) {
      return respond(req, { error: { code: 'INVALID_MEMBER', issues: parsed.error.issues } }, 422);
    }

    const targetId = parsed.data.user_id;
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('id,role,status,display_name,member_code')
      .eq('id', targetId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'member') {
      throw Object.assign(new Error('Member not found.'), { status: 404 });
    }

    const { data: authResult, error: authLookupError } = await admin.auth.admin.getUserById(targetId);
    if (authLookupError || !authResult.user) {
      throw Object.assign(new Error('Member authentication record not found.'), { status: 404 });
    }

    let memberCode = isValidMemberCode(profile.member_code) ? profile.member_code : '';
    if (!memberCode) {
      for (let attempt = 0; attempt < 6 && !memberCode; attempt += 1) {
        const candidate = generateMemberCode();
        const { data: collision, error: collisionError } = await admin.from('profiles')
          .select('id')
          .eq('member_code', candidate)
          .maybeSingle();
        if (collisionError) throw collisionError;
        if (!collision) memberCode = candidate;
      }
      if (!memberCode) throw new Error('Could not allocate a unique Member ID. Try again.');
    }

    const pin = generateMemberPin();
    const { error: passwordError } = await admin.auth.admin.updateUserById(targetId, { password: pin });
    if (passwordError) throw passwordError;

    if (memberCode !== profile.member_code) {
      const { error: codeError } = await admin.from('profiles')
        .update({ member_code: memberCode })
        .eq('id', targetId)
        .eq('role', 'member');
      if (codeError) throw codeError;
    }

    await audit(admin, user.id, 'member.credentials.reset', 'member', targetId, {
      member_code: memberCode,
      sign_in_method: 'member_id_pin',
      status_unchanged: profile.status,
    });

    return respond(req, {
      data: {
        member_code: memberCode,
        pin,
        display_name: profile.display_name || String(authResult.user.user_metadata?.name || 'Member'),
      },
    });
  } catch (error) {
    return handleError(req, error);
  }
});
