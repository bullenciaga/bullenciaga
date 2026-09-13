# BULLENCIAGA

The public website source for BULLENCIAGA: The Herd collectibles, House Objects,
$BULLEN, and the public records behind them.

[Visit the House](https://bullenciaga.com) · [The Herd](https://bullenciaga.com/#gallery) · [Whitepaper](https://bullenciaga.com/whitepaper.pdf)

## Explore and verify

| Surface | What you can find |
| --- | --- |
| [The Herd](https://bullenciaga.com/#gallery) | Browse the collection, inspect artwork and traits, and view marketplace listings. |
| [House Objects](https://bullenciaga.com/objects) | Explore the House Object collection. |
| [Live stats](https://bullenciaga.com/stats) | Supply, mint progress and the volume-based burn schedule. |
| [Burn reserve](https://bullenciaga.com/lock) | The locked reserve and its public evidence. |
| [Living Ledger](https://bullenciaga.com/ledger) | A timeline of public market, supply and collection activity. |
| [Giveaways](https://bullenciaga.com/giveaways) | Current rules, counting progress and published draw evidence. |
| [House Record](https://bullenciaga.com/patchnotes) | Public project updates and earlier editions. |

The canonical $BULLEN mint on Solana is:

```text
BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN
```

## What is in this repository?

- `site/` — the website pages, scripts, styles, artwork previews and public proof files.
- `src/website.mjs` — the static-asset request handler and canonical-domain redirects.
- `docs/` — public architecture, verification and transaction-safety explanations, plus the whitepaper source.
- `qa/` — checks for page behavior, accessibility-related controls, source integrity and release boundaries.

The server-side services are separate. This repository does not include wallet
signing material, service credentials or operator procedures.

## Inspect locally

Use Node.js24 or newer. The website checks do not require an API key:

```bash
npm test
```

For a local page preview:

```bash
node qa/serve-buy-preview.mjs --serve
```

Open the printed localhost address; change `/buy` to `/` or another page to explore.
This previews the front end, not a local copy of the live backend. Some live data,
wallet connections and marketplace functions require the production services.
The preview reads the public supply, volume and chart endpoints; it does not
configure credentials or run server-side transaction services.

After changing files under `site/`, run `npm run manifest` and then `npm test`.
The manifest records file hashes; it is not a security audit or a promise about
third-party transactions. See [verification](docs/VERIFICATION.md) and
[architecture](docs/ARCHITECTURE.md).

## Feedback and security

Report reproducible website issues through GitHub Issues. For suspected security
problems, contact **contact@bullenciaga.com** privately; see [SECURITY.md](SECURITY.md).
Never include recovery phrases, private keys or credentials in an issue.

Source and artwork are available for inspection under the terms in
[LICENSE](LICENSE). Public visibility does not grant reuse rights.
