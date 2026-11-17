-- Recover a failed headless Runner pairing without waiting for its full relay
-- TTL. The relay remains bound to the same environment, tenant and Runner.
DO $preflight$
DECLARE v_executor pg_catalog.pg_roles%ROWTYPE; v_owner pg_catalog.pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO v_executor FROM pg_catalog.pg_roles WHERE rolname=current_user;
  SELECT * INTO v_owner FROM pg_catalog.pg_roles WHERE rolname='modular_chat_mission_owner';
  IF current_database() <> 'smartspec'
    OR NOT (
      (current_user = 'smartspec_migrator_dev' AND NOT v_executor.rolsuper
        AND NOT v_executor.rolcreatedb AND NOT v_executor.rolcreaterole
        AND NOT v_executor.rolbypassrls AND NOT v_executor.rolreplication
        AND NOT v_executor.rolinherit
        AND pg_catalog.pg_has_role(current_user,'modular_chat_mission_owner','MEMBER'))
      OR (v_executor.rolsuper AND current_setting('application_name',true) = 'spec312-r124-single-owner-dev-admin')
    )
    OR v_owner.oid IS NULL OR v_owner.rolcanlogin OR v_owner.rolsuper OR v_owner.rolcreatedb
    OR v_owner.rolcreaterole OR v_owner.rolbypassrls OR v_owner.rolreplication OR v_owner.rolinherit
  THEN RAISE EXCEPTION 'MIGRATION_BOOTSTRAP_REQUIRED: verified Modular DEV migration authority is required'; END IF;
END $preflight$;
--> statement-breakpoint

-- The migrator is a non-inheriting member of this narrowly scoped NOLOGIN
-- owner role. Switch only for the SECURITY DEFINER function replacements;
-- Drizzle's outer migration transaction rolls the role switch back on error.
SET LOCAL ROLE modular_chat_mission_owner;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_modular_runner_pairing_relay(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v jsonb:=p_request->0; v_environment varchar; v_id uuid; v_expires timestamptz;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.assert_modular_runner_pairing_access((v->>'userId')::integer,v_environment,v->>'tenantId') THEN
    RETURN jsonb_build_object('status','denied'); END IF;

  v_expires:=now()+interval '60 minutes';
  UPDATE public.modular_runner_pairing_relays SET status='expired',updated_at=now()
    WHERE environment_tenant_id=v_environment AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId'
      AND status IN ('requested','claimed','link_ready') AND expires_at<=now();
  -- Claim is only held while the headless Runner creates and publishes the
  -- approval URL. A claim older than five minutes is abandoned and reusable.
  UPDATE public.modular_runner_pairing_relays SET status='failed',updated_at=now()
    WHERE environment_tenant_id=v_environment AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId'
      AND status='claimed' AND updated_at<=now()-interval '5 minutes';
  IF EXISTS (SELECT 1 FROM public.modular_runner_pairing_relays WHERE environment_tenant_id=v_environment
      AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId' AND status IN ('requested','claimed','link_ready')
      AND expires_at>now()) THEN RETURN jsonb_build_object('status','already_pending'); END IF;
  INSERT INTO public.modular_runner_pairing_relays(environment_tenant_id,tenant_id,requested_by,runner_id,expires_at)
    VALUES(v_environment,v->>'tenantId',(v->>'userId')::integer,v->>'runnerId',v_expires) RETURNING id INTO v_id;
  RETURN jsonb_build_object('status','requested','relayId',v_id,'expiresAt',v_expires);
END $function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.finish_modular_runner_pairing_relay(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v jsonb:=p_request->0; v_environment varchar; v_next_status varchar;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  IF v->>'approved'='true' THEN
    v_next_status:='approved';
    UPDATE public.modular_runner_pairing_relays SET status=v_next_status,updated_at=now()
      WHERE id=(v->>'relayId')::uuid AND environment_tenant_id=v_environment
        AND runner_id=v->>'runnerId' AND status='link_ready';
  ELSE
    v_next_status:='failed';
    UPDATE public.modular_runner_pairing_relays SET status=v_next_status,updated_at=now()
      WHERE id=(v->>'relayId')::uuid AND environment_tenant_id=v_environment
        AND runner_id=v->>'runnerId' AND status IN ('claimed','link_ready');
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  RETURN jsonb_build_object('status',v_next_status);
END $function$;
--> statement-breakpoint

DO $ownership$
BEGIN
  ALTER FUNCTION public.create_modular_runner_pairing_relay(jsonb) OWNER TO modular_chat_mission_owner;
  ALTER FUNCTION public.finish_modular_runner_pairing_relay(jsonb) OWNER TO modular_chat_mission_owner;
END $ownership$;
--> statement-breakpoint

RESET ROLE;
