ALTER TABLE "webhook_events"
  ADD COLUMN IF NOT EXISTS "invoiceId" integer REFERENCES "invoices"("id") ON DELETE cascade,
  ADD COLUMN IF NOT EXISTS "paymentId" integer REFERENCES "payments"("id") ON DELETE cascade;

CREATE INDEX IF NOT EXISTS "webhook_events_invoice_idx"
  ON "webhook_events" ("invoiceId", "createdAt");

CREATE INDEX IF NOT EXISTS "webhook_events_payment_idx"
  ON "webhook_events" ("paymentId", "createdAt");

CREATE TABLE IF NOT EXISTS "seller_profile_revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "sellerProfileId" integer NOT NULL REFERENCES "seller_profiles"("id") ON DELETE cascade,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE cascade,
  "revision" integer NOT NULL,
  "snapshotJson" json NOT NULL,
  "diffJson" json,
  "updatedBy" integer REFERENCES "users"("id") ON DELETE set null,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "seller_profile_revisions_profile_idx"
  ON "seller_profile_revisions" ("sellerProfileId", "revision");
