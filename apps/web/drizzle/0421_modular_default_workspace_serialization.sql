CREATE OR REPLACE FUNCTION public.ensure_modular_default_workspace(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_workspace_name varchar
)
RETURNS TABLE (
  workspace_id varchar,
  workspace_name varchar,
  member_role varchar,
  is_default boolean,
  workspace_type varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_workspace_id varchar(36);
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 OR
     p_workspace_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR
     length(btrim(p_workspace_name)) NOT BETWEEN 1 AND 80 OR p_workspace_name ~ '[[:cntrl:]]' OR NOT (
       (session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
       (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')
     ) THEN
    RAISE EXCEPTION 'WORKSPACE_PROVISION_REQUEST_INVALID' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('smartaihub:workspace-default:' || p_environment_tenant_id || ':' || p_user_id::text, 0)
  );

  SELECT workspace.id INTO v_workspace_id
  FROM public.modular_workspaces AS workspace
  WHERE workspace.environment_tenant_id = p_environment_tenant_id
    AND workspace.owner_user_id = p_user_id
    AND workspace.is_default IS TRUE;

  IF NOT FOUND THEN
    INSERT INTO public.modular_workspaces (
      environment_tenant_id, id, owner_user_id, name, workspace_type, is_default
    ) VALUES (
      p_environment_tenant_id, p_workspace_id, p_user_id, btrim(p_workspace_name), 'personal', true
    )
    RETURNING id INTO v_workspace_id;

    INSERT INTO public.modular_workspace_members (
      environment_tenant_id, workspace_id, user_id, role, is_active
    ) VALUES (p_environment_tenant_id, v_workspace_id, p_user_id, 'owner', true);
  END IF;

  RETURN QUERY
  SELECT workspace.id, workspace.name, member.role, workspace.is_default, workspace.workspace_type
  FROM public.modular_workspace_members AS member
  JOIN public.modular_workspaces AS workspace
    ON workspace.environment_tenant_id = member.environment_tenant_id
   AND workspace.id = member.workspace_id
  WHERE member.environment_tenant_id = p_environment_tenant_id
    AND member.workspace_id = v_workspace_id
    AND member.user_id = p_user_id
    AND member.is_active IS TRUE
    AND workspace.is_active IS TRUE;
END;
$function$;
--> statement-breakpoint
ALTER FUNCTION public.ensure_modular_default_workspace(integer, varchar, varchar, varchar) OWNER TO modular_workspace_owner;
