# Mahi Repair Cloud

Private owner control center and signed recipe distribution backend for a companion Android repair app.

## What this repository contains

- Next.js 16 App Router + TypeScript + Tailwind owner console
- Supabase SSR authentication and server-side owner authorization
- Supabase PostgreSQL migration with RLS, owner/member roles, devices, tools, immutable versions, assignments, runs, audit records and rate limits
- Supabase Edge Functions for invitations, member management, tool drafts, publishing, disabling, unpublishing/archiving, assignment, signed delivery, device registration, run submission and analytics
- JSON Repair Recipe DSL schema and validation
- RSA-SHA256 detached signature implementation
- Android API and security contract documentation
- Kotlin RSA verification example for the companion APK

## Quick start

Read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), configure `.env.local` from `.env.example`, apply the migration, bootstrap the owner manually and deploy Edge Functions. See [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md) for the exact checks run and the checks still blocked by missing dependencies/credentials.

```bash
npm install
npm run dev
```

## Important boundaries

This web repository does not contain an Android executor. The Android APK must implement every supported action natively and must verify the detached RSA-SHA256 signature over the exact `signed_payload` UTF-8 bytes before parsing. It must reject all unknown actions and must never run downloaded code.

Do not expose the Supabase service-role key or RSA private key to browsers, Android or source control. The app is not production-ready until the items in [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) have been verified in the target Supabase and Android environments.
