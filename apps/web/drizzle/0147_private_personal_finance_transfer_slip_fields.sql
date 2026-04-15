ALTER TABLE "finance_transactions"
  ADD COLUMN IF NOT EXISTS "slip_reference" text,
  ADD COLUMN IF NOT EXISTS "merchant_id" text,
  ADD COLUMN IF NOT EXISTS "payment_fee_minor" integer,
  ADD COLUMN IF NOT EXISTS "payment_source_name" text,
  ADD COLUMN IF NOT EXISTS "payment_destination_name" text;
