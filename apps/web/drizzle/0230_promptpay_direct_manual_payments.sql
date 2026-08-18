-- PromptPay Direct Payment + Manual Slip Approval
-- This migration is intentionally additive and keeps existing Beam rows intact.

DO $$ BEGIN
  ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'internal_manual';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE payment_channel AS ENUM ('beam_promptpay', 'beam_card', 'promptpay_direct_manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE payment_slip_status AS ENUM ('submitted', 'rejected', 'accepted', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE promptpay_reservation_state AS ENUM ('reserved', 'consumed', 'released');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS "paymentChannel" payment_channel NOT NULL DEFAULT 'beam_promptpay',
  ADD COLUMN IF NOT EXISTS "sourceAmountUsd" numeric(12,2),
  ADD COLUMN IF NOT EXISTS "sourceCurrency" varchar(16),
  ADD COLUMN IF NOT EXISTS "fxRate" numeric(20,10),
  ADD COLUMN IF NOT EXISTS "fxProvider" varchar(64),
  ADD COLUMN IF NOT EXISTS "fxRateDate" timestamptz,
  ADD COLUMN IF NOT EXISTS "fxFetchedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "fxSellSpreadBps" integer,
  ADD COLUMN IF NOT EXISTS "fxRiskBufferBps" integer,
  ADD COLUMN IF NOT EXISTS "fxEffectiveRate" numeric(20,10),
  ADD COLUMN IF NOT EXISTS "roundedBaseAmountThb" numeric(12,2),
  ADD COLUMN IF NOT EXISTS "randomSatang" integer,
  ADD COLUMN IF NOT EXISTS "promptpayAmountThb" numeric(12,2),
  ADD COLUMN IF NOT EXISTS "promptpayRecipientSnapshotJson" json;
--> statement-breakpoint

UPDATE payments
SET "paymentChannel" = CASE
  WHEN "providerPaymentType" = 'payment_link' THEN 'beam_card'::payment_channel
  ELSE 'beam_promptpay'::payment_channel
END
WHERE "paymentChannel" = 'beam_promptpay'::payment_channel;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS payments_payment_channel_status_idx
  ON payments ("paymentChannel", status, "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_slips (
  id serial PRIMARY KEY,
  "paymentId" integer NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  "invoiceId" integer NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tenantId" varchar(36) REFERENCES tenants(id) ON DELETE CASCADE,
  "storageKey" varchar(1024) NOT NULL,
  "originalFileName" varchar(255) NOT NULL,
  "mimeType" varchar(128) NOT NULL,
  "fileSizeBytes" integer NOT NULL,
  "checksumSha256" varchar(64) NOT NULL,
  status payment_slip_status NOT NULL DEFAULT 'submitted',
  "customerNote" text,
  "rejectionReason" text,
  "uploadedAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedAt" timestamptz,
  "reviewedBy" integer REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS payment_slips_payment_uploaded_idx
  ON payment_slips ("paymentId", "uploadedAt");
CREATE INDEX IF NOT EXISTS payment_slips_status_uploaded_idx
  ON payment_slips (status, "uploadedAt");
CREATE INDEX IF NOT EXISTS payment_slips_checksum_idx
  ON payment_slips ("checksumSha256");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS promptpay_amount_reservations (
  id serial PRIMARY KEY,
  "paymentId" integer NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  "businessDateBangkok" varchar(10) NOT NULL,
  "randomSatang" integer NOT NULL CHECK ("randomSatang" BETWEEN 0 AND 99),
  state promptpay_reservation_state NOT NULL DEFAULT 'reserved',
  "reservedAt" timestamptz NOT NULL DEFAULT now(),
  "consumedAt" timestamptz,
  "releasedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS promptpay_reservations_business_date_idx
  ON promptpay_amount_reservations ("businessDateBangkok", "randomSatang");
CREATE UNIQUE INDEX IF NOT EXISTS promptpay_reservations_same_day_unique
  ON promptpay_amount_reservations ("businessDateBangkok", "randomSatang")
  WHERE state IN ('reserved', 'consumed');
CREATE UNIQUE INDEX IF NOT EXISTS promptpay_reservations_active_satang_unique
  ON promptpay_amount_reservations ("randomSatang")
  WHERE state = 'reserved';
