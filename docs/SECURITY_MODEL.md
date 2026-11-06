# Security model

## Trust boundaries

1. Browser: Supabase publishable key only. It receives no service-role or signing secret.
2. Next.js server components: cookie-based Supabase SSR client. Owner pages call `auth.getUser()` and check `profiles.role='owner' AND status='active'`.
3. Supabase Edge Functions: authenticate the bearer JWT, load role/status from the database using the service role, validate every input, rate-limit, and audit owner mutations.
4. Database: RLS enabled for all application tables. Service-role access is limited to Edge Functions. Published version rows are immutable via trigger and unique `(tool_id, version)`.
5. Android APK: contains only the public verification key and a local action interpreter. It never receives the private signing key or a service credential.

## Signature format

The Edge Function creates stable JSON with sorted object keys, UTF-8 encodes the exact string, signs using RSASSA-PKCS1-v1_5 with SHA-256, and stores both canonical text and detached base64 signature. The API returns the stored text unchanged. The client verifies the raw UTF-8 bytes before parsing. The app must obtain fresh online authorization before execution to enforce immediate revocation; a device that is offline cannot receive a revocation update. The public key must be pinned in the APK, ideally with a key ID and a planned overlap window for rotation.

## Recipe execution rules

A recipe is declarative JSON. The APK maps each allowed action ID to a native Kotlin implementation compiled into the application. No interpreter or loader may execute arbitrary commands, JavaScript, Kotlin, DEX, shell, ADB, APK or downloaded libraries. Hostnames, package names, paths, enum values, timeouts, list sizes and step counts are bounded.

## Operational controls before launch

- Enable owner MFA and use a dedicated owner account.
- Configure SMTP, redirect allowlists, project auth rate limits and Edge Function rate limits.
- Rotate keys if exposed; never commit `.env` or private key material.
- Back up the RSA public key and define a signed key-rotation plan.
- Add Android-side tests for invalid signature, unknown action, wrong schema, revoked member, rollback, incompatible API and replayed run submissions.
- Configure monitoring for function errors, rate limits and unexpected owner audit events.
