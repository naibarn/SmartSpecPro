-- Include uploaded attachment bytes in the conservative Chat input-credit reserve.
CREATE OR REPLACE FUNCTION public.reserve_modular_chat_credits(p_job_id varchar, p_lease_token varchar, p_fencing_version integer)
RETURNS TABLE(reserved_credits integer, pricing_input numeric, pricing_output numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_job public.worker_jobs%ROWTYPE; v_hold public.modular_chat_credit_holds%ROWTYPE;
  v_config record; v_input_bound bigint; v_attachment_bytes bigint; v_amount numeric; v_balance integer; v_tx integer;
BEGIN
  SELECT * INTO v_job FROM public.worker_jobs AS j
  WHERE j.id = p_job_id AND j."jobType" = 'modular_chat.turn' AND j.status = 'running'
    AND j."leaseOwnerToken" = p_lease_token AND j."fencingVersion" = p_fencing_version
    AND ((session_user = 'modular_core_auth_dev' AND j.environment_tenant_id = 'modular-development') OR
         (session_user = 'modular_core_auth_prod' AND j.environment_tenant_id = 'modular-production')) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_CREDIT_JOB_DENIED' USING ERRCODE = '42501'; END IF;
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
  SELECT COALESCE(NULLIF((regexp_match(v_job."inputJson"->>'prompt',
      '\[\[SMARTSIHUB_ATTACHMENT_INPUT_BYTES:v1:([0-9]{1,8})\]\]'))[1], '')::bigint, 0)
    INTO v_attachment_bytes;
  IF v_attachment_bytes < 0 OR v_attachment_bytes > 10485760 THEN RAISE EXCEPTION 'CHAT_ATTACHMENT_CREDIT_BOUND_INVALID'; END IF;
  -- UTF-8 prompt + uploaded object bytes + recent context and provider framing, at a conservative two bytes/token bound.
  SELECT 2 * (octet_length(v_job."inputJson"->>'prompt') + 4096 + v_attachment_bytes + COALESCE(sum(x.bytes), 0))
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
