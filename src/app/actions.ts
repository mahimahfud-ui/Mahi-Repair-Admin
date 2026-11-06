"use server";
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { RepairRecipeSchema } from '@/lib/recipe/catalog';
import { requireOwner } from '@/lib/auth/require-owner';

const ADMIN_FUNCTIONS = new Set(['admin-invite-member','admin-manage-member','admin-upsert-tool','admin-publish-tool','admin-disable-tool','admin-assign-tool','admin-save-validation','admin-delete-draft-tool','admin-manage-device','admin-manage-tool-state','get-admin-analytics']);
const ADMIN_OPERATION_FAILED = 'The administrative operation could not be completed. Please retry.';

/** Server-side OTP request keeps PKCE/session cookies out of browser JavaScript. */
export async function requestSignInLink(email: string): Promise<{ ok: boolean }> {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { ok: false };

  try {
    const requestOrigin = (await headers()).get('origin');
    const callbackOrigin = process.env['NEXT_PUBLIC_APP_URL'] || requestOrigin;
    if (!callbackOrigin) return { ok: false };
    const parsedOrigin = new URL(callbackOrigin);
    if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.username || parsedOrigin.password ||
      (process.env.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:') ||
      (parsedOrigin.pathname !== '/' && parsedOrigin.pathname !== '') || parsedOrigin.search || parsedOrigin.hash) return { ok: false };

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false, emailRedirectTo: new URL('/auth/callback', parsedOrigin.origin).toString() },
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
export async function signOut() { const supabase = await createClient(); await supabase.auth.signOut(); redirect('/login'); }
export async function invokeAdminFunction(functionName: string, body: Record<string, unknown>) {
  if (!ADMIN_FUNCTIONS.has(functionName)) throw new Error('Unsupported administrative operation.');
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  const envelope = data as { data?: unknown; error?: unknown } | null;
  if (error || !envelope || envelope.error || envelope.data == null) throw new Error(ADMIN_OPERATION_FAILED);
  return envelope.data;
}
export async function createTool(formData: FormData) {
  await requireOwner();
  const name = String(formData.get('name') ?? '').trim(); const slug = String(formData.get('slug') ?? '').trim();
  const category = String(formData.get('category') ?? 'apps'); const description = String(formData.get('description') ?? '').trim(); const icon = String(formData.get('icon') ?? 'wrench');
  let recipe: unknown; try { recipe = JSON.parse(String(formData.get('recipe') ?? '')); } catch { throw new Error('Recipe must be valid JSON.'); }
  const checked = RepairRecipeSchema.safeParse(recipe);
  if (!checked.success) throw new Error(checked.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
  if (checked.data.toolId !== slug) throw new Error('Recipe toolId must match the tool slug.');
  await invokeAdminFunction('admin-upsert-tool', { name, slug, category, description, icon, draft_recipe: checked.data });
  revalidatePath('/tools'); redirect('/tools');
}
export async function saveToolDraft(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim();
  const category = String(formData.get('category') ?? 'apps');
  const description = String(formData.get('description') ?? '').trim();
  const icon = String(formData.get('icon') ?? 'wrench');
  let recipe: unknown;
  try { recipe = JSON.parse(String(formData.get('recipe') ?? '')); }
  catch { throw new Error('Recipe must be valid JSON.'); }
  const checked = RepairRecipeSchema.safeParse(recipe);
  if (!checked.success) throw new Error(checked.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
  if (checked.data.toolId !== slug) throw new Error('Recipe toolId must match the slug field.');
  const { supabase } = await requireOwner();
  const { data: tool, error } = await supabase.from('repair_tools').select('id,status').eq('id', id).single();
  if (error || !tool) throw new Error('The requested tool is unavailable.');
  if (tool.status === 'ARCHIVED') throw new Error('Archived tools cannot be edited.');
  await invokeAdminFunction('admin-upsert-tool', { id, name, slug, category, description, icon, draft_recipe: checked.data });
  revalidatePath('/tools');
  revalidatePath(`/tools/${id}`);
}
export async function publishTool(formData:FormData){const id=String(formData.get('tool_id')??'');const changelog=String(formData.get('changelog')??'');await invokeAdminFunction('admin-publish-tool',{tool_id:id,changelog});revalidatePath('/tools');revalidatePath('/publishing');revalidatePath('/versions');}
export async function republishVersion(formData:FormData){const toolId=String(formData.get('tool_id')??'');const sourceVersionId=String(formData.get('source_version_id')??'');const changelog=String(formData.get('changelog')??'Republished prior version');await invokeAdminFunction('admin-publish-tool',{tool_id:toolId,source_version_id:sourceVersionId,changelog});revalidatePath('/tools');revalidatePath('/publishing');revalidatePath('/versions');}
export async function setToolDisabled(formData:FormData){const toolId=String(formData.get('tool_id')??'');const disabled=String(formData.get('disabled')??'true')==='true';await invokeAdminFunction('admin-disable-tool',{tool_id:toolId,disabled});revalidatePath('/tools');revalidatePath('/publishing');}
export async function setToolState(formData:FormData){const toolId=String(formData.get('tool_id')??'');const status=String(formData.get('status')??'DRAFT');await invokeAdminFunction('admin-manage-tool-state',{tool_id:toolId,status});revalidatePath('/tools');revalidatePath('/publishing');}
export async function inviteMember(formData:FormData){const email=String(formData.get('email')??'').trim();await invokeAdminFunction('admin-invite-member',{email});revalidatePath('/members');}
export async function setMemberStatus(formData:FormData){const userId=String(formData.get('user_id')??'');const status=String(formData.get('status')??'suspended');await invokeAdminFunction('admin-manage-member',{user_id:userId,status});revalidatePath('/members');}
export async function assignTool(formData:FormData){const toolId=String(formData.get('tool_id')??'');const audience=String(formData.get('audience')??'all_active_members');const memberIds=formData.getAll('member_ids').map(x=>String(x).trim()).filter(Boolean);await invokeAdminFunction('admin-assign-tool',{tool_id:toolId,audience,...(audience==='selected_members'?{member_ids:memberIds}:{})});revalidatePath('/tools');}

export async function saveValidationHistory(formData:FormData){
  let recipe:unknown;const raw=String(formData.get('recipe')??'');try{recipe=JSON.parse(raw);}catch{recipe=raw;}
  await invokeAdminFunction('admin-save-validation',{recipe});revalidatePath('/test-lab');
}
export async function duplicateTool(formData:FormData){
  const id=String(formData.get('tool_id')??'');const {supabase}=await requireOwner();
  const {data,error}=await supabase.from('repair_tools').select('name,slug,category,description,icon,draft_recipe').eq('id',id).single();
  if(error||!data)throw new Error('The requested tool is unavailable.');
  const slug=`${data.slug}-copy-${crypto.randomUUID().slice(0,6)}`;
  const recipe={...(data.draft_recipe as Record<string,unknown>),toolId:slug,version:1,changelog:'Duplicated draft'};
  await invokeAdminFunction('admin-upsert-tool',{name:`${data.name} Copy`,slug,category:data.category,description:data.description,icon:data.icon,draft_recipe:recipe});
  revalidatePath('/tools');
}
export async function deleteDraftTool(formData:FormData){
  const id=String(formData.get('tool_id')??'');
  await invokeAdminFunction('admin-delete-draft-tool',{tool_id:id});
  revalidatePath('/tools');
}

export async function setDeviceRevoked(formData:FormData){const deviceId=String(formData.get('device_id')??'');const revoked=String(formData.get('revoked')??'true')==='true';await invokeAdminFunction('admin-manage-device',{device_id:deviceId,revoked});revalidatePath('/members');}
