import { respond, preflight } from '../_shared/http.ts';

// Legacy endpoint retained temporarily for compatibility, but all email-based
// member invitations are disabled. Create Member ID + PIN credentials instead.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  return respond(req, {
    error: {
      code: 'EMAIL_INVITES_DISABLED',
      message: 'Member email invitations are disabled. Use the Owner Console to create Member ID and PIN credentials.',
    },
  }, 410);
});
