-- Register Seedream 5.5 as one image model with automatic text-to-image and
-- image-to-image routing based on whether reference images are attached.
-- Provider pricing converts to platform credits at 1 USD = 1,000 credits:
--   1K/1.5K output: $0.018 = 18 credits; 2K output: $0.0315 = 31.5 (~32).
-- Reference images cost $0.0072 each = 7.2 (~8) platform credits.
INSERT INTO "media_models" (
  "modelId", "name", "description", "modelType", "provider", "aliases",
  "creditCost", "aspectRatios", "configJson", "isEnabled", "priority", "sortOrder", "updatedAt"
) VALUES (
  'seedream/5-5-text-to-image',
  'Seedream 5.5',
  'Seedream 5.5 image generation and reference editing via Kie.ai createTask.',
  'image'::media_model_type,
  'kie.ai',
  '["seedream-5.5", "seedream 5.5", "seedream55", "seedream/5-5-image-to-image", "seedream 5.5 image to image", "seedream-5.5-edit"]'::json,
  32,
  '["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "seedream/5-5-text-to-image",
    "documentationUrl": "https://docs.kie.ai/market/seedream/5-5-text-to-image",
    "generateType": "text-to-image",
    "supportsReferenceImages": true,
    "maxPromptLength": 5000,
    "verticalDramaCharacterPromptContract": { "family": "seedream", "negativePromptMode": "inline_only" },
    "maxReferenceImages": 10,
    "apiConfig": {
      "kie_model_id_with_references": "seedream/5-5-image-to-image",
      "reference_image_input_key": "image_urls",
      "reference_image_input_type": "array"
    },
    "inputFields": [
      { "key": "image_urls", "label": "Reference Images", "type": "image_urls", "required": false, "syncWith": "reference_images", "maxItems": 10 },
      { "key": "aspect_ratio", "label": "Aspect Ratio", "type": "select", "options": [
        { "value": "1:1", "label": "1:1" }, { "value": "4:3", "label": "4:3" }, { "value": "3:4", "label": "3:4" },
        { "value": "16:9", "label": "16:9" }, { "value": "9:16", "label": "9:16" }, { "value": "2:3", "label": "2:3" },
        { "value": "3:2", "label": "3:2" }, { "value": "21:9", "label": "21:9" }
      ], "default": "1:1", "syncWith": "aspect_ratio" },
      { "key": "size", "label": "Image Size", "type": "select", "options": [
        { "value": "1K", "label": "1K" }, { "value": "1.5K", "label": "1.5K" }, { "value": "2K", "label": "2K" }
      ], "default": "2K", "affectsPricing": true },
      { "key": "output_format", "label": "Output Format", "type": "select", "options": [
        { "value": "png", "label": "PNG" }, { "value": "jpeg", "label": "JPEG" }
      ], "default": "png" },
      { "key": "background", "label": "Background", "type": "select", "options": [
        { "value": "auto", "label": "Auto" }, { "value": "transparent", "label": "Transparent" }, { "value": "opaque", "label": "Opaque" }
      ], "default": "auto" },
      { "key": "nsfw_checker", "label": "NSFW Checker", "type": "boolean", "default": false }
    ],
    "pricingTiers": { "1K": 18, "1.5K": 18, "2K": 32 },
    "pricingFormula": "flat",
    "pricingAdditionalReferenceCosts": { "image_urls": 8 }
  }'::json,
  true,
  5,
  5,
  NOW()
)
ON CONFLICT ("modelId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "provider" = EXCLUDED."provider",
  "aliases" = EXCLUDED."aliases",
  "creditCost" = EXCLUDED."creditCost",
  "aspectRatios" = EXCLUDED."aspectRatios",
  "configJson" = EXCLUDED."configJson",
  "isEnabled" = EXCLUDED."isEnabled",
  "priority" = EXCLUDED."priority",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();
