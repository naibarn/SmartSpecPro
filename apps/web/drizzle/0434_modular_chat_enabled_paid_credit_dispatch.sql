-- Align Chat selection and dispatch with enabled shared mappings and the 10,000-credit/USD ledger.
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
    SELECT 1 FROM public.get_modular_chat_enabled_model_config(
      p_user_id, p_environment_tenant_id, p_workspace_id, p_provider_id, p_model_id
    ) AS provider
    WHERE provider.provider_name = 'openrouter'
      AND provider.api_style = 'chat-completions'
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
CREATE OR REPLACE FUNCTION public.fail_modular_chat_turn_job(
  p_job_id varchar,
  p_lease_token varchar,
  p_fencing_version integer,
  p_error_code varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_attempt integer;
BEGIN
  IF p_error_code NOT IN ('provider_unavailable', 'model_unavailable', 'invalid_provider_response', 'provider_request_failed', 'provider_outcome_unknown', 'insufficient_credits', 'provider_rate_limited') THEN
    RAISE EXCEPTION 'CHAT_JOB_ERROR_CODE_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE public.worker_jobs AS job
  SET status = 'failed', "finishedAt" = now(), "failureReason" = p_error_code,
      "errorCode" = p_error_code,
      "errorMessage" = CASE p_error_code
        WHEN 'model_unavailable' THEN 'The selected AI model is no longer available.'
        WHEN 'invalid_provider_response' THEN 'The AI provider returned an invalid response.'
        WHEN 'provider_outcome_unknown' THEN 'The AI provider may have received this request, but its result could not be confirmed.'
        WHEN 'insufficient_credits' THEN 'There are not enough credits to run this request.'
        WHEN 'provider_rate_limited' THEN 'The AI provider rate limit was reached. Please try again later.'
        ELSE 'The AI provider could not complete this request.' END,
      "statusReason" = p_error_code, "leaseOwnerToken" = NULL, "leaseExpiresAt" = NULL,
      "nextRetryAt" = NULL,
      "progressJson" = jsonb_build_object('phase', 'failed', 'errorCode', p_error_code)
  WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
    AND job.status IN ('leased', 'running') AND job."leaseOwnerToken" = p_lease_token
    AND job."fencingVersion" = p_fencing_version
    AND ((session_user = 'modular_core_auth_dev' AND job.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND job.environment_tenant_id = 'modular-production'))
  RETURNING job.attempt INTO v_attempt;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.worker_job_attempts SET "finishedAt" = now(),
    "terminalClass" = CASE WHEN p_error_code = 'provider_outcome_unknown' THEN 'outcome_unknown' ELSE 'failed' END
  WHERE "workerJobId" = p_job_id AND attempt = v_attempt AND "leaseGeneration" = p_fencing_version;
  PERFORM public.append_modular_chat_job_event(
    p_job_id, 'FAILED', 'failed:' || p_job_id || ':' || p_fencing_version::text,
    jsonb_build_object('errorCode', p_error_code)
  );
  RETURN true;
END;
$function$;
--> statement-breakpoint
CREATE FUNCTION public.fail_modular_chat_turn_after_rejection_and_release_credits(
  p_job_id varchar, p_lease_token varchar, p_fencing_version integer,
  p_error_code varchar, p_upstream_status integer
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_job public.worker_jobs%ROWTYPE; v_hold public.modular_chat_credit_holds%ROWTYPE;
  v_balance integer; v_refund_id integer;
BEGIN
  IF p_error_code NOT IN ('provider_unavailable', 'model_unavailable', 'provider_request_failed', 'provider_rate_limited') OR
     p_upstream_status IS NULL OR p_upstream_status NOT BETWEEN 400 AND 499 OR p_upstream_status IN (408, 425) OR
     ((p_error_code = 'provider_rate_limited') <> (p_upstream_status = 429)) THEN
    RAISE EXCEPTION 'CHAT_CREDIT_REJECTION_NOT_CONFIRMED';
  END IF;
  SELECT * INTO v_job FROM public.worker_jobs j WHERE j.id = p_job_id AND j."jobType" = 'modular_chat.turn'
    AND j.status = 'running' AND j."leaseOwnerToken" = p_lease_token AND j."fencingVersion" = p_fencing_version
    AND ((session_user = 'modular_core_auth_dev' AND j.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND j.environment_tenant_id = 'modular-production')) FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_hold FROM public.modular_chat_credit_holds h WHERE h.job_id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_hold.state <> 'reserved' THEN RAISE EXCEPTION 'CHAT_CREDIT_HOLD_NOT_OPEN'; END IF;
  IF NOT public.fail_modular_chat_turn_job(p_job_id, p_lease_token, p_fencing_version, p_error_code) THEN
    RAISE EXCEPTION 'CHAT_CREDIT_FAILURE_NOT_RECORDED';
  END IF;
  IF v_hold.reserved_credits > 0 THEN
    UPDATE public.users u SET credits = u.credits + v_hold.reserved_credits
      WHERE u.id = v_hold.user_id AND u.credits::bigint + v_hold.reserved_credits <= 2147483647
      RETURNING u.credits INTO v_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_CREDIT_REFUND_FAILED'; END IF;
    INSERT INTO public.credit_transactions ("userId", amount, type, description, "balanceAfter", "idempotencyKey", "conversationId", "sourceType", "reversalOfTransactionId", metadata)
    VALUES (v_hold.user_id, v_hold.reserved_credits, 'refund', 'SmartSIHub Chat rejected provider request', v_balance,
      'modular-chat:' || p_job_id || ':refund', (v_job."inputJson"->>'conversationId')::integer, 'chat',
      v_hold.reserve_transaction_id, jsonb_build_object('jobId', p_job_id, 'phase', 'provider_rejection', 'upstreamStatus', p_upstream_status))
    RETURNING id INTO v_refund_id;
  END IF;
  UPDATE public.modular_chat_credit_holds SET state = 'released', settled_credits = 0,
    refund_transaction_id = v_refund_id, updated_at = now() WHERE job_id = p_job_id;
  INSERT INTO public.worker_job_settlements ("workerJobId", "settlementKey", "settlementType", "payloadJson")
  VALUES (p_job_id, 'chat-credit-release:' || p_job_id, 'chat_credit_release',
    jsonb_build_object('reservedCredits', v_hold.reserved_credits, 'upstreamStatus', p_upstream_status))
  ON CONFLICT ("settlementKey") DO NOTHING;
  RETURN true;
END $function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fail_modular_chat_turn_after_rejection_and_release_credits(varchar, varchar, integer, varchar, integer) FROM PUBLIC;
--> statement-breakpoint
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.fail_modular_chat_turn_after_rejection_and_release_credits(varchar, varchar, integer, varchar, integer) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.fail_modular_chat_turn_after_rejection_and_release_credits(varchar, varchar, integer, varchar, integer) TO modular_core_auth_prod;
  END IF;
END $grants$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_modular_chat_turn_job_status(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_workspace_id varchar,
  p_job_id varchar
)
RETURNS TABLE(job_id varchar, job_status varchar, conversation_id integer, output_json jsonb, error_code varchar, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT (
    (session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
    (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')
  ) THEN
    RAISE EXCEPTION 'CHAT_JOB_ENVIRONMENT_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_modular_chat_workspace_access(p_user_id, p_environment_tenant_id, p_workspace_id);
  RETURN QUERY
  SELECT job.id, job.status::varchar, (job."outputJson"->>'conversationId')::integer,
         CASE WHEN hold.job_id IS NULL THEN job."outputJson"
              ELSE COALESCE(job."outputJson", '{}'::jsonb) || jsonb_build_object(
                'creditReservation', jsonb_build_object('state', hold.state,
                  'reservedCredits', hold.reserved_credits, 'settledCredits', hold.settled_credits)
              ) END,
         job."errorCode", job."createdAt", COALESCE(job."finishedAt", job."heartbeatAt", job."createdAt")
  FROM public.worker_jobs AS job
  LEFT JOIN public.modular_chat_credit_holds AS hold ON hold.job_id = job.id
  WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
    AND job.environment_tenant_id = p_environment_tenant_id
    AND job.chat_workspace_id = p_workspace_id AND job."requestedByUserId" = p_user_id
  LIMIT 1;
END;
$function$;
--> statement-breakpoint
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.get_modular_chat_turn_job_status(integer, varchar, varchar, varchar) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.get_modular_chat_turn_job_status(integer, varchar, varchar, varchar) TO modular_core_auth_prod;
  END IF;
END $grants$;
