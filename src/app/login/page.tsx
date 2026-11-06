"use client";

import { Suspense, type FormEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck, Cloud, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import {
  getMagicLinkErrorMessage,
  getMagicLinkRedirectUrl,
  MAGIC_LINK_COOLDOWN_SECONDS,
  MAGIC_LINK_COOLDOWN_STORAGE_KEY,
} from '@/lib/auth/magic-link';

function getRemainingCooldownSeconds(): number {
  try {
    const lastRequestAt = Number(window.localStorage.getItem(MAGIC_LINK_COOLDOWN_STORAGE_KEY));
    if (!Number.isFinite(lastRequestAt) || lastRequestAt <= 0) return 0;

    const remaining = Math.ceil(
      (lastRequestAt + MAGIC_LINK_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000,
    );
    if (remaining <= 0) {
      window.localStorage.removeItem(MAGIC_LINK_COOLDOWN_STORAGE_KEY);
      return 0;
    }
    return remaining;
  } catch {
    // Supabase Auth still enforces its own server-side rate limits if storage is unavailable.
    return 0;
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen grid place-items-center p-5 bg-[#090a0d] text-sm text-white">Loading secure sign-in…</main>}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const denied = searchParams.get('denied') === '1';
  const callbackError = searchParams.get('error') === 'callback';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [error, setError] = useState('');
  const requestInFlight = useRef(false);

  useEffect(() => {
    const syncCooldown = () => setCooldownSeconds(getRemainingCooldownSeconds());
    syncCooldown();
    window.addEventListener('storage', syncCooldown);
    const interval = window.setInterval(syncCooldown, 1000);

    return () => {
      window.removeEventListener('storage', syncCooldown);
      window.clearInterval(interval);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // A ref blocks same-tab double clicks before React can re-render.
    if (requestInFlight.current) return;

    // localStorage shares the cooldown between tabs and survives a page refresh.
    const remaining = getRemainingCooldownSeconds();
    if (remaining > 0) {
      setCooldownSeconds(remaining);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter the Owner email address first.');
      return;
    }

    let emailRedirectTo: string;
    try {
      emailRedirectTo = getMagicLinkRedirectUrl(
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.NODE_ENV === 'production',
      );
    } catch (configurationError) {
      setError(
        configurationError instanceof Error
          ? configurationError.message
          : 'The Admin Panel sign-in URL is not configured. Contact the administrator.',
      );
      return;
    }

    requestInFlight.current = true;
    setBusy(true);
    setError('');
    setSent(false);

    try {
      window.localStorage.setItem(
        MAGIC_LINK_COOLDOWN_STORAGE_KEY,
        String(Date.now()),
      );
    } catch {
      // The in-flight ref and Supabase Auth's server-side limits remain active.
    }
    setCooldownSeconds(MAGIC_LINK_COOLDOWN_SECONDS);

    try {
      const { error: authError } = await createClient().auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo,
        },
      });

      if (authError) {
        setError(getMagicLinkErrorMessage(authError));
        return;
      }

      // Keep the response generic so the UI does not reveal whether an email is registered.
      setSent(true);
    } catch (requestError) {
      setError(getMagicLinkErrorMessage(requestError));
    } finally {
      requestInFlight.current = false;
      setBusy(false);
      setCooldownSeconds(getRemainingCooldownSeconds());
    }
  }

  const buttonLabel = busy
    ? 'Sending…'
    : cooldownSeconds > 0
      ? `Please wait ${cooldownSeconds}s`
      : sent
        ? 'Resend secure sign-in link'
        : 'Email secure sign-in link';

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
          <div className="mb-2 flex items-center gap-2 text-sm text-red-300">
            <ShieldCheck size={16} /> Private owner access
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in securely</h1>
          <p className="muted text-sm mt-2">
            Use the owner email already registered in Supabase. Member accounts cannot enter this console.
          </p>
        </div>

        {denied && (
          <p role="alert" className="mb-4 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
            This sign-in link belongs to an account without active Owner access (for example, a Member account). You have been signed out. Request a new link using the active Owner email address.
          </p>
        )}
        {callbackError && (
          <p role="alert" className="mb-4 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
            The sign-in link is missing, invalid, or expired. Request a fresh link and open the newest email in this browser.
          </p>
        )}
        {sent && (
          <p role="status" aria-live="polite" className="mb-4 rounded-xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-200">
            Request accepted. If this address belongs to an active Owner account, a sign-in link will arrive by email. Check your inbox and spam folder.
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            Owner email
            <input
              className="field mt-2"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={busy}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSent(false);
                setError('');
              }}
              placeholder="owner@example.com"
            />
          </label>

          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={busy || cooldownSeconds > 0}
            aria-live="polite"
          >
            {buttonLabel}
            {cooldownSeconds === 0 && !busy && <ArrowRight size={16} />}
          </button>
        </form>

        {cooldownSeconds > 0 && (
          <p className="mt-2 text-xs muted" role="status">
            For security, another link can be requested after the 60-second cooldown.
          </p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

        <p className="mt-8 text-[11px] muted">
          Private administration · All access is verified server-side
        </p>
      </section>
    </main>
  );
}
