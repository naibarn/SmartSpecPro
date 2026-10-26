DO $dev_checkpoint_owner$ DECLARE
  actual_columns text[];
BEGIN
  IF current_database() !~ '_dev(_web)?$' THEN RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_TARGET_REQUIRED'; END IF;
  IF to_regclass('public.checkpoints') IS NULL THEN RETURN; END IF;

  SELECT array_agg(a.attname::text ORDER BY a.attname::text) INTO actual_columns
  FROM pg_attribute a
  WHERE a.attrelid = 'public.checkpoints'::regclass AND a.attnum > 0 AND NOT a.attisdropped;

  IF actual_columns = ARRAY['cost','created_at','execution_id','id','state','step_name','step_number','tokens_used']::text[] THEN
    IF to_regclass('public.legacy_execution_checkpoints') IS NOT NULL THEN
      RAISE EXCEPTION 'DEV_LEGACY_CHECKPOINT_ARCHIVE_ALREADY_EXISTS';
    END IF;
    ALTER TABLE public.checkpoints RENAME TO legacy_execution_checkpoints;
  ELSIF NOT ('thread_id' = ANY(actual_columns)) THEN
    RAISE EXCEPTION 'DEV_CHECKPOINT_TABLE_SHAPE_UNRECOGNIZED';
  END IF;
END $dev_checkpoint_owner$;
