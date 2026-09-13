# Website domain aliases

`bullen.app` and `www.bullen.app` redirect to the canonical website,
`https://bullenciaga.com`, while preserving paths and query strings.

The handler is in `src/website.mjs`. It matches those exact hostnames and uses
HTTP308 redirects. Other requests pass to the static-asset service.

`npm test` covers redirect behavior. `npm run smoke:aliases` checks deployed
aliases without following redirects to third-party destinations.
