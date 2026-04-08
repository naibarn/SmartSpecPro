ALTER TABLE "model_provider_map"
  ADD COLUMN IF NOT EXISTS "legacyModelAliases" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint

WITH ranked_duplicates AS (
  SELECT
    "id",
    "modelId",
    "providerId",
    "providerModelId",
    row_number() OVER (
      PARTITION BY "providerId", "providerModelId"
      ORDER BY "isEnabled" DESC, "priorityLocked" DESC, "priority" ASC, "id" ASC
    ) AS row_rank
  FROM "model_provider_map"
),
survivors AS (
  SELECT
    "id" AS survivor_id,
    "modelId",
    "providerId",
    "providerModelId"
  FROM ranked_duplicates
  WHERE row_rank = 1
),
alias_groups AS (
  SELECT
    deduped.survivor_id,
    jsonb_agg(deduped.alias ORDER BY deduped.alias) AS legacy_aliases
  FROM (
    SELECT DISTINCT
      survivors.survivor_id,
      duplicates."modelId" AS alias
    FROM survivors
    JOIN ranked_duplicates AS duplicates
      ON duplicates."providerId" = survivors."providerId"
     AND duplicates."providerModelId" = survivors."providerModelId"
    WHERE duplicates."modelId" <> survivors."modelId"
  ) AS deduped
  GROUP BY deduped.survivor_id
),
updated_survivors AS (
  UPDATE "model_provider_map" AS mappings
  SET "legacyModelAliases" = alias_groups.legacy_aliases
  FROM alias_groups
  WHERE mappings."id" = alias_groups.survivor_id
  RETURNING mappings."id"
)
DELETE FROM "model_provider_map"
WHERE "id" IN (
  SELECT "id"
  FROM ranked_duplicates
  WHERE row_rank > 1
);--> statement-breakpoint

CREATE UNIQUE INDEX "model_provider_map_provider_model_unique"
  ON "model_provider_map" USING btree ("providerId", "providerModelId");
