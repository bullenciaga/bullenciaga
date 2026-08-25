# BULLENCIAGA

Canonical public source for the BULLENCIAGA website and its public verification material.

## Identity

- Project: **BULLENCIAGA**
- Token: **$BULLEN**
- Solana mint: `BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN`
- Website: [bullenciaga.com](https://bullenciaga.com)

The production website snapshot in `site/` is preserved byte-for-byte. Its authoritative `index.html` SHA-256 is:

```text
416e5720e1711c2e3cdafc0caa81dbf7b3ffbb4a9974fda6a78dfce9c636f08a
```

## Repository boundary

This public repository contains the website, public documentation, transaction-safety notes, and verification checks. Telegram moderation, cron signing, giveaways, administrative endpoints, private operational runbooks, and the production API Worker belong in the private `bullenciaga-ops` repository.

No private key, wallet keypair, API key, bot token, webhook secret, or Cloudflare credential belongs here.

## Validate locally

Node.js 24 is the reference runtime.

```bash
npm test
```

The tests verify canonical naming, the token mint, production source hashes, static-file completeness, redirect safety, and the separation between static page names and Worker API route prefixes.

## Deployment status

Production remains unchanged. GitHub Actions are prepared for a future manually approved Cloudflare deployment, but deployment is blocked until the repository environment, scoped Cloudflare credentials, preview validation, and rollback checkpoint have all been configured.

See `docs/DEPLOYMENT.md` and `docs/TRANSACTION_SAFETY.md`.
