-- Wallet ownership is separate from the existing protected Goods page session.
-- No signatures, private keys, email addresses or postal/payment data are stored.
CREATE TABLE IF NOT EXISTS goods_wallet_challenges (
 id TEXT PRIMARY KEY, wallet TEXT NOT NULL, origin TEXT NOT NULL,
 message TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER
);
CREATE INDEX IF NOT EXISTS goods_challenge_expiry ON goods_wallet_challenges(expires_at);
CREATE TABLE IF NOT EXISTS goods_wallet_sessions (
 token_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS goods_session_expiry ON goods_wallet_sessions(expires_at);
CREATE TABLE IF NOT EXISTS goods_benefit_requests (
 id TEXT PRIMARY KEY, wallet TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('discount','custom')),
 idempotency_key TEXT NOT NULL, state TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 percent INTEGER, balance_raw TEXT, code TEXT UNIQUE, promotion_id TEXT UNIQUE,
 mint TEXT, colour TEXT, size TEXT, name TEXT, image_url TEXT,
 image_id TEXT, customization_id TEXT, product_id TEXT UNIQUE, variant_id TEXT,
 price REAL, preview TEXT, message TEXT, stage TEXT,
 UNIQUE(wallet,kind,idempotency_key)
);
-- Repeated/concurrent issuance cannot bypass the quota with many outstanding requests.
CREATE UNIQUE INDEX IF NOT EXISTS goods_one_active_kind ON goods_benefit_requests(wallet,kind) WHERE active=1;
CREATE INDEX IF NOT EXISTS goods_request_expiry ON goods_benefit_requests(active,expires_at);
CREATE TABLE IF NOT EXISTS goods_benefit_orders (
 order_id TEXT NOT NULL, wallet TEXT NOT NULL, kind TEXT NOT NULL,
 request_id TEXT NOT NULL REFERENCES goods_benefit_requests(id),
 status TEXT NOT NULL, provider_updated_at INTEGER NOT NULL,
 PRIMARY KEY(order_id,wallet,kind)
);
CREATE INDEX IF NOT EXISTS goods_completed_quota ON goods_benefit_orders(wallet,kind,status);
CREATE TABLE IF NOT EXISTS goods_webhook_inbox (
 event_id TEXT PRIMARY KEY, order_id TEXT, event_type TEXT NOT NULL,
 received_at INTEGER NOT NULL, processed_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS goods_webhook_pending ON goods_webhook_inbox(processed_at,received_at);
CREATE TABLE IF NOT EXISTS goods_reconcile_state (key TEXT PRIMARY KEY,value TEXT NOT NULL);
