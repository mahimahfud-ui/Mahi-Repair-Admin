# Mahi Repair — production readiness

This checklist separates code/CI evidence from checks that must be performed against the actual production Render, Supabase and Android environments. A passing CI workflow is not a production acceptance test.

## Implemented in the branch and covered by current-head CI

- [x] Separate native Android client, private Next.js Admin Panel and Supabase backend.
- [x] Minimal Android home with one RUN REPAIR action and a published-tool picker after the user taps it.
- [x] Invite-only email OTP auth implementation with account creation disabled.
- [x] Android Keystore-backed AES-GCM session storage and serialized refresh-token rotation implementation.
- [x] Server-issued device identity and server-side member/device authorization implementation.
- [x] Canonical recipe v1 schema, strict parameter validation and shared contract fixtures.
- [x] Canonical JSON serialization and RSA-SHA256 detached signing implementation.
- [x] Android signature-verification implementation and fresh online authorization before execution.
- [x] Native action allowlist; no remote script, shell, DEX, JAR, APK or arbitrary code execution by design.
- [x] Private per-member/per-device Realtime Broadcast migration source and Android foreground WebSocket listener.
- [x] Opaque Realtime events only; Android refetches and verifies the authorized catalogue. Launch/foreground/reconnect and WorkManager sync provide recovery.
- [x] Current-head Android unit tests and debug APK assembly.
- [x] Current-head Android Compose UI emulator tests (API 35).
- [x] Current-head source and generated-debug-APK privileged-secret marker scans.
- [x] Current-head Supabase CI: all 15 Edge Function entrypoints/shared modules type-check; canonical recipe/run-report tests pass.
- [x] Current-head Admin CI: dependency audit, scaffold/security checks, TypeScript, ESLint, Vitest and Next.js production build pass.
- [x] Node.js 22.23.4 pinned across Render, Admin Panel and Admin Panel CI.
- [x] Protected production workflow source for migration preview/apply and JWT-verified deployment of all 15 Edge Functions.

Current-head commit: dd7c922bf5533c34a424d8d7994f29d2d0fb0f82.

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
- [ ] Configure Supabase Auth Site URL and the actual Admin Panel /auth/callback redirect allow list.
- [ ] Verify the owner Auth account and manually bootstrap only that account to owner; new profiles intentionally default to member.
- [ ] Review and apply 20261106120000_private_realtime_catalog_broadcast.sql using the protected production workflow.
- [ ] Disable Supabase Realtime Allow public access and verify private realtime.messages RLS against owner/member/own-device/revoked-device cases.
- [ ] Deploy the PR-branch Edge Function updates with JWT verification enabled through the protected workflow.
- [ ] Verify production database migration history, function deployment status and RLS policy behavior after deployment.

## End-to-end acceptance tests still required

- [ ] Owner login on the production Render origin.
- [ ] Invite a member as owner; deliver and complete the member OTP flow.
- [ ] Register the Android device and verify ownership binding and duplicate registration behavior.
- [ ] Create a tool, validate its recipe, publish it and verify the committed immutable version in Supabase.
- [ ] Verify private per-device Realtime event delivery; ensure events contain no recipe/payload and only trigger a fresh authorized fetch.
- [ ] Install a release-signed APK on a physical Android device and sign in as the invited member.
- [ ] Verify the full catalogue, detached RSA signature and exact canonical UTF-8 payload before parsing or execution.
- [ ] Execute each supported native diagnostic action with valid/invalid parameters and permission/confirmation cases.
- [ ] Submit a repair report and verify the persisted report in the Admin Panel.
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

**NOT PRODUCTION READY.** Current-head CI is green, but production deployment/configuration, real owner/member/device workflow, signed release artifact, live Realtime/RLS authorization tests and physical-device acceptance remain unverified. Do not merge PR #1 or announce production availability until every required gate above has evidence.
