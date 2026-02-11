DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_callback_events' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE "media_callback_events" ADD COLUMN "tenant_id" varchar(36);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_callback_dlq' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE "media_callback_dlq" ADD COLUMN "tenant_id" varchar(36);
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_callback_events_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "media_callback_events"
      ADD CONSTRAINT "media_callback_events_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_callback_dlq_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "media_callback_dlq"
      ADD CONSTRAINT "media_callback_dlq_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "media_callback_events_tenant_status_retry_idx"
  ON "media_callback_events" ("tenant_id", "status", "next_retry_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_callback_dlq_tenant_status_idx"
  ON "media_callback_dlq" ("tenant_id", "status");
--> statement-breakpoint

WITH provider_task_tenant AS (
  SELECT
    ll.provider_task_id AS provider_task_id,
    MIN(li.tenant_id) AS tenant_id,
    COUNT(DISTINCT li.tenant_id) AS tenant_count
  FROM library_links ll
  INNER JOIN library_items li ON li.id = ll.library_item_id
  WHERE ll.provider_task_id IS NOT NULL
    AND li.deleted_at IS NULL
  GROUP BY ll.provider_task_id
),
resolved AS (
  SELECT provider_task_id, tenant_id
  FROM provider_task_tenant
  WHERE tenant_count = 1
)
UPDATE "media_callback_events" e
SET
  "tenant_id" = r.tenant_id,
  "updated_at" = NOW()
FROM resolved r
WHERE e."tenant_id" IS NULL
  AND e."provider_task_id" = r.provider_task_id;
--> statement-breakpoint

UPDATE "media_callback_dlq" d
SET "tenant_id" = e."tenant_id"
FROM "media_callback_events" e
WHERE d."tenant_id" IS NULL
  AND d."event_id" = e.id
  AND e."tenant_id" IS NOT NULL;
--> statement-breakpoint

WITH provider_task_tenant AS (
  SELECT
    ll.provider_task_id AS provider_task_id,
    MIN(li.tenant_id) AS tenant_id,
    COUNT(DISTINCT li.tenant_id) AS tenant_count
  FROM library_links ll
  INNER JOIN library_items li ON li.id = ll.library_item_id
  WHERE ll.provider_task_id IS NOT NULL
    AND li.deleted_at IS NULL
  GROUP BY ll.provider_task_id
),
resolved AS (
  SELECT provider_task_id, tenant_id
  FROM provider_task_tenant
  WHERE tenant_count = 1
)
UPDATE "media_callback_dlq" d
SET "tenant_id" = r.tenant_id
FROM resolved r
WHERE d."tenant_id" IS NULL
  AND d."provider_task_id" = r.provider_task_id;
