CREATE ROLE modular_workspace_owner
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint
COMMENT ON ROLE modular_workspace_owner IS 'smartaihub:modular-workspace-control:v1';
--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA public TO modular_workspace_owner;
--> statement-breakpoint
CREATE TABLE public.modular_workspaces (
  environment_tenant_id varchar(64) NOT NULL
    CHECK (environment_tenant_id IN ('modular-development', 'modular-production')),
  id varchar(36) NOT NULL,
  owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  workspace_type varchar(24) NOT NULL CHECK (workspace_type = 'personal'),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_tenant_id, id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX modular_workspaces_one_default_per_owner
  ON public.modular_workspaces (environment_tenant_id, owner_user_id)
  WHERE is_default IS TRUE;
--> statement-breakpoint
CREATE INDEX modular_workspaces_owner_active_idx
  ON public.modular_workspaces (environment_tenant_id, owner_user_id, is_active);
--> statement-breakpoint
CREATE TABLE public.modular_workspace_members (
  environment_tenant_id varchar(64) NOT NULL,
  workspace_id varchar(36) NOT NULL,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role varchar(24) NOT NULL CHECK (role IN ('owner', 'member')),
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_tenant_id, workspace_id, user_id),
  FOREIGN KEY (environment_tenant_id, workspace_id)
    REFERENCES public.modular_workspaces(environment_tenant_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX modular_workspace_members_user_env_idx
  ON public.modular_workspace_members (environment_tenant_id, user_id, is_active);
--> statement-breakpoint
GRANT SELECT, INSERT ON public.modular_workspaces TO modular_workspace_owner;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.modular_workspace_members TO modular_workspace_owner;
--> statement-breakpoint
CREATE FUNCTION public.list_modular_workspace_memberships(
  p_user_id integer,
  p_environment_tenant_id varchar
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
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 OR NOT (
    (session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
    (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')
  ) THEN
    RAISE EXCEPTION 'WORKSPACE_ENVIRONMENT_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT workspace.id, workspace.name, member.role, workspace.is_default, workspace.workspace_type
  FROM public.modular_workspace_members AS member
  JOIN public.modular_workspaces AS workspace
    ON workspace.environment_tenant_id = member.environment_tenant_id
   AND workspace.id = member.workspace_id
  WHERE member.environment_tenant_id = p_environment_tenant_id
    AND member.user_id = p_user_id
    AND member.is_active IS TRUE
    AND workspace.is_active IS TRUE
  ORDER BY workspace.is_default DESC, workspace.created_at, workspace.id;
END;
$function$;
--> statement-breakpoint
CREATE FUNCTION public.ensure_modular_default_workspace(
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
     length(btrim(p_workspace_name)) NOT BETWEEN 1 AND 80 OR NOT (
       (session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
       (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')
     ) THEN
    RAISE EXCEPTION 'WORKSPACE_PROVISION_REQUEST_INVALID' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.modular_workspaces (
    environment_tenant_id, id, owner_user_id, name, workspace_type, is_default
  ) VALUES (
    p_environment_tenant_id, p_workspace_id, p_user_id, btrim(p_workspace_name), 'personal', true
  )
  ON CONFLICT (environment_tenant_id, owner_user_id) WHERE is_default IS TRUE DO NOTHING
  RETURNING id INTO v_workspace_id;

  IF v_workspace_id IS NOT NULL THEN
    INSERT INTO public.modular_workspace_members (
      environment_tenant_id, workspace_id, user_id, role, is_active
    ) VALUES (p_environment_tenant_id, v_workspace_id, p_user_id, 'owner', true);
  ELSE
    SELECT workspace.id INTO v_workspace_id
    FROM public.modular_workspaces AS workspace
    WHERE workspace.environment_tenant_id = p_environment_tenant_id
      AND workspace.owner_user_id = p_user_id
      AND workspace.is_default IS TRUE
      AND workspace.is_active IS TRUE;
    IF NOT FOUND THEN RETURN; END IF;
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
CREATE FUNCTION public.create_modular_personal_workspace(
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
  v_existing_count integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 OR
     p_workspace_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR
     length(btrim(p_workspace_name)) NOT BETWEEN 1 AND 80 OR p_workspace_name ~ '[[:cntrl:]]' OR NOT (
       (session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
       (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')
     ) THEN
    RAISE EXCEPTION 'WORKSPACE_CREATE_REQUEST_INVALID' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('smartaihub:workspace-create:' || p_environment_tenant_id || ':' || p_user_id::text, 0)
  );

  SELECT count(*)::integer INTO v_existing_count
  FROM public.modular_workspaces AS workspace
  WHERE workspace.environment_tenant_id = p_environment_tenant_id
    AND workspace.owner_user_id = p_user_id
    AND workspace.is_default IS FALSE
    AND workspace.is_active IS TRUE;
  IF v_existing_count >= 20 THEN
    RAISE EXCEPTION 'WORKSPACE_LIMIT_REACHED' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.modular_workspaces (
    environment_tenant_id, id, owner_user_id, name, workspace_type, is_default
  ) VALUES (
    p_environment_tenant_id, p_workspace_id, p_user_id, btrim(p_workspace_name), 'personal', false
  );
  INSERT INTO public.modular_workspace_members (
    environment_tenant_id, workspace_id, user_id, role, is_active
  ) VALUES (p_environment_tenant_id, p_workspace_id, p_user_id, 'owner', true);

  RETURN QUERY
  SELECT workspace.id, workspace.name, member.role, workspace.is_default, workspace.workspace_type
  FROM public.modular_workspace_members AS member
  JOIN public.modular_workspaces AS workspace
    ON workspace.environment_tenant_id = member.environment_tenant_id
   AND workspace.id = member.workspace_id
  WHERE member.environment_tenant_id = p_environment_tenant_id
    AND member.workspace_id = p_workspace_id
    AND member.user_id = p_user_id;
END;
$function$;
--> statement-breakpoint
ALTER FUNCTION public.list_modular_workspace_memberships(integer, varchar) OWNER TO modular_workspace_owner;
--> statement-breakpoint
ALTER FUNCTION public.ensure_modular_default_workspace(integer, varchar, varchar, varchar) OWNER TO modular_workspace_owner;
--> statement-breakpoint
ALTER FUNCTION public.create_modular_personal_workspace(integer, varchar, varchar, varchar) OWNER TO modular_workspace_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM modular_workspace_owner;
--> statement-breakpoint
COMMENT ON TABLE public.modular_workspaces IS 'Environment-scoped private workspaces for Modular SaaS; separate from legacy customer tenants.';
--> statement-breakpoint
COMMENT ON TABLE public.modular_workspace_members IS 'Canonical user memberships for Modular personal workspaces, isolated by environment tenant.';
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_modular_workspace_memberships(integer, varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.ensure_modular_default_workspace(integer, varchar, varchar, varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_modular_personal_workspace(integer, varchar, varchar, varchar) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_modular_workspace_memberships(integer, varchar) TO modular_core_auth_dev;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.ensure_modular_default_workspace(integer, varchar, varchar, varchar) TO modular_core_auth_dev;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_modular_personal_workspace(integer, varchar, varchar, varchar) TO modular_core_auth_dev;
