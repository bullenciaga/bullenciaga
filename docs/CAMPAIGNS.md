# House campaigns

An unlinked campaign system at `/campaigns`. The owner studio is
`/campaigns/admin`; `/campaigns/preview` is an explicitly labelled, non-writing
example. Nothing is added to the site navigation or sitemap. The established
token giveaways, raiders, Goods, payments and their ledgers are separate.

The campaign pages and owner studio default to dark mode. The header's theme
button switches to light mode and stores that explicit preference locally.
Unavailable browser storage does not prevent either theme from working.

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
| Telegram join | Telegram OIDC identity and Bot API membership; bot must be an administrator |
| Instagram comment | One-use comment code; owned media, API author ID, username and timestamp |
| Newsletter | Explicit permission plus a confirmed email code; saved House subscriber record |
| Question / secret code | Private accepted answers; exact matching ignoring case and whitespace |
| Instagram follows / likes / story shares | Organizer-reviewed evidence; not automatic verification |
| TikTok / Facebook / creative / custom / open-ended answers | Organizer-reviewed evidence |

YouTube's API policies prohibit incentivized engagement. The generic review action
is not permission to reward prohibited views, likes, shares or subscriptions.

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
PKCE for X and Telegram, browser cookies and single-use expiry guard sign-in/linking.

Wallet sign-in uses a domain-bound, short-lived Ed25519 message challenge. It does
not request a transaction. Wallet ownership alone does not prove a unique human.
Identity uniqueness, duplicate constraints, per-IP/user throttles, review and
disqualification are basic abuse controls, not a claim of perfect bot detection.

Email sign-in optionally reuses the existing on display. account service. The
entrant requests an eight-digit code and submits it in the same browser within
ten minutes. Delivery and verification are rate-limited; five failed code checks
lock a request. The service must return a confirmed email and stable user ID.
Typed addresses alone never create campaign identities. An authenticated entrant
can link email without changing their entrant ID; an email already linked to a
different entrant cannot be taken over or silently merged.

Email sign-in stores a namespaced provider ID and masked email label, not the returned
account-service access or refresh token. The short-lived full email challenge is
removed on success, cancellation or expiry. The temporary provider session is
revoked locally after verification; other on display. sessions are unaffected.
No collection, wallet or private application data is read. The email form explains
the shared service and that sign-in is not marketing consent. The example page
keeps email/social sign-in disabled; use `/campaigns` to connect an account.

## Automatic verification additions (v1.2.0)

In the builder choose **Automatic answer / code check** for a question and enter
1–20 accepted answers, one per line. Answers are withheld from every public API
response, entry evidence and draw proof. Normalization is NFKC, trimmed/collapsed
whitespace and lowercase, then exact comparison. Five attempts per entrant/action
per ten-minute bucket; no fuzzy/AI grading. These are once-only actions.

**Email confirmation & consent** creates the native House newsletter list, not
an external mailing-provider subscription. The entrant must already be signed in
and have joined the campaign. An unchecked consent box displays the organizer's
exact saved wording. A separate one-use, entrant/action/campaign-bound code request
confirms the email with the existing account service. It expires after ten minutes,
locks after five failed attempts, and cannot silently merge another entrant's
email. Existing email sign-in never qualifies by itself.

The subscriber's full email and unsubscribe token are AES-GCM encrypted. Consent
wording and confirmation times are retained separately. Connections → Export
confirmed subscribers exports active addresses with consent history and an
unsubscribe URL; no mailing is sent. Use a fresh export immediately before a send
and include the provided unsubscribe URL. Unsubscribe works without signing in
through the email link, and from the participant's account preferences. It does
not revoke already-earned entries. Do not promise external mailing-list sync.

**Telegram API check** uses standard Telegram OIDC authorization-code login with
PKCE, browser-bound state and a one-use nonce. RS256 ID tokens are checked against
Telegram's fixed JWKS endpoint, issuer, audience, nonce, timestamp and numeric user
ID. No phone or direct-message permissions are requested. Membership checks first
confirm the bot's administrator status, then inspect the signed-in user's current
membership; a pending join request is not membership. Bot webhooks stay untouched.

**Instagram API check** only applies to comments on a post owned by the configured
professional account. The entrant requests a fifteen-minute code for their stated
username, adds it as a separate word in a new comment, and clicks Check & claim.
The API must return a matching author username and stable ID, timestamp, exact
code and correct media/permalink. Typed handles alone prove nothing. A single
Instagram identity cannot be attached to multiple entrants. Comment scans are
bounded to five pages of 100; an incomplete scan or missing identity fails closed.
No follow, like or story-share inference is made. API access must be tested with
the actual professional account before relying on a live campaign.

New actions can be added to drafts. Existing published rules remain immutable;
duplicate a published campaign to change verification methods. Provider checks
record status at verification, not continuous membership/subscription monitoring.

## Referrals, review and draws

Referrals are attributed at join, cannot be changed afterwards, and cannot refer
the same account. A referral pays only after a referred entrant has an approved
API/manual action or confirmed newsletter opt-in; visits, free entries and fixed-answer checks alone do not qualify. Campaign caps apply.
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
- `CAMPAIGNS_TELEGRAM_CLIENT_ID`, `CAMPAIGNS_TELEGRAM_CLIENT_SECRET`: Telegram
  Login credentials from BotFather. Register `https://bullenciaga.com` and
  `https://bullenciaga.com/campaigns/api/oauth/telegram/callback` as Allowed URLs;
  use RS256 signing. These are different from the bot token.
- `CAMPAIGNS_TELEGRAM_BOT_TOKEN`: existing bot token, used read-only for membership.
  Add that bot as an administrator of each target group/channel. Never reset its
  token or replace an existing webhook just to enable campaigns.
- `CAMPAIGNS_INSTAGRAM_ACCESS_TOKEN`, `CAMPAIGNS_INSTAGRAM_ACCOUNT_ID`: connected
  professional account with comment-management permission. For Facebook Login:
  `instagram_basic`, `instagram_manage_comments`, `pages_read_engagement` and the
  relevant Page access; for Instagram Login: `instagram_business_basic` and
  `instagram_business_manage_comments`. App roles/review and token expiry apply.
- `CAMPAIGNS_INSTAGRAM_LOGIN`: optional `facebook` (default) or `instagram`.
- `CAMPAIGNS_INSTAGRAM_GRAPH_VERSION`: optional version, default `v25.0`.
- `CAMPAIGNS_AUTH_URL`, `CAMPAIGNS_AUTH_PUBLISHABLE_KEY`: existing Supabase email
  account service, using only its publishable key. Never use an admin/service key.

Callbacks are exactly
`https://bullenciaga.com/campaigns/api/oauth/x/callback` and
`https://bullenciaga.com/campaigns/api/oauth/discord/callback`; staging uses its
own website origin. Scopes are read-only. Provider API usage/billing remains the
owner's existing account responsibility. Missing integrations remain disabled;
organizer review is explicitly selectable instead.

Register the X callback in the X developer app and the Discord callback in the
Discord developer application's OAuth2 settings. The Discord OAuth client secret
is separate from the bot token; campaign sign-in does not need or rotate a bot
token. Preserve the campaign encryption key across releases, or existing social
connections will need to reconnect.

The established website release pipeline deploys the isolated campaign service
before the frontend binding. SQLite objects are created on first access. Initial
deployment creates no active campaign, participant or real draw. Cloudflare's
SQLite Durable Object recovery history is available independently of code
rollback. Never delete the namespace to roll back code.

## Validation

`npm test` includes campaign domain, security, duplicate, review, referral,
OAuth, email verification/linking, Telegram signed identity/membership, Instagram comment proof, newsletter consent/export/unsubscribe, private answers, X verification, wallet and draw replay tests. `qa/campaigns` contains a
local-only in-memory fixture server, a browser acceptance runner and a native
workerd SQLite smoke test. Fixture credentials/data are never part of a deployed
Worker or static site. `qa/smoke-campaigns.mjs` checks deployed pages and read-only
API contracts without creating entrants or prizes.

Start the local fixture with `CAMPAIGN_TEST_EMAIL=1` to run
`qa/campaigns/auth-theme-browser.mjs`. That opt-in fixture intercepts all email
provider calls locally; it cannot send real email. Browser checks cover invalid
and valid codes, sessions, logout, narrow screens, stored theme choices and
blocked-storage fallback.

The automatic browser fixture uses `CAMPAIGN_TEST_EMAIL=1
CAMPAIGN_TEST_AUTOMATIC=1 CAMPAIGN_TEST_PORT=8841 node qa/campaigns/dev-server.mjs`
followed by `qa/campaigns/automatic-browser.mjs`. All provider calls are intercepted;
no real messages, social actions, newsletter subscribers or entries are created.

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

- [Telegram Login / OIDC](https://core.telegram.org/bots/telegram-login).
- [Telegram getChatMember](https://core.telegram.org/bots/api#getchatmember).
- [Meta's Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api): professional account access and comment permissions.
- [YouTube API developer policies](https://developers.google.com/youtube/terms/developer-policies#f.-user-experience).
