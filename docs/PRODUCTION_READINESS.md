# Mahi Repair — production readiness (verified 8 November 2026)

This document separates verified production state from work that is still blocked. A successful deployment or CI run is not an end-to-end acceptance test.

## Verified production state

### Admin web service
- Render service: `mahi-repair-admin` (Singapore, Node.js 22.23.4, Free plan).
- Public origin: `https://mahi-repair-admin.onrender.com`.
- Connected Git branch: `main`; deployed commit: `c7ae4df03f5de3ffea44b03cdbe14dd5cdd4893e`.
- Deployment `dep-dbo8q6jbc2fs73floqdg` completed successfully and is LIVE.
- Render health-check path is `/api/health`. On `main` this endpoint still returns an unconditional healthy response. PR #3 replaces it with a no-store configuration-readiness response (200 only when required configuration is present, otherwise 503).
- The Render log integration currently exposes `app` and `build` logs, but not `request` logs. Route-specific HTTP status codes for `/login` and `/auth/callback` therefore cannot currently be independently verified from Render telemetry.

### Production environment configuration
The Render service has been configured with:
- The Supabase project URL for the production project.
- An enabled Supabase publishable key.
- Server-only `ADMIN_OWNER_EMAIL` set to the existing Owner Auth email.

The values are intentionally not reproduced in this document. No service-role key, password, PIN, SMTP credential, private signing key or other secret belongs in a public repository or client build.

### Supabase backend
- Project ref: `shwqsljicmhflnvjqjah`; project reports `ACTIVE_HEALTHY`; PostgreSQL 17.
- All 7 repository migrations are present in the production migration history.
- All 15 production Edge Functions report `ACTIVE` with JWT verification enabled.
- RLS is enabled on all 9 public tables and on `realtime.messages`.
- The public schema has no `anon` table grants; `authenticated` table grants are read-only. The checked security-definer RPCs are executable by `service_role`, not by `anon` or `authenticated`.
- Private Realtime SELECT policies restrict the Admin broadcast to active Owners and Member broadcasts to an active Member's own non-revoked device topic.
- Current database records: 2 profiles, 1 active Owner, 1 active Member, 0 devices, 0 repair tools, 0 published versions, 0 repair runs, and 0 admin audit events.

### Account boundary
- Existing verified Owner profile: role `owner`, status `active`.
- Existing verified Member profile: role `member`, status `active`.
- These identities and roles must remain unchanged. The Member account must never be promoted or used as an Owner fallback.
- The Owner's successful PIN login has not yet been verified against the live website. Do not treat an active profile as proof of a successful session.

## Code and CI work in review

### Admin PR #3 — draft, not merged
[PR #3](https://github.com/mahimahfud-ui/Mahi-Repair-Admin/pull/3)
- Requires the authenticated Supabase user email to match the server-configured Owner email as well as an active Owner profile, for both PIN sign-in and protected server routes.
- Replaces the unconditional health response with runtime checks for Supabase URL, publishable-key format and configured Owner identity. It does not disclose the values.
- Adds tests for Owner identity mismatches and degraded/missing runtime configuration.
- Latest recorded Admin CI run for PR head `1a5fac9442bc2a7cfc1ed6a0c70078897f4386d7` passed. PR remains draft and has not been merged or deployed.

### Android PR #13 — draft, not merged
[PR #13](https://github.com/mahimahfud-ui/Mahi-Repair/pull/13)
- Fixes the known Kotlin compile errors in signature-verification and history UI code, and removes an unused legacy dialog that referenced a deleted ViewModel method.
- Populates Android `.env.example` with the public Supabase project URL/publishable key and the repository's RSA-3072 public key. Private signing material is not included.
- The optional legacy Mahi API endpoints remain fail-closed placeholders because no production Mahi API service is deployed.
- The latest Android CI build for the updated head is still pending. The main branch's previously inspected Android CI was failing. No production-signed APK/AAB has been produced or verified.

## Remaining production blockers

### 1. Signing-key secret and signature compatibility
- The Supabase Edge Function source requires `RECIPE_SIGNING_PRIVATE_KEY_PEM` to sign published tool releases.
- The Android client verifies signatures using the public key in its build configuration.
- The connected Supabase tools do not expose Edge Function secret values or allow us to verify a public/private key match. Therefore the presence, format, and match of the production private signing key are **unverified**.
- Before publishing any tool, securely verify that the deployed Edge Function secret is an RSA-3072 PKCS#8 private key matching the Android X.509 public key. Never print either private material or secrets in CI logs.
- Until this is proven, do not publish or deliver a signed repair recipe.

### 2. Owner authentication and Member email delivery
- Owner PIN authentication uses the existing Owner Auth account and a server-only 8–12 digit PIN. The PIN itself has not been tested or changed in this readiness pass.
- A successful Owner browser login and Owner-only route access still need a normal, user-initiated verification.
- Member invitation and OTP email delivery have not been tested. Do not send test emails.
- Supabase Security Advisor currently warns that leaked-password protection is disabled. Enable it in Supabase Auth security settings and verify the resulting status.
- Supabase/Render Auth and request telemetry is incomplete; recent Auth, Edge/email delivery and route request logs were not available from the connected log sources.

### 3. Android physical-device acceptance
- Install a release-signed build on a real Android device; debug CI output is not a production release.
- Sign in with a real invited Member account, register a server-issued device, and verify the device is associated with the correct Member.
- Create and validate a repair tool, publish a version only after the signer-key match is verified, and confirm the Android device receives and verifies the signed payload.
- Execute safe supported native actions, complete a repair run, and verify the report is persisted and visible in the Admin panel.
- Verify duplicate report idempotency, unpublish/disable behavior, device revocation, offline/reconnect handling, refresh-token rotation, and private Realtime delivery.
- No physical-device end-to-end test has been recorded. Current production data contains no registered device, tool, published version or repair run.

### 4. Optional device telemetry and remote support API
- The Android device-intelligence client and Remote Support service use `MAHI_API_BASE_URL`.
- No Render service in the connected workspaces deploys the standalone Mahi Repair Express API.
- The current standalone Express repository backend exports a `MemoryStagingDb` that persists to a local JSON file and seeds demo Owner/Member/device records. It is not a safe production datastore and must not be deployed as-is, especially to ephemeral hosting.
- Keep these optional features disabled until the API is redesigned around durable, authenticated Supabase storage, CORS is restricted, rate limits are shared/durable, and the full device/remote-session lifecycle is tested. Do not point `MAHI_API_BASE_URL` at the Admin website.

### 5. Operational readiness
- Enable leaked-password protection.
- Confirm Supabase Auth URL/redirect allowlists and SMTP/SPF/DKIM/DMARC using the correct production domain without sending unsolicited tests.
- Confirm private Realtime is globally configured as intended; current table-level RLS policies are restrictive, but the project-level public-access toggle was not exposed by the connected tooling.
- Add structured, privacy-safe Render request logs for login, callback, Owner authorization decisions and API 4xx/5xx outcomes.
- Complete backup/restore rehearsal, monitoring/alerts, key rotation/revocation, and incident-recovery runbook.

## Release decision

**NOT FULLY PRODUCTION READY.**

Verified: the Admin service is LIVE, production Supabase schema/migrations/functions are provisioned, database RLS and account roles are intact, and the Admin hardening PR CI passes.

Blocked/unverified: the Android CI result for the latest fix, release APK/AAB signing, production signing-key match, actual Owner PIN sign-in, Member email delivery, real device enrolment, published signed tool, repair-report end-to-end flow, physical-device acceptance, and optional remote-support API.

Do not merge release code, publish a repair tool, or announce full production readiness until these gates have concrete evidence.
