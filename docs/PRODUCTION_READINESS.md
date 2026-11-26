# Mahi Repair — production readiness

This checklist separates code/CI evidence from checks that must be performed against the actual production Render, Supabase and Android environments. A passing CI workflow is not a production acceptance test.

## Implemented in the branch and covered by current PR CI

- [x] Separate native Android client, private Next.js Admin Panel and Supabase backend.
- [x] Minimal Android home with one RUN REPAIR action and a published-tool picker after the user taps it.
- [x] Invite-only email OTP auth implementation with account creation disabled.
- [x] Owner login UI accepts only an 8–12 digit numeric PIN; no Owner email/OTP/Magic Link request is exposed in the browser.
- [x] Server action authenticates the PIN against the existing Owner Supabase Auth account using server-only `ADMIN_OWNER_EMAIL`, then requires an active Owner profile and signs out any non-Owner session.
- [x] PIN validation and server-only Owner Auth identifier validation have unit-test coverage; rate-limited password sign-in receives safe user-facing feedback.
- [x] Owner PIN tests cover 8–12 digit values, leading zeroes, invalid PINs and malformed/oversized server-side Owner identifiers.
- [x] Android Keystore-backed AES-GCM session storage and serialized refresh-token rotation implementation.
- [x] Server-issued device identity and server-side member/device authorization implementation.
- [x] Canonical recipe v1 schema, strict parameter validation and shared contract fixtures.
- [x] Canonical JSON serialization and RSA-SHA256 detached signing implementation.
- [x] Android signature-verification implementation and fresh online authorization before execution.
- [x] Native action allowlist; no remote script, shell, DEX, JAR, APK or arbitrary code execution by design.
- [x] Private per-member/per-device Realtime Broadcast migration source and Android foreground WebSocket listener.
- [x] Private Owner-only Admin broadcast channel and web client invalidation listener with polling fallback.
- [x] Idempotent Android `run_id` report acceptance source: the UUID is stored as `repair_runs.id` with request fingerprint and retry conflict checks.
- [x] Atomic member catalogue, signed-recipe fetch and device registration RPC source.
- [x] Opaque Realtime events only; Android refetches and verifies the authorized catalogue. Launch/foreground/reconnect and WorkManager sync provide recovery.
- [x] Android unit tests and debug APK assembly pass on the fixture-restoration PR #9; the follow-up 15-minute catalogue-sync change is under CI and is not yet merged.
- [x] Current-head Android Compose UI emulator tests (API 35).
- [x] Current-head source and generated-debug-APK privileged-secret marker scans.
- [x] Production Supabase project status is `ACTIVE_HEALTHY`; all seven migrations currently in this repository are applied and all 15 deployed member/Owner Edge Functions are active with `verify_jwt=true` (verified 2026-11-07).
- [x] Current-head Admin CI: dependency audit, scaffold/security checks, TypeScript, ESLint, Vitest and Next.js production build pass.
- [x] Node.js 22.23.4 pinned across Render, Admin Panel and Admin Panel CI.
- [x] Add a protected, manual-only Supabase production deployment workflow at `.github/workflows/supabase-production.yml` (source and workflow CI verified).
- [ ] Configure its GitHub `supabase-production` Environment with a required reviewer, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `ADMIN_ORIGIN` before the first dispatch.

Current review branches (not merged):
- Admin Send Email Hook and protected deploy PR #2 includes the HMAC-signed Auth Hook, Resend→Brevo fallback, a protected manual preview/apply workflow, and commit-SHA locking between dry-run and apply. Latest [Admin CI #42357571946](https://github.com/mahimahfud-ui/Mahi-Repair-Admin/actions/runs/42357571946) passed all checks at head `39d08f2effc4e868d03610fbc317ef87e85215ab` (Node, Deno type-checks/tests and production build).
- Android PR #9 restores the missing Recipe v1 unit-test fixture, adds 15-minute best-effort catalogue sync, repairs embedded Admin lockfile/lint issues and reconciles stale setup docs. [Android CI #42356751034](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42356751034) and [embedded Admin CI #42356751017](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42356751017) both passed at current documented head `52285bfda3b6f4d7d1cfb79c5de2e513f7d5b338`.

Production snapshot verified 2026-11-07:
- Render Admin service is deployed from `main` and reports `live` at https://mahi-repair-admin.onrender.com. The `/api/health` route is included in the deployed build, but a direct public HTTP response has not been independently verified.
- Render server-only `ADMIN_OWNER_EMAIL` was set to the verified active Owner account; the Owner PIN was not changed or disclosed.
- Production Supabase has seven applied migrations and 15 active Edge Functions with JWT verification enabled. The new Send Email Hook is only in PR #2; it is not deployed or enabled.
- The Android/Member end-to-end flow has not yet been proven. Supabase logs contain only earlier unauthenticated 401 probes, not a successful device registration or repair run.

Evidence:
- [Admin protected deploy workflow CI](https://github.com/mahimahfud-ui/Mahi-Repair-Admin/actions/runs/42357197845)
- [Android + embedded Admin CI](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42356751034)
- [Android PR #9](https://github.com/mahimahfud-ui/Mahi-Repair/pull/9)
- [Admin PR #2](https://github.com/mahimahfud-ui/Mahi-Repair-Admin/pull/2)

The APK artifact is a debug build using an ephemeral debug keystore. It is not a signed production release APK/AAB.

## Production configuration still required

- [x] Establish the production Render Web Service on branch `main` and record its canonical HTTPS URL: https://mahi-repair-admin.onrender.com (live deploy verified 2026-11-07).
- [ ] Independently probe the public `/api/health` response and complete real Owner sign-in against the production origin; service startup and build success are not HTTP or login acceptance tests.
- [ ] Generate a real RSA-3072 key pair. Add only the PKCS#8 private key directly to Supabase Edge Function Secrets as RECIPE_SIGNING_PRIVATE_KEY_PEM; configure the matching X.509 public PEM in the Android release build. The checked-in public-key value remains a placeholder.
- [ ] Configure the protected GitHub `supabase-production` environment with a required reviewer, secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`, and variable `ADMIN_ORIGIN`.
- [ ] Configure `RECIPE_SIGNING_PRIVATE_KEY_PEM` directly in Supabase Edge Function Secrets and verify key length/matching public key; the workflow checks secret-name presence only and never reads its value.
- [x] Configure the Admin host's server-only `ADMIN_OWNER_EMAIL` value to identify the existing active Owner Auth user (verified account/profile mapping and Render environment update 2026-11-07).
- [ ] Set the existing Owner Supabase Auth password to a random 8–12 digit PIN using Supabase Auth administration; never commit or expose the PIN.
- [ ] Set `SEND_EMAIL_HOOK_SECRET`, `RESEND_API_KEY`, `BREVO_API_KEY` and `AUTH_EMAIL_FROM` in Supabase Edge Function Secrets; verify sender-domain SPF/DKIM/DMARC at both providers.
- [ ] Configure and enable the Supabase Send Email Auth Hook at `/functions/v1/send-auth-email`; verify Resend primary delivery and Brevo fallback for Android OTP and Owner invitations. This does not affect Owner PIN sign-in.
- [ ] Verify the existing Owner Auth account, set `ADMIN_OWNER_EMAIL` server-side, and set the Owner PIN as that account's Supabase Auth password. New profiles intentionally default to Member.
- [x] Apply the seven repository migrations; production migration history confirms all seven are present (verified 2026-11-07).
- [x] Deploy all 15 member/Owner Edge Functions; production function inventory confirms all 15 are `ACTIVE` with JWT verification enabled (verified 2026-11-07).
- [ ] Deploy `send-auth-email` separately with `--no-verify-jwt` only after configuring the Auth Hook secret; confirm invalid hook signatures are rejected.
- [ ] Disable Supabase Realtime Allow public access and verify private realtime.messages RLS against owner/member/own-device/revoked-device cases.
- [ ] Merge/review Admin PR #2, then deploy its `send-auth-email` function separately with `--no-verify-jwt` only after secrets are set; all webhook requests must pass HMAC verification.
- [ ] Verify production `ADMIN_ORIGIN`, the RSA-3072 signing secret/public-key match, Supabase Auth Site URL and redirect allowlist.
- [ ] Verify private Realtime RLS behavior for Owner, active Member, own device and revoked device using real authenticated sessions.

## End-to-end acceptance tests still required

- [ ] Owner PIN login on the production Render origin; verify Member and suspended accounts are rejected.
- [ ] Invite a member as Owner; verify the invitation email is delivered through Resend.
- [ ] Request Android Member OTP; verify the six-digit code is delivered through Resend and authentication succeeds.
- [ ] Force a controlled Resend failure in a non-production test and verify Brevo fallback succeeds; do not disable the primary provider in production.
- [ ] Register the Android device and verify ownership binding and duplicate registration behavior.
- [ ] Create a tool, validate its recipe, publish it and verify the committed immutable version in Supabase.
- [ ] Verify private per-device Android Realtime event delivery and the Owner-only Admin channel; ensure every event contains only an opaque event ID and triggers a fresh authorized fetch/render.
- [ ] Install a release-signed APK on a physical Android device and sign in as the invited member.
- [ ] Verify the full catalogue, detached RSA signature and exact canonical UTF-8 payload before parsing or execution.
- [ ] Execute each supported native diagnostic action with valid/invalid parameters and permission/confirmation cases.
- [ ] Submit a repair report and verify the persisted report in the Admin Panel; replay the exact same `run_id` and confirm duplicate success, then alter content/reuse from a second identity and confirm conflict.
- [ ] Disable/unpublish a tool and verify the server refuses fresh retrieval/execution.
- [ ] Revoke a device and verify server-side authorization is denied even if the client retains cached data.
- [ ] Test foreground connection, background recovery, internet interruption/reconnect, expired JWT, rotated refresh token, duplicate/missed events, suspended member and multiple devices.
- [ ] Test offline mode: cached display may be available according to product policy, but no new server authorization or execution may be inferred while disconnected; revalidate online before execution.
- [ ] Establish signing-key rotation/revocation and secure backup procedure.
- [ ] Complete monitoring/alerting, backup/restore rehearsal, telemetry privacy/retention/deletion policy and operational recovery runbook.

## Security acceptance boundaries

- CI source/APK scans are marker scans for known privileged-secret patterns; they do not replace a complete secret review or runtime inspection.
- Deno type checks and contract tests do not prove production Edge Function deployment or database RLS behavior.
- A private Realtime subscription is a notification channel only. Every catalogue fetch and execution must still be authorized by the server for the active member and non-revoked device.
- Revocation cannot be observed by an offline device until it reconnects. The server must deny the next online fetch/run request.
- The APK artifact currently available from CI is debug-signed with an ephemeral key. No release signing proof is recorded.
- The current Render Admin Web Service is deployed from `main` at https://mahi-repair-admin.onrender.com. Its successful deploy and healthy startup do not prove the Auth Hook, signing key or Android device workflow.
- A remote recipe may only combine capabilities already compiled into the installed APK. Adding Kotlin behavior or an Android permission requires an app update.

## Release decision

**NOT PRODUCTION READY.** Admin CI passes on the updated Owner PIN head, but production deployment/configuration, PIN bootstrap, real owner/member/device workflow, signed release artifact, live Realtime/RLS authorization tests and physical-device acceptance remain unverified. Do not merge Admin PR #2 or Android PR #9, or announce production availability, until review and the required production gates above have evidence.
