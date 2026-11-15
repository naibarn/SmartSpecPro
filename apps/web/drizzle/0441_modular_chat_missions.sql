-- Explicit tenant Chat Missions bind a user-owned conversation to its existing
-- canonical Chat Jobs. They never enqueue work or mint execution identities.
CREATE TABLE public.modular_chat_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_tenant_id varchar(64) NOT NULL
    CHECK (environment_tenant_id IN ('modular-development', 'modular-production')),
  workspace_id varchar(36) NOT NULL,
  owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id integer NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  lifecycle_status varchar NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT modular_chat_missions_workspace_fk
    FOREIGN KEY (environment_tenant_id, workspace_id)
    REFERENCES public.modular_workspaces(environment_tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT modular_chat_missions_conversation_uq
    UNIQUE (environment_tenant_id, workspace_id, owner_user_id, conversation_id)
);
CREATE INDEX modular_chat_missions_owner_idx
  ON public.modular_chat_missions(environment_tenant_id, workspace_id, owner_user_id, updated_at DESC);
--> statement-breakpoint

CREATE FUNCTION public.create_modular_chat_mission(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar, p_conversation_id integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_workspace_type varchar; v_is_default boolean := false; v_mission_id uuid;
BEGIN
  v_workspace_type := public.assert_modular_chat_workspace_access(p_user_id, p_environment_tenant_id, p_workspace_id);
  SELECT workspace.is_default INTO v_is_default FROM public.modular_workspaces workspace
    WHERE workspace.environment_tenant_id = p_environment_tenant_id AND workspace.id = p_workspace_id
      AND workspace.owner_user_id = p_user_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations conversation
    LEFT JOIN public.modular_chat_conversation_scopes scope ON scope.conversation_id = conversation.id
    WHERE conversation.id = p_conversation_id AND conversation."userId" = p_user_id
      AND conversation."isArchived" IS FALSE AND conversation."trashedAt" IS NULL
      AND ((scope.conversation_id IS NOT NULL AND scope.environment_tenant_id = p_environment_tenant_id
          AND scope.workspace_id = p_workspace_id AND scope.owner_user_id = p_user_id)
        OR (scope.conversation_id IS NULL AND conversation."tenantId" IS NOT DISTINCT FROM
          CASE WHEN v_workspace_type = 'personal' THEN NULL ELSE p_workspace_id END
          AND (v_workspace_type <> 'personal' OR v_is_default IS TRUE)))
  ) THEN RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.modular_chat_missions(environment_tenant_id, workspace_id, owner_user_id, conversation_id)
  VALUES (p_environment_tenant_id, p_workspace_id, p_user_id, p_conversation_id)
  ON CONFLICT (environment_tenant_id, workspace_id, owner_user_id, conversation_id)
    DO UPDATE SET updated_at = public.modular_chat_missions.updated_at
  RETURNING id INTO v_mission_id;
  RETURN v_mission_id;
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.list_modular_chat_missions(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar, p_conversation_id integer DEFAULT NULL
) RETURNS TABLE(mission_id uuid, tenant_id varchar, workspace_id varchar, project_id varchar,
  session_id varchar, thread_id varchar, conversation_id integer, status varchar, job_ids varchar[],
  run_ids varchar[], agent_ids varchar[], event_cursor integer, artifact_ids varchar[], created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_workspace_type varchar; v_is_default boolean := false;
BEGIN
  v_workspace_type := public.assert_modular_chat_workspace_access(p_user_id, p_environment_tenant_id, p_workspace_id);
  SELECT workspace.is_default INTO v_is_default FROM public.modular_workspaces workspace
    WHERE workspace.environment_tenant_id = p_environment_tenant_id AND workspace.id = p_workspace_id
      AND workspace.owner_user_id = p_user_id;
  IF p_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations conversation
    LEFT JOIN public.modular_chat_conversation_scopes scope ON scope.conversation_id = conversation.id
    WHERE conversation.id = p_conversation_id AND conversation."userId" = p_user_id
      AND conversation."isArchived" IS FALSE AND conversation."trashedAt" IS NULL
      AND ((scope.conversation_id IS NOT NULL AND scope.environment_tenant_id = p_environment_tenant_id
          AND scope.workspace_id = p_workspace_id AND scope.owner_user_id = p_user_id)
        OR (scope.conversation_id IS NULL AND conversation."tenantId" IS NOT DISTINCT FROM
          CASE WHEN v_workspace_type = 'personal' THEN NULL ELSE p_workspace_id END
          AND (v_workspace_type <> 'personal' OR v_is_default IS TRUE)))
  ) THEN RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT mission.id, mission.environment_tenant_id, mission.workspace_id,
    NULL::varchar, NULL::varchar, NULL::varchar, mission.conversation_id,
    COALESCE((SELECT job.status::varchar FROM public.worker_jobs job
      WHERE job."jobType" = 'modular_chat.turn' AND job."requestedByUserId" = p_user_id
        AND job.environment_tenant_id = p_environment_tenant_id AND job.chat_workspace_id = p_workspace_id
        AND (job."inputJson"->>'conversationId')::integer = mission.conversation_id
      ORDER BY job."updatedAt" DESC LIMIT 1), mission.lifecycle_status),
    COALESCE((SELECT array_agg(job.id ORDER BY job."createdAt") FROM public.worker_jobs job
      WHERE job."jobType" = 'modular_chat.turn' AND job."requestedByUserId" = p_user_id
        AND job.environment_tenant_id = p_environment_tenant_id AND job.chat_workspace_id = p_workspace_id
        AND (job."inputJson"->>'conversationId')::integer = mission.conversation_id), ARRAY[]::varchar[]),
    COALESCE((SELECT (array_agg(DISTINCT NULLIF(job."progressJson"->'spec224'->>'runId', ''))
      FILTER (WHERE NULLIF(job."progressJson"->'spec224'->>'runId', '') IS NOT NULL))::varchar[]
      FROM public.worker_jobs job WHERE job."jobType" = 'modular_chat.turn'
        AND job."requestedByUserId" = p_user_id AND job.environment_tenant_id = p_environment_tenant_id
        AND job.chat_workspace_id = p_workspace_id AND (job."inputJson"->>'conversationId')::integer = mission.conversation_id), ARRAY[]::varchar[]),
    ARRAY[]::varchar[],
    COALESCE((SELECT max(event."eventSequence")::integer FROM public.worker_job_events event
      JOIN public.worker_jobs job ON job.id = event."workerJobId"
      WHERE job."jobType" = 'modular_chat.turn' AND job."requestedByUserId" = p_user_id
        AND job.environment_tenant_id = p_environment_tenant_id AND job.chat_workspace_id = p_workspace_id
        AND (job."inputJson"->>'conversationId')::integer = mission.conversation_id), 0),
    COALESCE((SELECT array_agg(DISTINCT artifact.id) FROM public.worker_artifacts artifact
      JOIN public.worker_jobs job ON job.id = artifact."workerJobId"
      WHERE artifact."artifactType" = 'chat_output_markdown' AND job."jobType" = 'modular_chat.turn'
        AND job."requestedByUserId" = p_user_id AND job.environment_tenant_id = p_environment_tenant_id
        AND job.chat_workspace_id = p_workspace_id AND (job."inputJson"->>'conversationId')::integer = mission.conversation_id
        AND (artifact."metadataJson"->>'expiresAt')::timestamptz > now()), ARRAY[]::varchar[]),
    mission.created_at, mission.updated_at
  FROM public.modular_chat_missions mission
  WHERE mission.owner_user_id = p_user_id AND mission.environment_tenant_id = p_environment_tenant_id
    AND mission.workspace_id = p_workspace_id AND (p_conversation_id IS NULL OR mission.conversation_id = p_conversation_id)
  ORDER BY mission.updated_at DESC, mission.id DESC LIMIT 100;
END $function$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.create_modular_chat_mission(integer, varchar, varchar, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_modular_chat_missions(integer, varchar, varchar, integer) FROM PUBLIC;
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.create_modular_chat_mission(integer, varchar, varchar, integer) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_missions(integer, varchar, varchar, integer) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.create_modular_chat_mission(integer, varchar, varchar, integer) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_missions(integer, varchar, varchar, integer) TO modular_core_auth_prod;
  END IF;
END $grants$;
