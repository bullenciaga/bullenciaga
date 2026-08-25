# Deployment policy

## Current state

The live website remains Cloudflare version 388. Creating this repository does not change production.

## Intended flow

1. Open a pull request.
2. Run identity, hash, route-boundary, and static-file checks.
3. Deploy to the route-free `bullenciaga-staging` Worker.
4. Complete desktop, mobile, wallet, redirect, and API-boundary QA.
5. Record the rollback version.
6. Merge to protected `main`.
7. Obtain approval through the GitHub `production` environment.
8. Trigger the production workflow manually.
9. Run post-deployment smoke checks.

Production deployment remains blocked because `.release/WEBSITE_DEPLOY_AUTHORIZED` is intentionally absent. Add that marker only after staging, scoped Cloudflare credentials, branch protection, required reviewers, and rollback have been exercised.

Never commit `CLOUDFLARE_API_TOKEN` or any other credential. GitHub must store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment secrets.
