# Website deployment

Website releases are GitOps-controlled. Merge an approved pull request into protected `main`; GitHub then stages, validates, promotes, proves, and records the release automatically. No local deployment script, copied commit hash, release fingerprint, rollback UUID, or mobile environment approval is required.

The workflow deploys only the public website Worker. It does not mutate API v234, the Telegram bot, KV data, the image proxy, secrets, `rpc-proxy`, or local macOS signing jobs.

## Release boundaries

Treat these as separate systems with separate rollback plans:

- Public website assets and routes: this repository and Cloudflare Worker `bullenciaga`.
- Public API: the existing API Worker; the website workflow only probes its response contracts before and after promotion.
- Image proxy: the existing Worker; not referenced by either website deployment config.
- Telegram bot and scheduled jobs: separate runtime; not deployed from this repository.
- KV and other data stores: no staging binding and no deployment-time writes.
- Runtime secrets: rotate separately from code releases.

## Normal release

1. Open a pull request.
2. Let the required `verify` status check pass.
3. Review and merge the pull request into protected `main`.
4. **Deploy website staging** runs automatically for that exact commit. It runs repository checks, calculates the release fingerprint, dry-runs the production config, deploys only the route-free `bullenciaga-staging` Worker, and smoke-tests all nine public pages.
5. **Deploy website production** starts only after that automatic staging run succeeds.
6. Production checks out the exact staged SHA and aborts if `main` has moved.
7. It proves the existing production pages and four API contracts before changing traffic.
8. It asks Cloudflare which Worker version is currently serving 100% of production and records that UUID as the rollback target.
9. It uploads an immutable production version without traffic, promotes only that exact tag to 100%, then repeats the nine-page and four-API smoke suite.
10. If the post-promotion smoke test fails, the workflow automatically restores the captured pre-release version.

The existing GitHub `staging` environment supplies `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to both automation stages. This is the same narrowly scoped credential pair already configured for route-free staging and website deployment. The protected `production` environment is retained as a legacy/manual recovery boundary but is not required by the automatic release path.

## Emergency staging

**Deploy website staging** retains `workflow_dispatch` for an isolated route-free test. A manually triggered staging run never promotes production; only a successful staging run caused by a protected `main` push can start production.

## Secret rotation

Rotate a secret in its owning runtime as a separate maintenance operation. Validate the dependent service immediately and keep the old value available until validation passes. A website release must not also rotate API, bot, proxy, or job credentials.

## Automatic stop conditions

The release stops before promotion when CI fails, staging fails, the staged SHA is not current `main`, the production configuration dry run fails, current production pages or APIs are unhealthy, Cloudflare does not report exactly one active production version at 100%, or the rollback UUID is invalid.

After promotion, any failed page or API contract triggers the automatic rollback step.
