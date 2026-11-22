-- Extend the authorized Task projection with bounded, attempt-scoped execution evidence.
GRANT SELECT ("runnerId", "leaseGeneration", "terminalClass", "startedAt", "finishedAt")
  ON public.worker_job_attempts TO modular_chat_mission_owner;
GRANT SELECT ("outputJson") ON public.worker_jobs TO modular_chat_mission_owner;
GRANT SELECT ("leaseFencingVersion", generation) ON public.runner_execution_sessions TO modular_chat_mission_owner;
GRANT CREATE ON SCHEMA public TO modular_chat_mission_owner;
--> statement-breakpoint
SET LOCAL ROLE modular_chat_mission_owner;
--> statement-breakpoint
CREATE FUNCTION public.list_modular_chat_task_execution_provenance(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar, p_conversation_id integer
) RETURNS TABLE(task_id varchar, job_id varchar, workspace_id varchar, thread_id uuid,
  conversation_id integer, run_id varchar, attempt_id varchar, execution_status varchar,
  agent_id varchar, harness_id varchar, executor_id varchar, machine_id varchar,
  event_cursor integer, artifact_ids varchar[], updated_at timestamptz, execution_attempts jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
  SELECT scoped.*, COALESCE(history.attempts, '[]'::jsonb)
  FROM public.list_modular_chat_task_control_projection(
    p_user_id, p_environment_tenant_id, p_workspace_id, p_conversation_id
  ) AS scoped
  JOIN public.worker_jobs job ON job.id = scoped.job_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'attemptId', attempt.id,
      'number', attempt.attempt,
      'terminalClass', attempt."terminalClass",
      'startedAt', to_char(attempt."startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'finishedAt', to_char(attempt."finishedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'route', CASE WHEN attempt."runnerId" = 'modular-chat-queue-consumer' THEN 'gateway'
        WHEN harness.id IS NOT NULL THEN 'harness'
        WHEN runner."runnerId" IS NOT NULL THEN 'runner' ELSE 'unrecorded' END,
      'gateway', CASE WHEN attempt."runnerId" = 'modular-chat-queue-consumer' THEN 'openrouter' END,
      'runnerId', runner."runnerId",
      'adapterId', harness."adapterId",
      'harnessId', harness.id,
      'sessionId', execution."sessionId",
      'resultModel', CASE WHEN attempt.id = scoped.attempt_id AND attempt."terminalClass" = 'succeeded'
        AND job."outputJson"->>'modelId' ~ '^[A-Za-z0-9][A-Za-z0-9_.+-]*(/[A-Za-z0-9][A-Za-z0-9_.:+-]*)?$'
        AND length(job."outputJson"->>'modelId') <= 200
        THEN job."outputJson"->>'modelId' END,
      'creditsUsed', CASE WHEN attempt.id = scoped.attempt_id AND attempt."terminalClass" = 'succeeded'
        AND job."outputJson"->>'creditsUsed' ~ '^[0-9]{1,15}$' THEN (job."outputJson"->>'creditsUsed')::bigint END,
      'artifactIds', ARRAY(SELECT artifact.id FROM public.worker_artifacts artifact
        WHERE artifact.id = ANY(scoped.artifact_ids) AND artifact."workerJobId" = scoped.job_id
          AND artifact."metadataJson"->>'attemptId' = attempt.id ORDER BY artifact.id)
    ) ORDER BY attempt.attempt DESC) AS attempts
    FROM (
      SELECT a.id, a.attempt, a."runnerId", a."leaseGeneration", a."terminalClass", a."startedAt", a."finishedAt"
      FROM public.worker_job_attempts a
      WHERE a."workerJobId" = scoped.job_id
      ORDER BY a.attempt DESC LIMIT 10
    ) AS attempt
    LEFT JOIN public.runner_nodes runner
      ON runner."runnerId" = attempt."runnerId" AND runner."tenantId" = job."tenantId"
      AND runner."ownerUserId" = p_user_id AND attempt."runnerId" <> 'modular-chat-queue-consumer'
    LEFT JOIN LATERAL (
      SELECT s."sessionId", s."harnessInstanceId"
      FROM public.runner_execution_sessions s
      WHERE s."tenantId" = runner."tenantId" AND s."runnerId" = runner."runnerId"
        AND s."workerJobId" = scoped.job_id AND s."workerJobAttempt" = attempt.attempt
        AND s."leaseFencingVersion" = attempt."leaseGeneration"
      ORDER BY s.generation DESC LIMIT 1
    ) AS execution ON true
    LEFT JOIN public.runner_harness_instances harness
      ON harness.id = execution."harnessInstanceId" AND harness."tenantId" = runner."tenantId"
      AND harness."runnerId" = runner."runnerId"
  ) AS history ON true
  ORDER BY job."createdAt" DESC, job.id DESC
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_modular_chat_task_execution_provenance(integer, varchar, varchar, integer) FROM PUBLIC;
--> statement-breakpoint
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_task_execution_provenance(integer, varchar, varchar, integer) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_task_execution_provenance(integer, varchar, varchar, integer) TO modular_core_auth_prod;
  END IF;
END $grants$;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM modular_chat_mission_owner;
