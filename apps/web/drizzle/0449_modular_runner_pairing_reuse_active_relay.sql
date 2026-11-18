-- Restore an authorized admin's active Runner approval relay after refresh or
-- retry rather than returning an opaque already_pending response without its
-- relay ID/URL. Both functions re-check the caller's environment/workspace.
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

SET LOCAL ROLE modular_chat_mission_owner;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_modular_runner_pairing_relay(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  v jsonb:=p_request->0;
  v_environment varchar;
  v_user_id integer;
  v_tenant_id varchar;
  v_runner_id varchar;
  v_expires timestamptz;
  v_row public.modular_runner_pairing_relays%ROWTYPE;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;

  v_user_id:=(v->>'userId')::integer;
  v_tenant_id:=v->>'tenantId';
  v_runner_id:=v->>'runnerId';
  IF NOT public.assert_modular_runner_pairing_access(v_user_id,v_environment,v_tenant_id) THEN
    RETURN jsonb_build_object('status','denied');
  END IF;

  -- Serialize creates for this Runner so concurrent clicks cannot make
  -- multiple active approval requests.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_environment || ':' || v_tenant_id || ':' || v_runner_id, 0));

  UPDATE public.modular_runner_pairing_relays SET status='expired',updated_at=now()
    WHERE environment_tenant_id=v_environment AND tenant_id=v_tenant_id AND runner_id=v_runner_id
      AND status IN ('requested','claimed','link_ready') AND expires_at<=now();
  -- Abandoned claims are released while preserving the long-lived relay
  -- window, so an offline/slow Runner can be retried without waiting an hour.
  UPDATE public.modular_runner_pairing_relays SET status='failed',updated_at=now()
    WHERE environment_tenant_id=v_environment AND tenant_id=v_tenant_id AND runner_id=v_runner_id
      AND status='claimed' AND updated_at<=now()-interval '5 minutes';

  SELECT * INTO v_row FROM public.modular_runner_pairing_relays
    WHERE environment_tenant_id=v_environment AND tenant_id=v_tenant_id AND runner_id=v_runner_id
      AND status IN ('requested','claimed','link_ready') AND expires_at>now()
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    -- The URL is a one-time approval capability. It is returned only after the
    -- same live workspace authorization check above, so an admin can recover
    -- a request created by another admin account in that workspace.
    RETURN jsonb_build_object('status',v_row.status,'relayId',v_row.id,'expiresAt',v_row.expires_at,
      'verificationUriComplete',v_row.verification_uri_complete,'pairingExpiresAt',v_row.pairing_expires_at);
  END IF;

  v_expires:=now()+interval '60 minutes';
  INSERT INTO public.modular_runner_pairing_relays(environment_tenant_id,tenant_id,requested_by,runner_id,expires_at)
    VALUES(v_environment,v_tenant_id,v_user_id,v_runner_id,v_expires) RETURNING * INTO v_row;
  RETURN jsonb_build_object('status','requested','relayId',v_row.id,'expiresAt',v_row.expires_at);
END $function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.get_modular_runner_pairing_relay(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v jsonb:=p_request->0; v_environment varchar; v_row public.modular_runner_pairing_relays%ROWTYPE;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.assert_modular_runner_pairing_access((v->>'userId')::integer,v_environment,v->>'tenantId') THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  SELECT * INTO v_row FROM public.modular_runner_pairing_relays WHERE id=(v->>'relayId')::uuid
    AND tenant_id=v->>'tenantId' AND environment_tenant_id=v_environment;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF v_row.expires_at<=now() AND v_row.status IN ('requested','claimed','link_ready') THEN
    UPDATE public.modular_runner_pairing_relays SET status='expired',updated_at=now() WHERE id=v_row.id;
    RETURN jsonb_build_object('status','expired');
  END IF;
  RETURN jsonb_build_object('status',v_row.status,'relayId',v_row.id,'expiresAt',v_row.expires_at,
    'verificationUriComplete',v_row.verification_uri_complete,'pairingExpiresAt',v_row.pairing_expires_at);
END $function$;
--> statement-breakpoint

DO $ownership$
BEGIN
  REVOKE ALL ON FUNCTION public.create_modular_runner_pairing_relay(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.get_modular_runner_pairing_relay(jsonb) FROM PUBLIC;
  ALTER FUNCTION public.create_modular_runner_pairing_relay(jsonb) OWNER TO modular_chat_mission_owner;
  ALTER FUNCTION public.get_modular_runner_pairing_relay(jsonb) OWNER TO modular_chat_mission_owner;
END $ownership$;
--> statement-breakpoint

RESET ROLE;
