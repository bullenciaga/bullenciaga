# House Record edition 002 and mobile Jump To

Canonical iCloud authority:
`/Users/mac/Library/Mobile Documents/com~apple~CloudDocs/CHATGPT/BULLENCIAGA`

Current code authority:
`/Users/mac/.codex/.chatgpt-projects/g-p-6a873cd902f081919acb076925de3827/work/bullenciaga-site`
and `bullenciaga/bullenciaga` on GitHub.

Approval state: owner explicitly asked to prepare and ship edition 002, preserve
edition 001 as an archive, and widen/restyle Jump To on mobile only. No new artwork
was generated or promoted. BULLENSAGA is mentioned as the related game authority;
no BULLENSAGA source or production service is changed by this release.

## Editorial and archive decision

- `/patchnotes` is edition 002, covering work since publication of edition 001 on
  2 September through 4 September 2026.
- `/patchnotes-001` is a full-size HTML archive. Its original hero, summary,
  release article and operating principle are preserved byte-for-byte. A SHA-256
  regression test pins that content. Historical/date-sensitive claims are clearly
  labeled as archival, with navigation back to the current edition.
- Current and archived pages retain the House Record shell identity, favicon,
  responsive layout and existing mobile BUY handoff. Each has its own canonical
  URL and share metadata. No redirect competes with Cloudflare clean HTML routing.
- Edition 002 leads with Living Ledger, Wallet Passport, BULLENSAGA Registrar and
  GraveMarket. It distinguishes newly listed collections from newly minted ones.
- Supporting entries cover navigation/art presentation, the published Buy + Hold
  draw, private-app improvements and bot fixes. House Desk live-stream verification
  is explicitly pending activation; no measured delivery-speed claim is made.
- Evidence: published edition 001; local site and bot Git histories; House Desk
  `HANDOFF.md`; Control Room `HANDOFF.md`; 4 September bot release receipts;
  public giveaway snapshot/result; owner's GraveMarket verification screenshot.
- Personal upscaling/trading experiments, unapproved art and private verification
  correspondence are excluded from the public release record.

## Mobile-only change

Below the existing 820px mobile breakpoint, Jump To is 112x44px with centered
11px type, 10px text/icon gap and 14px horizontal padding. The brand can shrink
without colliding with the controls; at 360px and below its secondary page label
is hidden and its typography is compacted to retain the full house name.
Desktop styling and navigation order are unchanged.

## Verification before release

- All repository checks pass, including the new archive/content/link tests.
- Local browser checks: widths 320, 375, 390, 430, 820 and 1440; no record overflow;
  archive round trips; mobile menus and Escape; all 14 existing shared-shell
  destinations; desktop Jump To measurements identical with previous CSS.
- 21 browser check records and reviewed screenshots are in
  `.visual/house-record-002/` (local-only).
- Production smoke now requires both edition markers and both archive navigation
  directions, while old-production preflight excludes the not-yet-created archive.
- No wallet connection, swap, chain transaction, synthetic raid or paid API
  monitoring was performed as a browser test.

## Release and next exact action

Release through the existing protected-main GitOps pipeline: required PR CI,
route-free staging smoke, production preflight, captured rollback version, exact
version promotion, and post-release page/API smoke. No API, bot, KV or secrets
are deployed from this repository.

Next exact action: verify production `/patchnotes` and `/patchnotes-001` after
promotion, record the release receipt, then let the owner inspect both pages and
the mobile Jump To control. Do not publish an X announcement without a request.
