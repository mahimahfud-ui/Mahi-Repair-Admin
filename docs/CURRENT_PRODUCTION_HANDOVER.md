# Mahi Repair — current production handover

**Audit date: 20 November 2026**  
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

## 2. Evidence checked on 20 November 2026

### Supabase project

The connected Supabase management API reported:

- Project name: `Mahi-Repair`.
- Status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.11.
- Nine production migrations recorded as applied.
- Seventeen Edge Functions reported `ACTIVE`.
- Sixteen Edge Functions require JWT verification. The Auth `send-email-hook` has JWT verification disabled because it validates the signed webhook signature itself.
- Nine public tables were listed; RLS was enabled on all nine.
- Profiles: one active Owner and one active Member.
- Devices: 0.
- Repair tools: 0.
- Published tool versions: 0.
- Repair runs: 0.
- Admin audit events: 0.

A direct read-only query of `storage.buckets` returned no buckets at the time of this audit.

The 17 active functions were:

`admin-assign-tool`, `admin-delete-draft-tool`, `admin-disable-tool`, `admin-invite-member`, `admin-manage-device`, `admin-manage-member`, `admin-manage-tool-state`, `admin-publish-tool`, `admin-save-validation`, `admin-upsert-tool`, `get-admin-analytics`, `get-admin-dashboard`, `get-my-repair-tools`, `get-signed-repair-tool`, `register-device`, `send-email-hook`, `submit-repair-run`.

The profile roles/statuses were read-only inspected and showed one `owner/active` and one `member/active`. Do not change, promote, delete or repurpose either existing account as part of routine integration work.

### Security Advisor

The Supabase Security Advisor returned one warning:

- `auth_leaked_password_protection`: leaked-password protection is disabled.

Enable the setting through Supabase Auth security settings, then re-run the Security Advisor. This audit did not change Auth settings.

### GitHub source heads

At the time of the repository inspection:

- Android `main`: `caebeca862a147139f4d9b08e0fa95acbea848d0`.
- Admin `main`: `ccaeea7a64dd9397c77f0b2209a4463db9681195`.

The Render repository YAML declares `main` and `checksPass`. The last recorded production-readiness document from 11 November reported the Admin service at `mahi-repair-admin-yy7c.onrender.com` and deployed commit `f4bc174cc2152fc88d92f0e62b24b981e97f9098`. The current Render deployed SHA was not independently confirmed during this audit; verify it in the Render dashboard rather than treating this historical SHA as current.

## 3. What is implemented in source

### Separate Admin website

The active Next.js source includes:

- Owner PIN sign-in using server-side Supabase Auth password authentication and an active Owner profile check.
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
- Test Owner PIN login, logout, refresh/session persistence and a protected Owner page.
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

## 5. Live App Update Engine — production gap

The earlier Android integration branch contains source for a signed App Update Manager, manifest verification, content ZIP extraction/activation, native APK handoff and local data rollback. That work is not merged into current Android `main` and is not provisioned in current Supabase production.

The 20 November production inspection found:

- No Storage buckets.
- No app-update release migration applied.
- No production `admin-publish-app-update` function.
- No production `get-app-update-manifest` function.
- No production `get-app-update-asset-url` function.

The earlier PR #12 is a draft, and PR #29 is based on PR #12's feature branch. Do not merge these stacked PRs as-is or deploy their draft migration/functions directly to production.

Required next steps:

1. Extract and review the update implementation from the feature branch.
2. Rebase/port only the necessary code onto the current two-repository architecture.
3. Add the App Update Manager to the standalone Admin repository.
4. Add a reviewed, staged migration and a private Storage bucket with owner-publish and member-download policies.
5. Deploy the three update Edge Functions to a staging environment first.
6. Verify Owner-only publication, Member/device authorization, signed manifest bytes, object size/MIME/hash and short-lived signed URLs.
7. Verify Android download integrity, archive traversal/zip-bomb defenses, atomic activation, local rollback and APK signing-certificate continuity on physical devices.
8. Add per-device update outcome telemetry and Admin release status visibility.
9. Promote to production only after staging and security acceptance.

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
7. Port, stage and release the Live App Update Engine.
8. Complete optional Device Intelligence and Remote Support only after the core workflow is stable.

## 8. Safety boundaries

- Do not change Owner/Member roles or identities.
- Do not put service-role keys, PINs, provider credentials or private signing material in GitHub, APKs, Render browser variables or chat.
- Do not apply production migrations, create buckets, deploy/replace Edge Functions, change Auth settings or publish tools without an explicit, reviewed operation.
- Keep the standalone Admin and Android repositories separate.
- Keep the production Supabase project as the single shared backend until a separately approved migration plan proves a replacement is necessary.
