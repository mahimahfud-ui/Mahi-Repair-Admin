import Link from 'next/link';
import { ConsoleShell } from '@/components/console-shell';
import { requireOwner } from '@/lib/auth/require-owner';
import { formatDate } from '@/lib/utils';
import { Plus, ShieldAlert, Send, Ban, Users, Archive, FlaskConical, Pencil } from 'lucide-react';
import { publishTool, setToolDisabled, assignTool, duplicateTool, deleteDraftTool, setToolState } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function ToolsPage() {
  const { supabase } = await requireOwner();
  const [{ data: tools, error }, { data: members }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase.from('repair_tools').select('id,name,slug,category,status,version,updated_at,audience,icon').order('updated_at', { ascending: false }),
    supabase.from('profiles').select('id,email,display_name').eq('role', 'member').eq('status', 'active').order('email'),
    supabase.from('repair_tool_access').select('tool_id,member_id'),
  ]);
  const assigned = new Map<string, string[]>();
  for (const row of assignments ?? []) assigned.set(row.tool_id, [...(assigned.get(row.tool_id) ?? []), row.member_id]);

  return (
    <ConsoleShell active="/tools" title="Repair Tool Library" subtitle="Create, test, publish and control approved repair recipes">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm muted">{tools?.length ?? 0} tools in your library</div>
        <Link href="/tools/new" className="btn btn-primary"><Plus size={15} /> New repair tool</Link>
      </div>
      {error && <div className="panel mb-4 p-4 text-sm text-red-300">Unable to load the tool library right now.</div>}
      {assignmentError && <div className="panel mb-4 p-4 text-sm text-red-300">Unable to load member assignments right now.</div>}

      <div className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#252830] p-4 text-sm muted"><ShieldAlert size={15} /> Tool inventory</div>
        {tools?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0d0f13] text-[11px] muted"><tr>
                <th className="p-4 text-left font-medium">TOOL</th><th className="p-4 text-left font-medium">CATEGORY</th>
                <th className="p-4 text-left font-medium">STATUS</th><th className="p-4 text-left font-medium">VERSION</th>
                <th className="p-4 text-left font-medium">LAST UPDATED</th><th className="p-4 text-left font-medium">ACTIONS</th>
              </tr></thead>
              <tbody className="divide-y divide-[#252830]">
                {tools.map((tool) => (
                  <tr key={tool.id} className="align-top hover:bg-white/[.02]">
                    <td className="p-4">
                      {tool.status === 'ARCHIVED' ? <span className="font-medium">{tool.name}</span> : <Link href={`/tools/${tool.id}`} className="font-medium hover:text-red-300"><Pencil size={12} className="mr-1 inline" />{tool.name}</Link>}
                      <div className="mt-1 font-mono text-[11px] muted">{tool.slug}</div>
                    </td>
                    <td className="p-4 capitalize text-gray-300">{tool.category}</td>
                    <td className="p-4"><span className={`rounded-full px-2 py-1 text-[10px] ${tool.status === 'PUBLISHED' ? 'bg-emerald-950 text-emerald-300' : tool.status === 'DISABLED' || tool.status === 'ARCHIVED' ? 'bg-red-950 text-red-300' : 'bg-[#292d36] text-gray-300'}`}>{tool.status}</span></td>
                    <td className="p-4 tabular-nums">v{tool.version}</td>
                    <td className="p-4 text-xs muted">{formatDate(tool.updated_at)}</td>
                    <td className="min-w-[330px] p-4">
                      <div className="flex flex-wrap gap-2">
                        {tool.status !== 'DISABLED' && tool.status !== 'ARCHIVED' && <form action={publishTool}><input type="hidden" name="tool_id" value={tool.id} /><input type="hidden" name="changelog" value="Owner-published update" /><button className="btn btn-secondary px-2 py-1 text-[11px]"><Send size={12} /> Publish</button></form>}
                        <form action={duplicateTool}><input type="hidden" name="tool_id" value={tool.id} /><button className="btn btn-secondary px-2 py-1 text-[11px]">Duplicate</button></form>
                        {tool.status === 'PUBLISHED' && <form action={setToolDisabled}><input type="hidden" name="tool_id" value={tool.id} /><input type="hidden" name="disabled" value="true" /><button className="btn btn-secondary px-2 py-1 text-[11px]"><Ban size={12} /> Disable</button></form>}
                        {tool.status === 'DISABLED' && <form action={setToolDisabled}><input type="hidden" name="tool_id" value={tool.id} /><input type="hidden" name="disabled" value="false" /><button className="btn btn-secondary px-2 py-1 text-[11px]">Enable</button></form>}
                        {(tool.status === 'PUBLISHED' || tool.status === 'DISABLED') && <form action={setToolState}><input type="hidden" name="tool_id" value={tool.id} /><input type="hidden" name="status" value="DRAFT" /><button className="btn btn-secondary px-2 py-1 text-[11px]">Unpublish</button></form>}
                        {tool.status === 'DRAFT' && <form action={setToolState}><input type="hidden" name="tool_id" value={tool.id} /><input type="hidden" name="status" value="TESTING" /><button className="btn btn-secondary px-2 py-1 text-[11px]"><FlaskConical size={12} /> Move to testing</button></form>}
                        {tool.status === 'TESTING' && <form action={setToolState}><input type="hidden" name="tool_id" value={tool.id} /><input type="hidden" name="status" value="DRAFT" /><button className="btn btn-secondary px-2 py-1 text-[11px]">Return to draft</button></form>}
                        {tool.version === 0 && ['DRAFT', 'TESTING'].includes(tool.status) && <form action={deleteDraftTool}><input type="hidden" name="tool_id" value={tool.id} /><button className="btn btn-secondary px-2 py-1 text-[11px] text-red-300">Delete draft</button></form>}
                        {tool.status !== 'ARCHIVED' && <form action={setToolState}><input type="hidden" name="tool_id" value={tool.id} /><input type="hidden" name="status" value="ARCHIVED" /><button className="btn btn-secondary px-2 py-1 text-[11px] text-red-300"><Archive size={12} /> Archive</button></form>}
                      </div>

                      {tool.status !== 'ARCHIVED' && (
                        <form action={assignTool} className="mt-3 grid gap-2 rounded-lg border border-[#292d36] bg-[#0b0d11] p-3">
                          <input type="hidden" name="tool_id" value={tool.id} />
                          <label className="text-[10px] muted">WHO CAN RECEIVE THIS TOOL
                            <select name="audience" defaultValue={tool.audience} className="field mt-1 w-full px-2 py-2 text-xs">
                              <option value="all_active_members">All active members</option><option value="selected_members">Selected members only</option>
                            </select>
                          </label>
                          <label className="text-[10px] muted">MEMBER ACCESS · Hold Ctrl/Cmd to select multiple
                            <select name="member_ids" multiple size={Math.min(Math.max(members?.length ?? 1, 2), 5)} defaultValue={assigned.get(tool.id) ?? []} className="field mt-1 w-full px-2 py-2 text-xs">
                              {(members ?? []).map((member) => <option key={member.id} value={member.id}>{member.email || member.display_name || member.id}</option>)}
                            </select>
                          </label>
                          <button className="btn btn-secondary w-fit px-2 py-1 text-[10px]"><Users size={12} /> Save access</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center"><ShieldAlert className="mx-auto text-[#626a77]" /><h3 className="mt-3 font-medium">No repair tools yet</h3><p className="mt-2 text-xs muted">Create a JSON recipe, validate it and publish its first immutable version.</p><Link href="/tools/new" className="btn btn-primary mt-5">Create first tool</Link></div>
        )}
      </div>
    </ConsoleShell>
  );
}
