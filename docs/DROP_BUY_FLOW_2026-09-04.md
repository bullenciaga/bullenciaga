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
