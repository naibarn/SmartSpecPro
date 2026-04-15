CREATE TYPE "public"."finance_payment_institution_kind" AS ENUM ('bank', 'issuer', 'other');
--> statement-breakpoint
CREATE TYPE "public"."finance_payment_instrument_kind" AS ENUM ('bank_account', 'credit_card', 'cash', 'unknown');
--> statement-breakpoint
CREATE TYPE "public"."finance_payment_direction" AS ENUM ('outbound', 'inbound', 'both', 'unknown');
--> statement-breakpoint

ALTER TYPE "public"."finance_document_role" ADD VALUE IF NOT EXISTS 'transfer_slip';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_payment_institutions" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" "finance_payment_institution_kind" NOT NULL DEFAULT 'bank',
  "display_name" text NOT NULL,
  "normalized_name" varchar(512) NOT NULL,
  "usage_count" integer NOT NULL DEFAULT 0,
  "last_seen_at" timestamp with time zone,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_payment_institutions_tenant_normalized_unique"
  ON "finance_payment_institutions" USING btree ("tenant_id", "project_id", "owner_user_id", "kind", "normalized_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_institutions_tenant_project_owner_idx"
  ON "finance_payment_institutions" USING btree ("tenant_id", "project_id", "owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_institutions_tenant_usage_idx"
  ON "finance_payment_institutions" USING btree ("tenant_id", "owner_user_id", "usage_count");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_institutions_last_seen_idx"
  ON "finance_payment_institutions" USING btree ("tenant_id", "last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_institutions_allowed_scopes_gin_idx"
  ON "finance_payment_institutions" USING gin ("allowed_scopes");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_payment_institution_aliases" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "payment_institution_id" integer NOT NULL REFERENCES "finance_payment_institutions"("id") ON DELETE cascade,
  "alias_name" text NOT NULL,
  "normalized_alias" varchar(512) NOT NULL,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_payment_institution_aliases_tenant_normalized_unique"
  ON "finance_payment_institution_aliases" USING btree ("tenant_id", "project_id", "owner_user_id", "normalized_alias");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_institution_aliases_payment_institution_idx"
  ON "finance_payment_institution_aliases" USING btree ("payment_institution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_institution_aliases_tenant_project_owner_idx"
  ON "finance_payment_institution_aliases" USING btree ("tenant_id", "project_id", "owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_institution_aliases_allowed_scopes_gin_idx"
  ON "finance_payment_institution_aliases" USING gin ("allowed_scopes");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_payment_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "payment_institution_id" integer NOT NULL REFERENCES "finance_payment_institutions"("id") ON DELETE cascade,
  "kind" "finance_payment_instrument_kind" NOT NULL,
  "nickname" text NOT NULL,
  "normalized_nickname" varchar(512) NOT NULL,
  "last4" varchar(4),
  "masked_identifier" text,
  "usage_count" integer NOT NULL DEFAULT 0,
  "last_seen_at" timestamp with time zone,
  "is_primary" boolean NOT NULL DEFAULT false,
  "archived_at" timestamp with time zone,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_payment_accounts_tenant_unique"
  ON "finance_payment_accounts" USING btree ("tenant_id", "project_id", "owner_user_id", "payment_institution_id", "kind", "normalized_nickname");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_accounts_tenant_project_owner_idx"
  ON "finance_payment_accounts" USING btree ("tenant_id", "project_id", "owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_accounts_payment_institution_idx"
  ON "finance_payment_accounts" USING btree ("payment_institution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_accounts_last_seen_idx"
  ON "finance_payment_accounts" USING btree ("tenant_id", "last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_accounts_usage_idx"
  ON "finance_payment_accounts" USING btree ("tenant_id", "owner_user_id", "usage_count");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_accounts_primary_idx"
  ON "finance_payment_accounts" USING btree ("tenant_id", "owner_user_id", "is_primary");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_accounts_allowed_scopes_gin_idx"
  ON "finance_payment_accounts" USING gin ("allowed_scopes");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_payment_account_aliases" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "payment_account_id" integer NOT NULL REFERENCES "finance_payment_accounts"("id") ON DELETE cascade,
  "alias_name" text NOT NULL,
  "normalized_alias" varchar(512) NOT NULL,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_payment_account_aliases_tenant_normalized_unique"
  ON "finance_payment_account_aliases" USING btree ("tenant_id", "project_id", "owner_user_id", "normalized_alias");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_account_aliases_payment_account_idx"
  ON "finance_payment_account_aliases" USING btree ("payment_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_account_aliases_tenant_project_owner_idx"
  ON "finance_payment_account_aliases" USING btree ("tenant_id", "project_id", "owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payment_account_aliases_allowed_scopes_gin_idx"
  ON "finance_payment_account_aliases" USING gin ("allowed_scopes");
--> statement-breakpoint

ALTER TABLE "finance_transactions"
ADD COLUMN IF NOT EXISTS "payment_source_account_id" integer REFERENCES "finance_payment_accounts"("id") ON DELETE set null,
ADD COLUMN IF NOT EXISTS "payment_destination_account_id" integer REFERENCES "finance_payment_accounts"("id") ON DELETE set null,
ADD COLUMN IF NOT EXISTS "payment_method_kind" "finance_payment_instrument_kind" NOT NULL DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS "payment_direction" "finance_payment_direction" NOT NULL DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS "payment_instrument_confidence" numeric(3,2);
--> statement-breakpoint

ALTER TABLE "finance_payment_institutions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_payment_institutions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_payment_institutions_tenant_scope" ON "finance_payment_institutions" FOR ALL TO public
USING (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
);
--> statement-breakpoint

ALTER TABLE "finance_payment_institution_aliases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_payment_institution_aliases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_payment_institution_aliases_tenant_scope" ON "finance_payment_institution_aliases" FOR ALL TO public
USING (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
);
--> statement-breakpoint

ALTER TABLE "finance_payment_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_payment_accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_payment_accounts_tenant_scope" ON "finance_payment_accounts" FOR ALL TO public
USING (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
);
--> statement-breakpoint

ALTER TABLE "finance_payment_account_aliases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_payment_account_aliases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_payment_account_aliases_tenant_scope" ON "finance_payment_account_aliases" FOR ALL TO public
USING (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
);
--> statement-breakpoint

-- compatibility-only: existing finance rows keep null payment-instrument references until they are edited or re-captured.
