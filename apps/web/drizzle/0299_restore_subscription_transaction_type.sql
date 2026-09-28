-- The application credit service and Drizzle schema support subscription
-- ledger rows. Restore the enum value on databases where the historical
-- creator-fee migration recreated the enum without preserving it.
ALTER TYPE "public"."transaction_type"
  ADD VALUE IF NOT EXISTS 'subscription';
