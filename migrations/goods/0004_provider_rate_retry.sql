-- Explicit429 is rejected before a provider write. Preserve completed IDs and
-- retry only that known-safe case; ambiguous writes remain review-required.
ALTER TABLE goods_benefit_requests ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE goods_benefit_requests ADD COLUMN next_retry_at INTEGER NOT NULL DEFAULT 0;
