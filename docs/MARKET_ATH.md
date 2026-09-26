# Homepage ATH

The homepage's historical record row uses `GET /volume/ath`, served by the existing market-data Worker. It reports CoinGecko's USD ATH and UTC date; it does not claim to reconstruct every transaction or historical market cap.

The fixed upstream is CoinGecko's `/api/v3/coins/bullen` endpoint with market data enabled and tickers/other large fields disabled. The handler verifies the exact Solana mint, numeric USD value, valid ATH date, and recent upstream market timestamp. Responses are bounded to256KiB and8 seconds. The existing backend CG_API_KEY authenticates the fixed CoinGecko Pro endpoint; it never reaches the public website. No new bindings are required.

Validated records are cached at the edge for5 minutes. Query parameters cannot create new cache keys. A source failure is briefly cached for30 seconds and returns503 with no numeric fallback. Browser responses are `no-store`; the page refreshes every5 minutes while visible, retries on return/online, and removes a record after its10-minute expiry. No snapshot values or local-storage records appear on first paint.

The row preserves the existing six-tile grid. Loading fades to the verified value/date; unavailable data retains the source link. Reduced-motion users get an immediate change. Source validation/cache/error tests live with the backend module in bullenciaga-ops (`t_market_ath.mjs`).
