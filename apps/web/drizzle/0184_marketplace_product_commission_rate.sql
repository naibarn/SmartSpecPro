ALTER TABLE "marketplace_products"
  ADD COLUMN IF NOT EXISTS "commissionRatePercent" numeric(5, 2);

ALTER TABLE "marketplace_product_price_snapshots"
  ADD COLUMN IF NOT EXISTS "commissionRatePercent" numeric(5, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_products_commission_rate_bounds'
  ) THEN
    ALTER TABLE "marketplace_products"
      ADD CONSTRAINT "marketplace_products_commission_rate_bounds"
      CHECK ("commissionRatePercent" IS NULL OR ("commissionRatePercent" >= 0 AND "commissionRatePercent" <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_price_snapshots_commission_rate_bounds'
  ) THEN
    ALTER TABLE "marketplace_product_price_snapshots"
      ADD CONSTRAINT "marketplace_price_snapshots_commission_rate_bounds"
      CHECK ("commissionRatePercent" IS NULL OR ("commissionRatePercent" >= 0 AND "commissionRatePercent" <= 100));
  END IF;
END $$;
