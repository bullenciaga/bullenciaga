# Integrated House release

Status: private predeploy. This document does not authorize a push, deployment,
Cloudflare mutation, D1 migration, collection transaction or mainnet mint.

## What ships together

The release is one coordinated state change across two repositories:

1. BULLENSAGA deploys the capped allocation ledger, public House Object burn
   registry, preorder counters and disabled managed mint worker.
2. BULLENCIAGA deploys the main-page tracker, revised roadmap and FAQ, the
   `/stats`, `/chart` and `/curve` registry views, and Whitepaper 2.0.
3. The two Metaplex Core collections are bootstrapped with the personal
   development wallet as root update authority, the Turnkey issuer as Update
   Delegate, and the personal development wallet as sole 10% royalty creator.
4. Canary assets prove both collections before automated minting is enabled.

The public BULLENCIAGA pages read one versioned registry contract from
`https://bullensaga.com/api/house-objects/burns`. They do not maintain their own
counter and cannot drift from preorder/manual allocation stock.

## Single release gate

Before any live mutation, both checkouts must be clean except for reviewed,
committed release changes and both local gates must pass:

```sh
(cd ../bullensaga-house-objects-v2 && npm run launch:verify)
(cd ../bullenciaga-site-house-objects && npm test)
```

The BULLENCIAGA gate deliberately fingerprints the exact revised homepage and
full static manifest. The BULLENSAGA gate verifies the database caps, Token-2022
escrow flow, Turnkey identity/policy, collection plan and dry-run Worker bundle.

## Live order

1. Deploy BULLENSAGA with minting disabled and apply the reviewed D1 migration.
2. Confirm the public registry reports the exact production inventory.
3. Deploy the revised BULLENCIAGA site and confirm all four registry views read
   the same production payload.
4. Bootstrap both Core collections and run one controlled canary per collection.
5. Verify owner, root update authority, issuer delegate, collection, image,
   metadata, serial and 10% royalty.
6. Enable batch size one and watch the first real fulfillment.

If any step fails, minting stays disabled. A low issuer balance pauses queued
delivery; it never changes inventory or marks a nonexistent mint complete.

## Authority and marketplace use

No Candy Machine is used. The personal development wallet is the public root and
the wallet used to claim or verify the two collection profiles on Magic Eden and
Tensor. The issuer is a managed automation delegate only; it is never used as a
marketplace login and its credential never reaches the browser.
