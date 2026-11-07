"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, Search, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

export const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");
export const ease = [0.22, 1, 0.36, 1] as const;

/* ---------- loading ---------- */
export function useLoading(ms = 700) {
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), ms); return () => clearTimeout(t); }, [ms]);
  return loading;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("relative overflow-hidden rounded-lg bg-raised", className)}>
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
  </div>;
}

/* ---------- surfaces ---------- */
export function Card({ children, className, hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={cn("rounded-2xl border border-line bg-panel", hover && "transition-all duration-200 hover:-translate-y-0.5 hover:border-[#34373e]", className)}>{children}</div>;
}
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div>
    <div className="flex items-center gap-2">{children}</div>
  </div>;
}

/* ---------- buttons & badges ---------- */
type BtnProps = { children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "danger" | "outline"; className?: string; type?: "button" | "submit"; disabled?: boolean; "aria-label"?: string };
export function Btn({ children, onClick, variant = "outline", className, type = "button", disabled, ...rest }: BtnProps) {
  const v = {
    primary: "bg-accent text-[#0b1210] hover:bg-[#92d3c0] font-medium",
    outline: "border border-line bg-raised text-ink hover:border-[#3a3d44] hover:bg-[#202227]",
    ghost: "text-muted hover:bg-raised hover:text-ink",
    danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
  }[variant];
  return <motion.button whileTap={{ scale: 0.97 }} type={type} onClick={onClick} disabled={disabled} aria-label={rest["aria-label"]}
    className={cn("inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm transition-colors disabled:opacity-50", v, className)}>{children}</motion.button>;
}
const tones: Record<string, string> = {
  green: "bg-accent/12 text-accent", red: "bg-danger/12 text-danger", amber: "bg-warn/12 text-warn", gray: "bg-white/[0.06] text-muted",
};
const toneFor: Record<string, string> = { Published: "green", Active: "green", Online: "green", Success: "green", Draft: "amber", Pending: "amber", Trial: "amber", Disabled: "gray", Offline: "gray", Revoked: "red", Suspended: "red", Failed: "red", Pro: "gray", Team: "gray" };
export function Badge({ label, dot = true }: { label: string; dot?: boolean }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", tones[toneFor[label] ?? "gray"])}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{label}</span>;
}

/* ---------- inputs ---------- */
export function SearchInput({ value, onChange, placeholder = "Search" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [focus, setFocus] = useState(false);
  return <motion.div animate={{ width: focus ? 300 : 240 }} transition={{ duration: 0.25, ease }} className={cn("flex h-9 max-w-full items-center gap-2 rounded-lg border bg-raised px-3 transition-colors", focus ? "border-accent/60" : "border-line")}>
    <Search size={15} className={focus ? "text-accent" : "text-muted"} />
    <input value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} placeholder={placeholder}
      className="w-full bg-transparent text-sm outline-none placeholder:text-muted focus-visible:outline-none" aria-label={placeholder} />
    {value && <button onClick={() => onChange("")} aria-label="Clear search" className="text-muted hover:text-ink"><X size={14} /></button>}
  </motion.div>;
}
export function Chips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-raised p-1">
    {options.map((o) => <button key={o} onClick={() => onChange(o)} className="relative rounded-md px-3 py-1 text-sm text-muted transition-colors hover:text-ink">
      {value === o && <motion.span layoutId={`chip-${options.join("")}`} transition={{ duration: 0.25, ease }} className="absolute inset-0 rounded-md bg-[#2a2d33]" />}
      <span className={cn("relative", value === o && "text-ink")}>{o}</span></button>)}
  </div>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm text-muted">{label}</span>{children}</label>;
}
export const inputCls = "h-10 w-full rounded-lg border border-line bg-raised px-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/60";
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn("relative h-6 w-11 rounded-full transition-colors", on ? "bg-accent" : "bg-[#2e3036]")}>
    <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white", on ? "right-0.5" : "left-0.5")} /></button>;
}

/* ---------- overlays ---------- */
function useEsc(open: boolean, close: () => void) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === "Escape" && close(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [open, close]);
}
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEsc(open, onClose);
  return <AnimatePresence>{open && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ duration: 0.22, ease }}
      className="relative w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
      <h3 className="text-lg font-semibold">{title}</h3><div className="mt-2 text-sm text-muted">{children}</div>
      {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
    </motion.div></div>}</AnimatePresence>;
}
export function Drawer({ open, onClose, title, children, width = "max-w-lg" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  useEsc(open, onClose);
  return <AnimatePresence>{open && <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/50" />
    <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.32, ease }}
      className={cn("absolute right-0 top-0 flex h-full w-full flex-col border-l border-line bg-panel", width)}>
      <div className="flex items-center justify-between border-b border-line px-6 py-4"><h2 className="font-semibold">{title}</h2>
        <button onClick={onClose} aria-label="Close panel" className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-ink"><X size={18} /></button></div>
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </motion.aside></div>}</AnimatePresence>;
}
export function Dropdown({ trigger, children, align = "right", label }: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  useEsc(open, () => setOpen(false));
  return <div ref={ref} className="relative">
    <button onClick={() => setOpen((o) => !o)} aria-label={label} aria-expanded={open} aria-haspopup="menu">{trigger}</button>
    <AnimatePresence>{open && <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.16, ease }}
      className={cn("absolute top-full z-30 mt-2 min-w-[220px] origin-top rounded-xl border border-line bg-panel p-1.5 shadow-2xl", align === "right" ? "right-0" : "left-0")}>{children(() => setOpen(false))}</motion.div>}</AnimatePresence></div>;
}
export function MenuItem({ icon, children, onClick, danger }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-raised", danger ? "text-danger" : "text-ink")}>{icon}{children}</button>;
}

/* ---------- toasts ---------- */
type Toast = { id: number; msg: string; tone: "ok" | "err" | "info" };
const ToastCtx = createContext<(msg: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random(); setItems((s) => [...s, { id, msg, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3200);
  }, []);
  const Icon = { ok: CheckCircle2, err: AlertTriangle, info: Info };
  return <ToastCtx.Provider value={push}>{children}
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
      <AnimatePresence>{items.map((t) => { const I = Icon[t.tone]; return <motion.div key={t.id} layout initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.25, ease }}
        className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-line bg-raised px-4 py-3 text-sm shadow-xl">
        <I size={16} className={t.tone === "ok" ? "text-accent" : t.tone === "err" ? "text-danger" : "text-warn"} />{t.msg}</motion.div>; })}</AnimatePresence>
    </div></ToastCtx.Provider>;
}

/* ---------- table helpers ---------- */
export function TableCard({ children }: { children: ReactNode }) {
  return <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">{children}</table></div></Card>;
}
export const Th = ({ children }: { children?: ReactNode }) => <th className="whitespace-nowrap border-b border-line px-5 py-3 text-xs font-medium text-muted">{children}</th>;
export const Tr = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
  <tr onClick={onClick} className={cn("border-b border-line/60 transition-colors last:border-0 hover:bg-raised/70", onClick && "cursor-pointer")}>{children}</tr>;
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn("px-5 py-3.5", className)}>{children}</td>;
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#262a2f] text-xs font-medium text-accent">{initials}</span>;
}
export function Empty({ title, hint }: { title: string; hint: string }) {
  return <div className="px-6 py-14 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted">{hint}</p></div>;
}
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return <Card className="space-y-3 p-5">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</Card>;
}
