CREATE OR REPLACE VIEW public.modular_chat_llm_model_catalog
WITH (security_barrier = true)
AS
WITH mapped_models AS (
  SELECT
    p.id AS provider_id,
    p."providerName" AS provider_name,
    p."displayName" AS provider_display_name,
    p."defaultModel" AS default_model,
    p."sortOrder" AS provider_sort_order,
    m."modelId" AS model_id,
    m."modelName" AS model_name,
    m."providerModelId" AS provider_model_id,
    m."legacyModelAliases" AS legacy_model_aliases,
    m."contextLength" AS context_length,
    m."isRecommended" AS is_recommended,
    m."isFree" AS is_free,
    m."pricingInput" AS pricing_input,
    m."pricingOutput" AS pricing_output,
    m.priority,
    m."apiStyle"::text AS api_style,
    catalog.model AS catalog_model
  FROM public.llm_providers AS p
  INNER JOIN public.model_provider_map AS m ON m."providerId" = p.id
  LEFT JOIN LATERAL (
    SELECT candidate.value AS model
    FROM jsonb_array_elements(COALESCE(p."availableModels"::jsonb, '[]'::jsonb)) AS candidate(value)
    WHERE candidate.value->>'id' = m."providerModelId"
    LIMIT 1
  ) AS catalog ON true
  WHERE p."isEnabled" = true
    AND p."hasApiKey" = true
    AND m."isEnabled" = true
), classified_models AS (
  SELECT mapped_models.*,
    COALESCE(
      jsonb_typeof(catalog_model->'surface') = 'string'
      OR jsonb_typeof(catalog_model->'executionMode') = 'string'
      OR jsonb_typeof(catalog_model->'autoSelectionEligible') = 'boolean',
      false
    ) AS strict_catalog
  FROM mapped_models
)
SELECT
  provider_id,
  provider_name,
  provider_display_name,
  model_id,
  model_name,
  COALESCE(
    default_model = model_id
    OR default_model = provider_model_id
    OR COALESCE(legacy_model_aliases @> jsonb_build_array(default_model), false),
    false
  ) AS is_default,
  is_recommended,
  context_length,
  is_free,
  pricing_input,
  pricing_output,
  priority,
  provider_sort_order,
  api_style,
  CASE WHEN strict_catalog THEN
    catalog_model->>'surface' = 'chat'
    AND catalog_model->>'executionMode' = 'public'
    AND catalog_model->'autoSelectionEligible' = 'true'::jsonb
  ELSE true END AS auto_selectable
FROM classified_models
WHERE NOT strict_catalog
   OR (
     catalog_model->>'surface' = 'chat'
     AND catalog_model->>'executionMode' = 'public'
   );
--> statement-breakpoint
COMMENT ON VIEW public.modular_chat_llm_model_catalog IS
  'Safe read-only projection for Modular Chat model selection. Never includes provider credentials, endpoints or request config.';
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.modular_chat_llm_model_catalog FROM PUBLIC;
--> statement-breakpoint
DO $modular_chat_catalog_grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.modular_chat_llm_model_catalog TO modular_core_auth_dev';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.modular_chat_llm_model_catalog TO modular_core_auth_prod';
  END IF;
END $modular_chat_catalog_grants$;
