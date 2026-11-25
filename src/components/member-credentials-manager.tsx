"use client";

import { useState, useTransition, type FormEvent } from 'react';
import { createMemberAccount, resetMemberPin, type MemberCredentials } from '@/app/actions';

function CredentialsNotice({ credentials }: { credentials: MemberCredentials }) {
  const [copied, setCopied] = useState(false);
  const value = ['Member: ' + credentials.display_name, 'Member ID: ' + credentials.member_code, 'PIN: ' + credentials.pin].join('\n');

  async function copyCredentials() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm" aria-live="polite">
      <p className="font-medium text-emerald-300">Credentials issued — save them now</p>
      <dl className="mt-2 grid grid-cols-[90px_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="muted">Member</dt><dd>{credentials.display_name}</dd>
        <dt className="muted">Member ID</dt><dd className="font-mono select-all">{credentials.member_code}</dd>
        <dt className="muted">12-digit PIN</dt><dd className="font-mono select-all">{credentials.pin}</dd>
      </dl>
      <button type="button" onClick={copyCredentials} className="btn btn-secondary mt-3 py-2 text-xs">{copied ? 'Copied' : 'Copy credentials'}</button>
      <p className="mt-2 text-[11px] muted">The PIN is shown only in this response. Share it privately with the intended Member.</p>
    </div>
  );
}

export function MemberCredentialCreateForm() {
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState<MemberCredentials | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError('');
    setCredentials(null);
    startTransition(async () => {
      try {
        const result = await createMemberAccount(formData);
        setCredentials(result);
        setName('');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create the Member account.');
      }
    });
  }

  return (
    <section className="panel mb-4 p-5">
      <h2 className="text-sm font-semibold">Create Member account</h2>
      <p className="mt-1 text-xs muted">Create a Member ID and 12-digit PIN for Android sign-in. No email address is required.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input className="field" name="display_name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} placeholder="Member display name" />
        <button className="btn btn-primary shrink-0" disabled={pending || name.trim().length < 2}>{pending ? 'Creating…' : 'Create Member'}</button>
      </form>
      {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
      {credentials && <CredentialsNotice credentials={credentials} />}
    </section>
  );
}

export function MemberCredentialResetButton({ userId, hasMemberCode }: { userId: string; hasMemberCode: boolean }) {
  const [credentials, setCredentials] = useState<MemberCredentials | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function issueOrReset() {
    setError('');
    setCredentials(null);
    startTransition(async () => {
      try {
        setCredentials(await resetMemberPin(userId));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not issue the Member PIN.');
      }
    });
  }

  return (
    <div className="min-w-[190px]">
      <button type="button" onClick={issueOrReset} disabled={pending} className="btn btn-secondary py-2 text-xs">
        {pending ? 'Working…' : hasMemberCode ? 'Reset PIN' : 'Assign ID + PIN'}
      </button>
      {error && <p role="alert" className="mt-2 max-w-[230px] text-xs text-red-300">{error}</p>}
      {credentials && <CredentialsNotice credentials={credentials} />}
    </div>
  );
}
