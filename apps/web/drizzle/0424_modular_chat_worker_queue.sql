-- Modular Chat LLM work shares the canonical worker_jobs/outbox control plane.
-- Personal workspaces are environment-scoped and deliberately have no customer tenant.
ALTER TABLE public.worker_jobs ALTER COLUMN "tenantId" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public.worker_jobs
  ADD COLUMN IF NOT EXISTS environment_tenant_id varchar(64),
  ADD COLUMN IF NOT EXISTS chat_workspace_id varchar(36);
--> statement-breakpoint
ALTER TABLE public.worker_job_outbox
  ADD COLUMN IF NOT EXISTS "modularChatDispatchLeaseTokenHash" varchar(64),
  ADD COLUMN IF NOT EXISTS "modularChatDispatchLeaseExpiresAt" timestamptz;
--> statement-breakpoint
DO $modular_chat_job_constraints$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_jobs_modular_chat_scope_check') THEN
    ALTER TABLE public.worker_jobs ADD CONSTRAINT worker_jobs_modular_chat_scope_check
      CHECK (
        (environment_tenant_id IS NULL AND chat_workspace_id IS NULL)
        OR (environment_tenant_id IN ('modular-development', 'modular-production') AND chat_workspace_id IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_jobs_modular_chat_identity_check') THEN
    ALTER TABLE public.worker_jobs ADD CONSTRAINT worker_jobs_modular_chat_identity_check
      CHECK (
        ("jobType" = 'modular_chat.turn'
          AND environment_tenant_id IN ('modular-development', 'modular-production')
          AND chat_workspace_id IS NOT NULL AND "requestedByUserId" IS NOT NULL)
        OR ("jobType" <> 'modular_chat.turn' AND "tenantId" IS NOT NULL
          AND environment_tenant_id IS NULL AND chat_workspace_id IS NULL)
      );
  END IF;
END $modular_chat_job_constraints$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS worker_jobs_modular_chat_idempotency_unique
  ON public.worker_jobs (environment_tenant_id, chat_workspace_id, "requestedByUserId", "idempotencyKey")
  WHERE "jobType" = 'modular_chat.turn' AND "idempotencyKey" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS worker_jobs_modular_chat_scope_status_idx
  ON public.worker_jobs (environment_tenant_id, chat_workspace_id, "requestedByUserId", status, "createdAt" DESC)
  WHERE "jobType" = 'modular_chat.turn';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.append_modular_chat_job_event(
  p_job_id varchar,
  p_event_type varchar,
  p_idempotency_key varchar,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_sequence integer;
BEGIN
  PERFORM 1 FROM public.worker_jobs
  WHERE id = p_job_id AND "jobType" = 'modular_chat.turn'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHAT_JOB_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.worker_job_events
    WHERE "workerJobId" = p_job_id AND "eventIdempotencyKey" = p_idempotency_key
  ) THEN
    RETURN;
  END IF;
  SELECT COALESCE(max("eventSequence"), 0) + 1 INTO v_sequence
  FROM public.worker_job_events WHERE "workerJobId" = p_job_id;
  INSERT INTO public.worker_job_events (
    "workerJobId", "eventType", "eventSequence", "eventIdempotencyKey", "payloadJson"
  ) VALUES (p_job_id, p_event_type, v_sequence, p_idempotency_key, COALESCE(p_payload, '{}'::jsonb));
END;
$function$;
--> statement-breakpoint

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

  SELECT job.id, job.status::text, (job.inputJson->>'conversationId')::integer
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
    SELECT conversation_id INTO v_conversation_id
    FROM public.create_modular_chat_conversation(
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
    ON CONFLICT (conversation_id) DO NOTHING;
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

CREATE OR REPLACE FUNCTION public.prepare_modular_chat_turn_outbox(
  p_environment_tenant_id varchar,
  p_dispatch_token_hash varchar,
  p_job_id varchar DEFAULT NULL
)
RETURNS TABLE(outbox_id varchar, job_id varchar, envelope_json jsonb, dedupe_key varchar, next_attempt_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT (
    (session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
    (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')
  ) OR p_dispatch_token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'CHAT_OUTBOX_ENVIRONMENT_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH due AS (
    SELECT outbox.id
    FROM public.worker_job_outbox AS outbox
    JOIN public.worker_jobs AS job ON job.id = outbox."workerJobId"
    WHERE job."jobType" = 'modular_chat.turn'
      AND job.environment_tenant_id = p_environment_tenant_id
      AND outbox."publisherLeaseTokenHash" = 'modular-chat-outbox-lane-v1'
      AND outbox."publishedAt" IS NULL AND outbox."cancelledAt" IS NULL
      AND outbox."quarantinedAt" IS NULL AND outbox."nextAttemptAt" <= now()
      AND (outbox."modularChatDispatchLeaseExpiresAt" IS NULL
        OR outbox."modularChatDispatchLeaseExpiresAt" <= now())
      AND (p_job_id IS NULL OR job.id = p_job_id)
    ORDER BY outbox."createdAt", outbox.id
    FOR UPDATE OF outbox SKIP LOCKED
    LIMIT 100
  )
  UPDATE public.worker_job_outbox AS outbox
  SET "modularChatDispatchLeaseTokenHash" = p_dispatch_token_hash,
      "modularChatDispatchLeaseExpiresAt" = now() + interval '30 seconds',
      "updatedAt" = now()
  FROM due, public.worker_jobs AS job
  WHERE outbox.id = due.id AND job.id = outbox."workerJobId"
  RETURNING outbox.id, job.id, outbox."envelopeJson", outbox."dedupeKey", outbox."nextAttemptAt";
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mark_modular_chat_turn_outbox_published(
  p_outbox_id varchar,
  p_dedupe_key varchar,
  p_dispatch_token_hash varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_job_id varchar(36);
  v_workspace varchar(36);
  v_env varchar(64);
  v_dispatch_id varchar(36);
BEGIN
  SELECT job.id, job.chat_workspace_id, job.environment_tenant_id
    INTO v_job_id, v_workspace, v_env
  FROM public.worker_job_outbox AS outbox
  JOIN public.worker_jobs AS job ON job.id = outbox."workerJobId"
  WHERE outbox.id = p_outbox_id AND outbox."dedupeKey" = p_dedupe_key
    AND job."jobType" = 'modular_chat.turn'
    AND outbox."publisherLeaseTokenHash" = 'modular-chat-outbox-lane-v1'
    AND outbox."modularChatDispatchLeaseTokenHash" = p_dispatch_token_hash
    AND ((session_user = 'modular_core_auth_dev' AND job.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND job.environment_tenant_id = 'modular-production'))
  FOR UPDATE OF outbox;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.worker_job_outbox AS outbox
  SET "publishedAt" = COALESCE(outbox."publishedAt", now()),
      "failedReason" = NULL, "modularChatDispatchLeaseTokenHash" = NULL,
      "modularChatDispatchLeaseExpiresAt" = NULL, "updatedAt" = now()
  WHERE outbox.id = p_outbox_id AND outbox."dedupeKey" = p_dedupe_key
    AND outbox."cancelledAt" IS NULL AND outbox."quarantinedAt" IS NULL
    AND outbox."modularChatDispatchLeaseTokenHash" = p_dispatch_token_hash;
  IF NOT FOUND THEN RETURN false; END IF;

  v_dispatch_id := pg_catalog.gen_random_uuid()::varchar;
  INSERT INTO public.worker_job_dispatches (
    id, "workerJobId", adapter, "referenceNamespace", "dispatchKind", "dedupeKey",
    "queueJobId", "publicationStatus", "createdAt", "publishedAt"
  ) VALUES (
    v_dispatch_id, v_job_id, 'cloudflare-queues', 'modular-chat-turns', 'publish', p_dedupe_key,
    'modular-chat-turns:' || p_dedupe_key, 'published', now(), now()
  ) ON CONFLICT (adapter, "dedupeKey") DO NOTHING;
  PERFORM public.append_modular_chat_job_event(
    v_job_id, 'DISPATCHED', 'dispatched:' || p_dedupe_key,
    jsonb_build_object('adapter', 'cloudflare-queues', 'referenceNamespace', 'modular-chat-turns', 'dedupeKey', p_dedupe_key)
  );
  RETURN true;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.record_modular_chat_turn_outbox_failure(
  p_outbox_id varchar,
  p_error_code varchar,
  p_dispatch_token_hash varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_job_id varchar(36);
  v_attempts integer;
BEGIN
  IF p_error_code NOT IN ('queue_unavailable', 'queue_publish_failed') THEN
    RAISE EXCEPTION 'CHAT_OUTBOX_ERROR_CODE_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE public.worker_job_outbox AS outbox
  SET "publishAttempts" = outbox."publishAttempts" + 1,
      "failedReason" = p_error_code,
      "nextAttemptAt" = now() + make_interval(secs => LEAST(900, power(2, LEAST(outbox."publishAttempts" + 1, 9))::integer)),
      "modularChatDispatchLeaseTokenHash" = NULL,
      "modularChatDispatchLeaseExpiresAt" = NULL,
      "updatedAt" = now()
  FROM public.worker_jobs AS job
  WHERE outbox.id = p_outbox_id AND job.id = outbox."workerJobId"
    AND job."jobType" = 'modular_chat.turn'
    AND outbox."publisherLeaseTokenHash" = 'modular-chat-outbox-lane-v1'
    AND outbox."modularChatDispatchLeaseTokenHash" = p_dispatch_token_hash
    AND outbox."publishedAt" IS NULL AND outbox."cancelledAt" IS NULL
    AND ((session_user = 'modular_core_auth_dev' AND job.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND job.environment_tenant_id = 'modular-production'))
  RETURNING job.id, outbox."publishAttempts" INTO v_job_id, v_attempts;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM public.append_modular_chat_job_event(
    v_job_id, 'DISPATCH_FAILED', 'queue-publish-failed:' || v_job_id || ':' || v_attempts::text,
    jsonb_build_object('errorCode', p_error_code, 'publishAttempt', v_attempts)
  );
  RETURN true;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.claim_modular_chat_turn_job(
  p_job_id varchar,
  p_lease_token varchar,
  p_lease_token_hash varchar
)
RETURNS TABLE(claim_status varchar, retry_after_seconds integer, job_input jsonb, fencing_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_job public.worker_jobs%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF length(p_lease_token) NOT BETWEEN 16 AND 128 OR p_lease_token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'CHAT_JOB_LEASE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job FROM public.worker_jobs AS job
  WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
    AND ((session_user = 'modular_core_auth_dev' AND job.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND job.environment_tenant_id = 'modular-production'))
  FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::varchar, 0, NULL::jsonb, 0; RETURN; END IF;

  IF v_job.status IN ('succeeded', 'failed', 'cancelled', 'completed', 'canceled', 'expired') THEN
    RETURN QUERY SELECT 'terminal'::varchar, 0, NULL::jsonb, v_job."fencingVersion"; RETURN;
  END IF;
  IF v_job.status IN ('leased', 'running') AND v_job."leaseExpiresAt" > v_now THEN
    RETURN QUERY SELECT 'busy'::varchar,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_job."leaseExpiresAt" - v_now)))::integer), NULL::jsonb, v_job."fencingVersion";
    RETURN;
  END IF;
  IF v_job.status = 'retry_scheduled' AND v_job."nextRetryAt" > v_now THEN
    RETURN QUERY SELECT 'delayed'::varchar,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_job."nextRetryAt" - v_now)))::integer), NULL::jsonb, v_job."fencingVersion";
    RETURN;
  END IF;
  IF v_job.status NOT IN ('queued', 'retry_scheduled', 'leased', 'running') THEN
    RETURN QUERY SELECT 'terminal'::varchar, 0, NULL::jsonb, v_job."fencingVersion"; RETURN;
  END IF;

  UPDATE public.worker_jobs SET status = 'leased', "leaseOwnerToken" = p_lease_token,
    "leaseExpiresAt" = v_now + interval '90 seconds', "heartbeatAt" = v_now,
    "fencingVersion" = "fencingVersion" + 1, "nextRetryAt" = NULL,
    "statusReason" = NULL, "progressJson" = jsonb_build_object('phase', 'leased', 'queue', 'modular-chat-turns')
  WHERE id = p_job_id
  RETURNING * INTO v_job;
  PERFORM public.append_modular_chat_job_event(
    p_job_id, 'LEASED', 'leased:' || p_job_id || ':' || v_job."fencingVersion"::text,
    jsonb_build_object('fencingVersion', v_job."fencingVersion", 'leaseExpiresAt', v_job."leaseExpiresAt")
  );
  RETURN QUERY SELECT 'claimed'::varchar, 0, v_job."inputJson", v_job."fencingVersion";
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.begin_modular_chat_turn_job(
  p_job_id varchar,
  p_lease_token varchar,
  p_lease_token_hash varchar,
  p_fencing_version integer
)
RETURNS TABLE(attempt_id varchar, attempt_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_job public.worker_jobs%ROWTYPE;
  v_attempt_id varchar(36);
BEGIN
  SELECT * INTO v_job FROM public.worker_jobs AS job
  WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
    AND job.status = 'leased' AND job."leaseOwnerToken" = p_lease_token
    AND job."fencingVersion" = p_fencing_version
    AND ((session_user = 'modular_core_auth_dev' AND job.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND job.environment_tenant_id = 'modular-production'))
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_attempt_id := pg_catalog.gen_random_uuid()::varchar;
  INSERT INTO public.worker_job_attempts (
    id, "workerJobId", attempt, "leaseGeneration", "runnerId", "leaseTokenHash", "leaseExpiresAt", "startedAt"
  ) VALUES (
    v_attempt_id, p_job_id, v_job.attempt, p_fencing_version,
    'modular-chat-queue-consumer', p_lease_token_hash, v_job."leaseExpiresAt", now()
  );
  UPDATE public.worker_jobs SET status = 'running', "startedAt" = COALESCE("startedAt", now()),
    "heartbeatAt" = now(), "progressJson" = jsonb_build_object('phase', 'provider-request', 'attempt', attempt)
  WHERE id = p_job_id;
  PERFORM public.append_modular_chat_job_event(
    p_job_id, 'STARTED', 'started:' || p_job_id || ':' || v_job."fencingVersion"::text,
    jsonb_build_object('attemptId', v_attempt_id, 'attempt', v_job.attempt, 'fencingVersion', p_fencing_version)
  );
  RETURN QUERY SELECT v_attempt_id, v_job.attempt;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.defer_modular_chat_turn_job(
  p_job_id varchar,
  p_lease_token varchar,
  p_fencing_version integer,
  p_delay_seconds integer,
  p_attempt_consumed boolean,
  p_error_code varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_job public.worker_jobs%ROWTYPE;
  v_status varchar(40);
BEGIN
  IF p_delay_seconds < 1 OR p_delay_seconds > 86400 OR
     p_error_code NOT IN ('provider_rate_limited', 'provider_admission_limited', 'provider_admission_unavailable', 'provider_request_failed') THEN
    RAISE EXCEPTION 'CHAT_JOB_RETRY_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job FROM public.worker_jobs AS job
  WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
    AND job.status IN ('leased', 'running') AND job."leaseOwnerToken" = p_lease_token
    AND job."fencingVersion" = p_fencing_version
    AND ((session_user = 'modular_core_auth_dev' AND job.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND job.environment_tenant_id = 'modular-production'))
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'stale'; END IF;

  IF p_attempt_consumed AND v_job.attempt >= v_job."maxAttempts" THEN
    v_status := 'failed';
    UPDATE public.worker_jobs SET status = 'failed', "finishedAt" = now(), "failureReason" = p_error_code,
      "errorCode" = p_error_code,
      "errorMessage" = CASE WHEN p_error_code = 'provider_request_failed'
        THEN 'The AI provider could not complete this request after several attempts.'
        ELSE 'The AI provider is temporarily rate limited.' END,
      "statusReason" = p_error_code, "leaseOwnerToken" = NULL, "leaseExpiresAt" = NULL,
      "nextRetryAt" = NULL, "progressJson" = jsonb_build_object('phase', 'failed', 'errorCode', p_error_code)
    WHERE id = p_job_id;
    UPDATE public.worker_job_attempts SET "finishedAt" = now(), "terminalClass" = 'provider_rejected'
    WHERE "workerJobId" = p_job_id AND attempt = v_job.attempt AND "leaseGeneration" = p_fencing_version;
  ELSE
    v_status := 'retry_scheduled';
    UPDATE public.worker_jobs SET status = 'retry_scheduled',
      attempt = attempt + CASE WHEN p_attempt_consumed THEN 1 ELSE 0 END,
      "nextRetryAt" = now() + make_interval(secs => p_delay_seconds),
      "statusReason" = p_error_code, "leaseOwnerToken" = NULL, "leaseExpiresAt" = NULL,
      "heartbeatAt" = now(), "progressJson" = jsonb_build_object('phase', 'waiting-provider', 'retryAfterSeconds', p_delay_seconds)
    WHERE id = p_job_id;
    UPDATE public.worker_job_attempts SET "finishedAt" = now(), "terminalClass" =
      CASE WHEN p_error_code = 'provider_request_failed' THEN 'retryable_failure' ELSE 'provider_rejected' END
    WHERE "workerJobId" = p_job_id AND attempt = v_job.attempt AND "leaseGeneration" = p_fencing_version;
  END IF;
  PERFORM public.append_modular_chat_job_event(
    p_job_id, CASE WHEN v_status = 'failed' THEN 'FAILED' ELSE 'RETRY_SCHEDULED' END,
    'retry:' || p_job_id || ':' || p_fencing_version::text,
    jsonb_build_object('errorCode', p_error_code, 'retryAfterSeconds', p_delay_seconds, 'attemptConsumed', p_attempt_consumed)
  );
  RETURN v_status;
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
  IF p_error_code NOT IN ('provider_unavailable', 'model_unavailable', 'invalid_provider_response', 'provider_request_failed') THEN
    RAISE EXCEPTION 'CHAT_JOB_ERROR_CODE_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE public.worker_jobs AS job
  SET status = 'failed', "finishedAt" = now(), "failureReason" = p_error_code,
      "errorCode" = p_error_code,
      "errorMessage" = CASE p_error_code
        WHEN 'model_unavailable' THEN 'The selected AI model is no longer available.'
        WHEN 'invalid_provider_response' THEN 'The AI provider returned an invalid response.'
        ELSE 'The AI provider could not complete this request.' END,
      "leaseOwnerToken" = NULL, "leaseExpiresAt" = NULL,
      "progressJson" = jsonb_build_object('phase', 'failed', 'errorCode', p_error_code)
  WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
    AND job.status IN ('leased', 'running') AND job."leaseOwnerToken" = p_lease_token
    AND job."fencingVersion" = p_fencing_version
    AND ((session_user = 'modular_core_auth_dev' AND job.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND job.environment_tenant_id = 'modular-production'))
  RETURNING job.attempt INTO v_attempt;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.worker_job_attempts SET "finishedAt" = now(), "terminalClass" = 'failed'
  WHERE "workerJobId" = p_job_id AND attempt = v_attempt AND "leaseGeneration" = p_fencing_version;
  PERFORM public.append_modular_chat_job_event(
    p_job_id, 'FAILED', 'failed:' || p_job_id || ':' || p_fencing_version::text,
    jsonb_build_object('errorCode', p_error_code)
  );
  RETURN true;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.complete_modular_chat_turn_job(
  p_job_id varchar,
  p_lease_token varchar,
  p_fencing_version integer,
  p_assistant_content text,
  p_prompt_tokens integer,
  p_completion_tokens integer
)
RETURNS TABLE(completed boolean, conversation_id integer, user_message_id integer, assistant_message_id integer, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_job public.worker_jobs%ROWTYPE;
  v_saved record;
  v_attempt_id varchar(36);
BEGIN
  IF p_assistant_content IS NULL OR length(p_assistant_content) NOT BETWEEN 1 AND 24000 OR
     COALESCE(p_prompt_tokens, 0) < 0 OR COALESCE(p_completion_tokens, 0) < 0 THEN
    RAISE EXCEPTION 'CHAT_COMPLETION_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job FROM public.worker_jobs AS job
  WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
    AND job.status = 'running' AND job."leaseOwnerToken" = p_lease_token
    AND job."fencingVersion" = p_fencing_version
    AND ((session_user = 'modular_core_auth_dev' AND job.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND job.environment_tenant_id = 'modular-production'))
  FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::integer, NULL::integer, NULL::integer, NULL::timestamptz; RETURN; END IF;

  SELECT attempt.id INTO v_attempt_id FROM public.worker_job_attempts AS attempt
  WHERE attempt."workerJobId" = p_job_id AND attempt.attempt = v_job.attempt
    AND attempt."leaseGeneration" = p_fencing_version LIMIT 1;
  SELECT * INTO v_saved FROM public.append_modular_chat_turn(
    v_job."requestedByUserId", v_job.environment_tenant_id, v_job.chat_workspace_id,
    (v_job."inputJson"->>'conversationId')::integer,
    v_job."inputJson"->>'prompt', p_assistant_content, v_job."inputJson"->>'modelId'
  );
  UPDATE public.worker_jobs SET status = 'succeeded', "finishedAt" = now(),
    "outputJson" = jsonb_build_object(
      'conversationId', v_saved.conversation_id,
      'userMessageId', v_saved.user_message_id,
      'assistantMessageId', v_saved.assistant_message_id,
      'modelId', v_job."inputJson"->>'modelId',
      'promptTokens', COALESCE(p_prompt_tokens, 0), 'completionTokens', COALESCE(p_completion_tokens, 0)
    ),
    "progressJson" = jsonb_build_object('phase', 'completed', 'conversationId', v_saved.conversation_id),
    "leaseOwnerToken" = NULL, "leaseExpiresAt" = NULL, "heartbeatAt" = now()
  WHERE id = p_job_id;
  UPDATE public.worker_job_attempts SET "finishedAt" = now(), "terminalClass" = 'succeeded'
  WHERE id = v_attempt_id;
  INSERT INTO public.worker_job_settlements (
    "workerJobId", "attemptId", "settlementKey", "settlementType", "payloadJson"
  ) VALUES (
    p_job_id, v_attempt_id, 'result:' || p_job_id || ':' || COALESCE(v_attempt_id, 'missing'),
    'chat_completion', jsonb_build_object('modelId', v_job."inputJson"->>'modelId', 'promptTokens', COALESCE(p_prompt_tokens, 0), 'completionTokens', COALESCE(p_completion_tokens, 0))
  ) ON CONFLICT ("settlementKey") DO NOTHING;
  PERFORM public.append_modular_chat_job_event(
    p_job_id, 'SUCCEEDED', 'succeeded:' || p_job_id || ':' || p_fencing_version::text,
    jsonb_build_object('conversationId', v_saved.conversation_id, 'modelId', v_job."inputJson"->>'modelId')
  );
  RETURN QUERY SELECT true, v_saved.conversation_id, v_saved.user_message_id, v_saved.assistant_message_id, v_saved.updated_at;
END;
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fail_modular_chat_turn_dead_letter(
  p_job_id varchar,
  p_environment_tenant_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT ((session_user = 'modular_core_auth_dev' AND p_environment_tenant_id = 'modular-development') OR
          (session_user = 'modular_core_auth_prod' AND p_environment_tenant_id = 'modular-production')) THEN
    RAISE EXCEPTION 'CHAT_JOB_ENVIRONMENT_DENIED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.worker_jobs AS job SET status = 'failed', "finishedAt" = now(),
    "failureReason" = 'queue_delivery_exhausted', "errorCode" = 'queue_delivery_exhausted',
    "errorMessage" = 'The queued chat request could not be started.',
    "leaseOwnerToken" = NULL, "leaseExpiresAt" = NULL,
    "progressJson" = jsonb_build_object('phase', 'failed', 'errorCode', 'queue_delivery_exhausted')
  WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
    AND job.environment_tenant_id = p_environment_tenant_id
    AND job.status NOT IN ('succeeded', 'failed', 'cancelled', 'completed', 'canceled', 'expired');
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM public.append_modular_chat_job_event(
    p_job_id, 'FAILED', 'dead-letter:' || p_job_id,
    jsonb_build_object('errorCode', 'queue_delivery_exhausted')
  );
  RETURN true;
END;
$function$;
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
         job."outputJson", job."errorCode", job."createdAt", COALESCE(job."finishedAt", job."heartbeatAt", job."createdAt")
  FROM public.worker_jobs AS job
  WHERE job.id = p_job_id AND job."jobType" = 'modular_chat.turn'
    AND job.environment_tenant_id = p_environment_tenant_id
    AND job.chat_workspace_id = p_workspace_id AND job."requestedByUserId" = p_user_id
  LIMIT 1;
END;
$function$;
--> statement-breakpoint

DO $modular_chat_queue_grants$ BEGIN
  REVOKE ALL ON FUNCTION public.append_modular_chat_job_event(varchar, varchar, varchar, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.create_modular_chat_turn_job(integer, varchar, varchar, integer, text, integer, varchar, varchar) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.prepare_modular_chat_turn_outbox(varchar, varchar, varchar) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.mark_modular_chat_turn_outbox_published(varchar, varchar, varchar) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.record_modular_chat_turn_outbox_failure(varchar, varchar, varchar) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.claim_modular_chat_turn_job(varchar, varchar, varchar) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.begin_modular_chat_turn_job(varchar, varchar, varchar, integer) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.defer_modular_chat_turn_job(varchar, varchar, integer, integer, boolean, varchar) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fail_modular_chat_turn_job(varchar, varchar, integer, varchar) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.complete_modular_chat_turn_job(varchar, varchar, integer, text, integer, integer) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fail_modular_chat_turn_dead_letter(varchar, varchar) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.get_modular_chat_turn_job_status(integer, varchar, varchar, varchar) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.create_modular_chat_turn_job(integer, varchar, varchar, integer, text, integer, varchar, varchar) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.prepare_modular_chat_turn_outbox(varchar, varchar, varchar) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.mark_modular_chat_turn_outbox_published(varchar, varchar, varchar) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.record_modular_chat_turn_outbox_failure(varchar, varchar, varchar) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.claim_modular_chat_turn_job(varchar, varchar, varchar) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.begin_modular_chat_turn_job(varchar, varchar, varchar, integer) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.defer_modular_chat_turn_job(varchar, varchar, integer, integer, boolean, varchar) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.fail_modular_chat_turn_job(varchar, varchar, integer, varchar) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.complete_modular_chat_turn_job(varchar, varchar, integer, text, integer, integer) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.fail_modular_chat_turn_dead_letter(varchar, varchar) TO modular_core_auth_dev;
    GRANT EXECUTE ON FUNCTION public.get_modular_chat_turn_job_status(integer, varchar, varchar, varchar) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.create_modular_chat_turn_job(integer, varchar, varchar, integer, text, integer, varchar, varchar) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.prepare_modular_chat_turn_outbox(varchar, varchar, varchar) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.mark_modular_chat_turn_outbox_published(varchar, varchar, varchar) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.record_modular_chat_turn_outbox_failure(varchar, varchar, varchar) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.claim_modular_chat_turn_job(varchar, varchar, varchar) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.begin_modular_chat_turn_job(varchar, varchar, varchar, integer) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.defer_modular_chat_turn_job(varchar, varchar, integer, integer, boolean, varchar) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.fail_modular_chat_turn_job(varchar, varchar, integer, varchar) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.complete_modular_chat_turn_job(varchar, varchar, integer, text, integer, integer) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.fail_modular_chat_turn_dead_letter(varchar, varchar) TO modular_core_auth_prod;
    GRANT EXECUTE ON FUNCTION public.get_modular_chat_turn_job_status(integer, varchar, varchar, varchar) TO modular_core_auth_prod;
  END IF;
END $modular_chat_queue_grants$;
