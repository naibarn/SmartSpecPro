-- Native Harness instances are authenticated Runner inventory projections.
-- worker_jobs and execution attempts remain canonical execution authority.
DO $preflight$
DECLARE
  v_executor pg_catalog.pg_roles%ROWTYPE;
  v_owner pg_catalog.pg_roles%ROWTYPE;
  v_single_owner_admin boolean := current_setting('application_name', true) = 'spec312-r124-single-owner-dev-admin';
BEGIN
  SELECT * INTO v_executor FROM pg_catalog.pg_roles WHERE rolname = current_user;
  SELECT * INTO v_owner FROM pg_catalog.pg_roles WHERE rolname = 'modular_chat_mission_owner';
  IF current_database() <> 'smartspec' OR v_executor.rolcanlogin IS NOT TRUE
    OR (v_single_owner_admin AND v_executor.rolsuper IS NOT TRUE)
    OR (NOT v_single_owner_admin AND (
      current_user <> 'smartspec_migrator_dev' OR v_executor.rolsuper OR v_executor.rolcreatedb
      OR v_executor.rolcreaterole OR v_executor.rolbypassrls OR v_executor.rolreplication OR v_executor.rolinherit
      OR NOT pg_catalog.pg_has_role(current_user, 'modular_chat_mission_owner', 'MEMBER')
      OR NOT pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE')
      OR NOT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relname = 'runner_execution_sessions'
          AND (relation.relowner = v_executor.oid OR pg_catalog.pg_has_role(current_user, relation.relowner, 'USAGE')))
    ))
    OR v_owner.oid IS NULL OR v_owner.rolcanlogin OR v_owner.rolsuper OR v_owner.rolcreatedb
    OR v_owner.rolcreaterole OR v_owner.rolbypassrls OR v_owner.rolreplication OR v_owner.rolinherit
    OR NOT pg_catalog.has_function_privilege(v_owner.oid,
      'public.assert_modular_chat_workspace_access(integer,character varying,character varying)', 'EXECUTE')
    OR NOT pg_catalog.has_schema_privilege(v_owner.oid, 'public', 'CREATE')
  THEN RAISE EXCEPTION 'MIGRATION_BOOTSTRAP_REQUIRED: verified smartspec DEV migration authority and restricted projection owner are required'; END IF;
END $preflight$;
--> statement-breakpoint

CREATE TABLE "runner_harness_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "runnerId" varchar(160) NOT NULL REFERENCES "runner_nodes"("runnerId") ON DELETE CASCADE,
  "adapterId" varchar(128) NOT NULL,
  "toolId" varchar(160) NOT NULL,
  "displayName" varchar(255) NOT NULL,
  "adapterVersion" varchar(64),
  "trustState" varchar(32) NOT NULL,
  "availabilityState" varchar(32) NOT NULL,
  "workspaceIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "capabilitySnapshotRevision" varchar(128) NOT NULL,
  "provenanceJson" jsonb NOT NULL,
  "registeredAt" timestamptz NOT NULL DEFAULT now(),
  "lastHeartbeatAt" timestamptz,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "runner_harness_instances_trust_check" CHECK ("trustState" IN ('trusted','pending','degraded','revoked','quarantined')),
  CONSTRAINT "runner_harness_instances_availability_check" CHECK ("availabilityState" IN ('available','busy','stale','disabled','unavailable'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "runner_harness_instances_source_unique"
  ON "runner_harness_instances" ("tenantId", "runnerId", "adapterId", "toolId");
--> statement-breakpoint
CREATE INDEX "runner_harness_instances_workspace_idx"
  ON "runner_harness_instances" USING gin ("workspaceIds");
--> statement-breakpoint
CREATE INDEX "runner_harness_instances_freshness_idx"
  ON "runner_harness_instances" ("tenantId", "expiresAt", "revokedAt");
--> statement-breakpoint
ALTER TABLE "runner_execution_sessions"
  ADD COLUMN "harnessInstanceId" uuid REFERENCES "runner_harness_instances"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "runner_execution_sessions_harness_idx"
  ON "runner_execution_sessions" ("tenantId", "harnessInstanceId", "workerJobId");
--> statement-breakpoint

GRANT SELECT ("id", "tenantId", "runnerId", "adapterId", "toolId", "displayName", "trustState", "availabilityState", "workspaceIds", "provenanceJson", "lastHeartbeatAt", "expiresAt", "revokedAt")
  ON public.runner_harness_instances TO modular_chat_mission_owner;
GRANT SELECT ("runnerId", "tenantId", "ownerUserId", "displayName", "status", "trustState", "lastSeenAt", "revokedAt")
  ON public.runner_nodes TO modular_chat_mission_owner;
GRANT SELECT ("tenantId", "workerJobId", "workerJobAttempt", "runnerId", "harnessInstanceId", "sessionId", "state", "driverId")
  ON public.runner_execution_sessions TO modular_chat_mission_owner;
GRANT SELECT ("workerJobId", "attemptId", "eventSequence")
  ON public.worker_job_events TO modular_chat_mission_owner;
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
DECLARE
  v_workspace_type varchar;
BEGIN
  v_workspace_type := public.assert_modular_chat_workspace_access(p_user_id, p_environment_tenant_id, p_workspace_id);
  IF v_workspace_type IS NULL THEN RAISE EXCEPTION 'CHAT_WORKSPACE_ACCESS_DENIED'; END IF;
  RETURN QUERY
  SELECT h.id, h."adapterId", h."toolId", h."displayName", r."runnerId", r."displayName",
    CASE WHEN r."revokedAt" IS NOT NULL THEN 'revoked'
         WHEN r."lastSeenAt" IS NULL OR r."lastSeenAt" < now() - interval '5 minutes' THEN 'offline'
         WHEN h."expiresAt" <= now() THEN 'stale'
         ELSE r.status END,
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
      'jobId', j.id,
      'attemptId', a.id,
      'attempt', a.attempt,
      'runId', NULLIF(j."progressJson"->'spec224'->>'runId', ''),
      'executionSessionId', s."sessionId",
      'missionId', NULL::varchar,
      'conversationId', CASE WHEN j."inputJson"->>'conversationId' ~ '^[0-9]+$'
        THEN (j."inputJson"->>'conversationId')::integer ELSE NULL END,
      'status', j.status,
      'eventCursor', COALESCE((SELECT max(e."eventSequence") FROM public.worker_job_events e
        WHERE e."workerJobId" = j.id AND e."attemptId" = a.id), 0)
    ) ORDER BY j."createdAt" DESC) FILTER (WHERE s."sessionId" IS NOT NULL), '[]'::jsonb)
  FROM public.runner_harness_instances h
  JOIN public.runner_nodes r ON r."runnerId" = h."runnerId" AND r."tenantId" = h."tenantId"
  LEFT JOIN public.runner_execution_sessions s ON s."harnessInstanceId" = h.id AND s."tenantId" = h."tenantId"
    AND EXISTS (SELECT 1 FROM public.worker_jobs scoped_job
      WHERE scoped_job.id = s."workerJobId" AND scoped_job."tenantId" = s."tenantId"
        AND scoped_job."environment_tenant_id" = p_environment_tenant_id
        AND scoped_job."chat_workspace_id" = p_workspace_id
        AND scoped_job."requestedByUserId" = p_user_id)
  LEFT JOIN public.worker_jobs j ON j.id = s."workerJobId" AND j."tenantId" = s."tenantId"
    AND j."environment_tenant_id" = p_environment_tenant_id AND j."chat_workspace_id" = p_workspace_id
    AND j."requestedByUserId" = p_user_id
  LEFT JOIN public.worker_job_attempts a ON a."workerJobId" = j.id AND a.attempt = s."workerJobAttempt"
  WHERE r."ownerUserId" = p_user_id
    AND (h."workspaceIds" @> jsonb_build_array(p_workspace_id) OR s."sessionId" IS NOT NULL)
  GROUP BY h.id, h."adapterId", h."toolId", h."displayName", r."runnerId", r."displayName",
    r."status", r."trustState", r."lastSeenAt", r."revokedAt", h."trustState", h."availabilityState",
    h."lastHeartbeatAt", h."expiresAt", h."workspaceIds", h."revokedAt", h."provenanceJson"
  ORDER BY h."lastHeartbeatAt" DESC NULLS LAST, h.id
  LIMIT 100;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.list_modular_chat_harness_projection(integer, varchar, varchar)
  OWNER TO modular_chat_mission_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_modular_chat_harness_projection(integer, varchar, varchar) FROM PUBLIC;
--> statement-breakpoint
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_harness_projection(integer, varchar, varchar) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_harness_projection(integer, varchar, varchar) TO modular_core_auth_prod;
  END IF;
END $grants$;
