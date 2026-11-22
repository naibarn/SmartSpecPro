-- An explicit user action may organize a recorded Chat Job under a Mission.
-- This operation writes the association only and does not submit a turn.
GRANT CREATE ON SCHEMA public TO modular_chat_mission_owner;
--> statement-breakpoint
SET LOCAL ROLE modular_chat_mission_owner;
--> statement-breakpoint
CREATE FUNCTION public.attach_modular_chat_job_to_mission(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar,
  p_conversation_id integer, p_job_id varchar
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_mission_id uuid;
BEGIN
  IF NOT ((session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
          (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')) THEN
    RAISE EXCEPTION 'CHAT_JOB_ENVIRONMENT_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Reuse the canonical workspace and conversation ownership checks.
  v_mission_id := public.create_modular_chat_mission(p_user_id, p_environment_tenant_id, p_workspace_id, p_conversation_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.worker_jobs job WHERE job.id = p_job_id
    AND job."jobType" = 'modular_chat.turn' AND job."requestedByUserId" = p_user_id
    AND job.environment_tenant_id = p_environment_tenant_id AND job.chat_workspace_id = p_workspace_id
    AND job."inputJson"->>'conversationId' = p_conversation_id::text
  ) THEN RAISE EXCEPTION 'CHAT_MISSION_JOB_NOT_FOUND' USING ERRCODE = '42501'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.modular_chat_missions WHERE id = v_mission_id AND lifecycle_status = 'active')
  THEN RAISE EXCEPTION 'CHAT_MISSION_INACTIVE' USING ERRCODE = '23514'; END IF;

  INSERT INTO public.modular_chat_mission_jobs
    (worker_job_id, environment_tenant_id, workspace_id, owner_user_id, mission_id, conversation_id)
  VALUES (p_job_id, p_environment_tenant_id, p_workspace_id, p_user_id, v_mission_id, p_conversation_id)
  ON CONFLICT (worker_job_id) DO NOTHING;

  IF FOUND THEN
    UPDATE public.modular_chat_missions SET updated_at = now() WHERE id = v_mission_id;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.modular_chat_mission_jobs binding WHERE binding.worker_job_id = p_job_id
      AND binding.environment_tenant_id = p_environment_tenant_id AND binding.workspace_id = p_workspace_id
      AND binding.owner_user_id = p_user_id AND binding.mission_id = v_mission_id AND binding.conversation_id = p_conversation_id
  ) THEN RAISE EXCEPTION 'CHAT_MISSION_BINDING_CONFLICT' USING ERRCODE = '23505'; END IF;

  RETURN v_mission_id;
END $function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.attach_modular_chat_job_to_mission(integer, varchar, varchar, integer, varchar) FROM PUBLIC;
--> statement-breakpoint
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.attach_modular_chat_job_to_mission(integer, varchar, varchar, integer, varchar) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.attach_modular_chat_job_to_mission(integer, varchar, varchar, integer, varchar) TO modular_core_auth_prod;
  END IF;
END $grants$;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM modular_chat_mission_owner;
