import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit, audit } from '../_shared/http.ts';
import { generateMemberCode, generateMemberPin } from '../_shared/member-credentials.ts';

const Input = z.object({
  display_name: z.string().trim().min(2).max(80),
}).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `member-create:${user.id}`, 10, 3600);

    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) {
      return respond(req, { error: { code: 'INVALID_MEMBER', issues: parsed.error.issues } }, 422);
    }

    const displayName = parsed.data.display_name.trim();
    let created: { id: string; email: string; code: string; pin: string } | null = null;

    for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
      const memberCode = generateMemberCode();
      const pin = generateMemberPin();
      // This is an internal Auth identifier only. It is never displayed to a member,
      // accepted from a user, or used as an email delivery destination.
      const internalAuthEmail = `mr-${memberCode.slice(3).toLowerCase()}@members.mahirepair.invalid`;
      const { data, error } = await admin.auth.admin.createUser({
        email: internalAuthEmail,
        password: pin,
        email_confirm: true,
        user_metadata: { name: displayName },
      });
      if (error) {
        if (/already|duplicate|unique/i.test(error.message)) continue;
        throw error;
      }
      if (!data.user) throw new Error('Member account creation did not return a user.');

      const { error: profileError } = await admin.from('profiles')
        .update({ member_code: memberCode, display_name: displayName, role: 'member', status: 'active' })
        .eq('id', data.user.id);
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id);
        if (/duplicate|unique/i.test(profileError.message)) continue;
        throw profileError;
      }
      created = { id: data.user.id, email: internalAuthEmail, code: memberCode, pin };
    }

    if (!created) throw new Error('Could not allocate a unique Member ID. Try again.');

    await audit(admin, user.id, 'member.credentials.created', 'member', created.id, {
      member_code: created.code,
      sign_in_method: 'member_id_pin',
    });

    return respond(req, {
      data: {
        member_code: created.code,
        pin: created.pin,
        display_name: displayName,
      },
    });
  } catch (error) {
    return handleError(req, error);
  }
});
