-- Backfill Media Studio ProductionSpace warning-like JSON fields so older
-- rows cannot fail the current API schema when reopened or saved.
-- This migration is idempotent and preserves the original rows in a backup table.

CREATE TABLE IF NOT EXISTS "media_production_spaces_warning_backup_0189" AS
SELECT *
FROM "media_production_spaces"
WHERE false;

CREATE OR REPLACE FUNCTION media_production_warning_text_0189(value jsonb)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  raw text;
  normalized text;
BEGIN
  IF value IS NULL THEN
    RETURN '';
  END IF;

  IF jsonb_typeof(value) = 'string' THEN
    raw := value #>> '{}';
  ELSE
    raw := value::text;
  END IF;

  normalized := btrim(regexp_replace(raw, '\s+', ' ', 'g'));
  IF length(normalized) > 1000 THEN
    RETURN left(normalized, 997) || '...';
  END IF;
  RETURN normalized;
END;
$$;

CREATE OR REPLACE FUNCTION media_production_warning_array_0189(value jsonb, max_items integer)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT COALESCE(
    jsonb_agg(to_jsonb(warning_text) ORDER BY ordinality),
    '[]'::jsonb
  )
  FROM (
    SELECT
      media_production_warning_text_0189(element.value) AS warning_text,
      element.ordinality
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS element(value, ordinality)
    WHERE element.ordinality <= max_items
  ) normalized
  WHERE warning_text <> '';
$$;

INSERT INTO "media_production_spaces_warning_backup_0189"
SELECT space_row.*
FROM "media_production_spaces" space_row
WHERE (
  space_row."space" ? 'warnings'
  OR space_row."space" #> '{productEvidenceManifest,warnings}' IS NOT NULL
  OR space_row."space" ? 'contextAssets'
  OR space_row."space" ? 'shots'
  OR space_row."space" ? 'flowNodes'
)
AND NOT EXISTS (
  SELECT 1
  FROM "media_production_spaces_warning_backup_0189" backup
  WHERE backup.id = space_row.id
);

WITH base AS (
  SELECT
    id,
    CASE
      WHEN "space" ? 'warnings' THEN jsonb_set(
        "space",
        '{warnings}',
        media_production_warning_array_0189("space"->'warnings', 50),
        true
      )
      ELSE "space"
    END AS space_json
  FROM "media_production_spaces"
),
manifest_warnings AS (
  SELECT
    id,
    CASE
      WHEN space_json #> '{productEvidenceManifest,warnings}' IS NOT NULL THEN jsonb_set(
        space_json,
        '{productEvidenceManifest,warnings}',
        media_production_warning_array_0189(space_json #> '{productEvidenceManifest,warnings}', 50),
        true
      )
      ELSE space_json
    END AS space_json
  FROM base
),
manifest_products AS (
  SELECT
    id,
    CASE
      WHEN jsonb_typeof(space_json #> '{productEvidenceManifest,products}') = 'array' THEN jsonb_set(
        space_json,
        '{productEvidenceManifest,products}',
        (
          SELECT COALESCE(jsonb_agg(
            CASE
              WHEN product.value ? 'reviewNotes' THEN jsonb_set(
                product.value,
                '{reviewNotes}',
                media_production_warning_array_0189(product.value->'reviewNotes', 20),
                true
              )
              ELSE product.value
            END
            ORDER BY product.ordinality
          ), '[]'::jsonb)
          FROM jsonb_array_elements(space_json #> '{productEvidenceManifest,products}') WITH ORDINALITY AS product(value, ordinality)
        ),
        true
      )
      ELSE space_json
    END AS space_json
  FROM manifest_warnings
),
context_assets AS (
  SELECT
    id,
    CASE
      WHEN jsonb_typeof(space_json->'contextAssets') = 'array' THEN jsonb_set(
        space_json,
        '{contextAssets}',
        (
          SELECT COALESCE(jsonb_agg(
            CASE
              WHEN asset.value ? 'warnings' THEN jsonb_set(
                asset.value,
                '{warnings}',
                media_production_warning_array_0189(asset.value->'warnings', 20),
                true
              )
              ELSE asset.value
            END
            ORDER BY asset.ordinality
          ), '[]'::jsonb)
          FROM jsonb_array_elements(space_json->'contextAssets') WITH ORDINALITY AS asset(value, ordinality)
        ),
        true
      )
      ELSE space_json
    END AS space_json
  FROM manifest_products
),
shots AS (
  SELECT
    id,
    CASE
      WHEN jsonb_typeof(space_json->'shots') = 'array' THEN jsonb_set(
        space_json,
        '{shots}',
        (
          SELECT COALESCE(jsonb_agg(
            CASE
              WHEN shot.value ? 'mustShow' OR shot.value ? 'mustAvoid' THEN
                jsonb_set(
                  jsonb_set(
                    shot.value,
                    '{mustShow}',
                    media_production_warning_array_0189(shot.value->'mustShow', 20),
                    true
                  ),
                  '{mustAvoid}',
                  media_production_warning_array_0189(shot.value->'mustAvoid', 20),
                  true
                )
              ELSE shot.value
            END
            ORDER BY shot.ordinality
          ), '[]'::jsonb)
          FROM jsonb_array_elements(space_json->'shots') WITH ORDINALITY AS shot(value, ordinality)
        ),
        true
      )
      ELSE space_json
    END AS space_json
  FROM context_assets
),
flow_nodes AS (
  SELECT
    id,
    CASE
      WHEN jsonb_typeof(space_json->'flowNodes') = 'array' THEN jsonb_set(
        space_json,
        '{flowNodes}',
        (
          SELECT COALESCE(jsonb_agg(
            CASE
              WHEN node.value ? 'readinessIssues' THEN jsonb_set(
                node.value,
                '{readinessIssues}',
                media_production_warning_array_0189(node.value->'readinessIssues', 20),
                true
              )
              ELSE node.value
            END
            ORDER BY node.ordinality
          ), '[]'::jsonb)
          FROM jsonb_array_elements(space_json->'flowNodes') WITH ORDINALITY AS node(value, ordinality)
        ),
        true
      )
      ELSE space_json
    END AS space_json
  FROM shots
)
UPDATE "media_production_spaces" target
SET
  "space" = flow_nodes.space_json,
  "updatedAt" = now()
FROM flow_nodes
WHERE target.id = flow_nodes.id
  AND target."space" IS DISTINCT FROM flow_nodes.space_json;

DROP FUNCTION media_production_warning_array_0189(jsonb, integer);
DROP FUNCTION media_production_warning_text_0189(jsonb);
