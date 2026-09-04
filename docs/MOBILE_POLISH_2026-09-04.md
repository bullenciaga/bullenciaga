# Mobile contract, navigation and Solflare polish — 4 September 2026

Canonical record: `work/bullenciaga-site/docs/MOBILE_POLISH_2026-09-04.md`
in the active BULLENCIAGA website repository.

Approval: explicitly requested by the owner in this task. Current authority:
the reviewed repository source; production authority is the successful GitOps
release recorded on this change's pull request. Next exact action: verify and
merge this website-only PR, then confirm staging and production smoke results.

## Changes

- The home-page contract label/address is one semantic copy button. Mobile
  hides the separate icon box, retains a 44px target, preserves the full exact
  case-sensitive mint, and overlays success/failure feedback on the label
  without shifting content. The desktop icon and layout remain intact.
- Clipboard API success is required before showing success. Browsers lacking
  it have a temporary readonly-field fallback, cleanup and focus restoration;
  unsuccessful copies explicitly show failure. No wallet interaction.
- Below 821px, hamburger and Jump To share the same panel surface, borders,
  position, padding, scrolling bounds, type and row spacing. Desktop CSS is
  unchanged. Existing destinations and open/close behavior are preserved.
- The shared mobile picker adds **Solflare token page** beside the existing
  Jupiter-in-Solflare route. It opens
  `https://www.solflare.com/prices/bullenciaga/BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN/`.
  The owner previously confirmed that this opens the native BULLEN page on
  iPhone; manually tapping Buy then selects SOL → BULLEN. The label discloses
  that extra tap. No speculative action, amount or swap parameters are added.
- Home, Tape and Drop use that one shared picker, as do the existing House
  Record buy controls. No copied or independently styled modal was created.

## Verification

- `test-contract-copy.mjs`: exact address, both controls, missing/denied API,
  failed fallback, cleanup, focus restoration, retries and pending writes.
- `test-mobile-buy-links.mjs`: both Solflare routes, unchanged Phantom and
  canonical Jupiter pair, no wallet navigation on modal opening.
- `visual-contract-copy.mjs`: 320/390/430/440/768/1440px; address copying by
  click, Enter and Space; stable feedback geometry; no horizontal overflow.
  Phone hero stack is 47px shorter at 390–440px (52px at 320px); desktop
  hero, controls and address geometry match the previous release exactly.
- `visual-mobile-navigation.mjs`: 15 public pages at 320/390/430px;
  computed panel/item style and position parity, full directory, exclusive
  dropdown opening, scroll reachability and Escape.
- `visual-mobile-buy-parity.mjs`: pixel and computed-style parity across home,
  Tape and Drop at 320/390/430px; native URL clicks intercepted without opening
  a wallet. Screenshots live in ignored `.visual/` directories.

These are controlled Chrome checks, not a claim of physical-iPhone testing of
the newly deployed UI. All release evidence belongs on the pull request.

## Boundary

Public website assets only. No API Worker, Telegram bot, Drop ledger, KV,
wallet balance, signature, transaction, security setting or secret changed.
The separate untracked native-link investigation is not part of this release.
