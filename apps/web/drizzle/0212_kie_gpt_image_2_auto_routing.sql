WITH existing_aliases(value) AS (
  SELECT json_array_elements_text(
    CASE
      WHEN json_typeof("aliases") = 'array' THEN "aliases"
      ELSE '[]'::json
    END
  )
  FROM "media_models"
  WHERE "modelId" = 'gpt-image-2-text-to-image'
),
desired_aliases(value) AS (
  VALUES
    ('gpt image 2'),
    ('gpt-image-2'),
    ('gpt image 2 text to image'),
    ('gpt-image-2-text-to-image'),
    ('openai gpt image 2'),
    ('gpt 2'),
    ('gpt2'),
    ('gpt image2'),
    ('gpt-image-2-image-to-image'),
    ('gpt image 2 image to image'),
    ('gpt-image-2-edit'),
    ('gpt image 2 edit'),
    ('openai gpt image 2 image edit')
),
merged_aliases(value) AS (
  SELECT DISTINCT value FROM existing_aliases
  UNION
  SELECT DISTINCT value FROM desired_aliases
)
UPDATE "media_models"
SET
  "name" = 'GPT Image 2',
  "description" = 'OpenAI GPT Image 2 generation and reference-image editing via Kie AI createTask.',
  "aliases" = (SELECT json_agg(value ORDER BY value) FROM merged_aliases),
  "configJson" = jsonb_set(
    COALESCE("configJson"::jsonb, '{}'::jsonb) || '{
      "kieModelId": "gpt-image-2-text-to-image",
      "apiEndpoint": "/api/v1/jobs/createTask",
      "apiPayloadFormat": "market",
      "documentationUrl": "https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image",
      "generateType": "text-to-image",
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
          "required": false,
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
    }'::jsonb,
    '{apiConfig}',
    COALESCE("configJson"::jsonb -> 'apiConfig', '{}'::jsonb) || '{
      "kie_model_id_with_references": "gpt-image-2-image-to-image",
      "reference_image_input_key": "input_urls",
      "reference_image_input_type": "array"
    }'::jsonb,
    true
  ),
  "isEnabled" = true,
  "updatedAt" = NOW()
WHERE "modelId" = 'gpt-image-2-text-to-image';

UPDATE "media_models"
SET
  "isEnabled" = false,
  "updatedAt" = NOW()
WHERE "modelId" = 'gpt-image-2-image-to-image';
