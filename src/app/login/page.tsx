"use client";

import { type FormEvent, useState } from 'react';
import { ArrowRight, Cloud, Lock, ShieldCheck } from 'lucide-react';
import { signInWithOwnerPin } from '@/app/actions';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await signInWithOwnerPin(pin);
      if (result.ok === false) {
        if (result.reason === 'rate_limited') setError('Too many attempts. Wait before trying again.');
        else if (result.reason === 'configuration') setError('Owner PIN sign-in is not configured on the server.');
        else setError('The Owner PIN is incorrect. Member accounts cannot enter this console.');
      }
    } catch {
      setError('Unable to sign in right now. Please try again.');
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
          <h1 className="text-2xl font-semibold tracking-tight">Unlock Admin Panel</h1>
          <p className="muted text-sm mt-2">Enter the Owner PIN to continue. This console is restricted to the configured active Owner account.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            Owner PIN
            <div className="relative mt-2">
              <Lock size={17} className="absolute left-3 top-1/2 -translate-y-1/2 muted" />
              <input className="field pl-10 font-mono tracking-[0.35em]" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{8,12}" minLength={8} maxLength={12} required disabled={busy} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="••••••••" />
            </div>
            <span className="mt-2 block text-[11px] muted">8–12 digits</span>
          </label>
          <button className="btn btn-primary w-full" type="submit" disabled={busy || pin.length < 8}>
            {busy ? 'Verifying…' : 'Unlock Owner Console'} <ArrowRight size={16} />
          </button>
        </form>
        {error && <p role="alert" aria-live="polite" className="mt-4 text-sm text-red-400">{error}</p>}
        <p className="mt-8 text-[11px] muted">No email sign-in · Owner authorization is verified against the active profile on the server</p>
      </section>
    </main>
  );
}
