-- Grok Imagine Image 2 is one user-facing image model with two paid operations
-- (text-to-image and image-edit). Segment Map is a separate operation because
-- it is free, has no prompt, and produces a task-derived map rather than an
-- ordinary generated image.
--
-- The sourceMediaTaskId used by image-edit/segment-map is an internal media
-- task ID. The server resolves it to the provider task_id after ownership and
-- tenant authorization; it is never accepted as a raw provider ID from the UI.
INSERT INTO "media_models" (
  "modelId", "name", "description", "modelType", "provider", "aliases",
  "creditCost", "aspectRatios", "configJson", "isEnabled", "priority",
  "sortOrder", "updatedAt"
) VALUES (
  'grok-imagine-image-2',
  'Grok Imagine Image 2',
  'xAI Grok Imagine Image 2 - Text-to-image generation and editing of a completed Grok image task.',
  'image'::media_model_type,
  'kie.ai',
  '["grok image 2", "grok-imagine-image-2", "grok imagine image 2", "grok-image-2"]'::json,
  20,
  '["1:1", "2:3", "3:2", "16:9", "9:16"]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "grok-imagine-image-2-0/text-to-image",
    "generateType": "text-to-image",
    "maxPromptLength": 5000,
    "maxReferenceImages": 1,
    "supportsReferenceImages": true,
    "operationModes": ["text-to-image", "image-edit"],
    "documentationUrl": "https://docs.kie.ai/market/grok-imagine-image-2-0/text-to-image",
    "apiConfig": {
      "grok_imagine_image_2_family": true,
      "operations": {
        "text-to-image": { "kie_model_id": "grok-imagine-image-2-0/text-to-image" },
        "image-edit": {
          "kie_model_id": "grok-imagine-image-2-0/image-edit",
          "drop_params": ["aspect_ratio", "resolution", "output_format", "sourceMediaTaskId", "grokOperation"]
        }
      }
    },
    "inputFields": [{
      "key": "aspect_ratio",
      "label": "Aspect Ratio",
      "type": "select",
      "options": [
        { "value": "1:1", "label": "1:1" },
        { "value": "2:3", "label": "2:3" },
        { "value": "3:2", "label": "3:2" },
        { "value": "16:9", "label": "16:9" },
        { "value": "9:16", "label": "9:16" }
      ],
      "default": "1:1",
      "syncWith": "aspect_ratio"
    }, {
      "key": "mask_indexs",
      "label": "Mask Indexes (optional)",
      "type": "array",
      "maxItems": 64,
      "itemFields": [{ "key": "value", "label": "Mask Index", "type": "number", "min": 0, "max": 64, "step": 1 }],
      "description": "Optional mask indexes returned by Segment Map."
    }]
  }'::json,
  true, 8, 8, NOW()
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

INSERT INTO "media_models" (
  "modelId", "name", "description", "modelType", "provider", "aliases",
  "creditCost", "aspectRatios", "configJson", "isEnabled", "priority",
  "sortOrder", "updatedAt"
) VALUES (
  'grok-imagine-image-2/segment-map',
  'Grok Imagine Image 2 Segment Map',
  'Create a segment map from a completed Grok Imagine Image 2 task.',
  'image'::media_model_type,
  'kie.ai',
  '["grok image 2 segment map", "grok-segment-map"]'::json,
  0,
  '[]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "grok-imagine-image-2-0/segment-map",
    "generateType": "segment-map",
    "operationOnly": true,
    "maxPromptLength": 0,
    "maxReferenceImages": 1,
    "supportsReferenceImages": true,
    "operationModes": ["segment-map"],
    "documentationUrl": "https://docs.kie.ai/market/grok-imagine-image-2-0/segment-map",
    "apiConfig": {
      "grok_imagine_image_2_family": true,
      "drop_params": ["prompt", "aspect_ratio", "resolution", "output_format", "sourceMediaTaskId", "grokOperation"]
    }
  }'::json,
  true, 9, 9, NOW()
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
