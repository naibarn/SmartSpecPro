-- Settle from provider-reported USD when available; retain the pinned-price fallback.
CREATE FUNCTION public.complete_modular_chat_turn_with_actual_cost(
  p_job_id varchar, p_lease_token varchar, p_fencing_version integer,
  p_assistant_content text, p_prompt_tokens integer, p_completion_tokens integer, p_cost_usd numeric
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
  IF p_cost_usd IS NOT NULL AND (p_cost_usd::text IN ('NaN', 'Infinity', '-Infinity') OR p_cost_usd < 0) THEN
    RAISE EXCEPTION 'CHAT_CREDIT_COST_INVALID';
  END IF;
  v_charge := CASE WHEN p_cost_usd IS NOT NULL THEN ceil(p_cost_usd * 10000) ELSE
    ceil((p_prompt_tokens::numeric * v_hold.input_usd_per_million + p_completion_tokens::numeric * v_hold.output_usd_per_million) / 1000000 * 10000) END;
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
      jsonb_build_object('jobId', p_job_id, 'phase', 'settlement', 'costUsd', p_cost_usd)) RETURNING id INTO v_refund_id;
  END IF;
  UPDATE public.modular_chat_credit_holds SET state = 'settled', settled_credits = v_charge::integer,
    refund_transaction_id = v_refund_id, updated_at = now() WHERE job_id = p_job_id;
  INSERT INTO public.worker_job_settlements ("workerJobId", "settlementKey", "settlementType", "payloadJson")
  VALUES (p_job_id, 'chat-credit:' || p_job_id, 'chat_credit',
    jsonb_build_object('credits', v_charge::integer, 'costUsd', p_cost_usd,
      'priceSource', CASE WHEN p_cost_usd IS NULL THEN 'pinned_token_price' ELSE 'provider_reported' END))
  ON CONFLICT ("settlementKey") DO NOTHING;
  UPDATE public.messages SET "creditsUsed" = v_charge, "inputTokens" = p_prompt_tokens, "outputTokens" = p_completion_tokens
    WHERE id = v_result.assistant_message_id;
  UPDATE public.worker_jobs SET "outputJson" = "outputJson" || jsonb_build_object('creditsUsed', v_charge::integer)
    WHERE id = p_job_id;
  RETURN QUERY SELECT v_result.completed, v_result.conversation_id, v_result.user_message_id, v_result.assistant_message_id, v_result.updated_at;
END $function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_modular_chat_turn_with_actual_cost(varchar, varchar, integer, text, integer, integer, numeric) FROM PUBLIC;
--> statement-breakpoint
DO $settle_grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN GRANT EXECUTE ON FUNCTION public.complete_modular_chat_turn_with_actual_cost(varchar, varchar, integer, text, integer, integer, numeric) TO modular_core_auth_dev; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN GRANT EXECUTE ON FUNCTION public.complete_modular_chat_turn_with_actual_cost(varchar, varchar, integer, text, integer, integer, numeric) TO modular_core_auth_prod; END IF;
END $settle_grants$;
--> statement-breakpoint
