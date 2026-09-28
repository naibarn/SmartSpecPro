-- Add the two GPT Image 2.5 variants as unified catalog rows.
-- Each row uses its text-to-image Kie model by default and switches to the
-- paired image-to-image model when input_urls/reference images are present.
-- This migration is intentionally scoped to these two model IDs and is safe
-- to run more than once.
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
) VALUES
(
  'gpt-image-2-5-flare-text-to-image',
  'GPT Image 2.5 Flare',
  'OpenAI GPT Image 2.5 Flare generation and reference-image editing via Kie AI createTask.',
  'image'::media_model_type,
  'kie.ai',
  '[
    "gpt image 2.5 flare",
    "gpt-image-2-5-flare",
    "gpt-image-2-5-flare-text-to-image",
    "gpt-image-2-5-flare-image-to-image",
    "gpt image 2.5 flare image to image"
  ]'::json,
  70,
  '["auto", "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9", "27:16", "16:27", "9:8", "8:9"]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "gpt-image-2-5-flare-text-to-image",
    "documentationUrl": "https://docs.kie.ai/43283988e0",
    "generateType": "text-to-image",
    "supportsReferenceImages": true,
    "maxPromptLength": 20000,
    "maxReferenceImages": 16,
    "apiConfig": {
      "kie_model_id_with_references": "gpt-image-2-5-flare-image-to-image",
      "reference_image_input_key": "input_urls",
      "reference_image_input_type": "array"
    },
    "inputFields": [
      {
        "key": "input_urls",
        "label": "Reference Images",
        "type": "image_urls",
        "required": false,
        "syncWith": "reference_images",
        "maxItems": 16
      },
      {
        "key": "aspect_ratio",
        "label": "Aspect Ratio",
        "type": "select",
        "options": [
          { "value": "auto", "label": "Auto" },
          { "value": "1:1", "label": "1:1" },
          { "value": "3:2", "label": "3:2" },
          { "value": "2:3", "label": "2:3" },
          { "value": "16:9", "label": "16:9" },
          { "value": "9:16", "label": "9:16" },
          { "value": "4:3", "label": "4:3" },
          { "value": "3:4", "label": "3:4" },
          { "value": "21:9", "label": "21:9" },
          { "value": "27:16", "label": "27:16" },
          { "value": "16:27", "label": "16:27" },
          { "value": "9:8", "label": "9:8" },
          { "value": "8:9", "label": "8:9" }
        ],
        "default": "auto",
        "syncWith": "aspect_ratio"
      },
      {
        "key": "resolution",
        "label": "Resolution",
        "type": "select",
        "options": [
          { "value": "1K", "label": "1K" },
          { "value": "2K", "label": "2K" },
          { "value": "4K", "label": "4K" }
        ],
        "default": "1K",
        "syncWith": "resolution"
      }
    ],
    "pricingTiers": { "default": 70 },
    "pricingFormula": "flat"
  }'::json,
  true,
  7,
  7,
  NOW()
),
(
  'gpt-image-2-5-sunburst-text-to-image',
  'GPT Image 2.5 Sunburst',
  'OpenAI GPT Image 2.5 Sunburst generation and reference-image editing via Kie AI createTask.',
  'image'::media_model_type,
  'kie.ai',
  '[
    "gpt image 2.5 sunburst",
    "gpt-image-2-5-sunburst",
    "gpt-image-2-5-sunburst-text-to-image",
    "gpt-image-2-5-sunburst-image-to-image",
    "gpt image 2.5 sunburst image to image"
  ]'::json,
  70,
  '["auto", "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9", "27:16", "16:27", "9:8", "8:9"]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "gpt-image-2-5-sunburst-text-to-image",
    "documentationUrl": "https://docs.kie.ai/43287106e0",
    "generateType": "text-to-image",
    "supportsReferenceImages": true,
    "maxPromptLength": 20000,
    "maxReferenceImages": 16,
    "apiConfig": {
      "kie_model_id_with_references": "gpt-image-2-5-sunburst-image-to-image",
      "reference_image_input_key": "input_urls",
      "reference_image_input_type": "array"
    },
    "inputFields": [
      {
        "key": "input_urls",
        "label": "Reference Images",
        "type": "image_urls",
        "required": false,
        "syncWith": "reference_images",
        "maxItems": 16
      },
      {
        "key": "aspect_ratio",
        "label": "Aspect Ratio",
        "type": "select",
        "options": [
          { "value": "auto", "label": "Auto" },
          { "value": "1:1", "label": "1:1" },
          { "value": "3:2", "label": "3:2" },
          { "value": "2:3", "label": "2:3" },
          { "value": "16:9", "label": "16:9" },
          { "value": "9:16", "label": "9:16" },
          { "value": "4:3", "label": "4:3" },
          { "value": "3:4", "label": "3:4" },
          { "value": "21:9", "label": "21:9" },
          { "value": "27:16", "label": "27:16" },
          { "value": "16:27", "label": "16:27" },
          { "value": "9:8", "label": "9:8" },
          { "value": "8:9", "label": "8:9" }
        ],
        "default": "auto",
        "syncWith": "aspect_ratio"
      },
      {
        "key": "resolution",
        "label": "Resolution",
        "type": "select",
        "options": [
          { "value": "1K", "label": "1K" },
          { "value": "2K", "label": "2K" },
          { "value": "4K", "label": "4K" }
        ],
        "default": "1K",
        "syncWith": "resolution"
      }
    ],
    "pricingTiers": { "default": 70 },
    "pricingFormula": "flat"
  }'::json,
  true,
  7,
  7,
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
