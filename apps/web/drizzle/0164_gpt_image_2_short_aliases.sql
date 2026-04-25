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
    ('gpt image2')
),
merged_aliases AS (
  SELECT DISTINCT value FROM existing_aliases
  UNION
  SELECT DISTINCT value FROM desired_aliases
)
UPDATE "media_models"
SET
  "aliases" = (SELECT json_agg(value ORDER BY value) FROM merged_aliases),
  "updatedAt" = NOW()
WHERE "modelId" = 'gpt-image-2-text-to-image';
