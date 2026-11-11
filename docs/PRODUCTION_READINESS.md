# Mahi Repair — production readiness (verified 11 November 2026)

This document separates verified production state from work that is still blocked. A successful deployment or CI run is not an end-to-end acceptance test.

## Verified production state

### Admin web service
- Canonical Render service: `mahi-repair-admin` (Singapore, Node.js 22.23.4, Free plan).
- Actual assigned public origin: `https://mahi-repair-admin-yy7c.onrender.com` (the shorter `mahi-repair-admin.onrender.com` hostname was already reserved by Render).
- Connected Git repository/branch: `mahimahfud-ui/Mahi-Repair-Admin` / `main`; deployed commit: `f4bc174cc2152fc88d92f0e62b24b981e97f9098`.
- Deployment `dep-dbq99spkl3bs73es29jg` completed successfully and Render reports the service as LIVE.
- The app exposes `/api/health` as a no-store configuration-readiness endpoint: `status=configured` and HTTP 200 only when required values are present; otherwise `status=misconfigured` and HTTP 503. A live fetch on 11 November 2026 returned `ready=true` with Supabase URL, publishable-key format and Owner identity checks all true. A live fetch of `/login` also confirmed the PIN login page loads. This does not prove a successful Supabase database request or Owner PIN authentication.
- The Render log integration currently exposes `app` and `build` logs, but not `request` logs. Route-specific HTTP status codes for `/login` and `/auth/callback` therefore cannot currently be independently verified from Render telemetry.

### Production environment configuration
The Render service has been configured with:
- The Supabase project URL and enabled publishable key.
- `NEXT_PUBLIC_APP_URL` set to the actual generated Render origin above.
- Server-only `ADMIN_OWNER_EMAIL` set to the existing Owner Auth identity.

The values are intentionally not reproduced in this document. No service-role key, password, PIN, SMTP credential, private signing key or other secret belongs in a public repository or client build.

### Supabase backend
- Project ref: `shwqsljicmhflnvjqjah`; project reports `ACTIVE_HEALTHY`; PostgreSQL 17.
- The production migration history contains 9 applied migration entries.
- All 17 production Edge Functions report `ACTIVE`: 16 require JWT verification, while the Supabase Auth `send-email-hook` validates the signed webhook payload itself.
- RLS is enabled on all 9 public tables and on `realtime.messages`.
- The public schema has no `anon` table grants; `authenticated` table grants are read-only. The checked security-definer RPCs are executable by `service_role`, not by `anon` or `authenticated`.
- Private Realtime SELECT policies restrict the Admin broadcast to active Owners and Member broadcasts to an active Member's own non-revoked device topic.
- Current database records: 2 profiles, 1 active Owner, 1 active Member, 0 devices, 0 repair tools, 0 published versions, 0 repair runs, and 0 admin audit events.

### Account boundary
- Existing verified Owner profile: role `owner`, status `active`.
- Existing verified Member profile: role `member`, status `active`.
- These identities and roles must remain unchanged. The Member account must never be promoted or used as an Owner fallback.
- The Owner's successful PIN login has not yet been verified against the live website. Do not treat an active profile as proof of a successful session.

## Integration changes verified 11 November 2026

### Android Member app
- [Android PR #27](https://github.com/mahimahfud-ui/Mahi-Repair/pull/27) was merged to `main` as `c6c495aeac2058055ba88ca5b761914c69a300be`.
- The Android app no longer contains an Owner Admin screen, route, Settings entry or privileged Owner API client. Owner management remains in the separate Admin repository.
- Android CI, Backend CI and the legacy Admin scaffold CI passed for the PR head. Android unit tests and the debug APK assembly/upload completed successfully.
- A 24 MB debug APK artifact was produced. It uses an ephemeral CI debug keystore; no production release-signed APK/AAB has been produced or verified.

### Standalone Owner Console
- A new Render Free service was created from this repository's `main` branch; the legacy `mahi-repair-admin-preview` service still points to the Android repository's old embedded Admin directory and is not the canonical Owner Console.
- The canonical Admin URL is `https://mahi-repair-admin-yy7c.onrender.com`.
- Render build log confirms the Next.js production build, TypeScript check and server startup completed; Render reports the service LIVE.
- The Owner Console uses the same Supabase project as the Android app. Its Owner PIN sign-in and live Member invitation flow have not yet been exercised.

### Invitation redirect origin
- Supabase `admin-invite-member` is active at version 6 and still requires JWT verification.
- Its canonical Owner Console origin is fixed to the generated Render hostname. [Admin PR #11](https://github.com/mahimahfud-ui/Mahi-Repair-Admin/pull/11) merged to `main` as `d6879d7cb0c5a2d939ffce0632d02c61c562e49f`; the shared CORS/redirect helper and regression tests reject the retired host and untrusted origins.
- The 12 Owner Admin Edge Functions currently used/retained by this integration are active, require JWT verification, and use the canonical Admin origin for CORS/redirect checks (the Send Email Auth Hook is the only JWT-disabled hook and verifies its webhook signature).
- The repository's `supabase/config.toml` now records the canonical `site_url` and redirect pattern. The live Supabase Auth URL configuration is not exposed by the connected Supabase management actions; verify/set it in [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/shwqsljicmhflnvjqjah/auth/url-configuration) before sending real Member invitations.

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

Blocked/unverified: actual Owner PIN sign-in, live Supabase Auth redirect allowlist configuration, Member invitation/OTP email delivery, production RSA private/public-key match, production release APK/AAB signing, real device enrolment, a published signed tool, repair-report end-to-end flow, physical-device acceptance, and optional remote-support API.

Do not merge release code, publish a repair tool, or announce full production readiness until these gates have concrete evidence.
