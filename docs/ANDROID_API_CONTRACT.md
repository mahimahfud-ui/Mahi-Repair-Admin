# Mahi Repair Cloud — Android API Contract v1

Base URL: `https://<project-ref>.supabase.co/functions/v1`

All requests use HTTPS and `Authorization: Bearer <Supabase access token>`. Android users authenticate as `member`; owner JWTs are rejected by member endpoints. Send `Content-Type: application/json` for POST.

## Signed payload response

`POST /get-my-repair-tools` with `{ "device_id": "<registered-device-uuid>" }` returns an array of currently authorized tool releases and records per-device sync versions. `POST /get-signed-repair-tool` with `{ "tool_id": "<uuid>", "device_id": "<registered-device-uuid>" }` returns:

```json
{
  "signed_payload": "<exact canonical JSON string>",
  "signature": "<base64 RSA signature>",
  "signature_algorithm": "RSA-SHA256",
  "version": 1
}
```

Verify the signature over the UTF-8 bytes of `signed_payload` using the embedded RSA public key and SHA-256 / RSASSA-PKCS1-v1_5. **Do not parse and re-serialize before verifying.** Only after verification succeeds, parse the JSON, validate `schemaVersion`, validate every action ID and parameter on-device, then execute actions implemented inside the APK. Reject unknown IDs, unsupported schema versions, invalid parameters, expired/revoked access and incompatible app/API versions. Never execute payload code.

## Member endpoints

`register-device` request: `{ "device_label": "My phone", "app_version": "1.0.0", "android_version": "15", "android_api": 35 }`. Persist the returned `device_id` in app-private storage and send it in repair-run submissions. On later app starts, include that same ID to update last-seen/app metadata. A revoked device cannot re-register using its old ID.

| Endpoint | Method | Purpose |
|---|---|---|
| `register-device` | POST | Register/update minimal device metadata and receive a server-issued device UUID |
| `admin-manage-device` | Owner only | Revoke or restore one device from the admin console |
| `get-my-repair-tools` | POST | Return current signed releases authorized for the member |
| `get-signed-repair-tool` | POST | Fetch latest signed version for one authorized tool |
| `submit-repair-run` | POST | Submit bounded repair telemetry |

## Repair run body

```json
{
  "run_id": "client-generated UUID for this execution; reuse unchanged on retries",
  "device_id": "uuid",
  "tool_id": "uuid",
  "tool_version": 1,
  "started_at": "2026-11-05T10:00:00Z",
  "completed_at": "2026-11-05T10:00:25Z",
  "result": "SUCCESS",
  "step_results": [{ "step_id": "check-internet", "status": "SUCCESS" }],
  "app_version": "1.0.0"
}
```

Android stores the report and its exact serialized request body in a Room outbox before network I/O. WorkManager retries queued reports with a connected-network constraint and exponential backoff. A periodic 15-minute worker recovers reports after process death. Every retry reuses the original `run_id`.

The server uses `repair_runs.id = run_id` as the idempotency key. An identical retry for the same member returns HTTP 200 with `duplicate: true`; a reused ID with different content or another member returns HTTP 409. The client removes the outbox record only after the server acknowledges the matching run ID. Account/device mismatches are retained locally and are not sent using another identity.

Never include personal files, messages, credentials, photos or unrelated device identifiers in logs. Device registration should submit only device label (optional), app version, Android version and API level. Device IDs are server-issued UUIDs.

## Admin endpoints

All admin endpoints require an active owner profile. They are not callable by member accounts:

- `admin-invite-member`: `{ "email": "member@example.com", "redirect_to": "https://admin.example.com/auth/callback" }`
- `admin-manage-member`: `{ "user_id": "uuid", "status": "active|suspended|revoked" }`
- `admin-upsert-tool`: `{ "id"?: "uuid", "name": "...", "slug": "...", "category": "apps", "description": "...", "draft_recipe": {} }`
- `admin-publish-tool`: `{ "tool_id": "uuid", "changelog": "..." }`; optional `source_version_id` republishes a previous payload as a **new** signed version.
- `admin-disable-tool`: `{ "tool_id": "uuid", "disabled": true }`
- `admin-manage-tool-state`: `{ "tool_id": "uuid", "status": "DRAFT|TESTING|ARCHIVED" }` (unpublishing sets `DRAFT`; `PUBLISHED` can only be set through signed publication)
- `admin-assign-tool`: `{ "tool_id": "uuid", "audience": "all_active_members" }` or `{ "tool_id": "uuid", "audience": "selected_members", "member_ids": ["uuid"] }`
- `get-admin-analytics`: no required body.

## Action catalogue

`CHECK_INTERNET`, `DNS_LOOKUP`, `HTTPS_PROBE`, `CHECK_APP_INSTALLED`, `CHECK_STORAGE`, `OPEN_APP`, `OPEN_APP_DETAILS`, `OPEN_ANDROID_SETTINGS`, `SHOW_GUIDE`, `ASK_USER_CONFIRMATION`, `REQUEST_OWN_APP_PERMISSION`, `VERIFY_INTERNET`, `VERIFY_DNS`.

The APK must sync the catalog with its registered `device_id` and must require a fresh online authorization/sync before each recipe execution if immediate member/device revocation is required. Previously cached signed payloads cannot be remotely erased while the device is offline. The APK must implement this allowlist locally. `OPEN_APP_DETAILS`, settings navigation, and own-app runtime permission requests must present understandable user confirmation. The server's recipe checks are defense-in-depth; the APK remains responsible for rejecting unsupported actions and validating every parameter.
