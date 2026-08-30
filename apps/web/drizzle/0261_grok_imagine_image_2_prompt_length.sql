-- Existing databases already applied 0260 before the documented prompt limit
-- was reconciled. Update only the paid Grok Image 2 row; Segment Map has no prompt.
UPDATE "media_models"
SET "configJson" = jsonb_set(
  "configJson"::jsonb,
  '{maxPromptLength}',
  '390000'::jsonb,
  true
)::json,
"updatedAt" = NOW()
WHERE "modelId" = 'grok-imagine-image-2';
