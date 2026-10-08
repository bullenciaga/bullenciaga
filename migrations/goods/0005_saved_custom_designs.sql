-- Keep up to five custom designs while retaining purchase reservations until
-- a discarded provider product is sold out and its orders are reconciled.
DROP INDEX IF EXISTS goods_one_active_custom;
ALTER TABLE goods_benefit_requests ADD COLUMN discard_requested_at INTEGER;
ALTER TABLE goods_benefit_requests ADD COLUMN processing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE goods_benefit_requests ADD COLUMN retired_at INTEGER;
CREATE UNIQUE INDEX goods_one_active_custom_choice
 ON goods_benefit_requests(wallet,mint,colour,size)
 WHERE active=1 AND kind='custom' AND discard_requested_at IS NULL;
