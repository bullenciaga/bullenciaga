# The Drop — existing desktop/mobile buy flow

Canonical iCloud authority: `/Users/mac/Library/Mobile Documents/com~apple~CloudDocs/CHATGPT/BULLENCIAGA`.
Active code authority: this `bullenciaga/bullenciaga` website repository.
Approval: owner requested the existing home-page / Tape buy flow on The Drop.

- The existing Buy $BULLEN action opens the House-styled Jupiter modal on desktop, with SOL input and the canonical $BULLEN output fixed, amount chosen by the visitor.
- Mobile uses the unchanged shared `mobile-buy.js` / `mobile-buy.css` picker: Phantom native prefilled swap, Solflare prefilled Jupiter page, and in-wallet embedded continuation.
- Shared `bullen-ui.css` supplies the same gold/black Jupiter palette. Home and Tape files are unchanged.
- A real prefilled Jupiter href remains for no-script / deliberate new-tab navigation. Missing plugin falls back safely to that page.
- Asset is named `thedrop-buy.js`, never `drop-buy.js`, to avoid the production API's `drop*` route.
- No Drop API, ledger, entries, pot, backend, signing logic or secrets changed. Tests do not connect wallets or submit trades.

Verification: full repository tests pass; deterministic tests compare the desktop Jupiter configuration directly with The Tape, check mobile handoff and fallback; isolated Chromium tests pass at 320, 390, 820 and 1440 pixels, including picker geometry, Escape/focus return and in-wallet continuation. Screenshots are local-only in `.visual/drop-buy/`; Jupiter itself is stubbed for these deterministic browser tests.

Next exact action: ship through required PR CI and the existing staging/production website pipeline, then verify the published HTML/JS and rerun the browser checks against production. Do not change backend routes or execute a trade as release validation.

## Real-plugin visual check and scoped position correction

Initial release PR 69 merged as `e4be7d8769f55e4f581e8b395c0938198c698fdf`; staging and production workflow `33873540735` succeeded. Live HTML/JS and deterministic desktop/mobile checks passed.

The real Jupiter plugin revealed an integration detail hidden by a configuration-only stub: its fixed shadow overlay leaves `left` automatic, so The Drop's centered flex body placed it 720px off-screen at a 1440px viewport. A page-scoped absolute host anchored at left/right/top zero fixes this without changing the page column or other pages. The empty host has no height and cannot intercept the page after close. Browser regressions now model that shadow-overlay geometry at all four widths.

The actual Jupiter modal was opened in a fresh isolated browser with the scoped fix: overlay bounds `(0,0,1440,1000)`, centered gold/black SOL-to-BULLEN form. Screenshot `.visual/drop-buy/desktop-real-jupiter-centered.png` was inspected. No wallet connection, amount entry, signature, warning bypass or trade was performed.

## Final release acceptance

PR 70 merged as `9ee44159acf69a8b333458d8f1407cf56db1622a`. Staging run `33874052237` and production run `33874100555` succeeded. Live `/thedrop` HTML matches the corrected source exactly. A fresh production browser opened the real Jupiter plugin with no injected layout CSS: overlay bounds exactly `(0,0,1440,1000)`. Dismissing it restored interaction with the buy button; no invisible host intercepted the page. Screenshot `.visual/drop-buy/production-real-jupiter.png` records this final state.

Next exact action: owner can use Buy $BULLEN on `/thedrop`; no accounting or backend follow-up is required for this frontend release. Preserve the scoped host positioning and shared mobile chooser on future refactors.
