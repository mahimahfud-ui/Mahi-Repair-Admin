# Manual Supabase Edge Function deployment from GitHub

This repository is the source of truth for the separate Owner Admin website and the shared Mahi Repair Supabase Edge Functions.

## Production target

- Supabase project: `shwqsljicmhflnvjqjah`
- Region: `ap-south-1`
- Owner Admin website: `https://mahi-repair-admin-yy7c.onrender.com`
- Source directory: `supabase/functions/`

The Android app and the Render-hosted Admin website are separate clients of this same Supabase project. Android calls the member Edge Functions directly using its Supabase session. It must not call the Render website as an API and must not contain Owner routes or credentials.

## One-time GitHub secret

In this repository, open **Settings → Secrets and variables → Actions → New repository secret**.

Create this secret:

- Name: `SUPABASE_ACCESS_TOKEN`
- Value: a Supabase Personal Access Token created from the Supabase account's Access Tokens page.

Do not paste the token into chat, source files, workflow inputs or build variables. Do not create a service-role key for this workflow. The token is used only by the manual GitHub Actions job.

## Manual production deployment

1. Merge the reviewed Edge Function changes into `main`.
2. Open **Actions → Deploy Supabase Edge Functions (manual production)**.
3. Select **Run workflow** on `main`.
4. Type exactly `DEPLOY` into the production confirmation field.
5. Review the run summary and Supabase CLI output.

The workflow runs source checks and deploys the Edge Functions from the checked-out `main` commit to the existing project.

## Exact deployment scope

The workflow runs:

```bash
supabase functions deploy --project-ref shwqsljicmhflnvjqjah --use-api
```

This deploys the functions contained in `supabase/functions/` and applies the function settings declared in `supabase/config.toml`.

It does **not** run `supabase db push`, apply SQL migrations, create/delete Storage buckets, modify Auth provider settings, rotate Supabase secrets, change Owner/Member records, or deploy the Render website. It does not create another Supabase project or Firebase/Cloud Run service.

The workflow is intentionally manual-only and requires both the main branch and the explicit `DEPLOY` confirmation. A normal push, pull request, Render deploy or Android build cannot trigger a Supabase production deployment.

## Current integration boundary

The production member APIs are:

- `register-device`
- `get-my-repair-tools`
- `get-signed-repair-tool`
- `submit-repair-run`

Every member request requires a valid Supabase access token. Server-side checks enforce active Member role, device ownership/revocation, tool publication/assignment and signed recipe version. The Android APK verifies the RSA-SHA256 recipe signature and only runs its compiled native action allowlist.

Owner-only operations remain in Supabase Edge Functions and the separate Render Admin site. Do not copy service-role credentials or the RSA signing private key to Android, browser configuration or GitHub source.

## Operational note

A successful deploy proves that the current source was accepted by Supabase. It does not prove that an invited member can receive email, that the production RSA private key matches the Android public key, or that a physical device has completed a real repair run. Those require separate end-to-end acceptance checks.
