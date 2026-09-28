-- Normalize select options created by 0294 to the ModelInputField contract.
DO $$
DECLARE
  item RECORD;
  fields jsonb;
  rebuilt jsonb;
  field jsonb;
  idx integer;
BEGIN
  FOR item IN
    SELECT "id", "configJson"::jsonb AS config
    FROM "media_models"
    WHERE "provider" = 'wavespeed_ai'
      AND "modelId" LIKE 'wavespeed-ai/minimax-h3/%'
  LOOP
    fields := item.config->'inputFields';
    rebuilt := '[]'::jsonb;
    IF jsonb_typeof(fields) = 'array' THEN
      FOR idx IN 0..jsonb_array_length(fields) - 1 LOOP
        field := fields->idx;
        IF jsonb_typeof(field->'options') = 'array'
           AND jsonb_array_length(field->'options') > 0
           AND jsonb_typeof(field->'options'->0) = 'string' THEN
          field := jsonb_set(
            field,
            '{options}',
            (
              SELECT jsonb_agg(jsonb_build_object('value', value, 'label', upper(value)))
              FROM jsonb_array_elements_text(field->'options') AS option(value)
            )
          );
        END IF;
        rebuilt := rebuilt || jsonb_build_array(field);
      END LOOP;
    END IF;
    UPDATE "media_models"
    SET "configJson" = jsonb_set(item.config, '{inputFields}', rebuilt)::json,
        "updatedAt" = NOW()
    WHERE "id" = item."id";
  END LOOP;
END $$;
