# Anonymous early-preview signup

Public surface: `/platform`, POST `/platform/signup`. Static assets and all requests remain on the BULLENCIAGA origin. No account creation, wallet connection, external authentication or email delivery occurs. A submitted X handle is a contact request, not verified account ownership.

The copied sculpture loop/poster are immutable local media under `site/assets/platform`. Product identity and the original app domain must never enter public copy, URLs, metadata or client code. The original app repositories are untouched.

## Storage and operations

D1 `bullen-platform-preview` holds production signups; `bullen-platform-preview-staging` is separate QA storage. Both were provisioned with EU jurisdiction. Schema: `migrations/platform/0001_signups.sql`. Rate limiter namespaces are isolated per environment. No public list, download, count or admin API exists.

Only chosen contact method, normalized contact, random ID, creation time and consent revision are stored. UNIQUE(method, contact) makes retry/duplicate submissions harmless. No addresses are logged or sent to an email provider. Honeypot entries are ignored; origin, content-type, byte limits, consent, contact validation and edge rate limiting precede writes. Success requires a completed database write.

Use authenticated Cloudflare D1 access to retrieve the list. Keep exported contacts outside Git, public site files, build artifacts and release receipts. Example read-only command (output contains personal data; run privately):

```
npx wrangler d1 execute PLATFORM_SIGNUPS --config wrangler.production.jsonc --remote --command "SELECT method, contact, created_at FROM preview_signups ORDER BY created_at"
```

Withdrawal/deletion requests go to contact@bullenciaga.com. Verify the requester controls the supplied contact before targeted deletion; do not infer X ownership from a handle alone. Remove details when no longer needed for preview/testing. Do not enroll this list in unrelated marketing. Inviting or emailing subscribers requires a separate owner instruction.

## Release / rollback

Production is promoted by the existing CI → route-free staging → exact-version production workflow. The two empty databases/schema were provisioned before the code release. Bindings contain database IDs, not credentials. Repository checks assert isolated staging/production storage.

Revert the page/Worker change and redeploy, or roll back to the recorded pre-release Worker version, to disable signup immediately. Retain the production database during rollback so existing requests survive. Never drop it as part of a code rollback. The database addition does not change existing campaign, wallet, account or giveaway data.
