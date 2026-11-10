-- Add GPT Image 2.6 Flare, Sunburst, and Economy as unified text/image rows.
-- Each row selects its paired image-to-image endpoint when references are present.
WITH variants AS (
  SELECT * FROM (VALUES
    ('flare', 'Flare', false),
    ('sunburst', 'Sunburst', false),
    ('economy', 'Economy', true)
  ) AS v(variant, title, economy)
), model_rows AS (
  SELECT
    'gpt-image-2-6-' || variant || '-text-to-image' AS model_id,
    'GPT Image 2.6 ' || title AS model_name,
    variant,
    economy,
    CASE WHEN economy THEN
      '["auto", "1:1", "16:9", "9:16", "3:2", "2:3", "21:9", "4:3"]'::json
    ELSE
      '["auto", "1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9"]'::json
    END AS ratios
  FROM variants
)
INSERT INTO "media_models" (
  "modelId", "name", "description", "modelType", "provider", "aliases",
  "creditCost", "aspectRatios", "configJson", "isEnabled", "priority", "sortOrder", "updatedAt"
)
SELECT
  model_id,
  model_name,
  model_name || ' generation and reference-image editing via Kie AI createTask.',
  'image'::media_model_type,
  'kie.ai',
  json_build_array(
    'gpt image 2.6 ' || variant,
    'gpt-image-2-6-' || variant,
    model_id,
    'gpt-image-2-6-' || variant || '-image-to-image',
    'gpt-image-2-6/' || variant || '-text-to-image',
    'gpt-image-2-6/' || variant || '-image-to-image',
    'gpt image 2.6 ' || variant || ' image to image'
  ),
  30,
  ratios,
  json_build_object(
    'apiEndpoint', '/api/v1/jobs/createTask',
    'apiPayloadFormat', 'market',
    'kieModelId', 'gpt-image-2-6/' || variant || '-text-to-image',
    'documentationUrl', 'https://docs.kie.ai/market/gpt/gpt-image-2-6-' || variant || '-text-to-image',
    'generateType', 'text-to-image',
    'supportsReferenceImages', true,
    'maxPromptLength', CASE WHEN variant = 'flare' THEN 32000 ELSE 20000 END,
    'maxReferenceImages', 16,
    'apiConfig', json_build_object(
      'kie_model_id_with_references', 'gpt-image-2-6/' || variant || '-image-to-image',
      'reference_image_input_key', 'input_urls',
      'reference_image_input_type', 'array',
      'defaultInputParams', CASE WHEN economy THEN '{}'::json ELSE '{"quality":"medium"}'::json END
    ),
    'inputFields', (
      SELECT json_agg(field) FROM (VALUES
        (json_build_object('key', 'input_urls', 'label', 'Reference Images', 'type', 'image_urls', 'required', false, 'syncWith', 'reference_images', 'maxItems', 16)),
        (json_build_object('key', 'aspect_ratio', 'label', 'Aspect Ratio', 'type', 'select', 'options',
          (SELECT json_agg(json_build_object('value', r, 'label', r)) FROM json_array_elements_text(ratios) AS a(r)),
          'default', 'auto', 'syncWith', 'aspect_ratio')),
        (CASE WHEN economy THEN NULL ELSE json_build_object('key', 'resolution', 'label', 'Resolution', 'type', 'select', 'options', '[{"value":"1K","label":"1K"},{"value":"2K","label":"2K"},{"value":"4K","label":"4K"}]'::json, 'default', '1K', 'affectsPricing', true, 'syncWith', 'resolution') END),
        (CASE WHEN economy THEN NULL ELSE json_build_object('key', 'quality', 'label', 'Image Quality', 'type', 'select', 'options', '[{"value":"low","label":"LOW"},{"value":"medium","label":"MEDIUM"},{"value":"high","label":"HIGH"},{"value":"xhigh","label":"XHIGH"},{"value":"max","label":"MAX"},{"value":"auto","label":"AUTO"}]'::json, 'default', 'medium') END),
        (json_build_object('key', 'background', 'label', 'Background', 'type', 'select', 'options', '[{"value":"auto","label":"AUTO"},{"value":"opaque","label":"OPAQUE"},{"value":"transparent","label":"TRANSPARENT"}]'::json, 'default', 'auto')),
        (json_build_object('key', 'output_format', 'label', 'Output Format', 'type', 'select', 'options', CASE WHEN economy THEN '[{"value":"png","label":"PNG"}]'::json ELSE '[{"value":"png","label":"PNG"},{"value":"jpeg","label":"JPEG"},{"value":"webp","label":"WEBP"},{"value":"gif","label":"GIF"},{"value":"svg","label":"SVG"}]'::json END, 'default', 'png')),
        (CASE WHEN economy THEN NULL ELSE json_build_object('key', 'complexity', 'label', 'Planning Complexity', 'type', 'select', 'options', '[{"value":"low","label":"LOW"},{"value":"medium","label":"MEDIUM"},{"value":"high","label":"HIGH"}]'::json, 'default', 'medium') END),
        (CASE WHEN economy THEN NULL ELSE json_build_object('key', 'moderation', 'label', 'Audit Intensity', 'type', 'select', 'options', '[{"value":"auto","label":"AUTO"},{"value":"low","label":"LOW"}]'::json, 'default', 'auto') END)
      ) AS fields(field) WHERE field IS NOT NULL
    ),
    'pricingTiers', CASE WHEN economy THEN '{"default":30,"1K":30}'::json ELSE '{"default":30,"1K":30,"2K":50,"4K":80}'::json END,
    'pricingFormula', 'flat'
  ),
  true, 7, 7, NOW()
FROM model_rows
ON CONFLICT ("modelId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "modelType" = EXCLUDED."modelType",
  "provider" = EXCLUDED."provider",
  "aliases" = EXCLUDED."aliases",
  "creditCost" = EXCLUDED."creditCost",
  "aspectRatios" = EXCLUDED."aspectRatios",
  "configJson" = EXCLUDED."configJson",
  "isEnabled" = EXCLUDED."isEnabled",
  "priority" = EXCLUDED."priority",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();
