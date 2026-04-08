ALTER TABLE "payment_attempts"
  ADD COLUMN "providerPaymentId" varchar(128),
  ADD COLUMN "providerReferenceId" varchar(128),
  ADD COLUMN "expectedAmount" numeric(12, 2),
  ADD COLUMN "expectedCurrency" varchar(16),
  ADD COLUMN "settledAmount" numeric(12, 2),
  ADD COLUMN "settledCurrency" varchar(16),
  ADD COLUMN "expiresAt" timestamp with time zone;
