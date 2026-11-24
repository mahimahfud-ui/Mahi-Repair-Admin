"use client";

import { type FormEvent, useState } from 'react';
import { KeyRound, Copy, RefreshCw, UserPlus } from 'lucide-react';
import { createMemberAccess, setMemberStatus } from '@/app/actions';

type MemberRow = {
  id: string;
  member_code: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

type Credentials = { member_code: string; pin: string; display_name: string };

export function MembersAccessManager({ members }: { members: MemberRow[] }) {
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setCredentials(null);
    try {
      const result = await createMemberAccess(name);
      setCredentials(result);
      setName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create member credentials.');
    } finally { setBusy(false); }
  }



  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setCopied('Clipboard unavailable'); }
  }

  return (
    <section className="panel mb-4 p-5">
      <div className="mb-4 flex items-center gap-3">
        <UserPlus className="text-red-400" />
        <div>
          <h2 className="text-sm font-semibold">Create member access</h2>
          <p className="mt-1 text-xs muted">Generate a Member ID and 12-digit PIN. No email or invitation is required. Existing email-only accounts remain preserved until their PIN migration is enabled.</p>
        </div>
      </div>
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <input className="field" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required placeholder="Member name" />
        <button className="btn btn-primary shrink-0" disabled={busy}>{busy ? 'Creating…' : 'Create Member ID + PIN'}</button>
      </form>
      {credentials && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-300"><KeyRound size={16} /> Save these credentials now</div>
          <p className="mb-3 text-xs muted">The PIN is shown only after creation or reset. Store it securely and share it directly with the member.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="mb-1 text-[10px] muted">MEMBER ID</div><div className="flex items-center justify-between gap-2 font-mono text-sm"><strong>{credentials.member_code}</strong><button type="button" aria-label="Copy Member ID" onClick={() => copy(credentials.member_code, 'Member ID copied')}><Copy size={15} /></button></div></div>
            <div><div className="mb-1 text-[10px] muted">12-DIGIT PIN</div><div className="flex items-center justify-between gap-2 font-mono text-sm"><strong>{credentials.pin}</strong><button type="button" aria-label="Copy PIN" onClick={() => copy(credentials.pin, 'PIN copied')}><Copy size={15} /></button></div></div>
          </div>
          {copied && <p className="mt-2 text-xs text-emerald-300" role="status">{copied}</p>}
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-300" role="alert">{error}</p>}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] muted"><tr><th className="p-3 text-left">MEMBER</th><th className="p-3 text-left">MEMBER ID</th><th className="p-3 text-left">STATUS</th><th className="p-3 text-left">CREATED</th><th className="p-3 text-left">ACCESS</th></tr></thead>
          <tbody className="divide-y divide-[#252830]">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="p-3 text-xs">{member.display_name || 'Member'}</td>
                <td className="p-3 font-mono text-xs">{member.member_code || <span className="muted">Not issued</span>}</td>
                <td className="p-3 text-xs">{member.status}</td>
                <td className="p-3 text-xs muted">{member.created_at.slice(0, 10)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-secondary py-2 text-[10px]" disabled title={member.member_code ? "Member PIN reset is not enabled yet." : "Legacy email-only account; its existing history is preserved."}><RefreshCw size={12} /> {member.member_code ? 'PIN reset pending' : 'Legacy account'}</button>
                    <form action={setMemberStatus} className="flex gap-1">
                      <input type="hidden" name="user_id" value={member.id} />
                      <select name="status" defaultValue={member.status} className="field py-2 text-[10px]"><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option></select>
                      <button className="btn btn-secondary py-2 text-[10px]">Save</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {!members.length && <tr><td colSpan={5} className="p-5 text-center text-xs muted">No members yet. Create the first Member ID and PIN above.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
