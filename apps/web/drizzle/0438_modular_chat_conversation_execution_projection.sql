-- Read the canonical Chat -> worker job -> attempt/event relationship without
-- creating a parallel Run, Agent, Harness, or Executor identity.
CREATE FUNCTION public.list_modular_chat_conversation_execution(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_conversation_id integer
)
RETURNS TABLE(job_id varchar, job_status varchar, attempt_id varchar, event_cursor integer)
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
    AND workspace.id = p_workspace_id AND workspace.owner_user_id = p_user_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations AS conversation
    LEFT JOIN public.modular_chat_conversation_scopes AS scope
      ON scope.conversation_id = conversation.id
    WHERE conversation.id = p_conversation_id AND conversation."userId" = p_user_id
      AND conversation."isArchived" IS FALSE AND conversation."trashedAt" IS NULL
      AND (
        (scope.conversation_id IS NOT NULL
          AND scope.environment_tenant_id = p_environment_tenant_id
          AND scope.workspace_id = p_workspace_id AND scope.owner_user_id = p_user_id)
        OR (scope.conversation_id IS NULL
          AND conversation."tenantId" IS NOT DISTINCT FROM
            CASE WHEN v_workspace_type = 'personal' THEN NULL ELSE p_workspace_id END
          AND (v_workspace_type <> 'personal' OR v_is_default IS TRUE))
      )
  ) THEN
    RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT job.id, job.status::varchar,
         (SELECT event."attemptId" FROM public.worker_job_events AS event
           WHERE event."workerJobId" = job.id AND event."attemptId" IS NOT NULL
           ORDER BY event."eventSequence" DESC LIMIT 1),
         COALESCE((SELECT max(event."eventSequence") FROM public.worker_job_events AS event
           WHERE event."workerJobId" = job.id), 0)::integer
  FROM public.worker_jobs AS job
  WHERE job."jobType" = 'modular_chat.turn'
    AND job."requestedByUserId" = p_user_id
    AND job.environment_tenant_id = p_environment_tenant_id
    AND job.chat_workspace_id = p_workspace_id
    AND (job."inputJson"->>'conversationId')::integer = p_conversation_id
  ORDER BY job."createdAt" ASC, job.id ASC;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::varchar, NULL::varchar, NULL::varchar, 0::integer;
  END IF;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_modular_chat_conversation_execution(integer, varchar, varchar, integer) FROM PUBLIC;
--> statement-breakpoint
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_conversation_execution(integer, varchar, varchar, integer) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_conversation_execution(integer, varchar, varchar, integer) TO modular_core_auth_prod;
  END IF;
END $grants$;
