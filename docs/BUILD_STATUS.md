# Build and verification status

Last checked: 2026-11-06. This is a CI/build evidence record, not a production release certification.

## Current branch checkpoint

- Branch: security-hardening/run-repair
- Verified HEAD: dd7c922bf5533c34a424d8d7994f29d2d0fb0f82
- PR: [#1 — Security hardening and live Supabase integration](https://github.com/mahimahfud-ui/Mahi-Repair/pull/1) (draft, open, unmerged)
- Current-head workflow runs: all three CI workflows completed successfully.

## Current-head CI results

| Area | Result | Evidence |
|---|---|---|
| Android unit tests | PASS | [Android CI run 42167251879](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42167251879) |
| Android debug APK assembly | PASS | Same Android CI run; artifact uses an ephemeral debug keystore and is not a signed production release. |
| Android Compose UI emulator tests (API 35) | PASS | Same Android CI run; emulator job completed successfully. |
| Android source privileged-secret marker scan | PASS | Same Android CI run. |
| Generated debug APK privileged-secret marker scan | PASS | Same Android CI run. |
| Android test reports | UPLOADED | Unit-test and Compose UI test report artifacts are attached to the Android run. |
| Debug APK artifact | UPLOADED | [mahi-repair-debug-apk](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42167251879/artifacts/13479439548). Debug artifact only; no release APK/AAB was produced by this workflow. |
| Supabase Edge Function inventory and Deno type checks | PASS | [Supabase Edge Functions CI run 42167251882](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42167251882); all 15 entrypoints and shared modules. |
| Canonical recipe/run-report contract tests | PASS | Same Supabase CI run. |
| Admin dependency installation and moderate-level npm audit | PASS | [Admin Panel CI run 42167251933](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42167251933); audit step passed. |
| Admin scaffold/security-integrity checks | PASS | Same Admin Panel CI run. |
| Admin TypeScript / ESLint / Vitest / Next.js production build | PASS | Same Admin Panel CI run; all steps completed successfully. |

The Android secret scan checks known privileged-key/service-role markers in source and the generated debug APK. It is useful defense-in-depth, not proof that every possible secret pattern or runtime exposure is absent. CI success also does not prove real production authentication, database RLS, Realtime delivery, or device authorization.

## Production environment checkpoint

The following is the last production Supabase state recorded in the repository's deployment inspection; it was not independently refreshed during this Phase 4 session because production credentials/dashboard access were not available:

- Project reference: shwqsljicmhflnvjqjah; previously reported as ACTIVE_HEALTHY.
- Three existing migrations were previously reported applied: 202611050001_initial_schema, 20261105180000_harden_rls_grants_and_indexes, and 20261105183000_deny_browser_rate_limit_access.
- Fifteen existing Edge Functions were previously reported ACTIVE with JWT verification enabled.
- Security Advisor was previously reported with no lints.
- The PR migration 20261106120000_private_realtime_catalog_broadcast.sql was recorded as NOT applied.
- PR-branch Edge Function changes were recorded as NOT deployed.

Do not interpret the passing Deno CI workflow as a Supabase production deployment. The production deploy workflow requires the protected environment and an explicit approved deployment from main.

## Render checkpoint

- Render service configured by render.yaml: mahi-repair-admin-preview.
- Preview URL: https://mahi-repair-admin-preview.onrender.com
- Plan: Free preview, not the final production Admin Panel.
- Runtime: Node.js 22.23.4.
- Prior repository smoke-test notes report that /login loaded and unauthenticated console routes required authentication.

A fresh HTTPS probe could not be completed from the Phase 4 execution environment because external DNS resolution was unavailable. Treat current public availability and owner login as not freshly verified here. No production Render service/URL is identified by the checked-in Render configuration.

## Not verified / release gates

1. Production Render HTTPS availability, owner login, and exact configured environment variables.
2. Matching RSA-3072 key-pair provisioning: private PKCS#8 key only in Supabase Edge Function Secrets; matching X.509 public key in Android release build configuration. The checked-in public-key setting is a placeholder.
3. Protected GitHub supabase-production environment and reviewer, with SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, and ADMIN_ORIGIN.
4. Supabase Auth Site URL and exact Render /auth/callback redirect allow list.
5. Owner account verification and one-time owner-profile bootstrap.
6. Production migration application, private Realtime configuration, and PR-branch Edge Function deployment with JWT verification.
7. Real owner/member invitation and OTP flow, device registration, recipe publication, server commit, private Realtime notification, Android sync/signature verification, native actions, and report visibility.
8. Online/offline, JWT expiry/refresh rotation, duplicate/missing notification, suspension, revocation and multiple-device tests against the live services.
9. Physical Android device installation and acceptance.
10. Signed release APK/AAB, release signing identity, backup/restore, key rotation, monitoring and retention operations.

No live owner/member account, production publication, production report submission, or physical-device test is claimed complete.
