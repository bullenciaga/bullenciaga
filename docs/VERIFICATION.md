# Reading the public evidence

## Supply and burns

The [statistics](https://bullenciaga.com/stats) and
[reserve](https://bullenciaga.com/lock) pages distinguish circulating supply,
locked reserves and completed burns. A lock or a burn commitment is not itself
a completed burn. Follow the linked account and transaction evidence when
checking a figure; values can differ between services while indexing catches up.

## Collection and marketplace records

The [gallery](https://bullenciaga.com/#gallery) links artwork, traits and
marketplace records. Check the asset and collection identifiers rather than
relying on an image or name alone. Listings and displayed prices can change.

## Giveaway progress and results

The [giveaways page](https://bullenciaga.com/giveaways) is the starting point for
current rules and published evidence. Each campaign has its own rules; a
progress total, an entry count and a final result are different records.

The live buy-competition counter shows when it was last verified. “Catching up”
means the displayed total is the last verified count, not a fresh live total.
Missing or ambiguous transaction data can pause verification.

Published snapshots, draw seeds and result files are available through the
campaign's evidence links. Some completed campaigns also have JSON proof files
under `site/`. Use the rules and evidence for that exact campaign; do not apply
one campaign's scoring formula to another.

## Source integrity

`site/SHA256SUMS.txt` records hashes of website assets. `npm test` checks the
manifest and other source contracts. Hashes can establish whether bytes match;
they do not prove an asset's authenticity, a transaction's safety or a service's
uptime. See [transaction safety](TRANSACTION_SAFETY.md).
