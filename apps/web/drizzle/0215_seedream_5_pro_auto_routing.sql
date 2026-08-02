-- Register a single unified Kie AI "Seedream 5.0 Pro" catalog row that
-- automatically switches between text-to-image and image-to-image based on
-- whether reference images are attached (same generic routing mechanism as
-- the unified GPT Image 2 row from 0212_kie_gpt_image_2_auto_routing.sql:
-- mediaGenerationService.ts forwards configJson.apiConfig as api_config, and
-- kie_ai_provider.py::resolve_image_api_model() picks
-- apiConfig.kie_model_id_with_references whenever reference_image_urls is a
-- non-empty list, else falls back to the default kieModelId).
--
-- This is a targeted, idempotent INSERT/UPDATE for exactly one row. Do NOT
-- re-run the full kie.ai seed script against production — it would
-- overwrite admin-maintained configJson for every catalog row.
INSERT INTO "media_models" (
  "modelId",
  "name",
  "description",
  "modelType",
  "provider",
  "aliases",
  "creditCost",
  "aspectRatios",
  "configJson",
  "isEnabled",
  "priority",
  "sortOrder",
  "updatedAt"
) VALUES (
  'seedream/5-pro-text-to-image',
  'Seedream 5.0 Pro',
  'Seedream 5.0 Pro - text-to-image generation and reference-image editing via Kie AI createTask.',
  'image'::media_model_type,
  'kie.ai',
  '[
    "seedream-5-pro",
    "seedream 5 pro",
    "seedream5 pro",
    "seedream-5.0-pro",
    "seedream 5.0 pro",
    "seedream/5-pro-image-to-image",
    "seedream 5 pro image to image",
    "seedream-5-pro-edit"
  ]'::json,
  75,
  '["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "seedream/5-pro-text-to-image",
    "documentationUrl": "https://docs.kie.ai/market/seedream/5-pro-text-to-image",
    "generateType": "text-to-image",
    "supportsReferenceImages": true,
    "maxPromptLength": 5000,
    "maxReferenceImages": 10,
    "apiConfig": {
      "kie_model_id_with_references": "seedream/5-pro-image-to-image",
      "reference_image_input_key": "image_urls",
      "reference_image_input_type": "array"
    },
    "inputFields": [
      {
        "key": "image_urls",
        "label": "Reference Images",
        "type": "image_urls",
        "required": false,
        "syncWith": "reference_images",
        "maxItems": 10
      },
      {
        "key": "aspect_ratio",
        "label": "Aspect Ratio",
        "type": "select",
        "options": [
          { "value": "1:1", "label": "1:1" },
          { "value": "4:3", "label": "4:3" },
          { "value": "3:4", "label": "3:4" },
          { "value": "16:9", "label": "16:9" },
          { "value": "9:16", "label": "9:16" },
          { "value": "2:3", "label": "2:3" },
          { "value": "3:2", "label": "3:2" },
          { "value": "21:9", "label": "21:9" }
        ],
        "default": "1:1",
        "syncWith": "aspect_ratio"
      },
      {
        "key": "quality",
        "label": "Quality",
        "type": "select",
        "options": [
          { "value": "basic", "label": "Basic (1K)" },
          { "value": "high", "label": "High (2K)" }
        ],
        "default": "basic",
        "affectsPricing": true
      },
      {
        "key": "output_format",
        "label": "Output Format",
        "type": "select",
        "options": [
          { "value": "png", "label": "PNG" },
          { "value": "jpeg", "label": "JPEG" }
        ],
        "default": "png"
      },
      {
        "key": "nsfw_checker",
        "label": "NSFW Checker",
        "type": "boolean",
        "default": false
      }
    ],
    "pricingTiers": {
      "basic": 55,
      "high": 75
    },
    "pricingFormula": "flat"
  }'::json,
  true,
  6,
  6,
  NOW()
)
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
