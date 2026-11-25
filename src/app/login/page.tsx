"use client";

import { type FormEvent, useState } from 'react';
import { ShieldCheck, Cloud, ArrowRight, KeyRound } from 'lucide-react';
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
      if (!result.ok) {
        if (result.reason === 'rate_limited') {
          setError('Too many sign-in attempts. Please wait a few minutes and try again.');
        } else if (result.reason === 'configuration') {
          setError('PIN sign-in is not configured for this deployment. Please check the server configuration.');
        } else {
          setError('Incorrect PIN or this account is not allowed to access the Owner Panel.');
        }
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
          <h1 className="text-2xl font-semibold tracking-tight">Enter your PIN</h1>
          <p className="muted text-sm mt-2">Use your private Owner PIN to open the control panel. Member accounts cannot enter this console.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            Owner PIN
            <div className="relative mt-2">
              <KeyRound size={17} className="absolute left-3 top-1/2 -translate-y-1/2 muted" />
              <input
                className="field pl-10 tracking-[0.35em]"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern="[0-9]{8,12}"
                minLength={8}
                maxLength={12}
                required
                disabled={busy}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                placeholder="••••••••"
                aria-describedby="pin-help"
              />
            </div>
          </label>

          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={busy || !/^[0-9]{8,12}$/.test(pin)}
          >
            {busy ? 'Checking PIN…' : 'Unlock Admin Panel'}
            <ArrowRight size={16} />
          </button>
        </form>

        {error && <p role="alert" aria-live="polite" className="mt-4 text-sm text-red-400">{error}</p>}
        <p id="pin-help" className="mt-3 text-xs muted">Enter your 8–12 digit PIN. Keep it private and do not share it.</p>
        <p className="mt-8 text-[11px] muted">Private administration · Owner access is verified server-side</p>
      </section>
    </main>
  );
}
