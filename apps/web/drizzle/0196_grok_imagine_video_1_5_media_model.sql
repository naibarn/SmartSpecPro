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
  'grok-imagine-video-1-5-preview',
  'Grok Imagine Video 1.5 Preview',
  'xAI Grok Imagine Video 1.5 Preview - Image-to-video generation with native audio.',
  'video',
  'kie.ai',
  '["grok-imagine-video-1.5", "grok-imagine-video-1-5", "grok-video-1.5", "grok-video-1-5", "grok imagine video 1.5"]'::json,
  125,
  '["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]'::json,
  NULL,
  '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]'::json,
  NULL,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "grok-imagine-video-1-5-preview",
    "documentationUrl": "https://docs.kie.ai/market/grok-imagine/1-5-preview",
    "generateType": "image-to-video",
    "hasAudio": true,
    "maxDuration": 15,
    "maxReferenceImages": 1,
    "supportedAspectRatios": ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    "supportedResolutions": ["480p", "720p"],
    "supportedDurations": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    "storyboardClipDurationSeconds": 8,
    "pricingTiers": {
      "default": 125
    },
    "pricingFormula": "flat",
    "inputFields": [
      {
        "key": "image_urls",
        "label": "Source Image",
        "type": "image_urls",
        "required": true,
        "syncWith": "reference_images",
        "maxItems": 1
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
          { "value": "3:4", "label": "3:4" },
          { "value": "3:2", "label": "3:2" },
          { "value": "2:3", "label": "2:3" }
        ],
        "default": "auto",
        "syncWith": "aspect_ratio"
      },
      {
        "key": "resolution",
        "label": "Resolution",
        "type": "select",
        "options": [
          { "value": "480p", "label": "480p" },
          { "value": "720p", "label": "720p" }
        ],
        "default": "480p"
      },
      {
        "key": "duration",
        "label": "Duration",
        "type": "select",
        "options": [
          { "value": "1", "label": "1s" },
          { "value": "2", "label": "2s" },
          { "value": "3", "label": "3s" },
          { "value": "4", "label": "4s" },
          { "value": "5", "label": "5s" },
          { "value": "6", "label": "6s" },
          { "value": "7", "label": "7s" },
          { "value": "8", "label": "8s" },
          { "value": "9", "label": "9s" },
          { "value": "10", "label": "10s" },
          { "value": "11", "label": "11s" },
          { "value": "12", "label": "12s" },
          { "value": "13", "label": "13s" },
          { "value": "14", "label": "14s" },
          { "value": "15", "label": "15s" }
        ],
        "default": "8"
      }
    ]
  }'::json,
  true,
  28,
  28,
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
  "priority" = EXCLUDED."priority",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();
