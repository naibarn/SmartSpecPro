-- Modular Chat model IDs come from OpenRouter's current free-model catalog.
-- The shared legacy model_provider_map is intentionally not required to mirror
-- this volatile upstream list; it remains the source for the legacy application.
CREATE OR REPLACE FUNCTION public.get_modular_chat_provider_config(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_provider_id integer,
  p_model_id varchar
)
RETURNS TABLE (
  provider_name varchar,
  base_url varchar,
  api_key_encrypted text,
  provider_model_id varchar,
  api_style text,
  is_free boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public.assert_modular_chat_workspace_access(
    p_user_id, p_environment_tenant_id, p_workspace_id
  );

  IF p_model_id IS NULL OR length(p_model_id) > 128 OR
     p_model_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT provider."providerName", provider."baseUrl", provider."apiKeyEncrypted",
         p_model_id, 'chat-completions'::text, true
  FROM public.llm_providers AS provider
  WHERE provider.id = p_provider_id
    AND lower(provider."providerName") = 'openrouter'
    AND provider."isEnabled" IS TRUE
    AND provider."hasApiKey" IS TRUE
    AND provider."apiKeyEncrypted" IS NOT NULL;
END;
$function$;
--> statement-breakpoint
COMMENT ON FUNCTION public.get_modular_chat_provider_config(integer, varchar, varchar, integer, varchar) IS
  'Returns the configured OpenRouter credential for a live free model selected by Modular Chat. Model availability and free pricing are independently checked against the live provider catalog before dispatch.';
