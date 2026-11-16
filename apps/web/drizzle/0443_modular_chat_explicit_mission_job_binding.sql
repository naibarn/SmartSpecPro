-- Bind a Mission to a canonical Chat Job only when the user explicitly selects
-- that Mission during admission. Job, Attempt and Runner identities stay in
-- their canonical control-plane tables.
DO $preflight$
DECLARE
  v_executor pg_catalog.pg_roles%ROWTYPE;
  v_owner pg_catalog.pg_roles%ROWTYPE;
  v_dispatch_owner name;
  v_admin boolean := current_setting('application_name', true) = 'spec312-r124-single-owner-dev-admin';
BEGIN
  SELECT * INTO v_executor FROM pg_catalog.pg_roles WHERE rolname = current_user;
  SELECT * INTO v_owner FROM pg_catalog.pg_roles WHERE rolname = 'modular_chat_mission_owner';
  SELECT pg_catalog.pg_get_userbyid(proowner) INTO v_dispatch_owner FROM pg_catalog.pg_proc
  WHERE oid = pg_catalog.to_regprocedure(
    'public.create_modular_chat_turn_job(integer,character varying,character varying,integer,text,integer,character varying,character varying)');
  IF current_database() <> 'smartspec' OR v_executor.rolcanlogin IS NOT TRUE
    OR (v_admin AND v_executor.rolsuper IS NOT TRUE)
    OR (NOT v_admin AND (current_user <> 'smartspec_migrator_dev' OR v_executor.rolsuper
      OR v_executor.rolcreatedb OR v_executor.rolcreaterole OR v_executor.rolbypassrls
      OR v_executor.rolreplication OR v_executor.rolinherit
      OR NOT pg_catalog.pg_has_role(current_user, 'modular_chat_mission_owner', 'MEMBER')
      OR NOT pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE')
      OR NOT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
      OR NOT pg_catalog.has_column_privilege(current_user, 'public.worker_jobs', 'id', 'REFERENCES')
      OR NOT pg_catalog.has_column_privilege(current_user, 'public.users', 'id', 'REFERENCES')
      OR NOT pg_catalog.has_column_privilege(current_user, 'public.conversations', 'id', 'REFERENCES')
      OR NOT pg_catalog.has_column_privilege(current_user, 'public.modular_chat_missions', 'id', 'REFERENCES')))
    OR v_owner.oid IS NULL OR v_owner.rolcanlogin OR v_owner.rolsuper OR v_owner.rolcreatedb
    OR v_owner.rolcreaterole OR v_owner.rolbypassrls OR v_owner.rolreplication OR v_owner.rolinherit
    OR NOT pg_catalog.has_schema_privilege(v_owner.oid, 'public', 'CREATE')
    OR (NOT v_admin AND v_dispatch_owner IS DISTINCT FROM current_user)
    OR NOT pg_catalog.has_column_privilege(v_owner.oid, 'public.modular_chat_missions', 'id', 'SELECT')
    OR NOT pg_catalog.has_column_privilege(v_owner.oid, 'public.modular_chat_missions', 'environment_tenant_id', 'SELECT')
    OR NOT pg_catalog.has_column_privilege(v_owner.oid, 'public.modular_chat_missions', 'workspace_id', 'SELECT')
    OR NOT pg_catalog.has_column_privilege(v_owner.oid, 'public.modular_chat_missions', 'owner_user_id', 'SELECT')
    OR NOT pg_catalog.has_column_privilege(v_owner.oid, 'public.modular_chat_missions', 'conversation_id', 'SELECT')
  THEN
    RAISE EXCEPTION 'MIGRATION_BOOTSTRAP_REQUIRED: verified Modular DEV migrator and restricted Mission owner capabilities are required';
  END IF;
END $preflight$;
--> statement-breakpoint

CREATE TABLE public.modular_chat_mission_jobs (
  worker_job_id varchar(36) PRIMARY KEY REFERENCES public.worker_jobs(id) ON DELETE CASCADE,
  environment_tenant_id varchar(64) NOT NULL
    CHECK (environment_tenant_id IN ('modular-development', 'modular-production')),
  workspace_id varchar(36) NOT NULL,
  owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.modular_chat_missions(id) ON DELETE CASCADE,
  conversation_id integer NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT modular_chat_mission_jobs_context_uq
    UNIQUE (environment_tenant_id, workspace_id, owner_user_id, mission_id, worker_job_id)
);
--> statement-breakpoint
CREATE INDEX modular_chat_mission_jobs_mission_idx
  ON public.modular_chat_mission_jobs(environment_tenant_id, workspace_id, owner_user_id, mission_id, created_at);
--> statement-breakpoint
GRANT SELECT (worker_job_id, environment_tenant_id, workspace_id, owner_user_id, mission_id, conversation_id, created_at),
  INSERT (worker_job_id, environment_tenant_id, workspace_id, owner_user_id, mission_id, conversation_id)
  ON public.modular_chat_mission_jobs TO modular_chat_mission_owner;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_modular_chat_turn_job(
  integer, varchar, varchar, integer, text, integer, varchar, varchar
) TO modular_chat_mission_owner;
--> statement-breakpoint

CREATE FUNCTION public.create_modular_chat_turn_job_for_mission(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar,
  p_conversation_id integer, p_prompt text, p_provider_id integer,
  p_model_id varchar, p_idempotency_key varchar, p_mission_id uuid
) RETURNS TABLE(job_id varchar, conversation_id integer, job_status varchar,
  created boolean, outbox_id varchar, outbox_dedupe_key varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_workspace_type varchar;
  v_mission_conversation_id integer;
  v_job record;
  v_bound_mission uuid;
BEGIN
  IF NOT ((session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
          (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')) THEN
    RAISE EXCEPTION 'CHAT_JOB_ENVIRONMENT_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_mission_id IS NULL OR p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'CHAT_MISSION_BINDING_INVALID' USING ERRCODE = '22023';
  END IF;
  v_workspace_type := public.assert_modular_chat_workspace_access(
    p_user_id, p_environment_tenant_id, p_workspace_id
  );
  SELECT mission.conversation_id INTO v_mission_conversation_id
  FROM public.modular_chat_missions mission
  WHERE mission.id = p_mission_id AND mission.environment_tenant_id = p_environment_tenant_id
    AND mission.workspace_id = p_workspace_id AND mission.owner_user_id = p_user_id
    AND mission.conversation_id = p_conversation_id AND mission.lifecycle_status = 'active'
  FOR UPDATE;
  IF NOT FOUND OR v_workspace_type IS NULL THEN
    RAISE EXCEPTION 'CHAT_MISSION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job FROM public.create_modular_chat_turn_job(
    p_user_id, p_environment_tenant_id, p_workspace_id, p_conversation_id,
    p_prompt, p_provider_id, p_model_id, p_idempotency_key
  );
  IF v_job.conversation_id IS DISTINCT FROM v_mission_conversation_id THEN
    RAISE EXCEPTION 'CHAT_MISSION_CONVERSATION_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF NOT v_job.created THEN
    SELECT binding.mission_id INTO v_bound_mission
    FROM public.modular_chat_mission_jobs binding
    WHERE binding.worker_job_id = v_job.job_id
      AND binding.environment_tenant_id = p_environment_tenant_id
      AND binding.workspace_id = p_workspace_id AND binding.owner_user_id = p_user_id
    FOR UPDATE;
    IF NOT FOUND OR v_bound_mission IS DISTINCT FROM p_mission_id THEN
      RAISE EXCEPTION 'CHAT_MISSION_BINDING_CONFLICT' USING ERRCODE = '23505';
    END IF;
  ELSE
    INSERT INTO public.modular_chat_mission_jobs (
      worker_job_id, environment_tenant_id, workspace_id, owner_user_id,
      mission_id, conversation_id
    ) VALUES (
      v_job.job_id, p_environment_tenant_id, p_workspace_id, p_user_id,
      p_mission_id, v_mission_conversation_id
    ) ON CONFLICT (worker_job_id) DO NOTHING;
    SELECT binding.mission_id INTO v_bound_mission
    FROM public.modular_chat_mission_jobs binding
    WHERE binding.worker_job_id = v_job.job_id
      AND binding.environment_tenant_id = p_environment_tenant_id
      AND binding.workspace_id = p_workspace_id AND binding.owner_user_id = p_user_id;
    IF NOT FOUND OR v_bound_mission IS DISTINCT FROM p_mission_id THEN
      RAISE EXCEPTION 'CHAT_MISSION_BINDING_CONFLICT' USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE public.modular_chat_missions SET updated_at = now()
  WHERE id = p_mission_id AND environment_tenant_id = p_environment_tenant_id
    AND workspace_id = p_workspace_id AND owner_user_id = p_user_id;
  RETURN QUERY SELECT v_job.job_id, v_job.conversation_id, v_job.job_status,
    v_job.created, v_job.outbox_id, v_job.outbox_dedupe_key;
END $function$;
--> statement-breakpoint
ALTER FUNCTION public.create_modular_chat_turn_job_for_mission(
  integer, varchar, varchar, integer, text, integer, varchar, varchar, uuid
) OWNER TO modular_chat_mission_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_modular_chat_turn_job_for_mission(
  integer, varchar, varchar, integer, text, integer, varchar, varchar, uuid
) FROM PUBLIC;
--> statement-breakpoint
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.create_modular_chat_turn_job_for_mission(
      integer, varchar, varchar, integer, text, integer, varchar, varchar, uuid
    ) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.create_modular_chat_turn_job_for_mission(
      integer, varchar, varchar, integer, text, integer, varchar, varchar, uuid
    ) TO modular_core_auth_prod;
  END IF;
END $grants$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.list_modular_chat_missions(
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
    mission.lifecycle_status,
    COALESCE((SELECT array_agg(job.id ORDER BY job."createdAt")
      FROM public.modular_chat_mission_jobs binding JOIN public.worker_jobs job ON job.id = binding.worker_job_id
      WHERE binding.mission_id = mission.id AND binding.environment_tenant_id = p_environment_tenant_id
        AND binding.workspace_id = p_workspace_id AND binding.owner_user_id = p_user_id
        AND binding.conversation_id = mission.conversation_id AND job."jobType" = 'modular_chat.turn'
        AND job."requestedByUserId" = p_user_id AND job.environment_tenant_id = p_environment_tenant_id
        AND job.chat_workspace_id = p_workspace_id), ARRAY[]::varchar[]),
    COALESCE((SELECT (array_agg(DISTINCT NULLIF(job."progressJson"->'spec224'->>'runId', ''))
      FILTER (WHERE NULLIF(job."progressJson"->'spec224'->>'runId', '') IS NOT NULL))::varchar[]
      FROM public.modular_chat_mission_jobs binding JOIN public.worker_jobs job ON job.id = binding.worker_job_id
      WHERE binding.mission_id = mission.id AND binding.environment_tenant_id = p_environment_tenant_id
        AND binding.workspace_id = p_workspace_id AND binding.owner_user_id = p_user_id
        AND binding.conversation_id = mission.conversation_id AND job."jobType" = 'modular_chat.turn'
        AND job."requestedByUserId" = p_user_id AND job.environment_tenant_id = p_environment_tenant_id
        AND job.chat_workspace_id = p_workspace_id), ARRAY[]::varchar[]),
    ARRAY[]::varchar[],
    COALESCE((SELECT max(event."eventSequence")::integer FROM public.modular_chat_mission_jobs binding
      JOIN public.worker_jobs job ON job.id = binding.worker_job_id
      JOIN public.worker_job_events event ON event."workerJobId" = job.id
      WHERE binding.mission_id = mission.id AND binding.environment_tenant_id = p_environment_tenant_id
        AND binding.workspace_id = p_workspace_id AND binding.owner_user_id = p_user_id
        AND binding.conversation_id = mission.conversation_id AND job."jobType" = 'modular_chat.turn'
        AND job."requestedByUserId" = p_user_id AND job.environment_tenant_id = p_environment_tenant_id
        AND job.chat_workspace_id = p_workspace_id), 0),
    COALESCE((SELECT array_agg(DISTINCT artifact.id) FROM public.modular_chat_mission_jobs binding
      JOIN public.worker_jobs job ON job.id = binding.worker_job_id
      JOIN public.worker_artifacts artifact ON artifact."workerJobId" = job.id
      WHERE binding.mission_id = mission.id AND binding.environment_tenant_id = p_environment_tenant_id
        AND binding.workspace_id = p_workspace_id AND binding.owner_user_id = p_user_id
        AND binding.conversation_id = mission.conversation_id AND job."jobType" = 'modular_chat.turn'
        AND job."requestedByUserId" = p_user_id AND job.environment_tenant_id = p_environment_tenant_id
        AND job.chat_workspace_id = p_workspace_id AND artifact."artifactType" = 'chat_output_markdown'
        AND (artifact."metadataJson"->>'expiresAt')::timestamptz > now()), ARRAY[]::varchar[]),
    mission.created_at, mission.updated_at
  FROM public.modular_chat_missions mission
  WHERE mission.owner_user_id = p_user_id AND mission.environment_tenant_id = p_environment_tenant_id
    AND mission.workspace_id = p_workspace_id AND (p_conversation_id IS NULL OR mission.conversation_id = p_conversation_id)
  ORDER BY mission.updated_at DESC, mission.id DESC LIMIT 100;
END $function$;
--> statement-breakpoint
ALTER FUNCTION public.list_modular_chat_missions(integer, varchar, varchar, integer) OWNER TO modular_chat_mission_owner;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.list_modular_chat_harness_projection(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar
) RETURNS TABLE(
  harness_id uuid, adapter_id varchar, tool_id varchar, display_name varchar,
  runner_id varchar, runner_name varchar, runner_status varchar,
  trust_state varchar, availability_state varchar, last_heartbeat_at timestamptz,
  expires_at timestamptz, workspace_ids jsonb, entitlement_state varchar,
  capabilities jsonb, dispatch_ready boolean, executions jsonb
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_workspace_type varchar;
BEGIN
  v_workspace_type := public.assert_modular_chat_workspace_access(p_user_id, p_environment_tenant_id, p_workspace_id);
  IF v_workspace_type IS NULL THEN RAISE EXCEPTION 'CHAT_WORKSPACE_ACCESS_DENIED'; END IF;
  RETURN QUERY
  SELECT h.id, h."adapterId", h."toolId", h."displayName", r."runnerId", r."displayName",
    CASE WHEN r."revokedAt" IS NOT NULL THEN 'revoked'
         WHEN r."lastSeenAt" IS NULL OR r."lastSeenAt" < now() - interval '5 minutes' THEN 'offline'
         WHEN h."expiresAt" <= now() THEN 'stale' ELSE r.status END,
    CASE WHEN r."revokedAt" IS NOT NULL THEN 'revoked' ELSE h."trustState" END,
    CASE WHEN h."revokedAt" IS NOT NULL OR r."revokedAt" IS NOT NULL THEN 'disabled'
         WHEN h."expiresAt" <= now() THEN 'stale' ELSE h."availabilityState" END,
    h."lastHeartbeatAt", h."expiresAt", h."workspaceIds", 'unknown'::varchar,
    COALESCE(h."provenanceJson"->'capabilities', '[]'::jsonb),
    COALESCE((r."revokedAt" IS NULL AND r."trustState" = 'trusted' AND r.status = 'online'
      AND r."lastSeenAt" IS NOT NULL AND r."lastSeenAt" >= now() - interval '5 minutes'
      AND h."revokedAt" IS NULL AND h."trustState" = 'trusted' AND h."availabilityState" = 'available'
      AND h."expiresAt" > now() AND h."provenanceJson"->>'authState' = 'authenticated'
      AND h."provenanceJson"->>'healthState' = 'healthy' AND h."provenanceJson"->>'inventoryTrustState' = 'ready'
      AND COALESCE(h."provenanceJson"->'capabilities', '[]'::jsonb) @> jsonb_build_array('tool.execute.' || h."toolId")), false),
    COALESCE(jsonb_agg(jsonb_build_object(
      'jobId', j.id, 'attemptId', a.id, 'attempt', a.attempt,
      'runId', NULLIF(j."progressJson"->'spec224'->>'runId', ''),
      'executionSessionId', s."sessionId",
      'missionId', (SELECT binding.mission_id::varchar FROM public.modular_chat_mission_jobs binding
        WHERE binding.worker_job_id = j.id AND binding.environment_tenant_id = p_environment_tenant_id
          AND binding.workspace_id = p_workspace_id AND binding.owner_user_id = p_user_id
          AND binding.conversation_id = (j."inputJson"->>'conversationId')::integer),
      'conversationId', CASE WHEN j."inputJson"->>'conversationId' ~ '^[0-9]+$'
        THEN (j."inputJson"->>'conversationId')::integer ELSE NULL END,
      'status', j.status,
      'eventCursor', COALESCE((SELECT max(e."eventSequence") FROM public.worker_job_events e
        WHERE e."workerJobId" = j.id AND e."attemptId" = a.id), 0)
    ) ORDER BY j."createdAt" DESC) FILTER (WHERE s."sessionId" IS NOT NULL), '[]'::jsonb)
  FROM public.runner_harness_instances h
  JOIN public.runner_nodes r ON r."runnerId" = h."runnerId" AND r."tenantId" = h."tenantId"
  LEFT JOIN public.runner_execution_sessions s ON s."harnessInstanceId" = h.id AND s."tenantId" = h."tenantId"
    AND EXISTS (SELECT 1 FROM public.worker_jobs scoped_job WHERE scoped_job.id = s."workerJobId"
      AND scoped_job."tenantId" = s."tenantId"
      AND scoped_job.environment_tenant_id = p_environment_tenant_id
      AND scoped_job.chat_workspace_id = p_workspace_id AND scoped_job."requestedByUserId" = p_user_id)
  LEFT JOIN public.worker_jobs j ON j.id = s."workerJobId" AND j."tenantId" = s."tenantId"
    AND j.environment_tenant_id = p_environment_tenant_id AND j.chat_workspace_id = p_workspace_id
    AND j."requestedByUserId" = p_user_id
  LEFT JOIN public.worker_job_attempts a ON a."workerJobId" = j.id AND a.attempt = s."workerJobAttempt"
  WHERE r."ownerUserId" = p_user_id
    AND (h."workspaceIds" @> jsonb_build_array(p_workspace_id) OR s."sessionId" IS NOT NULL)
  GROUP BY h.id, h."adapterId", h."toolId", h."displayName", r."runnerId", r."displayName",
    r."status", r."trustState", r."lastSeenAt", r."revokedAt", h."trustState", h."availabilityState",
    h."lastHeartbeatAt", h."expiresAt", h."workspaceIds", h."revokedAt", h."provenanceJson"
  ORDER BY h."lastHeartbeatAt" DESC NULLS LAST, h.id LIMIT 100;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.list_modular_chat_harness_projection(integer, varchar, varchar)
  OWNER TO modular_chat_mission_owner;
