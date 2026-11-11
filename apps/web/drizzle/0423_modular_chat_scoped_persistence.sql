CREATE TABLE public.modular_chat_conversation_scopes (
  environment_tenant_id varchar(64) NOT NULL
    CHECK (environment_tenant_id IN ('modular-development', 'modular-production')),
  workspace_id varchar(36) NOT NULL,
  conversation_id integer NOT NULL UNIQUE
    REFERENCES public.conversations(id) ON DELETE CASCADE,
  owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_tenant_id, workspace_id, conversation_id)
);
--> statement-breakpoint
CREATE INDEX modular_chat_conversation_scopes_workspace_idx
  ON public.modular_chat_conversation_scopes (environment_tenant_id, workspace_id, owner_user_id);
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.modular_chat_conversation_scopes FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.assert_modular_chat_workspace_access(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_workspace_type varchar;
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 OR p_workspace_id IS NULL OR length(p_workspace_id) > 36 OR NOT (
    (session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
    (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')
  ) THEN
    RAISE EXCEPTION 'CHAT_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT workspace.workspace_type INTO v_workspace_type
  FROM public.modular_workspace_members AS member
  JOIN public.modular_workspaces AS workspace
    ON workspace.environment_tenant_id = member.environment_tenant_id
   AND workspace.id = member.workspace_id
  WHERE member.environment_tenant_id = p_environment_tenant_id
    AND member.workspace_id = p_workspace_id
    AND member.user_id = p_user_id
    AND member.is_active IS TRUE
    AND workspace.is_active IS TRUE
  LIMIT 1;

  IF v_workspace_type IS NOT NULL THEN
    RETURN v_workspace_type;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_users AS member
    JOIN public.tenants AS tenant ON tenant.id = member.tenant_id
    WHERE member.user_id = p_user_id
      AND member.tenant_id = p_workspace_id
      AND member.is_active IS TRUE
      AND tenant."isActive" IS TRUE
  ) THEN
    RETURN 'customer';
  END IF;

  RAISE EXCEPTION 'CHAT_SCOPE_DENIED' USING ERRCODE = '42501';
END;
$function$;
--> statement-breakpoint
CREATE FUNCTION public.list_modular_chat_conversations(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar
)
RETURNS TABLE (
  conversation_id integer,
  title varchar,
  updated_at timestamptz,
  message_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_workspace_type varchar;
  v_is_default boolean := false;
BEGIN
  v_workspace_type := public.assert_modular_chat_workspace_access(
    p_user_id, p_environment_tenant_id, p_workspace_id
  );
  SELECT workspace.is_default INTO v_is_default
  FROM public.modular_workspaces AS workspace
  WHERE workspace.environment_tenant_id = p_environment_tenant_id
    AND workspace.id = p_workspace_id
    AND workspace.owner_user_id = p_user_id;

  RETURN QUERY
  SELECT conversation.id, conversation.title, conversation."updatedAt", conversation."messageCount"
  FROM public.conversations AS conversation
  LEFT JOIN public.modular_chat_conversation_scopes AS scope
    ON scope.conversation_id = conversation.id
  WHERE conversation."userId" = p_user_id
    AND conversation."isArchived" IS FALSE
    AND conversation."trashedAt" IS NULL
    AND (
      (scope.conversation_id IS NOT NULL
        AND scope.environment_tenant_id = p_environment_tenant_id
        AND scope.workspace_id = p_workspace_id
        AND scope.owner_user_id = p_user_id)
      OR
      (scope.conversation_id IS NULL
        AND conversation."tenantId" IS NOT DISTINCT FROM
          CASE WHEN v_workspace_type = 'personal' THEN NULL ELSE p_workspace_id END
        AND (v_workspace_type <> 'personal' OR v_is_default IS TRUE))
    )
  ORDER BY conversation."updatedAt" DESC, conversation.id DESC
  LIMIT 100;
END;
$function$;
--> statement-breakpoint
CREATE FUNCTION public.create_modular_chat_conversation(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_title varchar
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_workspace_type varchar;
  v_conversation_id integer;
  v_title varchar(255);
BEGIN
  v_workspace_type := public.assert_modular_chat_workspace_access(
    p_user_id, p_environment_tenant_id, p_workspace_id
  );
  v_title := left(btrim(COALESCE(p_title, 'New Chat')), 255);
  IF length(v_title) < 1 OR p_title ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'CHAT_TITLE_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.conversations ("userId", title, model, "tenantId", source)
  VALUES (
    p_user_id,
    v_title,
    'auto',
    CASE WHEN v_workspace_type = 'personal' THEN NULL ELSE p_workspace_id END,
    'web'
  )
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.modular_chat_conversation_scopes (
    environment_tenant_id, workspace_id, conversation_id, owner_user_id
  ) VALUES (p_environment_tenant_id, p_workspace_id, v_conversation_id, p_user_id);

  RETURN v_conversation_id;
END;
$function$;
--> statement-breakpoint
CREATE FUNCTION public.list_modular_chat_messages(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_conversation_id integer
)
RETURNS TABLE (
  message_id integer,
  role text,
  content text,
  created_at timestamptz,
  model_used varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_workspace_type varchar;
  v_is_default boolean := false;
BEGIN
  v_workspace_type := public.assert_modular_chat_workspace_access(
    p_user_id, p_environment_tenant_id, p_workspace_id
  );
  SELECT workspace.is_default INTO v_is_default
  FROM public.modular_workspaces AS workspace
  WHERE workspace.environment_tenant_id = p_environment_tenant_id
    AND workspace.id = p_workspace_id
    AND workspace.owner_user_id = p_user_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations AS conversation
    LEFT JOIN public.modular_chat_conversation_scopes AS scope
      ON scope.conversation_id = conversation.id
    WHERE conversation.id = p_conversation_id
      AND conversation."userId" = p_user_id
      AND (
        (scope.conversation_id IS NOT NULL
          AND scope.environment_tenant_id = p_environment_tenant_id
          AND scope.workspace_id = p_workspace_id
          AND scope.owner_user_id = p_user_id)
        OR
        (scope.conversation_id IS NULL
          AND conversation."tenantId" IS NOT DISTINCT FROM
            CASE WHEN v_workspace_type = 'personal' THEN NULL ELSE p_workspace_id END
          AND (v_workspace_type <> 'personal' OR v_is_default IS TRUE))
      )
  ) THEN
    RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT message.id, message.role::text, message.content, message."createdAt", message."modelUsed"
  FROM public.messages AS message
  WHERE message."conversationId" = p_conversation_id
  ORDER BY message."createdAt", message.id
  LIMIT 200;
END;
$function$;
--> statement-breakpoint
CREATE FUNCTION public.append_modular_chat_turn(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_conversation_id integer,
  p_user_content text,
  p_assistant_content text,
  p_model_id varchar
)
RETURNS TABLE (
  conversation_id integer,
  user_message_id integer,
  assistant_message_id integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_workspace_type varchar;
  v_is_default boolean := false;
  v_user_message_id integer;
  v_assistant_message_id integer;
  v_conversation_title varchar(255);
BEGIN
  v_workspace_type := public.assert_modular_chat_workspace_access(
    p_user_id, p_environment_tenant_id, p_workspace_id
  );
  IF p_user_content IS NULL OR length(p_user_content) NOT BETWEEN 1 AND 12000
     OR p_assistant_content IS NULL OR length(p_assistant_content) NOT BETWEEN 1 AND 24000
     OR p_model_id IS NULL OR length(p_model_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'CHAT_TURN_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT workspace.is_default INTO v_is_default
  FROM public.modular_workspaces AS workspace
  WHERE workspace.environment_tenant_id = p_environment_tenant_id
    AND workspace.id = p_workspace_id
    AND workspace.owner_user_id = p_user_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations AS conversation
    LEFT JOIN public.modular_chat_conversation_scopes AS scope
      ON scope.conversation_id = conversation.id
    WHERE conversation.id = p_conversation_id
      AND conversation."userId" = p_user_id
      AND (
        (scope.conversation_id IS NOT NULL
          AND scope.environment_tenant_id = p_environment_tenant_id
          AND scope.workspace_id = p_workspace_id
          AND scope.owner_user_id = p_user_id)
        OR
        (scope.conversation_id IS NULL
          AND conversation."tenantId" IS NOT DISTINCT FROM
            CASE WHEN v_workspace_type = 'personal' THEN NULL ELSE p_workspace_id END
          AND (v_workspace_type <> 'personal' OR v_is_default IS TRUE))
      )
  ) THEN
    RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.modular_chat_conversation_scopes (
    environment_tenant_id, workspace_id, conversation_id, owner_user_id
  ) VALUES (p_environment_tenant_id, p_workspace_id, p_conversation_id, p_user_id)
  ON CONFLICT (conversation_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.modular_chat_conversation_scopes AS scope
    WHERE scope.conversation_id = p_conversation_id
      AND scope.environment_tenant_id = p_environment_tenant_id
      AND scope.workspace_id = p_workspace_id
      AND scope.owner_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messages ("conversationId", role, content, "modelUsed", "sourceChannel")
  VALUES (p_conversation_id, 'user', p_user_content, NULL, 'web')
  RETURNING id INTO v_user_message_id;
  INSERT INTO public.messages ("conversationId", role, content, "modelUsed", "sourceChannel")
  VALUES (p_conversation_id, 'assistant', p_assistant_content, p_model_id, 'web')
  RETURNING id INTO v_assistant_message_id;

  UPDATE public.conversations AS conversation
  SET "messageCount" = conversation."messageCount" + 2,
      "updatedAt" = now(),
      title = CASE
        WHEN conversation.title = 'New Chat' THEN left(regexp_replace(btrim(p_user_content), '\s+', ' ', 'g'), 80)
        ELSE conversation.title
      END,
      model = p_model_id
  WHERE conversation.id = p_conversation_id
    AND conversation."userId" = p_user_id
  RETURNING conversation.title INTO v_conversation_title;

  RETURN QUERY SELECT p_conversation_id, v_user_message_id, v_assistant_message_id, now();
END;
$function$;
--> statement-breakpoint
CREATE FUNCTION public.get_modular_chat_provider_config(
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
  RETURN QUERY
  SELECT provider."providerName", provider."baseUrl", provider."apiKeyEncrypted",
         mapping."providerModelId", catalog.api_style, catalog.is_free
  FROM public.modular_chat_llm_model_catalog AS catalog
  JOIN public.llm_providers AS provider ON provider.id = catalog.provider_id
  JOIN public.model_provider_map AS mapping
    ON mapping."providerId" = catalog.provider_id AND mapping."modelId" = catalog.model_id
  WHERE catalog.provider_id = p_provider_id
    AND catalog.model_id = p_model_id
    AND catalog.is_free IS TRUE
    AND catalog.api_style = 'chat-completions'
    AND provider."isEnabled" IS TRUE
    AND provider."hasApiKey" IS TRUE
    AND provider."apiKeyEncrypted" IS NOT NULL
    AND mapping."isEnabled" IS TRUE
  LIMIT 1;
END;
$function$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION public.assert_modular_chat_workspace_access(integer, varchar, varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION public.list_modular_chat_conversations(integer, varchar, varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION public.create_modular_chat_conversation(integer, varchar, varchar, varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION public.list_modular_chat_messages(integer, varchar, varchar, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION public.append_modular_chat_turn(integer, varchar, varchar, integer, text, text, varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION public.get_modular_chat_provider_config(integer, varchar, varchar, integer, varchar) FROM PUBLIC;
--> statement-breakpoint
DO $modular_chat_scoped_grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.assert_modular_chat_workspace_access(integer, varchar, varchar) TO modular_core_auth_dev';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.list_modular_chat_conversations(integer, varchar, varchar) TO modular_core_auth_dev';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_modular_chat_conversation(integer, varchar, varchar, varchar) TO modular_core_auth_dev';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.list_modular_chat_messages(integer, varchar, varchar, integer) TO modular_core_auth_dev';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.append_modular_chat_turn(integer, varchar, varchar, integer, text, text, varchar) TO modular_core_auth_dev';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_modular_chat_provider_config(integer, varchar, varchar, integer, varchar) TO modular_core_auth_dev';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.assert_modular_chat_workspace_access(integer, varchar, varchar) TO modular_core_auth_prod';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.list_modular_chat_conversations(integer, varchar, varchar) TO modular_core_auth_prod';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_modular_chat_conversation(integer, varchar, varchar, varchar) TO modular_core_auth_prod';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.list_modular_chat_messages(integer, varchar, varchar, integer) TO modular_core_auth_prod';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.append_modular_chat_turn(integer, varchar, varchar, integer, text, text, varchar) TO modular_core_auth_prod';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_modular_chat_provider_config(integer, varchar, varchar, integer, varchar) TO modular_core_auth_prod';
  END IF;
END $modular_chat_scoped_grants$;
