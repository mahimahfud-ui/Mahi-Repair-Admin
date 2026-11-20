# Mahi Repair signed live updates

## Release flow

The Owner publishes a release in **App Update Manager**. The Admin Panel uploads ZIP/APK assets to the private `mahi-app-updates` Storage bucket, computes a SHA-256 digest server-side and submits a typed manifest to the `admin-publish-app-update` Edge Function. The function rechecks the active Owner, rate-limits publication, verifies every uploaded object and size/MIME, canonicalizes the manifest and signs it with the existing RSA-3072/SHA-256 release key. The SQL RPC inserts the immutable release row and audit record in one transaction.

The database trigger broadcasts only an opaque `app_update_published` event to registered active member devices. Android checks for the latest signed manifest when an authenticated session starts, when the app resumes, and when that private event arrives. The event itself contains no manifest or asset data; Android re-fetches the manifest from `get-app-update-manifest` and verifies its detached RSA-SHA256 signature against the bundled public key before parsing. The asset endpoint checks the member and registered non-revoked device, confirms the asset belongs to the selected signed release, and returns a 90-second private Storage URL.

## Manifest contract

- `schemaVersion` is 1; channels are `stable` and `beta`.
- `releaseNumber` increases monotonically within each channel. Published rows are immutable.
- `remoteConfig` allows booleans, labels, tool metadata, announcement text and Android API compatibility ranges. There is no script, HTML, WebView, reflection or arbitrary command field.
- ZIP resources must be declared in `packages[].entries` with exact relative path, SHA-256 and uncompressed byte size. Only JSON, PNG, JPEG and WebP resources are accepted. Admin and Android both cap an archive at 50 MB, each resource at 20 MB, at 200 declared entries and at 250 MB expanded data. The Android extractor rejects path traversal, directory/undeclared/duplicate entries, over-limit expansion, size mismatches and inner SHA-256 mismatches before activation.
- `nativeApk` metadata is optional. The APK must match the installed application ID, increase the version code and preserve signing-certificate continuity. The Android client must hand off to Android's system package installer and leave user confirmation / unknown-app installation permission under OS control.
- Signed package URLs are not embedded in the manifest and are not public. A client obtains a short-lived URL using `get-app-update-asset-url` only after device authorization.

## Rollback

Do not mutate or delete a published row. For a server-wide rollback, publish the earlier remote configuration/package descriptor as a new higher `releaseNumber`, signed with the current release key. On-device, the Android client retains the last activated data release and exposes a local rollback action; it atomically switches the active pointer back to that previous release. Native APK rollback is permitted only if Android accepts a higher versionCode built from the same signing identity; Android does not support downgrading an installed application through the normal package installer.

## Required production setup

1. Apply `20261120140000_app_update_releases.sql` to the intended Supabase environment.
2. Deploy `admin-publish-app-update`, `get-app-update-manifest` and `get-app-update-asset-url` Edge Functions.
3. Confirm the existing `RECIPE_SIGNING_PRIVATE_KEY_PEM` contains the RSA-3072 private key matching `RECIPE_SIGNING_PUBLIC_KEY_PEM` bundled in Android. Never upload the private key into the APK or Git.
4. Set the production app package ID and certificate SHA-256 accurately. The current Android Gradle applicationId in the repository is `com.aistudio.mahirepair.qrzntk`; change it only as a deliberate app identity migration.
5. Upload only packages produced from a trusted release pipeline. The upload API calculates the outer file digest; the manifest's inner-entry digests must come from the same deterministic package build.
6. Run signed-manifest verification and package-install tests on real Android hardware before making a mandatory release.

## Android client status

The Android client supports signed **remote configuration, data-package activation and native APK update** paths:

- It checks the stable channel after an authenticated session starts, on app foreground/resume and when the private `app_update_published` event arrives. The event carries only an opaque event ID; the client re-fetches the manifest through the member-authenticated, registered-device endpoint.
- It verifies the detached RSA-SHA256 signature over the exact manifest bytes before parsing. The manifest parser accepts only allowlisted configuration and data-package descriptors.
- Repair-tool availability overrides and safe title/description/category metadata are applied to the existing server-authorized tool catalogue. Owner announcements are displayed in-app. Android API compatibility ranges are enforced before data activation.
- For each content ZIP, Android obtains a short-lived private URL after device authorization, validates the URL origin, asset metadata, byte count and outer SHA-256, then checks every declared entry path, exact entry count, uncompressed byte size and inner SHA-256. Undeclared, duplicate, traversal, unsupported and over-limit entries fail the release.
- All downloaded packages are extracted into a private staging directory. The previous active package tree is carried forward, changed packages are replaced, and an Android `AtomicFile` pointer is updated only after all resources and remote config are validated. A failed download/extraction leaves the prior release active; the previous activated data release is retained for local rollback.
- The Admin publisher and Android client currently cap each ZIP at 50 MB and expanded resources at 250 MB. Changed package assets can be published independently, but Android downloads a changed package as a complete ZIP; it does not yet patch individual files inside an existing ZIP.
- Native APK metadata is checked against the installed package identity, increasing versionCode and currently installed signer. The downloaded APK is checked for exact byte count, SHA-256, application ID, version name/code and single signing-certificate fingerprint before Android's system installer is opened. The device owner must approve installation in Android; no silent install or downgrade is implemented.

The Admin release history records immutable published releases. The Android client currently exposes current release information and data download progress; per-device update success/failure telemetry and a complete installed-release history in Admin are not yet implemented. The client requests the stable channel; the Admin can publish beta releases, but a user-facing beta channel selector is not yet exposed.

## Important boundary

The signed native APK and data-only client paths are implemented in source, but the current Android CI has not yet completed a full successful run for the latest content-package code. A physical Android installation with a production-signed APK and a production-signed ZIP/config activation/rollback test are still required. Production deployment of the SQL migration/Edge Functions, real signing-key provisioning, and Owner/member/device authorization acceptance are also outstanding. A successful build alone is not production acceptance.
