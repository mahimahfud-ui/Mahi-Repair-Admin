# Mahi Repair Control Center — Admin UI

Frontend-only premium admin interface. No backend, authentication, API routes or external services.

## Run
```
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Stack
Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion, Recharts, Lucide icons. Uses the system font stack (no network font loading).

## Structure
- `app/login` — login screen (demo only; any input opens the dashboard)
- `app/(admin)/*` — Overview, Repair Tools, Members, Devices, Repair Reports, Audit Logs, Settings
- `components/ui.tsx` — shared primitives (Modal, Drawer, Dropdown, Toast, Badge, Skeleton, tables)
- `components/shell.tsx` — sidebar, topbar, notifications, profile menu
- `lib/mock-data.ts` — **all demo data and the TypeScript shapes** the UI expects. Replace these exports with real data sources.

## Hand-off notes
- Pages keep state locally (`useState`) and seed it from `lib/mock-data.ts`. Mutations (publish, disable, suspend, revoke, save) only update local state and show a toast; wire those handlers to real operations later.
- `useLoading()` simulates load time to show skeletons; replace with real loading states.
- Login redirect in `app/login/page.tsx` and sign-out in `components/shell.tsx` are navigation-only placeholders.
- No backend contract is assumed; adjust the types in `lib/mock-data.ts` to match real data.
