# Website deployment

The live website remains Cloudflare Worker `bullenciaga`, version 388, until a production workflow is explicitly approved and completes successfully. Website releases do not mutate API v234, the Telegram bot, KV data, the image proxy, secrets, or the local macOS signing jobs.

## Release boundaries

Treat these as separate systems with separate rollback plans:

- Public website assets and routes: this repository and the `bullenciaga` Worker.
- Public API: existing Worker version v234; this workflow only probes its response contracts.
- Image proxy: existing Worker; not referenced by either website deployment config.
- Telegram bot and scheduled jobs: separate runtime; not deployed from this repository.
- KV and other data stores: no staging binding and no deployment-time writes.
- Runtime secrets: rotate separately from code releases.

## Stage a website revision

1. Open a pull request and let `CI` pass.
2. Run **Deploy website staging** for the exact pull-request branch or commit.
3. The workflow runs repository checks, calculates a release fingerprint, performs a production-config dry run, and deploys only `wrangler.staging.jsonc`.
4. Review the route-free `workers.dev` URL and its nine-page smoke result.
5. Record the release fingerprint from the workflow summary.
6. Merge only after the staged revision is accepted.

The GitHub `staging` environment needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use a narrowly scoped Cloudflare token. The staging Worker has no production routes, data bindings, triggers, or API smoke calls.

## Promote the exact release

1. Confirm the approved commit is now the exact `main` HEAD.
2. Confirm `.release/PRODUCTION_BASELINE.json` still names the version currently serving production.
3. Run **Deploy website production** from `main` and supply:
   - the full 40-character approved `main` commit SHA;
   - the release fingerprint recorded during staging;
   - the current production version UUID as the rollback target;
   - the exact phrase `DEPLOY BULLENCIAGA WEBSITE`.
4. Approve the protected GitHub `production` environment.
5. The workflow re-runs all checks, recalculates the fingerprint, performs a dry run, uploads an immutable tagged version without traffic, then promotes that exact tag to 100%.
6. It checks all nine public pages and the four critical API contracts. If smoke fails after promotion, it rolls back automatically to the supplied baseline version.
7. After success, update the production baseline and continuity checkpoint with the new Cloudflare version/deployment IDs and live hashes.

The `production` environment should require a reviewer and contain the same narrowly scoped Cloudflare secrets. No production workflow runs on `push`.

## Secret rotation

Rotate a secret in its owning runtime as a separate maintenance operation. Validate the dependent service immediately and keep the old value available until validation passes. A website release must not also rotate API, bot, proxy, or job credentials.

## Stop conditions

Do not promote when the staged fingerprint differs, `main` moved, the rollback UUID is stale, any repository check fails, the production dry run changes routes unexpectedly, or a required external API is unhealthy. Resolve the mismatch or restore the last known-good version before continuing.
