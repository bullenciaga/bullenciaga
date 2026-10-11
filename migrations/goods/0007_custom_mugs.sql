-- Expand custom pieces to mugs without changing existing request or order values.
-- D1 executes this migration atomically. Foreign keys use NO ACTION, never CASCADE.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE goods_benefit_requests_mug_next (
 id TEXT PRIMARY KEY, wallet TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('discount','custom')),
 idempotency_key TEXT NOT NULL, state TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 percent INTEGER, balance_raw TEXT, code TEXT UNIQUE, promotion_id TEXT UNIQUE,
 mint TEXT, colour TEXT, size TEXT, name TEXT, image_url TEXT,
 image_id TEXT, customization_id TEXT, product_id TEXT UNIQUE, variant_id TEXT,
 price REAL, preview TEXT, message TEXT, stage TEXT, print_info TEXT, retry_count INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER NOT NULL DEFAULT 0, discard_requested_at INTEGER, processing INTEGER NOT NULL DEFAULT 0, retired_at INTEGER, garment TEXT NOT NULL DEFAULT 'tee'
 CHECK (garment IN ('tee','hoodie','mug')), previews TEXT,
 UNIQUE(wallet,kind,idempotency_key)
);
INSERT INTO goods_benefit_requests_mug_next (id, wallet, kind, idempotency_key, state, active, created_at, updated_at, expires_at, percent, balance_raw, code, promotion_id, mint, colour, size, name, image_url, image_id, customization_id, product_id, variant_id, price, preview, message, stage, print_info, retry_count, next_retry_at, discard_requested_at, processing, retired_at, garment, previews)
 SELECT id, wallet, kind, idempotency_key, state, active, created_at, updated_at, expires_at, percent, balance_raw, code, promotion_id, mint, colour, size, name, image_url, image_id, customization_id, product_id, variant_id, price, preview, message, stage, print_info, retry_count, next_retry_at, discard_requested_at, processing, retired_at, garment, previews FROM goods_benefit_requests;
DROP TABLE goods_benefit_requests;
ALTER TABLE goods_benefit_requests_mug_next RENAME TO goods_benefit_requests;
CREATE INDEX goods_request_expiry ON goods_benefit_requests(active,expires_at);
CREATE UNIQUE INDEX goods_one_active_custom_choice
 ON goods_benefit_requests(wallet,garment,mint,colour,size)
 WHERE active=1 AND kind='custom' AND discard_requested_at IS NULL;
PRAGMA defer_foreign_keys = OFF;
