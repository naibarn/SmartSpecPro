-- Authorized model configuration for the new Modular Chat billing path.
-- The worker must independently enforce endpoint safety and budget admission.
CREATE FUNCTION public.get_modular_chat_enabled_model_config(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar,
  p_provider_id integer, p_model_id varchar
)
RETURNS TABLE (
  provider_name varchar, base_url varchar, api_key_encrypted text,
  provider_model_id varchar, api_style text, is_free boolean,
  pricing_input numeric, pricing_output numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
BEGIN
  PERFORM public.assert_modular_chat_workspace_access(p_user_id, p_environment_tenant_id, p_workspace_id);
  RETURN QUERY
  SELECT provider."providerName", provider."baseUrl", provider."apiKeyEncrypted",
    mapping."providerModelId", catalog.api_style, catalog.is_free,
    mapping."pricingInput"::numeric, mapping."pricingOutput"::numeric
  FROM public.modular_chat_llm_model_catalog AS catalog
  JOIN public.llm_providers AS provider ON provider.id = catalog.provider_id
  JOIN public.model_provider_map AS mapping
    ON mapping."providerId" = catalog.provider_id AND mapping."modelId" = catalog.model_id
  WHERE catalog.provider_id = p_provider_id AND catalog.model_id = p_model_id
    AND provider."isEnabled" IS TRUE AND provider."hasApiKey" IS TRUE
    AND provider."apiKeyEncrypted" IS NOT NULL AND mapping."isEnabled" IS TRUE
    AND catalog.api_style = 'chat-completions'
    AND mapping."pricingInput" IS NOT NULL AND mapping."pricingInput" >= 0
    AND mapping."pricingOutput" IS NOT NULL AND mapping."pricingOutput" >= 0;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_modular_chat_enabled_model_config(integer, varchar, varchar, integer, varchar) FROM PUBLIC;
--> statement-breakpoint
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.get_modular_chat_enabled_model_config(integer, varchar, varchar, integer, varchar) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.get_modular_chat_enabled_model_config(integer, varchar, varchar, integer, varchar) TO modular_core_auth_prod;
  END IF;
END $grants$;
