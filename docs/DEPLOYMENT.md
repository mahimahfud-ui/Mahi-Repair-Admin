# Mahi Repair Admin — production deployment and operations

This guide describes the current standalone Owner website and its shared Supabase backend. The Android Member application is maintained in the separate [Mahi-Repair repository](https://github.com/mahimahfud-ui/Mahi-Repair).

For current evidence and the remaining production acceptance gates, read [CURRENT_PRODUCTION_HANDOVER.md](CURRENT_PRODUCTION_HANDOVER.md) first.

## 1. Canonical architecture and deployment

| Component | Current contract |
|---|---|
| Owner website | This repository, standalone Next.js app |
| Android Member app | [Mahi-Repair](https://github.com/mahimahfud-ui/Mahi-Repair) |
| Shared backend | Supabase project `shwqsljicmhflnvjqjah` |
| Supabase region | `ap-south-1` |
| Canonical Admin origin | `https://mahi-repair-admin-yy7c.onrender.com` |
| Owner login | `https://mahi-repair-admin-yy7c.onrender.com/login` |
| Render service definition | Root [render.yaml](../render.yaml) |

The shorter `mahi-repair-admin.onrender.com` hostname is not the canonical origin. Do not copy old preview URLs or the retired embedded-Admin service URL into Supabase Auth redirects or Edge Function CORS settings.

The checked-in Render Blueprint declares:

- Service: `mahi-repair-admin`
- Repository: `mahimahfud-ui/Mahi-Repair-Admin`
- Branch: `main`
- Runtime: Node.js
- Region: Singapore
- Plan: Free
- Build: `npm ci --no-audit --no-fund && npm run build`
- Start: `npm run start`
- Health check: `/api/health`
- Auto-deploy: `checksPass`

This is the repository's declared hosting configuration. Verify the actual Render service, latest deployed commit SHA, environment and live health endpoint in the Render dashboard before claiming that a deployment is current.

## 2. Local setup

Use Node.js 22.23.4, pinned in `.nvmrc` and `package.json`.

~~~bash
node --version
npm ci
cp .env.example .env.local
npm run dev
~~~

Windows PowerShell:

~~~powershell
Copy-Item .env.example .env.local
~~~

Configure browser-safe values locally:

~~~env
NEXT_PUBLIC_SUPABASE_URL=https://shwqsljicmhflnvjqjah.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PROJECT_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
~~~

The Owner Auth identifier belongs only in the server-side host environment:

~~~env
ADMIN_OWNER_EMAIL=THE_EXISTING_OWNER_AUTH_EMAIL
~~~

Never put an Owner PIN, Supabase service-role/secret key, database password, access token, email-provider credential or RSA private signing key in source control, browser variables, Android resources or chat.

## 3. Verify the website build

Run from the repository root:

~~~bash
npm ci --no-audit --no-fund
npm run check:scaffold
npm run typecheck
npm run lint
npm run test
npm run build
npm run start
~~~

The GitHub CI workflow validates repository code. It does not deploy Supabase migrations, Edge Functions, secrets or production data.

## 4. Render environment and health

The Render service should use the repository root and the commands declared in `render.yaml`.

Required environment values:

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Shared Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Supabase publishable client key |
| `NEXT_PUBLIC_APP_URL` | Browser-safe | Exact canonical Admin origin, no trailing slash |
| `ADMIN_OWNER_EMAIL` | Server-only | Existing Owner Auth identity; never use the `NEXT_PUBLIC_` prefix |

The `/api/health` endpoint reports whether required configuration values are present. It does not prove that Owner authentication succeeds, that database queries work, or that email delivery and recipe signing are ready.

After deployment, verify:

1. The production site and `/login` load over HTTPS.
2. `/api/health` returns HTTP 200 and `ready: true`.
3. The deployed commit SHA matches the intended reviewed `main` commit.
4. Owner PIN login succeeds and Member identities are denied from Owner-only routes.
5. Server logs do not expose PINs, tokens, email credentials or signing material.

## 5. Owner PIN authentication

The Owner enters an 8–12 digit numeric PIN. The server action uses the server-only `ADMIN_OWNER_EMAIL` to authenticate against the existing Supabase Auth account with `signInWithPassword`, then verifies that the matching `public.profiles` row has:

- `role = 'owner'`
- `status = 'active'`

The PIN is the existing Owner Auth account password. It is not stored in this repository, an environment file, browser storage or the Android app. Configure or rotate it directly through the approved Supabase Auth administration path. Use a random PIN and keep Auth rate limits enabled.

Every protected console page and privileged server action must continue to enforce the server-side Owner guard. Never infer Owner authority from a local UI flag, a client-supplied role, or a Member account.

## 6. Supabase project, migrations and Edge Functions

The canonical project is `shwqsljicmhflnvjqjah` in `ap-south-1`. Before any database change:

1. Confirm the project reference and production target.
2. Inspect the live migration history.
3. Compare it with the checked-in migration files.
4. Review the SQL and RLS consequences.
5. Use a development/staging branch for migration tests where possible.
6. Obtain explicit production-change approval before applying a production migration.

The production inspection on 20 November 2026 found these nine applied migrations:

- `20261105171141_202611050001_initial_schema.sql`
- `20261105171330_20261105180000_harden_rls_grants_and_indexes.sql`
- `20261105171827_20261105183000_deny_browser_rate_limit_access.sql`
- `20261106170418_private_realtime_catalog_broadcast.sql`
- `20261106170438_backend_report_idempotency_and_atomic_catalog.sql`
- `20261106170450_transactional_admin_mutations_audit.sql`
- `20261106170509_atomic_member_catalog_and_device_registration.sql`
- `20261108161813_device_intelligence_telemetry.sql`
- `20261108162722_device_tool_syncs_tool_version_index.sql`

The same inspection found 17 ACTIVE production Edge Functions:

- `admin-assign-tool`
- `admin-delete-draft-tool`
- `admin-disable-tool`
- `admin-invite-member`
- `admin-manage-device`
- `admin-manage-member`
- `admin-manage-tool-state`
- `admin-publish-tool`
- `admin-save-validation`
- `admin-upsert-tool`
- `get-admin-analytics`
- `get-admin-dashboard`
- `get-my-repair-tools`
- `get-signed-repair-tool`
- `register-device`
- `send-email-hook`
- `submit-repair-run`

All 17 were reported ACTIVE at inspection time. Sixteen require JWT verification; `send-email-hook` has JWT verification disabled because it validates the signed Supabase Auth webhook signature. Re-check current production state before each release; function ACTIVE status alone does not prove end-to-end behavior.

The public schema had nine tables with RLS enabled. The live database contained one active Owner profile and one active Member profile, but no registered devices, repair tools, published tool versions, repair runs or audit events at the time of inspection.

Do not run `supabase db push`, apply a migration, reset a branch or redeploy all functions as a generic troubleshooting step. Do not assume a local migration is already applied or that an applied migration should be applied again.

## 7. Edge Function secrets and recipe signing

Supabase Edge Functions receive their reserved project credentials server-side. Never expose or copy the service-role/secret key into the Admin website or Android app.

The recipe publisher requires the custom Edge Function secret `RECIPE_SIGNING_PRIVATE_KEY_PEM`. It must be an RSA-3072 PKCS#8 private key matching the X.509 public key embedded in the Android build. Keep the private key only in Supabase Edge Function Secrets.

The public/private key match was not verifiable through the connected management tools during the 20 November audit. Therefore:

- Do not publish a real repair tool until the existing production key is securely proven to match Android's public key.
- Do not print, commit, upload to the website, or send the private key.
- Do not generate a replacement key as a shortcut; coordinate any key rotation across the signer and Android verifier.
- Use a signing verification test that returns only pass/fail and safe key fingerprints, never secret material.

## 8. Member invitation and email OTP

Member onboarding is separate from Owner PIN login.

The production Auth hook function was ACTIVE during inspection, but actual message delivery was not proven. Before inviting real Members:

1. Confirm the Supabase Auth Send Email Hook points to the deployed `send-email-hook`.
2. Verify the signed webhook secret and the provider credentials in the correct server-side secret stores.
3. Confirm a verified sender domain and its SPF/DKIM/DMARC records.
4. Confirm Supabase Auth Site URL is `https://mahi-repair-admin-yy7c.onrender.com`.
5. Confirm the Additional Redirect URL includes `https://mahi-repair-admin-yy7c.onrender.com/**`.
6. Run one consented test invitation and verify inbox delivery.
7. Complete the Android Member OTP flow using that invited account.

The live Auth URL allowlist and end-to-end email delivery were not independently verified in the 20 November audit. Do not treat a repository `config.toml` entry or an ACTIVE function as proof of live dashboard configuration.

## 9. Repair Tool publishing and Android contract

The Owner workflow is:

1. Create a draft Repair Tool.
2. Validate it against the shared Repair Recipe v1 schema.
3. Review every action and parameter against the Android native allowlist.
4. Publish a new immutable version using the server-side RSA signer.
5. Assign the tool to all active Members or selected Members.
6. Confirm the Android device fetches the release through authenticated Edge Functions.
7. Verify the exact signed payload bytes before parsing.
8. Execute only native action IDs compiled into the APK, with user confirmation where required.
9. Confirm the report appears in Admin Logs.

Android must perform a fresh server authorization before execution when immediate revocation is required. A cached recipe is not a substitute for a fresh device/member authorization check.

## 10. Live Realtime and report integrity

Private Realtime events are opaque invalidation hints, not authorization or recipe payloads. Clients must refetch through the authenticated Edge Functions.

Verify:

- Project-level public Realtime access remains disabled.
- Only an active Owner can receive the Owner topic.
- Each active Member can receive only their own non-revoked device topic.
- Tool publication/assignment, Member status changes, device revocation and report commits produce the intended invalidation events.
- Identical retries with the same `run_id` are idempotent.
- Reusing a `run_id` with altered content or another identity returns a conflict.
- Offline reports remain queued locally until the server acknowledges the exact report.

## 11. Production release acceptance

Do not declare the product production-ready until the following complete on an actual Android handset:

- Owner PIN login and Owner-only Admin access.
- Member invite email received and Android OTP sign-in completed.
- Device appears under the correct Member in Admin.
- RSA private/public signing key match proven without exposing the private key.
- Owner creates, validates, publishes and assigns a safe repair tool.
- Android fetches and verifies the signed tool, then runs a supported action.
- Report is visible in Admin Logs.
- Disable/unpublish, Member suspension, device revocation, offline/reconnect, duplicate retry, token refresh and Realtime behavior pass.
- A stable production-signed APK/AAB installs and upgrades using the existing application ID and upload signing identity.

## 12. Operational security

The 20 November 2026 Supabase Security Advisor inspection reported `auth_leaked_password_protection` as a warning. Enable leaked-password protection in Supabase Auth security settings and re-check the advisor result.

Also complete:

- Backup and restore rehearsal.
- Privacy-safe Render and Supabase log review.
- Alerting for website, Auth, Edge Function and database failures.
- Signing-key backup, rotation and revocation procedure.
- Incident response and rollback runbook.
- Periodic review of RLS, Storage policies and Auth settings.

## 13. Live App Update Engine — not yet deployed

Do not confuse the earlier Android integration branch's live-update implementation with production deployment. The 20 November production inspection found no Storage buckets, no app-update release migration and none of these production functions:

- `admin-publish-app-update`
- `get-app-update-manifest`
- `get-app-update-asset-url`

A separate, reviewed implementation and deployment process is required for the App Update Manager, private release bucket, signed manifests, content ZIP packages, APK assets and per-device update telemetry. Do not apply the draft update migration or deploy those functions directly to production before review, staging validation, and key/authorization acceptance.

## Release decision

**NOT FULLY PRODUCTION READY.** The shared Supabase project, schema, RLS tables, core Edge Functions and separate Admin source are in place. Live Owner authentication, email delivery, signing-key compatibility, physical-device enrolment, end-to-end Repair execution/reporting, production Android signing and the App Update Engine still require evidence.
