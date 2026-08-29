# BULLENCIAGA Whitepaper v2.0

Status: private predeploy source. The rendered PDF is the public artifact.

## Core statement

BULLENCIAGA is one connected on-chain system: the Token-2022 $BULLEN asset, a
fixed volume-triggered burn schedule, The Herd, numbered House Objects, and the
BULLENSAGA game. The accounting rule is simple: escrow deposits are shown as
committed; only a confirmed Token-2022 burn is shown as destroyed supply.

## Token facts

- Original supply: 1,000,000,000 $BULLEN.
- Chain: Solana; program: Token-2022.
- Mint: `BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN`.
- Development wallet: `GV7XDVAkra3Kjr4b2f2nyYrhL9gqEx5gvevdkTBzyYmd`.
- Public burn escrow token account:
  `FUtAEk1TAVf2WZ3wqXeHYttqfpTftEf6qrprue5x6mLy`.
- Mint and freeze authority are revoked and read live from chain on the site.

## Supply reduction

### Volume schedule

The locked 250,000,000-token allocation burns across five cumulative trading
volume milestones: 5% at $250,000; 15% running total at $1,000,000; 30% at
$5,000,000; 55% at $20,000,000; and 100% at $50,000,000. Tier one executed on
11 August 2026 and destroyed 12,500,000 $BULLEN.

### The Herd

Each public Herd claim transfers 250,000 $BULLEN into the public burn escrow.
The scheduled burner later destroys the escrow balance. A complete 1,000-piece
public run can remove 250,000,000 $BULLEN.

The 1,000-piece issue spans twelve published trait categories. Five Grail and
five Legendary pieces retain the published creator-fee participation model:
2.5% each for Grails and 1.5% each for Legendaries, calculated after marketing
spend. Up to an additional 25% of creator-fee revenue may be assigned to early
marketing backers under their published terms. Payouts are reconciled weekly;
they depend on actual trading and are never guaranteed.

### House Objects

Each public Signet or Cufflinks claim transfers exactly 100,000 $BULLEN into the
same public burn escrow. The first two series are capped at 100 each, so their
maximum public-claim commitment is 20,000,000 $BULLEN. Preorder and manual awards
consume the same numbered inventory but do not create a token-burn record.

## House Objects

The first issue is The Signet and The Cufflinks, 100 numbered records of each.
Holders receive a 48-hour first-access window before the public claim opens.
Published benefits include pairing, private access, curated participation, set
progression, physical priority and transferable status. A later Key can be
awarded free to wallets holding the first pair at the published snapshot.

## BULLENSAGA founding records

- The Promise: maximum 200; included in House and Estate Founding I.
- The Triad: maximum 100; included in Estate Founding I.
- Estate Founding I also allocates one Signet and one Cufflinks from the same
  House Object inventory used by public claims and manual awards.
- A bundle is never sold unless every promised numbered record can be reserved.
- When the founding inventory closes, a later benefit wave may name House
  Objects 03 and 04. Existing orders are never silently substituted.
- A published portion of each completed preorder is tracked as committed to
  supply reduction. Fulfilment can be a direct $BULLEN burn or a Herd giveaway
  mint whose 250,000-token claim enters the established escrow flow. A preorder
  event is not counted as destroyed supply until the corresponding Token-2022
  burn is confirmed on-chain.

## Collections and authority

The records use two Metaplex Core collections, not Candy Machines:

1. `BULLENCIAGA - HOUSE OBJECTS`
2. `BULLENSAGA - FOUNDING RECORDS`

The personal development wallet is the root update authority and sole 10%
royalty creator. The isolated Turnkey issuer is the collection Update Delegate
used for deterministic automated delivery. The development wallet seed is never
imported into the worker or Turnkey.

## Roadmap

01 Deploy $BULLEN. 02 First Blood. 03 The House Fills Up. 04 The Vault Empties
in two portions at $20M and $50M cumulative volume. 05 House Objects.
06 BULLENSAGA. 07 $BULLEN Staking. 08 The Collab.

## Referral record

Referral binding is signed, forward-only and permanent. Only buys after the
binding count; sells and self-referred activity do not manufacture rewards.
Three referred public Herd mints earn the referrer one custom 1-of-1 under the
published programme. The public record and payout view live at `/refer`.

## Risk

$BULLEN is a community token, not a security. Nothing here guarantees price,
liquidity, NFT value, royalties, rewards, timelines or marketplace support.
Users should verify mint authority, freeze authority, supply, escrow deposits,
completed burns, NFT ownership and collection authority independently.
