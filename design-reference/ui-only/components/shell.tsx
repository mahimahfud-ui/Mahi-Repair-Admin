"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronRight, Cpu, FileText, History, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, Smartphone, UserCog, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { notifications } from "@/lib/mock-data";
import { Avatar, cn, Dropdown, ease, MenuItem, ToastProvider, useToast } from "./ui";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/tools", label: "Repair Tools", icon: Wrench },
  { href: "/members", label: "Members", icon: Users },
  { href: "/devices", label: "Devices", icon: Smartphone },
  { href: "/reports", label: "Repair Reports", icon: FileText },
  { href: "/logs", label: "Audit Logs", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Brand({ collapsed }: { collapsed: boolean }) {
  return <div className="flex h-16 items-center gap-3 px-5">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-[#0b1210]"><Cpu size={18} /></span>
    <AnimatePresence initial={false}>{!collapsed && <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden whitespace-nowrap text-sm font-semibold">Mahi Repair <span className="font-normal text-muted">Control Center</span></motion.span>}</AnimatePresence>
  </div>;
}
function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  return <nav className="flex-1 space-y-1 px-3 py-2">{nav.map(({ href, label, icon: Icon }) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return <Link key={href} href={href} onClick={onNavigate} title={collapsed ? label : undefined}
      className={cn("group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors", active ? "text-ink" : "text-muted hover:bg-raised hover:text-ink")}>
      {active && <motion.span layoutId="nav-active" transition={{ duration: 0.28, ease }} className="absolute inset-0 rounded-lg bg-raised ring-1 ring-line" />}
      {active && <motion.span layoutId="nav-bar" className="absolute -left-3 h-5 w-[3px] rounded-r bg-accent" />}
      <Icon size={18} className={cn("relative shrink-0 transition-transform group-hover:scale-110", active && "text-accent")} />
      {!collapsed && <span className="relative whitespace-nowrap">{label}</span>}
    </Link>; })}</nav>;
}

function Topbar({ onMenu, collapsed, toggle }: { onMenu: () => void; collapsed: boolean; toggle: () => void }) {
  const path = usePathname(); const router = useRouter(); const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [read, setRead] = useState(false);
  const current = nav.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)));
  const unread = !read && notifications.some((n) => n.unread);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  const go = () => { const m = nav.find((n) => n.label.toLowerCase().includes(q.trim().toLowerCase())); if (q.trim() && m) { router.push(m.href); setQ(""); } else if (q.trim()) toast("No page matches that search", "info"); };
  return <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-xl md:px-6">
    <button onClick={onMenu} aria-label="Open navigation" className="rounded-lg p-2 text-muted hover:bg-raised md:hidden"><Menu size={20} /></button>
    <button onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-ink md:block">{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-xs text-muted"><span>Control Center</span><ChevronRight size={12} /><span>{current?.label ?? "Page"}</span></div>
      <div className="truncate text-sm font-medium">{current?.label ?? "Page"}</div>
    </div>
    <div className="ml-auto flex items-center gap-2">
      <div className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-line bg-raised px-3 transition-colors focus-within:border-accent/60 sm:flex">
        <Search size={15} className="text-muted" />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Search pages" aria-label="Global search" className="w-full bg-transparent text-sm outline-none placeholder:text-muted focus-visible:outline-none" />
        <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">⌘K</kbd>
      </div>
      <Dropdown label="Notifications" trigger={<span className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink"><Bell size={18} />
        {unread && <span className="absolute right-2 top-2 flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-accent" /><span className="relative h-2 w-2 rounded-full bg-accent" /></span>}</span>}>
        {(close) => <div className="w-80">
          <div className="flex items-center justify-between px-3 py-2"><span className="text-sm font-medium">Notifications</span><button onClick={() => { setRead(true); toast("All notifications marked read"); close(); }} className="text-xs text-accent hover:underline">Mark all read</button></div>
          {notifications.map((n) => <div key={n.id} className="flex gap-3 rounded-lg px-3 py-2.5 hover:bg-raised"><span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.unread && !read ? "bg-accent" : "bg-transparent")} />
            <div className="min-w-0"><p className="text-sm">{n.title}</p><p className="text-xs text-muted">{n.body} · {n.when}</p></div></div>)}
        </div>}
      </Dropdown>
      <Dropdown label="Owner menu" trigger={<span className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-raised"><Avatar name="Mahi Owner" /><span className="hidden text-left text-sm sm:block">Owner</span></span>}>
        {(close) => <>
          <div className="px-3 py-2"><p className="text-sm font-medium">Mahi Owner</p><p className="text-xs text-muted">owner@mahirepair.example</p></div>
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<UserCog size={16} />} onClick={() => { router.push("/settings"); close(); }}>Account settings</MenuItem>
          <MenuItem icon={<LogOut size={16} />} danger onClick={() => { close(); router.push("/login"); }}>Sign out</MenuItem>
        </>}
      </Dropdown>
    </div>
  </header>;
}

export function Shell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  return <ToastProvider>
    <div className="flex min-h-screen">
      <motion.aside animate={{ width: collapsed ? 72 : 248 }} transition={{ duration: 0.28, ease }} className="sticky top-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-line bg-panel md:flex">
        <Brand collapsed={collapsed} /><NavList collapsed={collapsed} />
        {!collapsed && <div className="m-3 rounded-xl border border-line bg-raised p-3 text-xs text-muted"><p className="font-medium text-ink">Demo preview</p>All data shown is sample data.</div>}
      </motion.aside>
      <AnimatePresence>{mobile && <div className="fixed inset-0 z-40 md:hidden">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} className="absolute inset-0 bg-black/60" />
        <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ duration: 0.28, ease }} className="absolute left-0 top-0 flex h-full w-[264px] flex-col border-r border-line bg-panel">
          <Brand collapsed={false} /><NavList collapsed={false} onNavigate={() => setMobile(false)} /></motion.aside></div>}</AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobile(true)} collapsed={collapsed} toggle={() => setCollapsed((c) => !c)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  </ToastProvider>;
}
