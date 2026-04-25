INSERT INTO "media_models" (
  "modelId",
  "name",
  "description",
  "modelType",
  "provider",
  "aliases",
  "creditCost",
  "aspectRatios",
  "sizes",
  "durations",
  "voices",
  "configJson",
  "isEnabled",
  "priority",
  "sortOrder",
  "updatedAt"
)
VALUES (
  'gpt-image-2-text-to-image',
  'GPT Image 2 Text-to-Image',
  'Kie AI GPT Image 2 text-to-image generation via the createTask API.',
  'image',
  'kie_ai',
  '["gpt image 2", "gpt-image-2", "gpt image 2 text to image", "gpt-image-2-text-to-image", "openai gpt image 2"]'::json,
  70,
  '["auto", "1:1", "16:9", "9:16", "4:3", "3:4"]'::json,
  NULL,
  NULL,
  NULL,
  '{
    "kieModelId": "gpt-image-2-text-to-image",
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "kie_create_task",
    "documentationUrl": "https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image",
    "generateType": "text-to-image",
    "pricingFormula": "flat",
    "pricingTiers": {
      "default": 70
    },
    "inputFields": [
      {
        "key": "aspect_ratio",
        "label": "Aspect Ratio",
        "type": "select",
        "options": [
          { "value": "auto", "label": "Auto" },
          { "value": "1:1", "label": "1:1" },
          { "value": "16:9", "label": "16:9" },
          { "value": "9:16", "label": "9:16" },
          { "value": "4:3", "label": "4:3" },
          { "value": "3:4", "label": "3:4" }
        ],
        "default": "auto",
        "syncWith": "aspect_ratio"
      },
      {
        "key": "nsfw_checker",
        "label": "NSFW Checker",
        "type": "boolean",
        "default": false
      }
    ]
  }'::json,
  true,
  6,
  16,
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
  "sizes" = EXCLUDED."sizes",
  "durations" = EXCLUDED."durations",
  "voices" = EXCLUDED."voices",
  "configJson" = EXCLUDED."configJson",
  "isEnabled" = EXCLUDED."isEnabled",
  "priority" = EXCLUDED."priority",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();

INSERT INTO "media_models" (
  "modelId",
  "name",
  "description",
  "modelType",
  "provider",
  "aliases",
  "creditCost",
  "aspectRatios",
  "sizes",
  "durations",
  "voices",
  "configJson",
  "isEnabled",
  "priority",
  "sortOrder",
  "updatedAt"
)
VALUES (
  'gpt-image-2-image-to-image',
  'GPT Image 2 Image-to-Image',
  'Kie AI GPT Image 2 image-to-image generation via the createTask API.',
  'image',
  'kie_ai',
  '["gpt image 2 image to image", "gpt-image-2-image-to-image", "gpt image 2 edit", "gpt-image-2-edit", "openai gpt image 2 image edit"]'::json,
  70,
  '["auto", "1:1", "16:9", "9:16", "4:3", "3:4"]'::json,
  NULL,
  NULL,
  NULL,
  '{
    "kieModelId": "gpt-image-2-image-to-image",
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "kie_create_task",
    "documentationUrl": "https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image",
    "generateType": "image-to-image",
    "supportsReferenceImages": true,
    "maxReferenceImages": 4,
    "pricingFormula": "flat",
    "pricingTiers": {
      "default": 70
    },
    "inputFields": [
      {
        "key": "input_urls",
        "label": "Reference Images",
        "type": "image_urls",
        "required": true,
        "syncWith": "reference_images",
        "maxItems": 4
      },
      {
        "key": "aspect_ratio",
        "label": "Aspect Ratio",
        "type": "select",
        "options": [
          { "value": "auto", "label": "Auto" },
          { "value": "1:1", "label": "1:1" },
          { "value": "16:9", "label": "16:9" },
          { "value": "9:16", "label": "9:16" },
          { "value": "4:3", "label": "4:3" },
          { "value": "3:4", "label": "3:4" }
        ],
        "default": "auto",
        "syncWith": "aspect_ratio"
      },
      {
        "key": "nsfw_checker",
        "label": "NSFW Checker",
        "type": "boolean",
        "default": false
      }
    ]
  }'::json,
  true,
  7,
  17,
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
  "sizes" = EXCLUDED."sizes",
  "durations" = EXCLUDED."durations",
  "voices" = EXCLUDED."voices",
  "configJson" = EXCLUDED."configJson",
  "isEnabled" = EXCLUDED."isEnabled",
  "priority" = EXCLUDED."priority",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();
