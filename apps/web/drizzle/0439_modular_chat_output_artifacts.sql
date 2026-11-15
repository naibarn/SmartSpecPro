-- Persist private, provider-produced Chat outputs in the canonical worker_artifacts ledger.
CREATE FUNCTION public.complete_modular_chat_turn_with_output_artifacts(
  p_job_id varchar, p_lease_token varchar, p_fencing_version integer,
  p_assistant_content text, p_prompt_tokens integer, p_completion_tokens integer,
  p_cost_usd numeric, p_artifact jsonb
)
RETURNS TABLE(completed boolean, conversation_id integer, user_message_id integer, assistant_message_id integer, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_result record;
  v_job public.worker_jobs%ROWTYPE;
  v_attempt public.worker_job_attempts%ROWTYPE;
  v_storage_ref text;
  v_metadata jsonb;
BEGIN
  SELECT * INTO v_job FROM public.worker_jobs j
    WHERE j.id = p_job_id AND j."jobType" = 'modular_chat.turn'
      AND j.status = 'running' AND j."leaseOwnerToken" = p_lease_token
      AND j."fencingVersion" = p_fencing_version
      AND ((session_user = 'modular_core_auth_dev' AND j.environment_tenant_id = 'modular-development') OR
           (session_user = 'modular_core_auth_prod' AND j.environment_tenant_id = 'modular-production'))
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_CREDIT_JOB_DENIED' USING ERRCODE = '42501'; END IF;

  IF p_artifact IS NOT NULL THEN
    IF session_user <> 'modular_core_auth_dev' THEN RAISE EXCEPTION 'CHAT_OUTPUT_ARTIFACT_TARGET_DENIED' USING ERRCODE = '42501'; END IF;
    v_storage_ref := p_artifact->>'storageRef';
    v_metadata := p_artifact->'metadata';
    IF v_metadata IS NULL OR v_storage_ref IS NULL THEN RAISE EXCEPTION 'CHAT_OUTPUT_ARTIFACT_INVALID'; END IF;
    SELECT * INTO v_attempt FROM public.worker_job_attempts a
      WHERE a."workerJobId" = p_job_id AND a.id = v_metadata->>'attemptId'
        AND a.attempt = (v_metadata->>'attemptNumber')::integer;
    IF NOT FOUND OR v_metadata->>'schemaVersion' <> 'smartaihub.chat-output-artifact.v1'
      OR v_metadata->>'contentType' <> 'text/markdown; charset=utf-8'
      OR (v_metadata->>'sizeBytes')::integer NOT BETWEEN 1 AND 131072
      OR (v_metadata->>'sha256') !~ '^[a-f0-9]{64}$'
      OR (v_metadata->>'expiresAt')::timestamptz <= now()
      OR (v_metadata->>'expiresAt')::timestamptz > now() + interval '31 days'
      OR (v_metadata->>'userId')::integer <> v_job."requestedByUserId"
      OR v_metadata->>'workspaceId' <> v_job.chat_workspace_id
      OR (v_metadata->>'conversationId')::integer <> (v_job."inputJson"->>'conversationId')::integer
      OR v_metadata->>'jobId' <> p_job_id
      OR v_storage_ref <> 'chat-outputs/v1/' || v_job.environment_tenant_id || '/' || v_job.chat_workspace_id || '/' || p_job_id || '/attempt-' || v_attempt.attempt || '.md'
    THEN RAISE EXCEPTION 'CHAT_OUTPUT_ARTIFACT_INVALID'; END IF;
  END IF;

  SELECT * INTO v_result FROM public.complete_modular_chat_turn_with_actual_cost(
    p_job_id, p_lease_token, p_fencing_version, p_assistant_content,
    p_prompt_tokens, p_completion_tokens, p_cost_usd
  );
  IF v_result.completed IS NOT TRUE THEN RAISE EXCEPTION 'CHAT_CREDIT_COMPLETION_FAILED'; END IF;
  IF p_artifact IS NOT NULL THEN
    INSERT INTO public.worker_artifacts ("workerJobId", "artifactType", "storageRef", "metadataJson")
    VALUES (p_job_id, 'chat_output_markdown', v_storage_ref, v_metadata)
    ON CONFLICT ("workerJobId", "storageRef") DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.worker_artifacts artifact
      WHERE artifact."workerJobId" = p_job_id AND artifact."storageRef" = v_storage_ref
        AND artifact."artifactType" = 'chat_output_markdown' AND artifact."metadataJson" = v_metadata)
    THEN RAISE EXCEPTION 'CHAT_OUTPUT_ARTIFACT_CONFLICT'; END IF;
  END IF;
  RETURN QUERY SELECT v_result.completed, v_result.conversation_id, v_result.user_message_id,
    v_result.assistant_message_id, v_result.updated_at;
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.list_modular_chat_conversation_artifacts(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar, p_conversation_id integer
)
RETURNS TABLE(artifact_id varchar, artifact_type varchar, metadata_json jsonb, created_at timestamptz)
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
  RETURN QUERY SELECT artifact.id, artifact."artifactType", artifact."metadataJson", artifact."createdAt"
    FROM public.worker_artifacts artifact JOIN public.worker_jobs job ON job.id = artifact."workerJobId"
    WHERE artifact."artifactType" = 'chat_output_markdown'
      AND job."jobType" = 'modular_chat.turn' AND job.status = 'succeeded'
      AND job."requestedByUserId" = p_user_id AND job.environment_tenant_id = p_environment_tenant_id
      AND job.chat_workspace_id = p_workspace_id
      AND (job."inputJson"->>'conversationId')::integer = p_conversation_id
      AND (artifact."metadataJson"->>'expiresAt')::timestamptz > now()
    ORDER BY artifact."createdAt", artifact.id;
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.get_modular_chat_output_artifact(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar, p_artifact_id varchar
)
RETURNS TABLE(storage_ref varchar, metadata_json jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
BEGIN
  PERFORM public.assert_modular_chat_workspace_access(p_user_id, p_environment_tenant_id, p_workspace_id);
  RETURN QUERY SELECT artifact."storageRef", artifact."metadataJson"
    FROM public.worker_artifacts artifact JOIN public.worker_jobs job ON job.id = artifact."workerJobId"
    WHERE artifact.id = p_artifact_id AND artifact."artifactType" = 'chat_output_markdown'
      AND job."jobType" = 'modular_chat.turn' AND job.status = 'succeeded'
      AND job."requestedByUserId" = p_user_id AND job.environment_tenant_id = p_environment_tenant_id
      AND job.chat_workspace_id = p_workspace_id
      AND (artifact."metadataJson"->>'expiresAt')::timestamptz > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_ARTIFACT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
END $function$;
--> statement-breakpoint

-- Task Control's Chat adapter projects only the existing canonical Job ledger.
CREATE FUNCTION public.list_modular_chat_task_control_projection(
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
      NULLIF(job."progressJson"->'spec224'->>'runId', ''),
      (SELECT attempt.id FROM public.worker_job_attempts attempt
        WHERE attempt."workerJobId" = job.id ORDER BY attempt.attempt DESC LIMIT 1),
      job.status::varchar, NULL::varchar, NULL::varchar, NULL::varchar, NULL::varchar,
      COALESCE((SELECT max(event."eventSequence") FROM public.worker_job_events event
        WHERE event."workerJobId" = job.id), 0)::integer, COALESCE(array_agg(DISTINCT artifact.id) FILTER (WHERE artifact.id IS NOT NULL), ARRAY[]::varchar[]),
      job."updatedAt"
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

REVOKE ALL ON FUNCTION public.complete_modular_chat_turn_with_output_artifacts(varchar, varchar, integer, text, integer, integer, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_modular_chat_conversation_artifacts(integer, varchar, varchar, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_modular_chat_output_artifact(integer, varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_modular_chat_task_control_projection(integer, varchar, varchar, integer) FROM PUBLIC;
--> statement-breakpoint
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.complete_modular_chat_turn_with_output_artifacts(varchar, varchar, integer, text, integer, integer, numeric, jsonb) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_conversation_artifacts(integer, varchar, varchar, integer) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.get_modular_chat_output_artifact(integer, varchar, varchar, varchar) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_task_control_projection(integer, varchar, varchar, integer) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.complete_modular_chat_turn_with_output_artifacts(varchar, varchar, integer, text, integer, integer, numeric, jsonb) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_conversation_artifacts(integer, varchar, varchar, integer) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.get_modular_chat_output_artifact(integer, varchar, varchar, varchar) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_task_control_projection(integer, varchar, varchar, integer) TO modular_core_auth_prod;
  END IF;
END $grants$;
