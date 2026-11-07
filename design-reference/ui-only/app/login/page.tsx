"use client";
import { motion } from "framer-motion";
import { Cpu, Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Field, inputCls, ToastProvider, useToast } from "@/components/ui";

function LoginForm() {
  const router = useRouter(); const toast = useToast();
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [remember, setRemember] = useState(true);
  const submit = (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setTimeout(() => router.push("/"), 900); }; // demo only: no authentication
  return <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
    <div className="pointer-events-none absolute left-1/2 top-[-20%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-3xl" />
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="relative w-full max-w-[400px]">
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-[#0b1210]"><Cpu size={24} /></span>
        <h1 className="text-2xl font-semibold tracking-tight">Mahi Repair Control Center</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in to manage tools, members and devices.</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-panel p-6">
        <Field label="Email"><input type="email" required placeholder="owner@mahirepair.example" className={inputCls} autoComplete="email" /></Field>
        <Field label="Password"><div className="relative"><input type={show ? "text" : "password"} required placeholder="Enter your password" className={inputCls + " pr-10"} autoComplete="current-password" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-ink">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></Field>
        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-muted"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[#7cc4b0]" />Remember me</label>
          <button type="button" onClick={() => toast("Password reset is not connected in this preview", "info")} className="text-accent hover:underline">Forgot password?</button>
        </div>
        <Btn type="submit" variant="primary" className="h-10 w-full" disabled={busy}>{busy ? <><Loader2 size={16} className="animate-spin" />Signing in</> : "Sign in"}</Btn>
      </form>
      <p className="mt-5 text-center text-xs text-muted">Design preview. Any credentials open the demo dashboard.</p>
    </motion.div></div>;
}
export default function LoginPage() { return <ToastProvider><LoginForm /></ToastProvider>; }
