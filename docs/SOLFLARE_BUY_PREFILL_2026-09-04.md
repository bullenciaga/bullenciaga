# Solflare buy prefill — 04 September 2026

## Authority and approval

Canonical iCloud authority: `/Users/mac/Library/Mobile Documents/com~apple~CloudDocs/CHATGPT/BULLENCIAGA`.

Active code authority: this `bullenciaga-site` repository. User explicitly requested fixing Solflare buy links across all pages and asked whether a native Solflare swap could be prefilled. No approval to connect a wallet, sign, transact, change financial rules, or modify BULLENSAGA. This handoff records a website-only change; no unapproved visual assets are promoted.

## Reproduced cause

The old `https://jup.ag/swap/SOL-<BULLEN mint>` route redirects to `/swap?buy=<USDC mint>&sell=<SOL mint>`. A fresh isolated mobile browser reproduced the user's SOL/USDC screenshot.

The corrected route is:

`https://jup.ag/swap?buy=BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN&sell=So11111111111111111111111111111111111111112`

Jupiter's live, unmocked interface rendered Sell SOL / Buy BULLEN. Its existing token warnings were not bypassed.

Solflare's documented Browse link remains `https://solflare.com/ul/v1/browse/<encoded destination>?ref=<encoded origin>`. Source: https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse . Its published provider-method list and Other Methods do not document a native swap-prefill method. Solflare's public token pages use a native token-detail link, not a documented prefilled swap. Do not invent a native swap URI or claim this release opens the native Swap tab.

## Change

- Shared `mobile-buy.js` derives the Jupiter destination from the passed mint, even if cached page HTML supplies the obsolete Jupiter URL.
- Solflare receives the complete, once-encoded Jupiter destination, with both buy and sell parameters preserved.
- Jupiter web links and desktop plugin-unavailable fallbacks use the same explicit pair.
- Updated Home, The Tape, The Drop, House Record 002 and the 001 archive buy scripts. The Drop's static anchor also uses the corrected route.
- Modal markup, styles, Phantom native swap, in-wallet embedded Jupiter, amounts and warnings are unchanged. Archive 001 editorial content is unchanged.

## Checks

- `npm test`: all repository checks, including new link tests, pass.
- `qa/test-mobile-buy-links.mjs`: shared real click handlers, stale caller URLs, nested Solflare encoding, all page fallback definitions, and unchanged Phantom route.
- `qa/visual-buy-links.mjs`: actual Buy → Solflare clicks on all five pages; captures and intercepts the navigation before any wallet launch. Optional `VERIFY_JUPITER_LIVE=1` checks the actual Jupiter form in a fresh disconnected browser.
- `qa/visual-mobile-buy-parity.mjs`: home/Tape/Drop computed styles, geometry and screenshot bytes match at 320, 390 and 430 px.
- `qa/visual-drop-buy.mjs`: mobile handoff/dismissal/continuation and desktop swap/configuration/geometry pass at 320, 390, 820 and 1440 px.
- No live wallet used, connected, signed or traded. Native iPhone app handoff cannot be certified by desktop browser QA; only the encoded destination and Jupiter's actual selected pair are verified here.

## Release and next action

Ship through the protected-main GitHub staging → production workflow. Record the PR, exact production commit and workflow outcomes in the PR release comment. After production, rerun the five-page browser handoff check against `https://bullenciaga.com`, recheck the live Jupiter pair, and compare the seven changed production assets with local SHA-256 hashes.

Next exact user check: refresh a BULLENCIAGA page in Safari, tap Buy → Solflare, and confirm that the newly opened Jupiter tab displays Buy BULLEN. An already-open old SOL/USDC Jupiter tab does not update itself. Do not connect or trade solely for this verification.
