# Public website architecture

The website is a static multi-page application served through Cloudflare Workers.
HTML, CSS, JavaScript and media live in `site/`; `src/website.mjs` serves those
assets and handles canonical-domain redirects.

Shared scripts provide navigation, wallet selection, collection displays and
public data views. Page-specific modules implement features such as the gallery,
giveaway evidence and Living Ledger. Server-side data services are deployed
separately and are not reproduced by a local static preview.

The public API prefixes listed in `API_ROUTE_PREFIXES.json` must remain distinct
from static page paths. Tests reject collisions so a page cannot accidentally
replace a data endpoint.

`site/SHA256SUMS.txt` records the static asset hashes. `npm run manifest` regenerates
it; `npm test` verifies it alongside page and route checks. Public builds run
through the repository's CI and staging checks before production. See
[release overview](DEPLOYMENT.md).
