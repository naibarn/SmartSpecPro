-- Repair Modular Chat job creation, idempotent retries, and message persistence.
CREATE OR REPLACE FUNCTION public.create_modular_chat_turn_job(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_conversation_id integer,
  p_prompt text,
  p_provider_id integer,
  p_model_id varchar,
  p_idempotency_key varchar
)
RETURNS TABLE(job_id varchar, conversation_id integer, job_status varchar, created boolean, outbox_id varchar, outbox_dedupe_key varchar)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_workspace_type varchar;
  v_is_default boolean := false;
  v_conversation_id integer;
  v_job_id varchar(36);
  v_job_status varchar(40);
  v_outbox_id varchar(36);
  v_dedupe_key varchar(200);
  v_existing record;
  v_lane_marker varchar(128) := 'modular-chat-outbox-lane-v1';
BEGIN
  IF NOT (
    (session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
    (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')
  ) THEN
    RAISE EXCEPTION 'CHAT_JOB_ENVIRONMENT_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_user_id <= 0 OR p_provider_id IS NULL OR p_provider_id <= 0 OR
     p_prompt IS NULL OR length(p_prompt) NOT BETWEEN 1 AND 12000 OR
     p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 16 AND 128 OR
     p_model_id IS NULL OR length(p_model_id) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'CHAT_JOB_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;

  v_workspace_type := public.assert_modular_chat_workspace_access(
    p_user_id, p_environment_tenant_id, p_workspace_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'modular-chat-idempotency:' || p_environment_tenant_id || ':' || p_workspace_id || ':' ||
    p_user_id::text || ':' || p_idempotency_key, 0
  ));

  SELECT job.id, job.status::text AS status, (job."inputJson"->>'conversationId')::integer AS conversation_id
    INTO v_existing
  FROM public.worker_jobs AS job
  WHERE job."jobType" = 'modular_chat.turn'
    AND job.environment_tenant_id = p_environment_tenant_id
    AND job.chat_workspace_id = p_workspace_id
    AND job."requestedByUserId" = p_user_id
    AND job."idempotencyKey" = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    SELECT outbox.id, outbox."dedupeKey" INTO v_outbox_id, v_dedupe_key
    FROM public.worker_job_outbox AS outbox
    WHERE outbox."workerJobId" = v_existing.id ORDER BY outbox."createdAt" LIMIT 1;
    RETURN QUERY SELECT v_existing.id::varchar, v_existing.conversation_id,
      v_existing.status::varchar, false, v_outbox_id, v_dedupe_key;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.get_modular_chat_provider_config(
      p_user_id, p_environment_tenant_id, p_workspace_id, p_provider_id, p_model_id
    ) AS provider
    WHERE provider.provider_name = 'openrouter'
      AND provider.api_style = 'chat-completions'
      AND provider.is_free IS TRUE
  ) THEN
    RAISE EXCEPTION 'CHAT_MODEL_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

  SELECT workspace.is_default INTO v_is_default
  FROM public.modular_workspaces AS workspace
  WHERE workspace.environment_tenant_id = p_environment_tenant_id
    AND workspace.id = p_workspace_id AND workspace.owner_user_id = p_user_id;

  IF p_conversation_id IS NULL THEN
    v_conversation_id := public.create_modular_chat_conversation(
      p_user_id, p_environment_tenant_id, p_workspace_id,
      COALESCE(NULLIF(left(regexp_replace(btrim(p_prompt), '\s+', ' ', 'g'), 80), ''), 'New Chat')
    );
  ELSE
    v_conversation_id := p_conversation_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.conversations AS conversation
      LEFT JOIN public.modular_chat_conversation_scopes AS scope
        ON scope.conversation_id = conversation.id
      WHERE conversation.id = p_conversation_id
        AND conversation."userId" = p_user_id
        AND (
          (scope.conversation_id IS NOT NULL
            AND scope.environment_tenant_id = p_environment_tenant_id
            AND scope.workspace_id = p_workspace_id
            AND scope.owner_user_id = p_user_id)
          OR
          (scope.conversation_id IS NULL
            AND conversation."tenantId" IS NOT DISTINCT FROM
              CASE WHEN v_workspace_type = 'personal' THEN NULL ELSE p_workspace_id END
            AND (v_workspace_type <> 'personal' OR v_is_default IS TRUE))
        )
    ) THEN
      RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.modular_chat_conversation_scopes (
      environment_tenant_id, workspace_id, conversation_id, owner_user_id
    ) VALUES (p_environment_tenant_id, p_workspace_id, v_conversation_id, p_user_id)
    ON CONFLICT ON CONSTRAINT modular_chat_conversation_scopes_conversation_id_key DO NOTHING;
    IF NOT EXISTS (
      SELECT 1 FROM public.modular_chat_conversation_scopes AS scope
      WHERE scope.environment_tenant_id = p_environment_tenant_id
        AND scope.workspace_id = p_workspace_id AND scope.conversation_id = v_conversation_id
        AND scope.owner_user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_job_id := pg_catalog.gen_random_uuid()::varchar;
  INSERT INTO public.worker_jobs (
    id, "tenantId", "requestedByUserId", "requestedBySystemComponent", "runtimeType",
    "jobType", status, "executionClass", "contractVersion", "resourceProfile",
    "capabilityRequirementsJson", "inputJson", "instructionsJson", "retryPolicyJson",
    "timeoutPolicyJson", "timeoutSeconds", attempt, "maxAttempts", "idempotencyKey",
    "fencingVersion", "progressJson", "operatorReviewRequired", "createdAt",
    environment_tenant_id, chat_workspace_id
  ) VALUES (
    v_job_id,
    CASE WHEN v_workspace_type = 'customer' THEN p_workspace_id ELSE NULL END,
    p_user_id, 'modular-chat', 'node_job_worker'::public.worker_runtime_type,
    'modular_chat.turn', 'queued'::public.worker_job_status, 'short', 'modular-chat-turn-v1', 'cpu_light',
    jsonb_build_object('provider', 'openrouter'),
    jsonb_build_object(
      'schemaVersion', 'modular-chat-turn-input.v1', 'userId', p_user_id,
      'environmentTenantId', p_environment_tenant_id, 'workspaceId', p_workspace_id,
      'conversationId', v_conversation_id, 'prompt', p_prompt,
      'providerId', p_provider_id, 'modelId', p_model_id
    ),
    '{}'::jsonb,
    jsonb_build_object('maxAttempts', 8, 'retryProvider429', true),
    jsonb_build_object('softTimeoutMs', 0, 'hardTimeoutMs', 45000),
    45, 1, 8, p_idempotency_key, 0,
    jsonb_build_object('phase', 'queued'), false, now(),
    p_environment_tenant_id, p_workspace_id
  );

  PERFORM public.append_modular_chat_job_event(
    v_job_id, 'CREATED', 'created:' || v_job_id,
    jsonb_build_object('source', 'modular-chat', 'environmentTenantId', p_environment_tenant_id)
  );
  PERFORM public.append_modular_chat_job_event(
    v_job_id, 'QUEUED', 'queued:' || v_job_id,
    jsonb_build_object('queue', 'modular-chat-turns', 'contractVersion', 'modular-chat-turn-v1')
  );

  v_dedupe_key := 'job:' || v_job_id || ':attempt:1';
  INSERT INTO public.worker_job_outbox (
    "workerJobId", "envelopeVersion", "envelopeJson", "dedupeKey",
    "publisherLeaseTokenHash", "publisherLeaseExpiresAt", "createdAt", "updatedAt"
  ) VALUES (
    v_job_id, 'modular-chat-turn-v1',
    jsonb_build_object('kind', 'modular-chat-turn.v1', 'jobId', v_job_id, 'attempt', 1, 'dedupeKey', v_dedupe_key),
    v_dedupe_key, v_lane_marker, 'infinity'::timestamptz, now(), now()
  ) RETURNING id INTO v_outbox_id;
  PERFORM public.append_modular_chat_job_event(
    v_job_id, 'OUTBOX_CREATED', 'outbox-created:' || v_job_id,
    jsonb_build_object('outboxId', v_outbox_id, 'dedupeKey', v_dedupe_key)
  );

  RETURN QUERY SELECT v_job_id, v_conversation_id, 'queued'::varchar, true, v_outbox_id, v_dedupe_key;
END;
$function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.append_modular_chat_turn(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_conversation_id integer,
  p_user_content text,
  p_assistant_content text,
  p_model_id varchar
)
RETURNS TABLE (
  conversation_id integer,
  user_message_id integer,
  assistant_message_id integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_workspace_type varchar;
  v_is_default boolean := false;
  v_user_message_id integer;
  v_assistant_message_id integer;
  v_conversation_title varchar(255);
BEGIN
  v_workspace_type := public.assert_modular_chat_workspace_access(
    p_user_id, p_environment_tenant_id, p_workspace_id
  );
  IF p_user_content IS NULL OR length(p_user_content) NOT BETWEEN 1 AND 12000
     OR p_assistant_content IS NULL OR length(p_assistant_content) NOT BETWEEN 1 AND 24000
     OR p_model_id IS NULL OR length(p_model_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'CHAT_TURN_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT workspace.is_default INTO v_is_default
  FROM public.modular_workspaces AS workspace
  WHERE workspace.environment_tenant_id = p_environment_tenant_id
    AND workspace.id = p_workspace_id
    AND workspace.owner_user_id = p_user_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations AS conversation
    LEFT JOIN public.modular_chat_conversation_scopes AS scope
      ON scope.conversation_id = conversation.id
    WHERE conversation.id = p_conversation_id
      AND conversation."userId" = p_user_id
      AND (
        (scope.conversation_id IS NOT NULL
          AND scope.environment_tenant_id = p_environment_tenant_id
          AND scope.workspace_id = p_workspace_id
          AND scope.owner_user_id = p_user_id)
        OR
        (scope.conversation_id IS NULL
          AND conversation."tenantId" IS NOT DISTINCT FROM
            CASE WHEN v_workspace_type = 'personal' THEN NULL ELSE p_workspace_id END
          AND (v_workspace_type <> 'personal' OR v_is_default IS TRUE))
      )
  ) THEN
    RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.modular_chat_conversation_scopes (
    environment_tenant_id, workspace_id, conversation_id, owner_user_id
  ) VALUES (p_environment_tenant_id, p_workspace_id, p_conversation_id, p_user_id)
  ON CONFLICT ON CONSTRAINT modular_chat_conversation_scopes_conversation_id_key DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.modular_chat_conversation_scopes AS scope
    WHERE scope.conversation_id = p_conversation_id
      AND scope.environment_tenant_id = p_environment_tenant_id
      AND scope.workspace_id = p_workspace_id
      AND scope.owner_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'CHAT_CONVERSATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messages ("conversationId", role, content, "modelUsed", "sourceChannel")
  VALUES (p_conversation_id, 'user', p_user_content, NULL, 'web')
  RETURNING id INTO v_user_message_id;
  INSERT INTO public.messages ("conversationId", role, content, "modelUsed", "sourceChannel")
  VALUES (p_conversation_id, 'assistant', p_assistant_content, p_model_id, 'web')
  RETURNING id INTO v_assistant_message_id;

  UPDATE public.conversations AS conversation
  SET "messageCount" = conversation."messageCount" + 2,
      "updatedAt" = now(),
      title = CASE
        WHEN conversation.title = 'New Chat' THEN left(regexp_replace(btrim(p_user_content), '\s+', ' ', 'g'), 80)
        ELSE conversation.title
      END,
      model = p_model_id
  WHERE conversation.id = p_conversation_id
    AND conversation."userId" = p_user_id
  RETURNING conversation.title INTO v_conversation_title;

  RETURN QUERY SELECT p_conversation_id, v_user_message_id, v_assistant_message_id, now();
END;
$function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_modular_chat_provider_config(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_provider_id integer,
  p_model_id varchar
)
RETURNS TABLE (
  provider_name varchar,
  base_url varchar,
  api_key_encrypted text,
  provider_model_id varchar,
  api_style text,
  is_free boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public.assert_modular_chat_workspace_access(
    p_user_id, p_environment_tenant_id, p_workspace_id
  );

  IF p_model_id IS NULL OR length(p_model_id) > 100 OR
     p_model_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT provider."providerName", provider."baseUrl", provider."apiKeyEncrypted",
         p_model_id, 'chat-completions'::text, true
  FROM public.llm_providers AS provider
  WHERE provider.id = p_provider_id
    AND lower(provider."providerName") = 'openrouter'
    AND provider."isEnabled" IS TRUE
    AND provider."hasApiKey" IS TRUE
    AND provider."apiKeyEncrypted" IS NOT NULL;
END;
$function$;
