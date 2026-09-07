# Website domain aliases

`bullen.app` and `www.bullen.app` belong to the public BULLENCIAGA deployment.
They are exact-host Worker routes in `wrangler.production.jsonc`, attached to the existing
`bullenciaga` Worker. They are not additional copies of the site.

`src/website.mjs` redirects both exact hostnames to `https://bullenciaga.com`,
retaining the path and query string. HTTP 308 preserves the request method.
The redirect is cached for five minutes. Browser fragments are not sent to the
server and follow normal redirect inheritance. All other hosts pass the same
request to the existing ASSETS service, preserving `_redirects` and `_headers`.
Existing, more-specific public API Worker routes remain unchanged.

## Release and verification

The normal GitHub release stages and checks the Worker, promotes its exact
version, verifies the primary site, and checks every current short link through both
aliases. `src/**` changes trigger the release; the release fingerprint includes
the Worker source. Staging remains route-free.

`npm test` exercises alias paths, queries and canonical asset passthrough.
`npm run smoke:aliases` checks the deployed alias redirects without following
links to third parties. It accepts permanent301/308 responses so propagation or
an emergency edge redirect can keep the origin reachable during recovery.
Normal application responses are308. The temporary dashboard301 rule created
before this migration must remain disabled after cutover.

## Domain lifecycle and recovery

Apply infrastructure changes separately with the existing authenticated operator
CLI: `wrangler triggers deploy --config wrangler.production.jsonc`. The GitHub
code-release token intentionally does not need zone route write access.
The apex and www DNS records must be proxied for these Worker routes to run.
Their legacy Sites DNS targets are never fetched by the exact-host handler.
Keep the recorded edge fallback enabled until the alias-aware Worker is live,
then disable it and verify application308 responses.

DNS/custom-domain bindings are Cloudflare infrastructure, not Worker-version
state. A source rollback does not undo domain attachments. Keep the bindings
and roll back to a known-good version containing the alias handler for ordinary
recovery. The initial migration's pre-handler rollback version requires the
recorded edge redirect as a temporary fallback until routing is repaired.

The pre-migration DNS snapshot and exact live receipt are in the canonical
PROJECT/RELEASES/BULLEN_APP_REDIRECT_2026-09-07 and PROJECT/HANDOFFS folders.
The unrelated BULLENSAGA website, its primary domains, data, and deployment
identity are unchanged. Do not reattach bullen.app to its Sites project.
