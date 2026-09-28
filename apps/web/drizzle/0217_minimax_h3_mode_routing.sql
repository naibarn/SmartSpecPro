-- Register a single unified Kie AI "MiniMax H3 (Hailuo 03)" catalog row that
-- routes across THREE provider endpoints from the shape of the attachments:
--
--   nothing attached          -> minimax-h3/text-to-video
--   1-2 images                -> minimax-h3/image-to-video   (first/last frame)
--   3+ images, any video/audio-> minimax-h3/reference-to-video
--
-- The two-way `kie_model_id_with_references` switch used by GPT Image 2
-- (0212) and Seedream 5 Pro (0215) cannot express this: the third mode is
-- selected by video/audio presence, and the three endpoints disagree on both
-- the reference field names AND whether `aspect_ratio` exists at all. So this
-- row uses the generalized `apiConfig.modes` routing added alongside this
-- migration (kie_ai_provider.py::resolve_mode_api_config) — an ordered list of
-- partial apiConfig overrides, first match wins, no match falls back to the
-- base config. Rows without `modes` are completely unaffected.
--
-- Notable per-mode overrides:
--   * image-to-video takes SINGLE-URL frames, so `reference_image_input_type`
--     is "url" and `reference_image_overflow_keys` maps the 2nd attached image
--     onto `last_frame_url` (MediaStudio's start/stop-frame flow already emits
--     an ordered 2-image list).
--   * image-to-video has NO `aspect_ratio` parameter. `omit_aspect_ratio`
--     alone is not enough because it runs before the extra_params merge and
--     the aspect_ratio inputField below would put the key back, so the mode
--     also declares `drop_params`.
--
-- Pricing: Kie bills MiniMax H3 at $0.13/second @ 2K. At the platform rate of
-- 1 credit = $0.001 that is 130 credits/second, expressed as a per_duration
-- tier per allowed integer duration (4-15s).
-- KNOWN UNDER-CHARGE: the provider ALSO bills the duration of each reference
-- video and each input image beyond the 5th. `pricingFormula` cannot express
-- either, so heavy reference-to-video runs are under-billed. Same limitation
-- noted for Seedream 5 Pro's per-image surcharge in 0215.
--
-- Targeted, idempotent INSERT/UPDATE for exactly one row. Do NOT re-run the
-- full kie.ai seed script — it overwrites admin-maintained configJson on every
-- catalog row.
INSERT INTO "media_models" (
  "modelId",
  "name",
  "description",
  "modelType",
  "provider",
  "aliases",
  "creditCost",
  "aspectRatios",
  "durations",
  "configJson",
  "isEnabled",
  "priority",
  "sortOrder",
  "updatedAt"
) VALUES (
  'minimax-h3',
  'MiniMax H3 (Hailuo 03)',
  'MiniMax H3 native 2K video with stereo audio. One model for text-to-video, image-to-video (first/last frame) and reference-to-video (up to 9 images, 3 video clips, 3 audio clips) — the endpoint is chosen automatically from what you attach.',
  'video'::media_model_type,
  'kie.ai',
  '[
    "minimax-h3/text-to-video",
    "minimax-h3/image-to-video",
    "minimax-h3/reference-to-video",
    "minimax h3",
    "hailuo-3",
    "hailuo 03",
    "hailuo-03"
  ]'::json,
  780,
  '["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]'::json,
  '[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]'::json,
  '{
    "apiEndpoint": "/api/v1/jobs/createTask",
    "apiPayloadFormat": "market",
    "kieModelId": "minimax-h3/text-to-video",
    "documentationUrl": "https://docs.kie.ai/market/minimax-h3/text-to-video",
    "generateType": "text-to-video",
    "supportsReferenceImages": true,
    "supportsReferenceVideos": true,
    "supportsReferenceAudio": true,
    "maxPromptLength": 7000,
    "maxReferenceImages": 9,
    "apiConfig": {
      "kie_model_id": "minimax-h3/text-to-video",
      "modes": [
        {
          "id": "reference-to-video",
          "label": "Reference to Video",
          "notice": "Uses reference-to-video: images, clips and audio are cited by the order you attach them.",
          "when": { "minVideos": 1 },
          "kie_model_id": "minimax-h3/reference-to-video",
          "reference_image_input_key": "reference_image_urls",
          "reference_image_input_type": "array",
          "reference_video_input_key": "reference_video_urls",
          "reference_video_input_type": "array",
          "reference_audio_input_key": "reference_audio_urls",
          "reference_audio_input_type": "array"
        },
        {
          "id": "reference-to-video-audio",
          "label": "Reference to Video",
          "notice": "Uses reference-to-video: audio references require an accompanying image or video.",
          "when": { "minAudios": 1 },
          "kie_model_id": "minimax-h3/reference-to-video",
          "reference_image_input_key": "reference_image_urls",
          "reference_image_input_type": "array",
          "reference_audio_input_key": "reference_audio_urls",
          "reference_audio_input_type": "array"
        },
        {
          "id": "reference-to-video-multi-image",
          "label": "Reference to Video",
          "notice": "3 or more images use reference-to-video (image-to-video only has a first and last frame slot).",
          "when": { "minImages": 3 },
          "kie_model_id": "minimax-h3/reference-to-video",
          "reference_image_input_key": "reference_image_urls",
          "reference_image_input_type": "array"
        },
        {
          "id": "image-to-video",
          "label": "Image to Video",
          "notice": "Image-to-video derives framing from your first frame — the aspect ratio setting is ignored.",
          "when": { "minImages": 1, "maxImages": 2 },
          "kie_model_id": "minimax-h3/image-to-video",
          "reference_image_input_key": "first_frame_url",
          "reference_image_input_type": "url",
          "reference_image_overflow_keys": ["last_frame_url"],
          "omit_aspect_ratio": true,
          "drop_params": ["aspect_ratio"]
        }
      ]
    },
    "inputFields": [
      {
        "key": "reference_image_urls",
        "label": "Reference Images",
        "type": "image_urls",
        "required": false,
        "syncWith": "reference_images",
        "maxItems": 9,
        "includeInPayload": false,
        "description": "1-2 images act as the first and last frame. 3 or more switch to reference-to-video."
      },
      {
        "key": "reference_video_urls",
        "label": "Reference Videos",
        "type": "video_urls",
        "required": false,
        "syncWith": "reference_videos",
        "maxItems": 3,
        "includeInPayload": false,
        "description": "Up to 3 clips, 2-15s each and 15s in total. Attaching any clip switches to reference-to-video."
      },
      {
        "key": "reference_audio_urls",
        "label": "Reference Audio",
        "type": "audio_urls",
        "required": false,
        "syncWith": "none",
        "maxItems": 3,
        "description": "Up to 3 clips, 2-15s each. Requires an accompanying image or video."
      },
      {
        "key": "aspect_ratio",
        "label": "Aspect Ratio",
        "type": "select",
        "options": [
          { "value": "16:9", "label": "16:9" },
          { "value": "9:16", "label": "9:16" },
          { "value": "1:1", "label": "1:1" },
          { "value": "4:3", "label": "4:3" },
          { "value": "3:4", "label": "3:4" },
          { "value": "21:9", "label": "21:9" }
        ],
        "default": "16:9",
        "syncWith": "aspect_ratio",
        "description": "Ignored in image-to-video — that endpoint takes framing from the first frame."
      },
      {
        "key": "duration",
        "label": "Duration (seconds)",
        "type": "select",
        "options": [
          { "value": 4, "label": "4s" },
          { "value": 5, "label": "5s" },
          { "value": 6, "label": "6s" },
          { "value": 7, "label": "7s" },
          { "value": 8, "label": "8s" },
          { "value": 9, "label": "9s" },
          { "value": 10, "label": "10s" },
          { "value": 11, "label": "11s" },
          { "value": 12, "label": "12s" },
          { "value": 13, "label": "13s" },
          { "value": 14, "label": "14s" },
          { "value": 15, "label": "15s" }
        ],
        "default": 6,
        "affectsPricing": true
      }
    ],
    "pricingTiers": {
      "4s": 520,
      "5s": 650,
      "6s": 780,
      "7s": 910,
      "8s": 1040,
      "9s": 1170,
      "10s": 1300,
      "11s": 1430,
      "12s": 1560,
      "13s": 1690,
      "14s": 1820,
      "15s": 1950
    },
    "pricingFormula": "per_duration"
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
  "durations" = EXCLUDED."durations",
  "configJson" = EXCLUDED."configJson",
  "isEnabled" = EXCLUDED."isEnabled",
  "priority" = EXCLUDED."priority",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();
