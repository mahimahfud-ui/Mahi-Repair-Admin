# Mahi Repair — current production handover

**Audit date: 24 November 2026**  
**Scope:** Android Member app, standalone Owner Admin website, shared Supabase production project, GitHub source and deployment configuration.

This document is the current operational reference for the two-repository Supabase architecture. It supersedes conflicting historical setup notes that describe the short Render hostname, the old embedded Admin app, or a Firebase/Cloud Run cutover as the active runtime.

## 1. Canonical architecture

| Component | Canonical resource |
|---|---|
| Android Member application | [mahimahfud-ui/Mahi-Repair](https://github.com/mahimahfud-ui/Mahi-Repair) |
| Separate Owner website | [mahimahfud-ui/Mahi-Repair-Admin](https://github.com/mahimahfud-ui/Mahi-Repair-Admin) |
| Owner login | https://mahi-repair-admin-yy7c.onrender.com/login |
| Shared backend | Supabase project `shwqsljicmhflnvjqjah` |
| Supabase region | `ap-south-1` |
| Admin hosting definition | This repository's root `render.yaml`, branch `main` |

The Android package is a Member client. Owner management must remain exclusively in the separate website. Do not add Admin pages, Owner routes, Admin API clients, Owner credentials or privileged actions to the Android app.

Current Android authentication, device registration, recipe retrieval, report submission and private Realtime implementation use Supabase. Firebase project metadata and Firebase/Cloud Run handover material still present in the Android repository are not evidence of a live native Firebase backend. Do not provision another backend, enable billing, or migrate the clients to Firebase/Cloud Run unless the Owner explicitly approves a separate architecture replacement.

## 2. Evidence checked on 24 November 2026

### Supabase project

The connected Supabase management API reported:

- Project name: `Mahi-Repair`.
- Status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.11.
- Ten production migrations recorded as applied, including `20261120135855_add_signed_app_update_releases`.
- Twenty Edge Functions reported `ACTIVE`.
- Sixteen Edge Functions require JWT verification. The Auth `send-email-hook` has JWT verification disabled because it validates the signed webhook signature itself.
- Ten public tables were listed; RLS was enabled on all ten.
- Profiles: one active Owner and one active Member.
- Devices: 0.
- Repair tools: 0.
- Published tool versions: 0.
- Repair runs: 0.
- App update releases: 0.
- Admin audit events: 0.

The private Storage bucket `mahi-app-updates` exists with `public=false`, a 150 MiB upload cap, and ZIP/APK MIME restrictions. The bucket currently has no stored release objects.

The 20 active functions include the original 17 repair/admin functions plus `admin-publish-app-update` (v2), `get-app-update-manifest` (v1), and `get-app-update-asset-url` (v1). The three app-update functions all require JWT verification. The Auth `send-email-hook` is the one JWT-disabled hook and validates its signed webhook payload.

The profile roles/statuses were read-only inspected and showed one `owner/active` and one `member/active`. Do not change, promote, delete or repurpose either existing account as part of routine integration work.

### Security Advisor

The Supabase Security Advisor returned one warning:

- `auth_leaked_password_protection`: leaked-password protection is disabled.

Enable the setting through Supabase Auth security settings, then re-run the Security Advisor. This audit did not change Auth settings.

### GitHub source heads

At the 24 November inspection:

- Android `main`: `bf87061cf1cbb713258550cb51413e2834afed99` before the open Realtime fix PR #36.
- Android PR #36 head: `0cff83ad27b06625eaf2615b49435a377d4219d1`; Admin Panel CI and Backend CI passed, while Android CI was still running at the time of this note.
- Admin `main` includes migration-alignment merge commit `22ae1248ef4ef0ed49e8b410a9e526523dc9d99` and current handover refresh `aa3c371ee7f1157c4a786d6cb6b6e60824d28e56`.
- Render service `mahi-repair-admin` deployed the Admin `main` documentation update as deploy `dep-dc2rbjk9v7es73bi3910` (`LIVE`); `/api/health` returned HTTP 200 with `ready=true` after deployment.

The Render repository YAML declares `main` and `checksPass`. The last recorded production-readiness document from 11 November reported the Admin service at `mahi-repair-admin-yy7c.onrender.com` and deployed commit `f4bc174cc2152fc88d92f0e62b24b981e97f9098`. The current Render deployed SHA was not independently confirmed during this audit; verify it in the Render dashboard rather than treating this historical SHA as current.

## 3. What is implemented in source

### Separate Admin website

The active Next.js source includes:

- One-time Owner Magic Link sign-in using the server-configured Auth identity, PKCE callback exchange and active Owner profile check. The shared email hook distinguishes the canonical Admin callback from Android Member OTP.
- Owner-protected dashboard and server actions.
- Member invitation and Member status management.
- Device inventory and revoke/restore.
- Repair Tool authoring, recipe schema validation and Test Lab.
- Signed immutable tool publication, version history, disable/unpublish and member assignment.
- Analytics, audit and repair-run logs.
- A health endpoint that checks required configuration values.

### Android Member client

The Kotlin app source includes:

- Invite-only Supabase email OTP login.
- Session refresh and encrypted local session/device identity handling.
- Server-issued device registration and heartbeat.
- Authenticated repair-tool sync into Room.
- RSA-SHA256 signature verification before recipe parsing.
- Strict native action allowlist and foreground/user-confirmed actions.
- Fresh server authorization before repair execution.
- Durable repair report outbox, WorkManager retry and idempotent report IDs.
- Private Supabase Realtime invalidation events and reconnect behavior.
- A Member-only app architecture without an embedded Owner Admin screen.

These are source-level capabilities. They are not proof of successful production credentials, deployed secret compatibility, email delivery, or physical-device operation.

## 4. Production acceptance gates still open

Do not publish a production tool or announce full production readiness until the following gates have evidence.

### Gate A — Owner authentication and Render

- Confirm Render is serving this repository's `main` branch at the canonical `yy7c` hostname.
- Confirm the deployed SHA is the reviewed release commit.
- Confirm Render environment values exist with correct scopes.
- Test Owner Magic Link delivery and callback, logout, refresh/session persistence and a protected Owner page.
- Confirm a Member identity is denied before any Owner-only session or page access is granted.

The `/api/health` endpoint checks configuration shape only. It is not a successful Owner login or database integration test.

### Gate B — Auth redirects and Member email delivery

- Confirm live Supabase Auth Site URL is `https://mahi-repair-admin-yy7c.onrender.com`.
- Confirm Additional Redirect URLs includes `https://mahi-repair-admin-yy7c.onrender.com/**`.
- Confirm the Supabase Auth Send Email Hook is wired to the deployed `send-email-hook`.
- Confirm the signed webhook secret and approved email-provider secrets are present in the correct secret store.
- Verify sender-domain SPF/DKIM/DMARC and real inbox delivery using one consented test invitation.
- Complete the invited Member's six-digit OTP sign-in in Android.

Do not treat an ACTIVE hook function or a repository `config.toml` entry as proof of email delivery or live dashboard Auth URL configuration.

### Gate C — recipe-signing key match

The private key configured in Supabase Edge Function Secrets must be an RSA-3072 PKCS#8 PEM key matching the public key embedded in the Android release. The management tools cannot reveal secret values or establish this match.

- Verify the match securely without printing or exporting private material.
- Test one non-production canonical recipe signature against Android's public-key verifier.
- Confirm altered payloads and unknown action IDs are rejected.

Until the key match is proven, do not publish or assign a real production repair tool.

### Gate D — physical Android workflow

On a real handset:

1. Install the intended test/release build.
2. Sign in as an invited Member.
3. Register the server-issued device identity.
4. Confirm that device appears under the correct Member in Admin.
5. Create a safe Repair Tool in Admin, validate it and publish it only after Gate C passes.
6. Assign it to the test Member.
7. Confirm Android fetches and verifies the signed recipe.
8. Execute a safe supported action with the required user confirmation.
9. Confirm the resulting repair report and audit trail appear in Admin Logs.
10. Verify duplicate retry, altered retry conflict, offline outbox recovery, disable/unpublish, Member suspension, device revoke, token refresh and private Realtime behavior.

At the audit time the live database had zero registered devices, zero tools, zero published versions and zero repair runs. No complete physical-device acceptance evidence was available.

### Gate E — production Android signing

The normal Android CI artifact is debug-signed and not a production distribution build. The Android repository has a separate release workflow that requires the existing upload keystore and its protected GitHub Actions secrets.

- Verify the existing upload keystore and `upload` alias.
- Run the production release workflow.
- Confirm the APK and AAB signatures and record SHA-256 checksums.
- Install and upgrade on a physical device.
- Preserve the existing application ID and upload signing identity; never generate a replacement key for an already distributed app.

## 5. Signed Live App Update Engine — deployed, awaiting real-device acceptance

The signed app-update implementation is now present in Android `main` and the standalone Admin repository. The production Supabase project has the matching migration, private Storage bucket, immutable release table, private device-scoped broadcast trigger, and all three update Edge Functions.

Production evidence checked on 24 November 2026:

- Applied migration: `20261120135855` / `add_signed_app_update_releases`.
- Repository migration filename was aligned by merged Admin PR #18; do not reapply the migration to production.
- Private bucket: `mahi-app-updates`, `public=false`, 157286400-byte limit, ZIP/APK MIME allowlist.
- Edge Functions: `admin-publish-app-update` v2, `get-app-update-manifest` v1, and `get-app-update-asset-url` v1, all `ACTIVE` with JWT verification enabled.
- Table: `public.app_update_releases`, RLS enabled, Owner-only authenticated read policy, immutable update/delete triggers and an after-insert private device broadcast trigger.
- Current live counts: 0 published app-update releases, 0 registered devices, and 0 stored update assets. Therefore no device has yet completed the real update flow.

The release flow is: Owner publishes an immutable manifest from the standalone Admin Update Manager; the server validates private assets and signs canonical manifest bytes; the database inserts the release and emits an opaque `app_update_published` event to active registered Member devices; Android re-fetches the manifest using its Member JWT and registered device ID, verifies RSA-SHA256, and only then offers a data package or Android system-installer APK handoff.

The 24 November client-side Realtime allowlist omission is fixed. Android PR #36 merged to Android `main` as commit `669e6b70fa411ec423b9d592464b1ffc6f85fb22`; it adds `app_update_published` and a regression test using the exact broadcast envelope. The PR's Android CI retry passed (test suite and debug APK build); post-merge main workflows were running/queued at the time of this update. Android now has the source-level path to receive the Admin publish event and then re-fetch the signed manifest through the authenticated Member/device endpoint. Physical-device event delivery remains unverified.

Remaining acceptance work:

1. Complete and merge Android PR #36 only after Android CI passes.
2. Verify the deployed RSA-3072 private signing secret matches the Android public key without revealing private material. The server-side publisher rejects publication when the signature does not verify against the Android public key.
3. Complete an Owner PIN session and a real invited Member OTP sign-in.
4. Register at least one real Android device and verify it appears under the correct Member.
5. Publish a reviewed non-mandatory test release using a safe, signed data-only configuration/package; do not publish a fake release or use a dummy device.
6. Verify the actual Android notification, authenticated manifest fetch, RSA verification, asset download digest/entry checks, atomic activation and rollback on a physical phone.
7. Produce a production-signed APK/AAB with the existing upload key; verify certificate continuity and installer update on a physical phone.
8. Record per-device update outcome telemetry and provide release history/status in Admin before claiming fleet-wide update acceptance.

Remote configuration must remain data-only. No script execution, WebView injection, arbitrary shell commands, silent APK installation or signature bypass is allowed.

Remote configuration must remain data-only. No script execution, WebView injection, arbitrary shell commands, silent APK installation or signature bypass is allowed.

## 6. Optional Device Intelligence and Remote Support

The current Android `DeviceIntelligenceApiClient` and `RemoteSupportService` use the legacy `MAHI_API_BASE_URL` path, which is intentionally configured with an invalid placeholder. Keep those optional features disabled until a durable, authenticated API is available.

The current Admin website URL is not a Remote Support API. The old local JSON staging backend must not be deployed as production storage. Real screen sharing would additionally require a tested WebRTC/media transport, explicit Member consent, Android MediaProjection handling, bounded signaling, audit events and immediate session termination.

## 7. Required completion order

1. Confirm canonical Render deployment, environment and Auth URL configuration.
2. Test Owner PIN authentication.
3. Verify Send Email Hook and actual Member invitation/OTP delivery.
4. Prove the production recipe-signing key matches the Android public key.
5. Complete a physical-device Member → Device → Tool → Repair → Admin report test.
6. Produce and verify the stable production-signed APK/AAB.
7. Complete the deployed Live App Update Engine's real-device acceptance and signed production release.
8. Complete optional Device Intelligence and Remote Support only after the core workflow is stable.

## 8. Safety boundaries

- Do not change Owner/Member roles or identities.
- Do not put service-role keys, PINs, provider credentials or private signing material in GitHub, APKs, Render browser variables or chat.
- Do not apply production migrations, create buckets, deploy/replace Edge Functions, change Auth settings or publish tools without an explicit, reviewed operation.
- Keep the standalone Admin and Android repositories separate.
- Keep the production Supabase project as the single shared backend until a separately approved migration plan proves a replacement is necessary.
