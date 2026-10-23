# House campaigns

An unlinked campaign system at `/campaigns`. The owner studio is
`/campaigns/admin`; `/campaigns/preview` is an explicitly labelled, non-writing
example. Nothing is added to the site navigation or sitemap. The established
token giveaways, raiders, Goods, payments and their ledgers are separate.

## Campaign lifecycle

Create a draft from a House, creative-submission or blank template. Set the cover,
description, precise prizes/quantities, dates, time zone, actions, points,
eligibility, privacy and final campaign rules. The date inputs use the operator's
device time and are stored as UTC; daily tasks reset in the campaign time zone.
The studio rejects placeholder rules at publication.

Publish when ready. A random draw seed is committed then. Published actions,
prizes, dates and rules are immutable; title, introduction and cover can be
edited. Pause/resume entry collection or close it permanently. Duplicate for
another round rather than changing the deal after entrants have joined.

Each approved point is one weighted draw entry. Pending, rejected, revoked and
disqualified submissions do not count. A unique entrant/action/period constraint
prevents duplicate claims. Follows, membership, likes and reposts of the same
target are one-time actions. Replies and other repeatable tasks may be daily.

## Actual verification

| Action | Verification |
|---|---|
| Free entry | Authenticated entrant and accepted current campaign rules |
| Visit a URL | Outbound visit recorded; explicitly not a follow, like, view-duration or purchase claim |
| X follow | X API following list, matched to the verified account identity |
| X repost | X API reposting accounts matched to verified entrant |
| X reply / quote | X post author, referenced target, timestamp and daily period |
| X like | User-context OAuth required for the entrant's private likes |
| Discord join | OAuth membership lookup, including completed screening |
| Instagram actions | Organizer-reviewed evidence; not automatic verification |
| TikTok / YouTube / Facebook / Telegram / newsletter / creative / custom | Organizer-reviewed evidence |

Where direct X OAuth is not configured, the existing app bearer credential can
verify a one-use public nonce post. The author returned by X, not the handle typed
into a URL, becomes the entrant's identity. The flow is browser-bound, expires in
15 minutes, and can sign an entrant in without a wallet. No post is made by this
app; the entrant chooses to publish the verification post and may delete it
after checking. Public proof cannot read private likes.

X relationship scans have a five-page budget. A truncated/partial result,
permission failure, exhausted API credits, timeout or rate limit never earns
points. A successful check is evidence at that time, not continuous monitoring.
Private, deleted or inaccessible posts may need manual review. This application
does not bypass provider access or claim API verification for unsupported actions.

Optional OAuth X and Discord tokens use AES-GCM encryption with identity-bound
additional authenticated data. Token refresh stays on the server. OAuth state,
PKCE for X, browser cookies and single-use expiry guard sign-in/linking.

Wallet sign-in uses a domain-bound, short-lived Ed25519 message challenge. It does
not request a transaction. Wallet ownership alone does not prove a unique human.
Identity uniqueness, duplicate constraints, per-IP/user throttles, review and
disqualification are basic abuse controls, not a claim of perfect bot detection.

## Referrals, review and draws

Referrals are attributed at join, cannot be changed afterwards, and cannot refer
the same account. A referral pays only after a referred entrant has an approved
API/manual action; visits/free entries alone do not qualify. Campaign caps apply.
Loss of qualification or disqualification revokes the derived reward.

The studio has approve/reject/revoke, an explicit exclusion reason, recorded
activity and paginated CSV export with formula escaping. Contact is optional,
collected for prize administration only. Owner exports include connected account
identifiers, but never access tokens. No promotional mailing is performed.

Close the campaign, resolve pending submissions, then type its slug to draw.
The snapshot is permanently frozen. SHA-256 rejection sampling selects by weight
with or without repeat winners, as configured before launch. Repeating the draw
request returns the existing result; there is no silent reroll. If there are
fewer eligible distinct entrants than prizes, unfilled prizes remain unassigned.
The public proof includes anonymous entrant IDs, weights, seed commitment,
revealed seed, canonical snapshot and hash. `selectWinners` in
`src/campaigns/model.mjs` replays it. It is auditable randomness, not an externally
audited competition or a guarantee that an operator cannot abandon a campaign.
Prizes are delivered manually; the app never transfers assets.

## Hosting and credentials

`src/campaigns-gateway.mjs` serves the private-discovery frontend and proxies only
the campaign API. A dedicated `bullenciaga-campaigns` Worker, accessible through
the website service binding, owns a SQLite Durable Object. Staging uses the
separate `bullenciaga-campaigns-staging` namespace and origin. No existing dataset
is migrated or reused.

The studio uses the existing `CONTROL_AUTH` service's auth-only probe and House
control credential. The browser keeps the key only in tab memory. Requests are
same-origin and non-cached. No credential is included in public assets.

Optional server secrets (never commit values):

- `CAMPAIGNS_X_BEARER`: existing app bearer for public X identity and checks.
- `CAMPAIGNS_TOKEN_KEY`: at least 32 random characters, needed for OAuth storage.
- `CAMPAIGNS_X_CLIENT_ID`, `CAMPAIGNS_X_CLIENT_SECRET`: OAuth X app.
- `CAMPAIGNS_DISCORD_CLIENT_ID`, `CAMPAIGNS_DISCORD_CLIENT_SECRET`: Discord app.

Callbacks are exactly
`https://bullenciaga.com/campaigns/api/oauth/x/callback` and
`https://bullenciaga.com/campaigns/api/oauth/discord/callback`; staging uses its
own website origin. Scopes are read-only. Provider API usage/billing remains the
owner's existing account responsibility. Missing integrations remain disabled;
organizer review is explicitly selectable instead.

The established website release pipeline deploys the isolated campaign service
before the frontend binding. SQLite objects are created on first access. Initial
deployment creates no active campaign, participant or real draw. Cloudflare's
SQLite Durable Object recovery history is available independently of code
rollback. Never delete the namespace to roll back code.

## Validation

`npm test` includes campaign domain, security, duplicate, review, referral,
OAuth, X verification, wallet and draw replay tests. `qa/campaigns` contains a
local-only in-memory fixture server, a browser acceptance runner and a native
workerd SQLite smoke test. Fixture credentials/data are never part of a deployed
Worker or static site. `qa/smoke-campaigns.mjs` checks deployed pages and read-only
API contracts without creating entrants or prizes.

## Research references

- [Gleam competitions](https://gleam.io/docs/competitions): configurable actions,
  hosted campaigns, referral sharing, entry reporting and draws.
- [Gleam Instagram actions](https://gleam.io/docs/actions/instagram): the
  distinction between visits and platform-verifiable engagement.
- [X OAuth with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code).
- [X following](https://docs.x.com/x-api/users/get-following),
  [liked posts](https://docs.x.com/x-api/users/get-liked-posts),
  [reposted by](https://docs.x.com/x-api/posts/get-reposted-by).
- [Discord OAuth](https://discord.com/developers/docs/topics/oauth2).
- [Cloudflare SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/).
