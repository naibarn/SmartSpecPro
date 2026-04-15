CREATE TABLE IF NOT EXISTS "finance_counterparties" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "display_name" text NOT NULL,
  "normalized_name" varchar(512) NOT NULL,
  "usage_count" integer NOT NULL DEFAULT 0,
  "last_seen_at" timestamp with time zone,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_counterparties_tenant_normalized_unique"
  ON "finance_counterparties" USING btree ("tenant_id", "project_id", "owner_user_id", "normalized_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_counterparties_tenant_project_owner_idx"
  ON "finance_counterparties" USING btree ("tenant_id", "project_id", "owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_counterparties_tenant_usage_idx"
  ON "finance_counterparties" USING btree ("tenant_id", "owner_user_id", "usage_count");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_counterparties_last_seen_idx"
  ON "finance_counterparties" USING btree ("tenant_id", "last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_counterparties_allowed_scopes_gin_idx"
  ON "finance_counterparties" USING gin ("allowed_scopes");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_counterparty_aliases" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "counterparty_id" integer NOT NULL REFERENCES "finance_counterparties"("id") ON DELETE cascade,
  "alias_name" text NOT NULL,
  "normalized_alias" varchar(512) NOT NULL,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_counterparty_aliases_tenant_normalized_unique"
  ON "finance_counterparty_aliases" USING btree ("tenant_id", "project_id", "owner_user_id", "normalized_alias");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_counterparty_aliases_counterparty_idx"
  ON "finance_counterparty_aliases" USING btree ("counterparty_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_counterparty_aliases_tenant_project_owner_idx"
  ON "finance_counterparty_aliases" USING btree ("tenant_id", "project_id", "owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_counterparty_aliases_allowed_scopes_gin_idx"
  ON "finance_counterparty_aliases" USING gin ("allowed_scopes");
--> statement-breakpoint

ALTER TABLE "finance_recurring_rules"
ADD COLUMN IF NOT EXISTS "counterparty_id" integer REFERENCES "finance_counterparties"("id") ON DELETE set null,
ADD COLUMN IF NOT EXISTS "counterparty_name" text;
--> statement-breakpoint
ALTER TABLE "finance_drafts"
ADD COLUMN IF NOT EXISTS "counterparty_id" integer REFERENCES "finance_counterparties"("id") ON DELETE set null,
ADD COLUMN IF NOT EXISTS "counterparty_name" text;
--> statement-breakpoint
ALTER TABLE "finance_transactions"
ADD COLUMN IF NOT EXISTS "counterparty_id" integer REFERENCES "finance_counterparties"("id") ON DELETE set null,
ADD COLUMN IF NOT EXISTS "counterparty_name" text;
--> statement-breakpoint

WITH finance_counterparty_sources AS (
  SELECT
    tenant_id,
    project_id,
    owner_user_id,
    trim(regexp_replace(coalesce(counterparty_name, merchant_name), '\s+', ' ', 'g')) AS display_name,
    lower(trim(regexp_replace(coalesce(counterparty_name, merchant_name), '\s+', ' ', 'g'))) AS normalized_name,
    occurred_at AS seen_at
  FROM finance_transactions
  WHERE coalesce(counterparty_name, merchant_name) IS NOT NULL
    AND btrim(coalesce(counterparty_name, merchant_name)) <> ''
  UNION ALL
  SELECT
    tenant_id,
    project_id,
    owner_user_id,
    trim(regexp_replace(coalesce((payload_json ->> 'counterpartyName'), payload_json ->> 'merchantName'), '\s+', ' ', 'g')) AS display_name,
    lower(trim(regexp_replace(coalesce((payload_json ->> 'counterpartyName'), payload_json ->> 'merchantName'), '\s+', ' ', 'g'))) AS normalized_name,
    created_at AS seen_at
  FROM finance_drafts
  WHERE coalesce(payload_json ->> 'counterpartyName', payload_json ->> 'merchantName') IS NOT NULL
    AND btrim(coalesce(payload_json ->> 'counterpartyName', payload_json ->> 'merchantName')) <> ''
  UNION ALL
  SELECT
    tenant_id,
    project_id,
    owner_user_id,
    trim(regexp_replace(coalesce(counterparty_name, merchant_name), '\s+', ' ', 'g')) AS display_name,
    lower(trim(regexp_replace(coalesce(counterparty_name, merchant_name), '\s+', ' ', 'g'))) AS normalized_name,
    created_at AS seen_at
  FROM finance_recurring_rules
  WHERE coalesce(counterparty_name, merchant_name) IS NOT NULL
    AND btrim(coalesce(counterparty_name, merchant_name)) <> ''
)
INSERT INTO finance_counterparties (
  tenant_id,
  project_id,
  owner_user_id,
  display_name,
  normalized_name,
  usage_count,
  last_seen_at,
  allowed_scopes,
  created_at,
  updated_at
)
SELECT
  tenant_id,
  project_id,
  owner_user_id,
  display_name,
  normalized_name,
  count(*)::int AS usage_count,
  max(seen_at) AS last_seen_at,
  ARRAY[format('user:%s', owner_user_id)]::text[] AS allowed_scopes,
  now(),
  now()
FROM finance_counterparty_sources
GROUP BY tenant_id, project_id, owner_user_id, display_name, normalized_name
ON CONFLICT ("tenant_id", "project_id", "owner_user_id", "normalized_name")
DO UPDATE SET
  "usage_count" = "finance_counterparties"."usage_count" + EXCLUDED."usage_count",
  "last_seen_at" = CASE
    WHEN "finance_counterparties"."last_seen_at" IS NULL THEN EXCLUDED."last_seen_at"
    WHEN EXCLUDED."last_seen_at" IS NULL THEN "finance_counterparties"."last_seen_at"
    ELSE GREATEST("finance_counterparties"."last_seen_at", EXCLUDED."last_seen_at")
  END,
  "updated_at" = now();
--> statement-breakpoint

UPDATE finance_transactions t
SET
  counterparty_id = c.id,
  counterparty_name = c.display_name,
  merchant_name = c.display_name,
  updated_at = now()
FROM finance_counterparties c
WHERE t.tenant_id = c.tenant_id
  AND t.project_id = c.project_id
  AND t.owner_user_id = c.owner_user_id
  AND lower(trim(regexp_replace(coalesce(t.counterparty_name, t.merchant_name), '\s+', ' ', 'g'))) = c.normalized_name;
--> statement-breakpoint

UPDATE finance_drafts d
SET
  counterparty_id = c.id,
  counterparty_name = c.display_name,
  payload_json = coalesce(d.payload_json, '{}'::jsonb)
    || jsonb_build_object('merchantName', c.display_name, 'counterpartyName', c.display_name),
  updated_at = now()
FROM finance_counterparties c
WHERE d.tenant_id = c.tenant_id
  AND d.project_id = c.project_id
  AND d.owner_user_id = c.owner_user_id
  AND lower(trim(regexp_replace(coalesce((d.payload_json ->> 'counterpartyName'), (d.payload_json ->> 'merchantName')), '\s+', ' ', 'g'))) = c.normalized_name;
--> statement-breakpoint

UPDATE finance_recurring_rules r
SET
  counterparty_id = c.id,
  counterparty_name = c.display_name,
  merchant_name = c.display_name,
  updated_at = now()
FROM finance_counterparties c
WHERE r.tenant_id = c.tenant_id
  AND r.project_id = c.project_id
  AND r.owner_user_id = c.owner_user_id
  AND lower(trim(regexp_replace(coalesce(r.counterparty_name, r.merchant_name), '\s+', ' ', 'g'))) = c.normalized_name;
--> statement-breakpoint

ALTER TABLE "finance_counterparties" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_counterparties" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_counterparties_tenant_scope" ON "finance_counterparties" FOR ALL TO public
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

ALTER TABLE "finance_counterparty_aliases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_counterparty_aliases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_counterparty_aliases_tenant_scope" ON "finance_counterparty_aliases" FOR ALL TO public
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

-- compatibility-only: canonical counterparties are backfilled from existing merchant names.
