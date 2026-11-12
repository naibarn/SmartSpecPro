-- Add MiniMax H3 Image as one Kie.ai catalog model with reference-driven edit routing.
INSERT INTO "media_models" (
  "modelId", "name", "description", "modelType", "provider", "aliases",
  "creditCost", "aspectRatios", "configJson", "isEnabled", "priority",
  "sortOrder", "thinkingModeDefault", "thinkingModes", "updatedAt"
) VALUES (
  'minimax-h3/text-to-image',
  'MiniMax H3 Image',
  'MiniMax H3 Image generation and reference-image editing via Kie.ai.',
  'image'::media_model_type,
  'kie.ai',
  '["minimax h3 image", "minimax-h3-image", "minimax-h3/text-to-image", "minimax-h3/image-edit"]'::json,
  30,
  '["auto", "1:1", "5:4", "4:5", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9"]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "minimax-h3/text-to-image",
    "generateType": "text-to-image",
    "maxPromptLength": 5000,
    "supportsReferenceImages": true,
    "maxReferenceImages": 16,
    "apiConfig": {
      "kie_model_id_with_references": "minimax-h3/image-edit",
      "reference_image_input_key": "image_urls",
      "reference_image_input_type": "array"
    },
    "inputFields": [
      { "key": "image_urls", "label": "Reference Images", "type": "image_urls", "required": false, "syncWith": "reference_images", "providerPayloadKey": "image_urls", "maxItems": 16 },
      { "key": "aspect_ratio", "label": "Aspect Ratio", "type": "select", "options": [
        { "value": "auto", "label": "Auto" }, { "value": "1:1", "label": "1:1" }, { "value": "5:4", "label": "5:4" },
        { "value": "4:5", "label": "4:5" }, { "value": "4:3", "label": "4:3" }, { "value": "3:4", "label": "3:4" },
        { "value": "3:2", "label": "3:2" }, { "value": "2:3", "label": "2:3" }, { "value": "16:9", "label": "16:9" },
        { "value": "9:16", "label": "9:16" }, { "value": "21:9", "label": "21:9" }
      ], "default": "auto", "syncWith": "aspect_ratio" },
      { "key": "resolution", "label": "Resolution", "type": "select", "options": [
        { "value": "1K", "label": "1K" }, { "value": "2K", "label": "2K" }, { "value": "4K", "label": "4K" }
      ], "default": "2K", "affectsPricing": true, "syncWith": "resolution" },
      { "key": "expand_prompt", "label": "Expand Prompt", "type": "boolean", "default": true },
      { "key": "output_format", "label": "Output Format", "type": "select", "options": [
        { "value": "png", "label": "PNG" }, { "value": "jpeg", "label": "JPEG" }
      ], "default": "png" },
      { "key": "seed", "label": "Seed", "type": "number", "required": false, "advancedOnly": true, "min": 0, "max": 2147483647 }
    ],
    "pricingTiers": { "default": 30, "1K": 30, "2K": 30, "4K": 60 },
    "pricingFormula": "flat"
  }'::json,
  true,
  25,
  25,
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
