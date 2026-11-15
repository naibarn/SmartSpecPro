-- Replay Chat execution events from the canonical worker_job_events ledger.
-- Cursor is eventSequence scoped to one job; append_modular_chat_job_event locks
-- that job row before allocating sequence, so reconnects cannot skip a committed
-- event for the subscription.
CREATE FUNCTION public.list_modular_chat_job_events(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_job_id varchar,
  p_after_sequence integer DEFAULT 0,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  event_id varchar,
  event_sequence integer,
  event_type varchar,
  created_at timestamptz,
  safe_payload jsonb,
  job_id varchar,
  conversation_id integer,
  job_status varchar,
  attempt_id varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_after_sequence < 0 OR p_limit < 1 OR p_limit > 100 OR NOT (
    (session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
    (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')
  ) THEN
    RAISE EXCEPTION 'CHAT_EVENT_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_modular_chat_workspace_access(p_user_id, p_environment_tenant_id, p_workspace_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.worker_jobs AS job
    WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
      AND job."requestedByUserId" = p_user_id
      AND job.environment_tenant_id = p_environment_tenant_id
      AND job.chat_workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'CHAT_JOB_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT event.id, event."eventSequence", event."eventType", event."createdAt",
         COALESCE((SELECT jsonb_object_agg(item.key, item.value)
           FROM jsonb_each(event."payloadJson") AS item
           WHERE item.key = ANY (ARRAY[
             'phase', 'status', 'errorCode', 'attempt', 'retryAfterSeconds',
             'modelId', 'promptTokens', 'completionTokens', 'conversationId',
             'source', 'queue', 'contractVersion'
           ])), '{}'::jsonb),
         job.id, NULLIF(job."inputJson"->>'conversationId', '')::integer,
         job.status::varchar, event."attemptId"
  FROM public.worker_job_events AS event
  JOIN public.worker_jobs AS job ON job.id = event."workerJobId"
  WHERE event."workerJobId" = p_job_id AND event."eventSequence" > p_after_sequence
    AND job."jobType" = 'modular_chat.turn'
    AND job."requestedByUserId" = p_user_id
    AND job.environment_tenant_id = p_environment_tenant_id
    AND job.chat_workspace_id = p_workspace_id
  ORDER BY event."eventSequence" ASC
  LIMIT p_limit;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_modular_chat_job_events(integer, varchar, varchar, varchar, integer, integer) FROM PUBLIC;
--> statement-breakpoint
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_job_events(integer, varchar, varchar, varchar, integer, integer) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_job_events(integer, varchar, varchar, varchar, integer, integer) TO modular_core_auth_prod;
  END IF;
END $grants$;
