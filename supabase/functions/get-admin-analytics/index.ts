import { requireOwner, respond, preflight, handleError, rateLimit } from '../_shared/http.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `analytics:${user.id}`, 20, 60);
    const { data, error } = await admin.rpc('get_admin_analytics');
    if (error) throw error;
    return respond(req, { data });
  } catch (error) { return handleError(req, error); }
});
