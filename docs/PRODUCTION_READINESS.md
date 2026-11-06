# Mahi Repair — production readiness

This checklist separates code/CI evidence from checks that must be performed against the actual production Render, Supabase and Android environments. A passing CI workflow is not a production acceptance test.

## Implemented in the branch (CI re-verification required after the PIN change)

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
- [x] Current-head Android unit tests and debug APK assembly.
- [x] Current-head Android Compose UI emulator tests (API 35).
- [x] Current-head source and generated-debug-APK privileged-secret marker scans.
- [x] Current-head Supabase CI: all 15 Edge Function entrypoints/shared modules type-check; canonical recipe/run-report tests pass.
- [x] Current-head Admin CI: dependency audit, scaffold/security checks, TypeScript, ESLint, Vitest and Next.js production build pass.
- [x] Node.js 22.23.4 pinned across Render, Admin Panel and Admin Panel CI.
- [x] Protected production workflow source for migration preview/apply and JWT-verified deployment of all 15 Edge Functions.

Previous verified CI head before the PIN change: `9e627816446889909c1c57475082e2525a902847`. Re-run the PR workflow on the updated head before treating the new Owner PIN code as verified.

Evidence:
- [Android CI](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42167251879)
- [Supabase Edge Functions CI](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42167251882)
- [Admin Panel CI](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42167251933)
- [Debug APK artifact](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42167251879/artifacts/13479439548)

The APK artifact is a debug build using an ephemeral debug keystore. It is not a signed production release APK/AAB.

## Production configuration still required

- [ ] Establish the final production Render Web Service and record its canonical HTTPS URL; the checked-in render.yaml defines only the Free preview service.
- [ ] Verify production Render TLS/HTTPS, health, owner sign-in and exact environment configuration.
- [ ] Generate a real RSA-3072 key pair. Add only the PKCS#8 private key directly to Supabase Edge Function Secrets as RECIPE_SIGNING_PRIVATE_KEY_PEM; configure the matching X.509 public PEM in the Android release build. The checked-in public-key value remains a placeholder.
- [ ] Configure the protected GitHub supabase-production environment with a required reviewer, secrets SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD, and variable ADMIN_ORIGIN.
- [ ] Verify the private signing secret exists in Supabase before deployment without logging its value.
- [ ] Configure the Admin host's server-only `ADMIN_OWNER_EMAIL` value and verify it identifies the existing active Owner Auth user.
- [ ] Set the existing Owner Supabase Auth password to a random 8–12 digit PIN using Supabase Auth administration; never commit or expose the PIN.
- [ ] Configure and verify production SMTP, sender-domain SPF/DKIM/DMARC and inbox delivery for Android Member OTP and Owner-issued member invitations; this does not affect Owner PIN sign-in.
- [ ] Verify the owner Auth account and manually bootstrap only that account to owner; new profiles intentionally default to member.
- [ ] Apply the pending migrations in order: `20261106170418_private_realtime_catalog_broadcast.sql`, `20261106170438_backend_report_idempotency_and_atomic_catalog.sql`, `20261106170450_transactional_admin_mutations_audit.sql`, and `20261106170509_atomic_member_catalog_and_device_registration.sql`.
- [ ] Deploy all 15 latest Edge Functions with JWT verification enabled, including the run-idempotent report, atomic catalog/device RPC clients and owner-checked transactional admin functions.
- [ ] Disable Supabase Realtime Allow public access and verify private realtime.messages RLS against owner/member/own-device/revoked-device cases.
- [ ] Deploy the PR-branch Edge Function updates with JWT verification enabled through the protected workflow.
- [ ] Verify production database migration history, function deployment status and RLS policy behavior after deployment.

## End-to-end acceptance tests still required

- [ ] Owner PIN login on the production Render origin; verify Member and suspended accounts are rejected.
- [ ] Invite a member as owner; deliver and complete the member OTP flow.
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
- The Render Free preview is not the production Admin Panel service.
- A remote recipe may only combine capabilities already compiled into the installed APK. Adding Kotlin behavior or an Android permission requires an app update.

## Release decision

**NOT PRODUCTION READY.** The prior head's CI passed, but the Owner PIN change requires fresh CI verification. Production deployment/configuration, PIN bootstrap, real owner/member/device workflow, signed release artifact, live Realtime/RLS authorization tests and physical-device acceptance remain unverified. Do not merge PR #1 or announce production availability until every required gate above has evidence.
