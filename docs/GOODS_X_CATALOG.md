# Goods catalog for X Shopping

Use `https://bullenciaga.com/goods/x-feed.xml` as a scheduled XML feed. A four-hour import schedule matches the Fourthwall integration guidance. No username or password is required. X controls catalog approval and profile-shop availability; the website release does not connect an X account or publish a shop.

The feed uses the same approved variant mappings and live Fourthwall storefront reads as Goods. Only mapped products are exported. Primary images are versioned 1200×1200 JPEG compositions of the approved Goods photography; framed-print images reflect the selected format. Existing approved gallery images supply additional views. Product links open Goods with `product`, `colour` and `size` query parameters; they do not add to the bag or create checkout sessions.

Successful feeds are cached for at most 15 minutes. Upstream errors return 503 instead of an empty or fabricated catalog. The feed is unavailable while Goods is private or checkout is disabled. Wallet and holder-discount APIs retain their separate authentication.

`src/goods-x-products.mjs` owns public presentation metadata. `src/goods-mappings.mjs` remains the approved variant identity source. New products/colours require matching imagery and metadata before release; tests check complete mapping coverage. Price and availability changes require no image or feed code edits. The catalog lists ordinary prices; wallet-dependent discounts are applied through the existing Goods flow.

When replacing images, use a new content-hashed URL: X does not reliably refresh a changed image at an existing URL. Do not export the private print masters.
