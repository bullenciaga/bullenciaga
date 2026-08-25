# Public architecture

The public site is a static multi-page application deployed as Cloudflare Worker static assets.

Public browser requests are divided between two services:

1. `bullenciaga` serves the files in `site/`.
2. `rpc-proxy` serves the explicitly routed JSON, webhook, referral, giveaway, and marketplace transaction endpoints.

Static pages must not be named with an API route prefix. A page named `drop.html`, for example, would conflict with the production `drop*` Worker route. The repository test in `qa/check-route-boundary.mjs` enforces this separation.

The current site is deliberately preserved as deployed. Refactoring the large standalone HTML files into shared components is a later, visual-regression-tested change—not part of the source-control migration.
