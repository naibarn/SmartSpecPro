-- Explicit tenant Chat Missions bind a user-owned conversation to its existing
-- canonical Chat Jobs. They never enqueue work or mint execution identities.
-- Owner-role creation and limited source-table reads are prepared by the
-- single DEV owner. Migration execution must use an explicit admin profile or
-- the documented least-privilege migration login; it never creates roles or
-- grants itself SECURITY DEFINER authority.
DO $preflight$
DECLARE
  v_owner oid;
  v_executor pg_catalog.pg_roles%ROWTYPE;
  v_existing_owner name;
  v_single_owner_admin boolean;
BEGIN
  SELECT * INTO v_executor FROM pg_catalog.pg_roles WHERE rolname = current_user;
  v_single_owner_admin := current_setting('application_name', true) = 'spec312-r124-single-owner-dev-admin';
  SELECT oid INTO v_owner FROM pg_catalog.pg_roles WHERE rolname = 'modular_chat_mission_owner';
  IF current_database() <> 'smartspec' OR v_executor.rolcanlogin IS NOT TRUE
    OR (v_single_owner_admin AND v_executor.rolsuper IS NOT TRUE)
    OR (NOT v_single_owner_admin AND (
      current_user <> 'smartspec_migrator_dev' OR v_executor.rolsuper OR v_executor.rolcreatedb
      OR v_executor.rolcreaterole OR v_executor.rolbypassrls OR v_executor.rolreplication OR v_executor.rolinherit
    ))
    OR v_owner IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles owner_role WHERE owner_role.oid = v_owner
      AND NOT owner_role.rolcanlogin AND NOT owner_role.rolsuper AND NOT owner_role.rolcreatedb
      AND NOT owner_role.rolcreaterole AND NOT owner_role.rolbypassrls
      AND NOT owner_role.rolreplication AND NOT owner_role.rolinherit)
    OR (NOT v_single_owner_admin AND NOT pg_catalog.pg_has_role(current_user, v_owner, 'MEMBER'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE'))
    OR NOT pg_catalog.has_schema_privilege(v_owner, 'public', 'CREATE')
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_column_privilege(current_user, 'public.users', 'id', 'REFERENCES'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_column_privilege(current_user, 'public.conversations', 'id', 'REFERENCES'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_column_privilege(current_user, 'public.modular_workspaces', 'environment_tenant_id', 'REFERENCES'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_column_privilege(current_user, 'public.modular_workspaces', 'id', 'REFERENCES'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_schema_privilege(current_user, 'drizzle', 'USAGE'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_schema_privilege(current_user, 'drizzle', 'CREATE'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'SELECT'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'INSERT'))
    OR (NOT v_single_owner_admin AND NOT pg_catalog.has_sequence_privilege(current_user, 'drizzle.__drizzle_migrations_id_seq', 'USAGE'))
    OR NOT pg_catalog.has_function_privilege(v_owner,
      'public.assert_modular_chat_workspace_access(integer,character varying,character varying)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'MIGRATION_BOOTSTRAP_REQUIRED: explicit DEV admin profile or prepared least-privilege migrator and restricted modular_chat_mission_owner role are required';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(proowner) INTO v_existing_owner
  FROM pg_catalog.pg_proc
  WHERE oid = pg_catalog.to_regprocedure(
    'public.list_modular_chat_task_control_projection(integer,character varying,character varying,integer)');
  IF NOT v_single_owner_admin AND v_existing_owner IS DISTINCT FROM current_user THEN
    RAISE EXCEPTION 'MIGRATION_BOOTSTRAP_REQUIRED: transfer the existing Task Control function to the migration login before 0441';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.users', 'id'),
      ('public.conversations', 'id'), ('public.conversations', 'userId'),
      ('public.conversations', 'isArchived'), ('public.conversations', 'trashedAt'), ('public.conversations', 'tenantId'),
      ('public.modular_workspaces', 'environment_tenant_id'), ('public.modular_workspaces', 'id'),
      ('public.modular_workspaces', 'owner_user_id'), ('public.modular_workspaces', 'is_default'), ('public.modular_workspaces', 'workspace_type'),
      ('public.modular_chat_conversation_scopes', 'conversation_id'), ('public.modular_chat_conversation_scopes', 'environment_tenant_id'),
      ('public.modular_chat_conversation_scopes', 'workspace_id'), ('public.modular_chat_conversation_scopes', 'owner_user_id'),
      ('public.worker_jobs', 'id'), ('public.worker_jobs', 'jobType'), ('public.worker_jobs', 'requestedByUserId'),
      ('public.worker_jobs', 'environment_tenant_id'), ('public.worker_jobs', 'chat_workspace_id'), ('public.worker_jobs', 'thread_id'),
      ('public.worker_jobs', 'inputJson'), ('public.worker_jobs', 'createdAt'), ('public.worker_jobs', 'startedAt'),
      ('public.worker_jobs', 'heartbeatAt'), ('public.worker_jobs', 'finishedAt'), ('public.worker_jobs', 'progressJson'), ('public.worker_jobs', 'status'),
      ('public.worker_job_attempts', 'id'), ('public.worker_job_attempts', 'workerJobId'), ('public.worker_job_attempts', 'attempt'),
      ('public.worker_job_events', 'workerJobId'), ('public.worker_job_events', 'eventSequence'),
      ('public.worker_artifacts', 'id'), ('public.worker_artifacts', 'workerJobId'),
      ('public.worker_artifacts', 'artifactType'), ('public.worker_artifacts', 'metadataJson')
    ) AS required(relation_name, column_name)
    WHERE NOT pg_catalog.has_column_privilege(v_owner, required.relation_name, required.column_name, 'SELECT')
  ) THEN
    RAISE EXCEPTION 'MIGRATION_BOOTSTRAP_REQUIRED: grant modular_chat_mission_owner the documented narrow projection reads';
  END IF;
END $preflight$;
--> statement-breakpoint

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

GRANT SELECT (id, environment_tenant_id, workspace_id, owner_user_id, conversation_id, lifecycle_status, created_at, updated_at),
  INSERT (environment_tenant_id, workspace_id, owner_user_id, conversation_id),
  UPDATE (updated_at) ON public.modular_chat_missions TO modular_chat_mission_owner;
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

-- Repair the 0439 Task Control projection's reference to the absent Job.updatedAt.
-- Keep the existing API and ACL while deriving freshness from canonical Job timestamps.
CREATE OR REPLACE FUNCTION public.list_modular_chat_task_control_projection(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar, p_conversation_id integer
)
RETURNS TABLE(task_id varchar, job_id varchar, workspace_id varchar, thread_id uuid,
  conversation_id integer, run_id varchar, attempt_id varchar, execution_status varchar,
  agent_id varchar, harness_id varchar, executor_id varchar, machine_id varchar,
  event_cursor integer, artifact_ids varchar[], updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_workspace_type varchar; v_is_default boolean := false;
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
  RETURN QUERY SELECT job.id, job.id, job.chat_workspace_id, job.thread_id, p_conversation_id,
      NULLIF(job."progressJson"->'spec224'->>'runId', '')::varchar,
      (SELECT attempt.id FROM public.worker_job_attempts attempt
        WHERE attempt."workerJobId" = job.id ORDER BY attempt.attempt DESC LIMIT 1),
      job.status::varchar, NULL::varchar, NULL::varchar, NULL::varchar, NULL::varchar,
      COALESCE((SELECT max(event."eventSequence") FROM public.worker_job_events event
        WHERE event."workerJobId" = job.id), 0)::integer,
      COALESCE(array_agg(DISTINCT artifact.id) FILTER (WHERE artifact.id IS NOT NULL), ARRAY[]::varchar[]),
      COALESCE(job."finishedAt", job."heartbeatAt", job."startedAt", job."createdAt")
    FROM public.worker_jobs job
    LEFT JOIN public.worker_artifacts artifact ON artifact."workerJobId" = job.id
      AND artifact."artifactType" = 'chat_output_markdown'
      AND (artifact."metadataJson"->>'expiresAt')::timestamptz > now()
    WHERE job."jobType" = 'modular_chat.turn' AND job."requestedByUserId" = p_user_id
      AND job.environment_tenant_id = p_environment_tenant_id AND job.chat_workspace_id = p_workspace_id
      AND (job."inputJson"->>'conversationId')::integer = p_conversation_id
    GROUP BY job.id ORDER BY job."createdAt" DESC, job.id DESC LIMIT 100;
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
    mission.lifecycle_status,
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
--> statement-breakpoint

ALTER FUNCTION public.create_modular_chat_mission(integer, varchar, varchar, integer)
  OWNER TO modular_chat_mission_owner;
ALTER FUNCTION public.list_modular_chat_missions(integer, varchar, varchar, integer)
  OWNER TO modular_chat_mission_owner;
ALTER FUNCTION public.list_modular_chat_task_control_projection(integer, varchar, varchar, integer)
  OWNER TO modular_chat_mission_owner;
