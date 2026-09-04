# Mobile picker parity and stable first paint — 4 September 2026

## Requested correction

Use the existing home-page mobile buying modal exactly on The Drop. Do not
redesign it. Also extend the stable desktop header/content startup to mobile.

## Changes

- Kept the existing `mobile-buy.js` component and its copy, wallet links,
  icons, layout and colors. No second modal was created.
- Made the shared stylesheet own the home page's measured inherited values:
  bold 700 Poppins heading, white ink, mixed case; normal body line-height;
  the existing font rendering and zero close-button padding.
- Loaded the actual Poppins 700 face on Tape/Drop, like home.
- Prioritized the existing shared navigation script before deferred swap
  plugins on all 16 shared-shell documents; preload its stylesheet without
  changing CSS cascade order. This prevents slow Jupiter loading from delaying
  header construction and avoids a second shell.
- Mobile content now waits for the actual House header fonts, up to 1200ms,
  then uses the existing content-only 150ms fade. Warm fonts reveal immediately
  after the existing two-frame settle. Desktop retains its 500ms budget.
- The independent mobile script-failure escape is 3000ms (desktop 1600ms).
  No indefinite blank page, no waiting for live API data or wallets.
- Shared iPhone safe-area geometry for home and standalone headers. Mobile
  hero/stage use stable small viewport units so browser chrome does not resize
  them during scroll. All geometry rules are mobile-only.
- Updated the pinned index authority digest for the reviewed head boot changes;
  no home content, art, links, or desktop design was changed.

## Verification

`visual-mobile-buy-parity.mjs` checks every rendered element's computed styles
and geometry on the real home, Tape and Drop documents at 320×700, 390×844,
430×932. It ignores only inactive animation duration and effectively disabled
reduced-motion transition properties. No wallet or trade is invoked.

Before the mobile startup edits, the three 390px modal PNGs were byte-identical
to the original, unmodified home modal PNG, SHA-256:
`e1625562ad1b6cd7e5a65ac0ca41038e5821fede8a1e5671102c64ba7ce4d89c`.

`visual-mobile-first-paint.mjs` holds Jupiter's script response indefinitely
until after the mobile menu has been opened successfully on home, Tape,
Passport and Drop. It separately holds real font binaries past the old 500ms
deadline and checks hidden content, stationary header geometry, and the
content-only fade after fonts arrive. It also checks shared public page header
geometry and mobile menu interactions at 320/390/430px, plus 1440px desktop.

These are controlled local Chrome browser checks, not a claim of testing every
physical iPhone or network condition. Browser screenshots are under `.visual/`.

## Release boundary

Website assets only, using the existing staging → production GitOps pipeline.
No Drop ledger replay, bot, API Worker, secrets, balances, prizes or wallet state
are mutated by this release. Production proof is recorded in the pull request.
