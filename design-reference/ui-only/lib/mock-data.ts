// DEMO DATA ONLY — replace with real data sources later. UI components import types from here
// but never hard-code records, so swapping in real data means replacing these exports.

export type ToolStatus = "Draft" | "Published" | "Disabled";
export type RecipeStep = { id: string; title: string; command: string };
export type Tool = { id: string; name: string; category: string; status: ToolStatus; version: string; updated: string; runs: number; successRate: number; description: string; steps: RecipeStep[] };
export type Member = { id: string; name: string; email: string; plan: "Pro" | "Team" | "Trial"; access: "Active" | "Suspended" | "Pending"; devices: number; joined: string; lastSeen: string; repairs: number };
export type Device = { id: string; name: string; owner: string; model: string; os: string; status: "Online" | "Offline" | "Revoked"; lastSeen: string; registered: string };
export type Report = { id: string; tool: string; member: string; device: string; result: "Success" | "Failed"; duration: string; when: string; notes: string };
export type LogEntry = { id: string; actor: string; action: string; target: string; kind: "publish" | "disable" | "revoke" | "member" | "settings" | "login"; when: string };

export const stats = [
  { label: "Active members", value: "1,284", delta: "+6.2%", up: true, spark: [12, 14, 13, 17, 16, 20, 22] },
  { label: "Registered devices", value: "2,016", delta: "+3.1%", up: true, spark: [9, 10, 12, 11, 13, 14, 14] },
  { label: "Repairs this week", value: "4,872", delta: "+12.4%", up: true, spark: [8, 12, 11, 15, 14, 19, 24] },
  { label: "Failure rate", value: "3.8%", delta: "-0.9%", up: false, spark: [9, 8, 9, 7, 6, 6, 5] },
];

export const repairsOverTime = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({
  day: d, success: [520, 610, 580, 702, 760, 540, 488][i], failed: [24, 31, 22, 29, 33, 18, 16][i],
}));
export const repairsByTool = [
  { tool: "Bootloop Fix", count: 1420 }, { tool: "IMEI Repair", count: 1105 }, { tool: "FRP Reset", count: 890 },
  { tool: "Baseband Restore", count: 612 }, { tool: "Storage Rebuild", count: 388 },
];

export const tools: Tool[] = [
  { id: "t1", name: "Bootloop Fix", category: "System", status: "Published", version: "2.4.1", updated: "2 hours ago", runs: 1420, successRate: 97.2, description: "Clears corrupted boot partitions and restores a clean boot chain.", steps: [{ id: "s1", title: "Detect device mode", command: "probe --mode" }, { id: "s2", title: "Backup boot partition", command: "dump boot --safe" }, { id: "s3", title: "Rebuild boot chain", command: "flash boot --verify" }] },
  { id: "t2", name: "IMEI Repair", category: "Radio", status: "Published", version: "1.9.0", updated: "Yesterday", runs: 1105, successRate: 94.8, description: "Restores identifiers after a failed firmware update.", steps: [{ id: "s1", title: "Read NVRAM", command: "nv read" }, { id: "s2", title: "Write identifiers", command: "nv write --confirm" }] },
  { id: "t3", name: "FRP Reset", category: "Security", status: "Published", version: "3.0.2", updated: "3 days ago", runs: 890, successRate: 92.1, description: "Removes the factory reset protection lock for verified owners.", steps: [{ id: "s1", title: "Verify ownership", command: "verify --owner" }, { id: "s2", title: "Clear lock state", command: "frp clear" }] },
  { id: "t4", name: "Baseband Restore", category: "Radio", status: "Draft", version: "0.8.0", updated: "5 days ago", runs: 0, successRate: 0, description: "Reinstalls baseband firmware from a verified image.", steps: [{ id: "s1", title: "Select image", command: "image pick" }] },
  { id: "t5", name: "Storage Rebuild", category: "System", status: "Published", version: "1.2.5", updated: "1 week ago", runs: 388, successRate: 95.6, description: "Repairs partition tables and rebuilds the data volume.", steps: [{ id: "s1", title: "Scan partitions", command: "scan --deep" }, { id: "s2", title: "Rebuild table", command: "parted rebuild" }] },
  { id: "t6", name: "Legacy Recovery", category: "System", status: "Disabled", version: "1.0.3", updated: "3 weeks ago", runs: 214, successRate: 71.4, description: "Older recovery flow, replaced by Bootloop Fix.", steps: [{ id: "s1", title: "Enter recovery", command: "recovery enter" }] },
];

export const members: Member[] = [
  { id: "m1", name: "Aarav Mehta", email: "aarav@lumenlabs.io", plan: "Team", access: "Active", devices: 4, joined: "Jan 12, 2026", lastSeen: "Just now", repairs: 312 },
  { id: "m2", name: "Sofia Alvarez", email: "sofia@fixbench.co", plan: "Pro", access: "Active", devices: 2, joined: "Feb 03, 2026", lastSeen: "12 min ago", repairs: 188 },
  { id: "m3", name: "Daniel Okafor", email: "daniel@okafor.repair", plan: "Pro", access: "Suspended", devices: 1, joined: "Feb 21, 2026", lastSeen: "6 days ago", repairs: 54 },
  { id: "m4", name: "Mei Tanaka", email: "mei@tanakaworks.jp", plan: "Team", access: "Active", devices: 6, joined: "Mar 08, 2026", lastSeen: "1 hour ago", repairs: 421 },
  { id: "m5", name: "Lucas Rinaldi", email: "lucas@rinaldi.it", plan: "Trial", access: "Pending", devices: 0, joined: "Nov 04, 2026", lastSeen: "Never", repairs: 0 },
  { id: "m6", name: "Priya Nair", email: "priya@nairmobile.in", plan: "Pro", access: "Active", devices: 3, joined: "Apr 17, 2026", lastSeen: "Yesterday", repairs: 97 },
];

export const devices: Device[] = [
  { id: "d1", name: "Workbench-01", owner: "Aarav Mehta", model: "ThinkPad T14", os: "Windows 11", status: "Online", lastSeen: "Just now", registered: "Jan 12, 2026" },
  { id: "d2", name: "Studio Mac", owner: "Sofia Alvarez", model: "MacBook Pro 14", os: "macOS 15", status: "Online", lastSeen: "4 min ago", registered: "Feb 03, 2026" },
  { id: "d3", name: "Bench-Laptop", owner: "Daniel Okafor", model: "Dell XPS 13", os: "Windows 11", status: "Offline", lastSeen: "6 days ago", registered: "Feb 21, 2026" },
  { id: "d4", name: "Lab-Tower", owner: "Mei Tanaka", model: "Custom Desktop", os: "Ubuntu 24.04", status: "Online", lastSeen: "1 min ago", registered: "Mar 08, 2026" },
  { id: "d5", name: "Old-Rig", owner: "Mei Tanaka", model: "Optiplex 7040", os: "Windows 10", status: "Revoked", lastSeen: "2 months ago", registered: "Mar 09, 2026" },
  { id: "d6", name: "Field-Kit", owner: "Priya Nair", model: "Surface Go 3", os: "Windows 11", status: "Offline", lastSeen: "Yesterday", registered: "Apr 17, 2026" },
];

export const reports: Report[] = [
  { id: "r1", tool: "Bootloop Fix", member: "Aarav Mehta", device: "Workbench-01", result: "Success", duration: "2m 14s", when: "6 min ago", notes: "Boot chain rebuilt and verified on first pass." },
  { id: "r2", tool: "IMEI Repair", member: "Sofia Alvarez", device: "Studio Mac", result: "Success", duration: "1m 02s", when: "22 min ago", notes: "Identifiers restored; signal confirmed." },
  { id: "r3", tool: "FRP Reset", member: "Mei Tanaka", device: "Lab-Tower", result: "Failed", duration: "0m 48s", when: "1 hour ago", notes: "Ownership check timed out. Retry with a stable connection." },
  { id: "r4", tool: "Storage Rebuild", member: "Priya Nair", device: "Field-Kit", result: "Success", duration: "5m 31s", when: "3 hours ago", notes: "Partition table rebuilt; 0 bad sectors." },
  { id: "r5", tool: "Bootloop Fix", member: "Aarav Mehta", device: "Workbench-01", result: "Failed", duration: "1m 56s", when: "Yesterday", notes: "Backup step failed: not enough free space." },
  { id: "r6", tool: "IMEI Repair", member: "Mei Tanaka", device: "Lab-Tower", result: "Success", duration: "1m 20s", when: "Yesterday", notes: "Completed without warnings." },
];

export const logs: LogEntry[] = [
  { id: "l1", actor: "Owner", action: "Published tool", target: "Bootloop Fix v2.4.1", kind: "publish", when: "2 hours ago" },
  { id: "l2", actor: "Owner", action: "Revoked device", target: "Old-Rig (Mei Tanaka)", kind: "revoke", when: "5 hours ago" },
  { id: "l3", actor: "Owner", action: "Suspended member", target: "Daniel Okafor", kind: "member", when: "Yesterday" },
  { id: "l4", actor: "Owner", action: "Disabled tool", target: "Legacy Recovery", kind: "disable", when: "3 weeks ago" },
  { id: "l5", actor: "Owner", action: "Changed setting", target: "Two-step verification enabled", kind: "settings", when: "3 weeks ago" },
  { id: "l6", actor: "Owner", action: "Signed in", target: "Chrome on macOS", kind: "login", when: "Today, 08:42" },
];

export const notifications = [
  { id: "n1", title: "FRP Reset failed twice in a row", body: "Check the latest reports for Mei Tanaka.", when: "1h", unread: true },
  { id: "n2", title: "New member awaiting approval", body: "Lucas Rinaldi requested access.", when: "3h", unread: true },
  { id: "n3", title: "Weekly summary is ready", body: "4,872 repairs completed this week.", when: "1d", unread: false },
];
