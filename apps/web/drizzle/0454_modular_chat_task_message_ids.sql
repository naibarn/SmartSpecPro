-- Project message IDs from authorized Jobs so Mission Chat can display its own turns.
GRANT CREATE ON SCHEMA public TO modular_chat_mission_owner;
--> statement-breakpoint
SET LOCAL ROLE modular_chat_mission_owner;
--> statement-breakpoint
CREATE FUNCTION public.list_modular_chat_task_execution_with_messages(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar, p_conversation_id integer
) RETURNS TABLE(task_id varchar, job_id varchar, workspace_id varchar, thread_id uuid,
  conversation_id integer, run_id varchar, attempt_id varchar, execution_status varchar,
  agent_id varchar, harness_id varchar, executor_id varchar, machine_id varchar,
  event_cursor integer, artifact_ids varchar[], updated_at timestamptz, execution_attempts jsonb, message_ids text[])
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
  SELECT scoped.*, ARRAY(
    SELECT message_id
    FROM (VALUES (job."outputJson"->>'userMessageId'), (job."outputJson"->>'assistantMessageId')) AS linked(message_id)
    WHERE message_id ~ '^[1-9][0-9]{0,9}$'
  )
  FROM public.list_modular_chat_task_execution_provenance(
    p_user_id, p_environment_tenant_id, p_workspace_id, p_conversation_id
  ) AS scoped
  JOIN public.worker_jobs job ON job.id = scoped.job_id
  ORDER BY job."createdAt" DESC, job.id DESC
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_modular_chat_task_execution_with_messages(integer, varchar, varchar, integer) FROM PUBLIC;
--> statement-breakpoint
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_task_execution_with_messages(integer, varchar, varchar, integer) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_task_execution_with_messages(integer, varchar, varchar, integer) TO modular_core_auth_prod;
  END IF;
END $grants$;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM modular_chat_mission_owner;
