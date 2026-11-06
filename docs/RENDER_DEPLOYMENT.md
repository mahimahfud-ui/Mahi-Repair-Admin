# Render hosting notes — standalone Mahi Repair Admin

## Current configuration status

This standalone repository does not currently include a render.yaml, root Dockerfile or Render service definition. It does not establish a production Render service or production website URL.

Older Render notes copied from the separate Mahi-Repair Android repository referenced its admin-panel/ subdirectory, a preview service and a different source branch. Those details are not configuration for this repository and must not be used to deploy this standalone Admin application.

## Manual Render setup

To host this application on Render, create or select a Node.js Web Service and connect this repository. Set the service root directory to the repository root (leave the root directory field empty/default).

- Runtime: Node.js 22.23.4
- Build command: npm ci && npm run build
- Start command: npm run start

Configure only the browser-safe application environment variables:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_APP_URL — the exact HTTPS origin, without a trailing slash

Do not put the Supabase service-role key, database password, access token or RSA signing private key in Render. Those privileged values must not be part of the website's browser-facing deployment environment.

After creating and deploying a service, configure Supabase Auth Site URL and the exact /auth/callback redirect allow-list entry. Set the Supabase Edge Function secret ADMIN_ORIGIN to the exact canonical HTTPS origin. Verify active Owner sign-in and denied member access before enabling administration.

A Render website deployment does not apply Supabase migrations or deploy Edge Functions. Those are separate manual operations described in [DEPLOYMENT.md](DEPLOYMENT.md).

## Deployment boundary

No Render service was created, modified or deployed by the PR verification workflow. Do not infer a live URL, service ID, branch or environment configuration from this document. Record those values only after a real service has been configured and its deployment has been verified.
