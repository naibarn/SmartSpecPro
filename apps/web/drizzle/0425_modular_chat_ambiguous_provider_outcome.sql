-- Never re-run an LLM call after an expired lease if the prior attempt had started.
-- The provider may have completed the request even when the Core Worker lost its response.
ALTER TABLE public.worker_job_outbox
  ADD COLUMN IF NOT EXISTS "modularChatNextAttemptAt" timestamptz;
--> statement-breakpoint

UPDATE public.worker_job_outbox AS outbox
SET "modularChatNextAttemptAt" = COALESCE(outbox."modularChatNextAttemptAt", outbox."nextAttemptAt", now()),
    "nextAttemptAt" = 'infinity'::timestamptz,
    "publisherLeaseTokenHash" = 'modular-chat-outbox-lane-v1',
    "publisherLeaseExpiresAt" = 'infinity'::timestamptz
FROM public.worker_jobs AS job
WHERE job.id = outbox."workerJobId" AND job."jobType" = 'modular_chat.turn';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS worker_job_outbox_modular_chat_due_idx
  ON public.worker_job_outbox ("modularChatNextAttemptAt", "createdAt", id)
  WHERE "publisherLeaseTokenHash" = 'modular-chat-outbox-lane-v1'
    AND "publishedAt" IS NULL AND "cancelledAt" IS NULL AND "quarantinedAt" IS NULL;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.route_modular_chat_outbox_lane()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."envelopeVersion" = 'modular-chat-turn-v1'
    AND NEW."envelopeJson"->>'kind' = 'modular-chat-turn.v1' THEN
    NEW."modularChatNextAttemptAt" := COALESCE(NEW."modularChatNextAttemptAt", NEW."nextAttemptAt", now());
    NEW."publisherLeaseTokenHash" := 'modular-chat-outbox-lane-v1';
    NEW."publisherLeaseExpiresAt" := 'infinity'::timestamptz;
    NEW."nextAttemptAt" := 'infinity'::timestamptz;
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS worker_job_outbox_modular_chat_lane_insert ON public.worker_job_outbox;
CREATE TRIGGER worker_job_outbox_modular_chat_lane_insert
  BEFORE INSERT ON public.worker_job_outbox
  FOR EACH ROW EXECUTE FUNCTION public.route_modular_chat_outbox_lane();
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
      AND outbox."quarantinedAt" IS NULL AND outbox."modularChatNextAttemptAt" <= now()
      AND (outbox."modularChatDispatchLeaseExpiresAt" IS NULL
        OR outbox."modularChatDispatchLeaseExpiresAt" <= now())
      AND (p_job_id IS NULL OR job.id = p_job_id)
    ORDER BY outbox."modularChatNextAttemptAt", outbox."createdAt", outbox.id
    FOR UPDATE OF outbox SKIP LOCKED
    LIMIT 100
  )
  UPDATE public.worker_job_outbox AS outbox
  SET "modularChatDispatchLeaseTokenHash" = p_dispatch_token_hash,
      "modularChatDispatchLeaseExpiresAt" = now() + interval '30 seconds',
      "updatedAt" = now()
  FROM due, public.worker_jobs AS job
  WHERE outbox.id = due.id AND job.id = outbox."workerJobId"
  RETURNING outbox.id, job.id, outbox."envelopeJson", outbox."dedupeKey", outbox."modularChatNextAttemptAt";
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
  IF p_error_code IS NULL OR p_error_code NOT IN ('queue_unavailable', 'queue_publish_failed') THEN
    RAISE EXCEPTION 'CHAT_OUTBOX_ERROR_CODE_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE public.worker_job_outbox AS outbox
  SET "publishAttempts" = outbox."publishAttempts" + 1,
      "failedReason" = p_error_code,
      "modularChatNextAttemptAt" = now() + make_interval(secs => LEAST(900, power(2, LEAST(outbox."publishAttempts" + 1, 9))::integer)),
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

REVOKE ALL ON FUNCTION public.route_modular_chat_outbox_lane() FROM PUBLIC;
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
  v_attempt_id varchar(36);
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

  IF v_job.status IN ('leased', 'running') AND v_job."leaseExpiresAt" <= v_now THEN
    SELECT attempt.id INTO v_attempt_id
    FROM public.worker_job_attempts AS attempt
    WHERE attempt."workerJobId" = p_job_id AND attempt.attempt = v_job.attempt
      AND attempt."leaseGeneration" = v_job."fencingVersion" AND attempt."finishedAt" IS NULL
    LIMIT 1;
    IF FOUND THEN
      UPDATE public.worker_jobs SET status = 'failed', "finishedAt" = v_now,
        "failureReason" = 'provider_outcome_unknown', "errorCode" = 'provider_outcome_unknown',
        "errorMessage" = 'The AI provider may have received this request, but its result could not be confirmed.',
        "statusReason" = 'provider_outcome_unknown', "leaseOwnerToken" = NULL, "leaseExpiresAt" = NULL,
        "nextRetryAt" = NULL, "progressJson" = jsonb_build_object('phase', 'failed', 'errorCode', 'provider_outcome_unknown')
      WHERE id = p_job_id;
      UPDATE public.worker_job_attempts SET "finishedAt" = v_now, "terminalClass" = 'outcome_unknown'
      WHERE id = v_attempt_id;
      PERFORM public.append_modular_chat_job_event(
        p_job_id, 'FAILED', 'unknown:' || p_job_id || ':' || v_job."fencingVersion"::text,
        jsonb_build_object('errorCode', 'provider_outcome_unknown')
      );
      RETURN QUERY SELECT 'terminal'::varchar, 0, NULL::jsonb, v_job."fencingVersion"; RETURN;
    END IF;
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
  IF p_error_code NOT IN ('provider_unavailable', 'model_unavailable', 'invalid_provider_response', 'provider_request_failed', 'provider_outcome_unknown') THEN
    RAISE EXCEPTION 'CHAT_JOB_ERROR_CODE_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE public.worker_jobs AS job
  SET status = 'failed', "finishedAt" = now(), "failureReason" = p_error_code,
      "errorCode" = p_error_code,
      "errorMessage" = CASE p_error_code
        WHEN 'model_unavailable' THEN 'The selected AI model is no longer available.'
        WHEN 'invalid_provider_response' THEN 'The AI provider returned an invalid response.'
        WHEN 'provider_outcome_unknown' THEN 'The AI provider may have received this request, but its result could not be confirmed.'
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
