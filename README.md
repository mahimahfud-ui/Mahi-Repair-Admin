# Mahi Repair Cloud

Private Owner control center and signed recipe distribution backend for the companion Mahi Repair Android app.

## Repository layout

This is a standalone Next.js application. The application root is the repository root; package.json, package-lock.json, src/, supabase/, schemas/, tests/ and docs/ are all at the top level. There is no admin-panel/ subdirectory.

- Next.js 16 App Router, React 19, TypeScript and Tailwind
- Supabase SSR authentication and server-side active-Owner authorization
- PostgreSQL schema, RLS policies and manually managed migrations
- Supabase Edge Functions for Owner administration and Android member/device operations
- Declarative Repair Recipe v1 schema, canonical JSON and RSA-SHA256 signing
- Android API contract and Kotlin signature-verification example

## Quick start

Use Node.js 22.23.4 (see .nvmrc and the package.json engines field).

~~~bash
npm ci
cp .env.example .env.local
npm run dev
~~~

On Windows PowerShell, use Copy-Item .env.example .env.local for the copy step.

Set these values in .env.local. The Owner Auth email is server-only and must never use the `NEXT_PUBLIC_` prefix:

~~~env
NEXT_PUBLIC_SUPABASE_URL=https://shwqsljicmhflnvjqjah.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PROJECT_PUBLISHABLE_KEY
ADMIN_OWNER_EMAIL=owner@example.com
~~~

Run the local checks from the repository root:

~~~bash
npm run check:scaffold
npm run typecheck
npm run lint
npm run test
npm run build
~~~

The application starts with npm run start after a successful production build.

## Shared Android backend

The Admin website and Android client in [mahimahfud-ui/Mahi-Repair](https://github.com/mahimahfud-ui/Mahi-Repair) are separate clients of the same Supabase project (shwqsljicmhflnvjqjah). The APK does not embed Admin routes, Owner credentials, the service-role key or the recipe-signing private key.

- Owner web path: the Owner enters an 8–12 digit PIN; a server action authenticates against the existing Supabase Auth Owner account using the server-only `ADMIN_OWNER_EMAIL`, then verifies `profiles.role='owner' AND status='active'`. The Owner login page does not request or send an email, OTP or Magic Link.
- Android member path: Supabase email OTP → device registration → authorized published-recipe retrieval → on-device RSA signature verification → native allowlisted action execution → run-report submission. Member invitations and Android OTP remain separate member-onboarding email flows.
- Admin operations: member invitations/status, device revoke/restore, recipe drafting/validation/publication, tool state and assignment, analytics, audit records and execution logs.
- Report retries: Android reuses the same run_id as the `repair_runs.id` primary key; a SHA-256 fingerprint makes identical retries idempotent and rejects altered content or a different member reusing the UUID.
- Live updates: private Realtime broadcasts send only opaque event IDs to each authorized Android device and the active Owner Admin Console. Clients refetch through authenticated server endpoints; Realtime payloads never contain recipes or authorization decisions.

See [Android API contract](docs/ANDROID_API_CONTRACT.md), [security model](docs/SECURITY_MODEL.md) and [manual deployment guide](docs/DEPLOYMENT.md).

## Security boundaries

Browser and Android clients use only the Supabase URL and publishable key. The service-role key is used only inside Supabase Edge Functions. The RSA-3072 PKCS#8 signing private key must remain in Supabase Edge Function Secrets; only the matching public key belongs in Android build configuration.

Published versions and audit records are append-only. Authenticated browser database access is read-only and row-gated by RLS. All privileged mutations are routed through authenticated Edge Functions. Recipes are declarative JSON, not executable code: the Android app must reject unknown actions and execute only native action IDs already compiled into the APK.

## CI and source synchronization

The pull-request workflow verifies the complete application committed in this repository with read-only GitHub permissions. It does not sync files from another repository, create commits, push branches or use deployment secrets. There is no automatic source-sync workflow; changes originating in the Android repository must be copied into this repository through a separately reviewed code change.

The CI workflow is not a deployment workflow. No Supabase migrations, Edge Functions, secrets, website hosting service or production environment are changed by CI.

## Design reference

The imported UI archive remains under design-reference/ for reference only. Its mock login and mock data are not part of the active Next.js runtime.
