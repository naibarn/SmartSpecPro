DO $dev_vector_state_guard$ BEGIN
  IF current_database() !~ '_dev(_web)?$' THEN RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_TARGET_REQUIRED'; END IF;
  IF to_regclass('public.tenants') IS NULL THEN RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_BASELINE_REQUIRED'; END IF;
END $dev_vector_state_guard$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.smartspec_vector_entries (
  index_name TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  embedding DOUBLE PRECISION[] NOT NULL,
  metadata JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (index_name, vector_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS smartspec_vector_entries_index_name_idx ON public.smartspec_vector_entries (index_name);
