-- Existing requests remain tees; both garments share the same order/save limits.
ALTER TABLE goods_benefit_requests ADD COLUMN garment TEXT NOT NULL DEFAULT 'tee'
 CHECK (garment IN ('tee','hoodie'));
ALTER TABLE goods_benefit_requests ADD COLUMN previews TEXT;
DROP INDEX goods_one_active_custom_choice;
CREATE UNIQUE INDEX goods_one_active_custom_choice
 ON goods_benefit_requests(wallet,garment,mint,colour,size)
 WHERE active=1 AND kind='custom' AND discard_requested_at IS NULL;
