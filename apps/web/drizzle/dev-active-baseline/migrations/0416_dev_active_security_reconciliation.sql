DO $dev_active_security_guard$ BEGIN
  IF current_database() !~ '_dev(_web)?$' THEN RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_TARGET_REQUIRED'; END IF;
  IF to_regclass('public.llm_inference_profile_certifications') IS NULL OR to_regclass('public.mcp_server_assignments') IS NULL THEN
    RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_BASELINE_REQUIRED';
  END IF;
END $dev_active_security_guard$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.validate_tool_names() RETURNS trigger AS $function$
BEGIN
  IF NEW.enabled_tool_names IS NOT NULL THEN
    FOR i IN 1..array_length(NEW.enabled_tool_names, 1) LOOP
      IF NEW.enabled_tool_names[i] !~ '^[a-zA-Z0-9_\-\.]{1,64}$' THEN
        RAISE EXCEPTION 'Invalid tool name: %', NEW.enabled_tool_names[i];
      END IF;
    END LOOP;
  END IF;
  IF NEW.disabled_tool_names IS NOT NULL THEN
    FOR i IN 1..array_length(NEW.disabled_tool_names, 1) LOOP
      IF NEW.disabled_tool_names[i] !~ '^[a-zA-Z0-9_\-\.]{1,64}$' THEN
        RAISE EXCEPTION 'Invalid tool name: %', NEW.disabled_tool_names[i];
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS llm_inference_profile_certifications_immutable ON public.llm_inference_profile_certifications;
--> statement-breakpoint
CREATE TRIGGER llm_inference_profile_certifications_immutable BEFORE UPDATE OR DELETE ON public.llm_inference_profile_certifications
  FOR EACH ROW EXECUTE FUNCTION public.reject_llm_inference_authority_history_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_validate_tool_names ON public.mcp_server_assignments;
--> statement-breakpoint
CREATE TRIGGER trg_validate_tool_names BEFORE INSERT OR UPDATE ON public.mcp_server_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_tool_names();
