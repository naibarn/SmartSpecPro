-- Add unified Qwen Image 3 Pro/Standard rows for Kie.ai.
-- Each row keeps one catalog entry and switches to its paired image-to-image
-- operation only when reference images are attached.
-- This migration is intentionally scoped to these model IDs and is idempotent.
INSERT INTO "media_models" (
  "modelId", "name", "description", "modelType", "provider", "aliases",
  "creditCost", "aspectRatios", "configJson", "isEnabled", "priority",
  "sortOrder", "thinkingModeDefault", "thinkingModes", "updatedAt"
) VALUES
(
  'qwen3/pro-text-to-image',
  'Qwen Image 3 Pro',
  'Alibaba Qwen Image 3 Pro generation and reference-image editing via Kie.ai createTask.',
  'image'::media_model_type,
  'kie.ai',
  '["qwen image 3 pro", "qwen3 pro", "qwen3/pro-text-to-image", "qwen3/pro-image-to-image", "qwen image 3 pro image to image"]'::json,
  30,
  '["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "qwen3/pro-text-to-image",
    "generateType": "text-to-image",
    "maxPromptLength": 5000,
    "supportsReferenceImages": true,
    "maxReferenceImages": 3,
    "apiConfig": {
      "kie_model_id_with_references": "qwen3/pro-image-to-image",
      "reference_image_input_key": "image_urls",
      "reference_image_input_type": "array",
      "drop_params": ["aspect_ratio"]
    },
    "inputFields": [
      {
        "key": "image_urls",
        "label": "Reference Images",
        "type": "image_urls",
        "required": false,
        "syncWith": "reference_images",
        "providerPayloadKey": "image_urls",
        "maxItems": 3
      },
      {
        "key": "image_size",
        "label": "Image Size",
        "type": "select",
        "options": [
          { "value": "1:1", "label": "1:1" },
          { "value": "3:2", "label": "3:2" },
          { "value": "2:3", "label": "2:3" },
          { "value": "4:3", "label": "4:3" },
          { "value": "3:4", "label": "3:4" },
          { "value": "16:9", "label": "16:9" },
          { "value": "9:16", "label": "9:16" },
          { "value": "21:9", "label": "21:9" }
        ],
        "default": "1:1"
      },
      {
        "key": "resolution",
        "label": "Resolution",
        "type": "select",
        "options": [
          { "value": "1K", "label": "1K" },
          { "value": "2K", "label": "2K" }
        ],
        "default": "1K",
        "affectsPricing": true,
        "syncWith": "resolution"
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
      { "key": "prompt_extend", "label": "Prompt Extend", "type": "boolean", "default": true },
      { "key": "negative_prompt", "label": "Negative Prompt", "type": "text", "required": false, "max": 5000 },
      { "key": "seed", "label": "Seed", "type": "number", "required": false, "advancedOnly": true, "min": 0, "max": 2147483647 },
      { "key": "nsfw_checker", "label": "NSFW Checker", "type": "boolean", "default": false }
    ],
    "pricingTiers": {"default": 30, "1K": 30, "2K": 50},
    "pricingFormula": "flat"
  }'::json,
  true,
  23,
  23,
  'none',
  '["none"]'::json,
  NOW()
),
(
  'qwen3/text-to-image',
  'Qwen Image 3',
  'Alibaba Qwen Image 3 generation and reference-image editing via Kie.ai createTask.',
  'image'::media_model_type,
  'kie.ai',
  '["qwen image 3", "qwen3", "qwen3/text-to-image", "qwen3/image-to-image", "qwen image 3 image to image"]'::json,
  30,
  '["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "qwen3/text-to-image",
    "generateType": "text-to-image",
    "maxPromptLength": 5000,
    "supportsReferenceImages": true,
    "maxReferenceImages": 3,
    "apiConfig": {
      "kie_model_id_with_references": "qwen3/image-to-image",
      "reference_image_input_key": "image_urls",
      "reference_image_input_type": "array",
      "drop_params": ["aspect_ratio"]
    },
    "inputFields": [
      {
        "key": "image_urls",
        "label": "Reference Images",
        "type": "image_urls",
        "required": false,
        "syncWith": "reference_images",
        "providerPayloadKey": "image_urls",
        "maxItems": 3
      },
      {
        "key": "image_size",
        "label": "Image Size",
        "type": "select",
        "options": [
          { "value": "1:1", "label": "1:1" },
          { "value": "3:2", "label": "3:2" },
          { "value": "2:3", "label": "2:3" },
          { "value": "4:3", "label": "4:3" },
          { "value": "3:4", "label": "3:4" },
          { "value": "16:9", "label": "16:9" },
          { "value": "9:16", "label": "9:16" },
          { "value": "21:9", "label": "21:9" }
        ],
        "default": "1:1"
      },
      {
        "key": "resolution",
        "label": "Resolution",
        "type": "select",
        "options": [
          { "value": "1K", "label": "1K" },
          { "value": "2K", "label": "2K" }
        ],
        "default": "1K",
        "affectsPricing": true,
        "syncWith": "resolution"
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
      { "key": "prompt_extend", "label": "Prompt Extend", "type": "boolean", "default": true },
      { "key": "negative_prompt", "label": "Negative Prompt", "type": "text", "required": false, "max": 5000 },
      { "key": "seed", "label": "Seed", "type": "number", "required": false, "advancedOnly": true, "min": 0, "max": 2147483647 },
      { "key": "nsfw_checker", "label": "NSFW Checker", "type": "boolean", "default": false }
    ],
    "pricingTiers": {"default": 30, "1K": 30, "2K": 50},
    "pricingFormula": "flat"
  }'::json,
  true,
  24,
  24,
  'none',
  '["none"]'::json,
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
  "thinkingModeDefault" = EXCLUDED."thinkingModeDefault",
  "thinkingModes" = EXCLUDED."thinkingModes",
  "updatedAt" = NOW();
