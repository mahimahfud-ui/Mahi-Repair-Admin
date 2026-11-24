"use client";

import { type FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2, Cloud, Mail, ShieldCheck } from 'lucide-react';
import { requestOwnerMagicLink } from '@/app/auth/actions';

export default function LoginPage() {
  const [email, setEmail] = useState('mahinmhfd@gmail.com');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setSent(false);
    setError('');
    try {
      const result = await requestOwnerMagicLink(email);
      if (result.ok) {
        setSent(true);
      } else if (result.reason === 'rate_limited') {
        setError('Too many sign-in requests. Wait before requesting another link.');
      } else if (result.reason === 'configuration') {
        setError('Owner sign-in is not configured correctly. Check the server-side Owner email and Admin URL settings.');
      } else if (result.reason === 'invalid') {
        setError('This email is not the configured Owner account. Member accounts cannot enter this console.');
      } else {
        setError('The sign-in link could not be sent. Check Auth email delivery and try again.');
      }
    } catch {
      setError('Unable to request a sign-in link right now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-5 bg-[radial-gradient(ellipse_at_top,#321214_0%,#090a0d_48%)]">
      <section className="panel w-full max-w-[420px] p-8 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-3 mb-8">
          <div className="rounded-xl bg-red-500/15 p-3 text-red-400"><Cloud size={22} /></div>
          <div>
            <div className="font-semibold tracking-tight">Mahi Repair Cloud</div>
            <div className="text-xs muted">OWNER CONTROL CENTER</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-red-300"><ShieldCheck size={16} /> Private owner access</div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in with email</h1>
          <p className="muted text-sm mt-2">Enter the configured Owner email. We will send a one-time sign-in link to that inbox. Member accounts cannot enter this console.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            Owner email
            <div className="relative mt-2">
              <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 muted" />
              <input
                className="field pl-10"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={busy || sent}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@example.com"
              />
            </div>
          </label>

          <button className="btn btn-primary w-full" type="submit" disabled={busy || sent || !email.trim()}>
            {busy ? 'Sending secure link…' : sent ? 'Link sent' : 'Send secure sign-in link'}
            <ArrowRight size={16} />
          </button>
        </form>

        {sent && <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"><div className="flex items-center gap-2 font-medium"><CheckCircle2 size={16} /> Magic Link sent</div><p className="mt-1 text-emerald-200/80">Check your inbox and spam folder, then open the one-time sign-in link on this device.</p></div>}
        {error && <p role="alert" aria-live="polite" className="mt-4 text-sm text-red-400">{error}</p>}
        {sent && <button type="button" className="mt-3 text-xs text-red-300 hover:text-red-200" onClick={() => setSent(false)}>Use a different email</button>}
        <p className="mt-8 text-[11px] muted">Private administration · Access is verified against the active Owner profile on the server</p>
      </section>
    </main>
  );
}
