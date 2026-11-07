# Build status — standalone Mahi Repair Admin

This document describes only this repository, mahimahfud-ui/Mahi-Repair-Admin. It is not a build record for the separate Android repository, mahimahfud-ui/Mahi-Repair. Historical Android repository branch names, CI run IDs, preview URLs and deployment claims do not describe this standalone Admin repository.

## Application location

The Next.js application is at the repository root. package.json, package-lock.json, .nvmrc, src/, supabase/, schemas/, tests/ and contract-tests/ are root-level paths. The Node.js version is 22.23.4.

## Automated verification

The current GitHub Actions workflow is the source of truth for each pull-request head. It runs with contents: read and checkout persist-credentials: false. It verifies only the checked-in application and does not sync another repository, create commits, push branches, use production secrets, deploy the website, apply Supabase migrations or deploy Edge Functions.

The required checks are:

- npm ci
- npm run check:scaffold
- npm run typecheck
- npm run lint
- npm run test
- Deno tests for the shared recipe, report, CORS and redirect contracts
- npm run build

See the Checks tab on [PR #1](https://github.com/mahimahfud-ui/Mahi-Repair-Admin/pull/1) for the exact head SHA and current run result. A previous green run does not certify a later commit.

## Deployment status

This repository does not contain a production Render/Cloud Run configuration, a root Dockerfile, or an automated Supabase deployment workflow. The website host must build from the repository root. Supabase migrations and Edge Function deployments are manual operations that require separate authorization and target-project review.

No production deployment, live migration, Edge Function update, secret update or live Owner/member/device acceptance test is implied by successful CI.
