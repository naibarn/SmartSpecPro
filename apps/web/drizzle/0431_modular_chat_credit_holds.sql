-- Isolated credit reservations owned by the canonical Modular Chat worker job.
-- No paid dispatch uses these functions until the queue consumer is integrated.
CREATE TABLE public.modular_chat_credit_holds (
  job_id varchar(36) PRIMARY KEY REFERENCES public.worker_jobs(id) ON DELETE RESTRICT,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reserved_credits integer NOT NULL CHECK (reserved_credits >= 0),
  settled_credits integer CHECK (settled_credits >= 0 AND settled_credits <= reserved_credits),
  input_usd_per_million numeric NOT NULL CHECK (input_usd_per_million >= 0),
  output_usd_per_million numeric NOT NULL CHECK (output_usd_per_million >= 0),
  reserve_transaction_id integer REFERENCES public.credit_transactions(id) ON DELETE RESTRICT,
  refund_transaction_id integer REFERENCES public.credit_transactions(id) ON DELETE RESTRICT,
  state varchar(16) NOT NULL CHECK (state IN ('reserved', 'settled', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
REVOKE ALL ON public.modular_chat_credit_holds FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.reserve_modular_chat_credits(p_job_id varchar, p_lease_token varchar, p_fencing_version integer)
RETURNS TABLE(reserved_credits integer, pricing_input numeric, pricing_output numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_job public.worker_jobs%ROWTYPE; v_hold public.modular_chat_credit_holds%ROWTYPE;
  v_config record; v_input_bound bigint; v_amount numeric; v_balance integer; v_tx integer;
BEGIN
  SELECT * INTO v_job FROM public.worker_jobs AS j
  WHERE j.id = p_job_id AND j."jobType" = 'modular_chat.turn' AND j.status = 'running'
    AND j."leaseOwnerToken" = p_lease_token AND j."fencingVersion" = p_fencing_version
    AND ((session_user = 'modular_core_auth_dev' AND j.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND j.environment_tenant_id = 'modular-production')) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_CREDIT_JOB_DENIED' USING ERRCODE = '42501'; END IF;
  -- Customer tenant budgets need their own scoped admission before activation.
  IF v_job."tenantId" IS NOT NULL THEN RAISE EXCEPTION 'CHAT_CREDIT_TENANT_UNSUPPORTED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_hold FROM public.modular_chat_credit_holds h WHERE h.job_id = p_job_id FOR UPDATE;
  IF FOUND THEN
    IF v_hold.state <> 'reserved' THEN RAISE EXCEPTION 'CHAT_CREDIT_ALREADY_CLOSED'; END IF;
    RETURN QUERY SELECT v_hold.reserved_credits, v_hold.input_usd_per_million, v_hold.output_usd_per_million; RETURN;
  END IF;
  SELECT * INTO v_config FROM public.get_modular_chat_enabled_model_config(
    v_job."requestedByUserId", v_job.environment_tenant_id, v_job.chat_workspace_id,
    (v_job."inputJson"->>'providerId')::integer, v_job."inputJson"->>'modelId');
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_MODEL_UNAVAILABLE'; END IF;
  -- Reserve against the UTF-8 size of the exact bounded context, plus framing margin.
  SELECT 2 * (octet_length(v_job."inputJson"->>'prompt') + 1024 + COALESCE(sum(x.bytes), 0))
    INTO v_input_bound FROM (
      SELECT octet_length(right(m.content, 6000)) AS bytes FROM public.messages m
      WHERE m."conversationId" = (v_job."inputJson"->>'conversationId')::integer
        AND m.role::text IN ('user', 'assistant') ORDER BY m."createdAt" DESC, m.id DESC LIMIT 12
    ) x;
  v_amount := ceil((v_input_bound * v_config.pricing_input + 768 * v_config.pricing_output) / 1000000 * 10000);
  IF v_amount < 0 OR v_amount > 2147483647 THEN RAISE EXCEPTION 'CHAT_CREDIT_AMOUNT_INVALID'; END IF;
  IF v_amount > 0 THEN
    UPDATE public.users u SET credits = u.credits - v_amount::integer, "lastCreditUsedAt" = now()
      WHERE u.id = v_job."requestedByUserId" AND u."isDisabled" IS FALSE AND u.credits >= v_amount
      RETURNING u.credits INTO v_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_CREDIT_INSUFFICIENT'; END IF;
    INSERT INTO public.credit_transactions ("userId", amount, type, description, "balanceAfter", "idempotencyKey", "conversationId", "sourceType", metadata)
      VALUES (v_job."requestedByUserId", -v_amount::integer, 'usage', 'SmartSIHub Chat credit reservation', v_balance,
        'modular-chat:' || p_job_id || ':reserve', (v_job."inputJson"->>'conversationId')::integer, 'chat',
        jsonb_build_object('jobId', p_job_id, 'phase', 'reservation')) RETURNING id INTO v_tx;
  END IF;
  INSERT INTO public.modular_chat_credit_holds (job_id, user_id, reserved_credits, input_usd_per_million, output_usd_per_million, reserve_transaction_id, state)
  VALUES (p_job_id, v_job."requestedByUserId", v_amount::integer, v_config.pricing_input, v_config.pricing_output, v_tx, 'reserved');
  RETURN QUERY SELECT v_amount::integer, v_config.pricing_input::numeric, v_config.pricing_output::numeric;
END $function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reserve_modular_chat_credits(varchar, varchar, integer) FROM PUBLIC;
--> statement-breakpoint
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN GRANT EXECUTE ON FUNCTION public.reserve_modular_chat_credits(varchar, varchar, integer) TO modular_core_auth_dev; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN GRANT EXECUTE ON FUNCTION public.reserve_modular_chat_credits(varchar, varchar, integer) TO modular_core_auth_prod; END IF;
END $grants$;
--> statement-breakpoint
CREATE FUNCTION public.complete_modular_chat_turn_with_credits(
  p_job_id varchar, p_lease_token varchar, p_fencing_version integer,
  p_assistant_content text, p_prompt_tokens integer, p_completion_tokens integer
)
RETURNS TABLE(completed boolean, conversation_id integer, user_message_id integer, assistant_message_id integer, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_job public.worker_jobs%ROWTYPE; v_hold public.modular_chat_credit_holds%ROWTYPE;
  v_result record; v_charge numeric; v_refund integer; v_balance integer; v_refund_id integer;
BEGIN
  IF p_prompt_tokens IS NULL OR p_completion_tokens IS NULL OR p_prompt_tokens < 0 OR p_completion_tokens < 0 THEN
    RAISE EXCEPTION 'CHAT_CREDIT_USAGE_INVALID';
  END IF;
  SELECT * INTO v_job FROM public.worker_jobs j WHERE j.id = p_job_id AND j."jobType" = 'modular_chat.turn'
    AND j.status = 'running' AND j."leaseOwnerToken" = p_lease_token AND j."fencingVersion" = p_fencing_version
    AND ((session_user = 'modular_core_auth_dev' AND j.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND j.environment_tenant_id = 'modular-production')) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_CREDIT_JOB_DENIED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_hold FROM public.modular_chat_credit_holds h WHERE h.job_id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_hold.state <> 'reserved' THEN RAISE EXCEPTION 'CHAT_CREDIT_HOLD_NOT_OPEN'; END IF;
  v_charge := ceil((p_prompt_tokens::numeric * v_hold.input_usd_per_million + p_completion_tokens::numeric * v_hold.output_usd_per_million) / 1000000 * 10000);
  IF v_charge < 0 OR v_charge > v_hold.reserved_credits THEN RAISE EXCEPTION 'CHAT_CREDIT_RECONCILIATION_REQUIRED'; END IF;
  SELECT * INTO v_result FROM public.complete_modular_chat_turn_job(
    p_job_id, p_lease_token, p_fencing_version, p_assistant_content, p_prompt_tokens, p_completion_tokens);
  IF v_result.completed IS NOT TRUE THEN RAISE EXCEPTION 'CHAT_CREDIT_COMPLETION_FAILED'; END IF;
  v_refund := v_hold.reserved_credits - v_charge::integer;
  IF v_refund > 0 THEN
    UPDATE public.users u SET credits = u.credits + v_refund WHERE u.id = v_hold.user_id
      AND u.credits::bigint + v_refund <= 2147483647 RETURNING u.credits INTO v_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_CREDIT_REFUND_FAILED'; END IF;
    INSERT INTO public.credit_transactions ("userId", amount, type, description, "balanceAfter", "idempotencyKey", "conversationId", "sourceType", "reversalOfTransactionId", metadata)
    VALUES (v_hold.user_id, v_refund, 'refund', 'SmartSIHub Chat unused reservation', v_balance,
      'modular-chat:' || p_job_id || ':refund', v_result.conversation_id, 'chat', v_hold.reserve_transaction_id,
      jsonb_build_object('jobId', p_job_id, 'phase', 'settlement')) RETURNING id INTO v_refund_id;
  END IF;
  UPDATE public.modular_chat_credit_holds SET state = 'settled', settled_credits = v_charge::integer,
    refund_transaction_id = v_refund_id, updated_at = now() WHERE job_id = p_job_id;
  UPDATE public.messages SET "creditsUsed" = v_charge, "inputTokens" = p_prompt_tokens, "outputTokens" = p_completion_tokens
    WHERE id = v_result.assistant_message_id;
  UPDATE public.worker_jobs SET "outputJson" = "outputJson" || jsonb_build_object('creditsUsed', v_charge::integer)
    WHERE id = p_job_id;
  RETURN QUERY SELECT v_result.completed, v_result.conversation_id, v_result.user_message_id, v_result.assistant_message_id, v_result.updated_at;
END $function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_modular_chat_turn_with_credits(varchar, varchar, integer, text, integer, integer) FROM PUBLIC;
--> statement-breakpoint
DO $settle_grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN GRANT EXECUTE ON FUNCTION public.complete_modular_chat_turn_with_credits(varchar, varchar, integer, text, integer, integer) TO modular_core_auth_dev; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN GRANT EXECUTE ON FUNCTION public.complete_modular_chat_turn_with_credits(varchar, varchar, integer, text, integer, integer) TO modular_core_auth_prod; END IF;
END $settle_grants$;
--> statement-breakpoint
CREATE FUNCTION public.fail_modular_chat_turn_and_release_credits(
  p_job_id varchar, p_lease_token varchar, p_fencing_version integer, p_error_code varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_job public.worker_jobs%ROWTYPE; v_hold public.modular_chat_credit_holds%ROWTYPE;
  v_balance integer; v_refund_id integer;
BEGIN
  -- Only failures established before a provider call can release funds here.
  IF p_error_code NOT IN ('model_unavailable', 'provider_unavailable') THEN
    RAISE EXCEPTION 'CHAT_CREDIT_RELEASE_NOT_SAFE';
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
    VALUES (v_hold.user_id, v_hold.reserved_credits, 'refund', 'SmartSIHub Chat cancelled reservation', v_balance,
      'modular-chat:' || p_job_id || ':refund', (v_job."inputJson"->>'conversationId')::integer, 'chat',
      v_hold.reserve_transaction_id, jsonb_build_object('jobId', p_job_id, 'phase', 'released')) RETURNING id INTO v_refund_id;
  END IF;
  UPDATE public.modular_chat_credit_holds SET state='released', settled_credits=0,
    refund_transaction_id=v_refund_id, updated_at=now() WHERE job_id=p_job_id;
  RETURN true;
END $function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fail_modular_chat_turn_and_release_credits(varchar, varchar, integer, varchar) FROM PUBLIC;
--> statement-breakpoint
DO $release_grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN GRANT EXECUTE ON FUNCTION public.fail_modular_chat_turn_and_release_credits(varchar, varchar, integer, varchar) TO modular_core_auth_dev; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN GRANT EXECUTE ON FUNCTION public.fail_modular_chat_turn_and_release_credits(varchar, varchar, integer, varchar) TO modular_core_auth_prod; END IF;
END $release_grants$;
