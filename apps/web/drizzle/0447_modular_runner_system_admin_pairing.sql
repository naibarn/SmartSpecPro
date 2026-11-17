-- Permit the authenticated platform admin to pair the dedicated headless DEV
-- Runner from a Personal workspace. This grants pairing relay access only; it
-- does not add tenant membership or widen Modular Chat authorization.
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

GRANT SELECT (id, "role", "isDisabled") ON public.users TO modular_chat_mission_owner;
--> statement-breakpoint
GRANT SELECT (id, "isActive") ON public.tenants TO modular_chat_mission_owner;
--> statement-breakpoint
GRANT SELECT (user_id, tenant_id, is_active) ON public.tenant_users TO modular_chat_mission_owner;
--> statement-breakpoint

CREATE FUNCTION public.assert_modular_runner_pairing_access(
  p_user_id integer,
  p_environment_tenant_id varchar,
  p_tenant_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 OR p_tenant_id IS NULL OR length(p_tenant_id) > 36 OR NOT (
    (session_user='modular_core_auth_dev' AND p_environment_tenant_id='modular-development') OR
    (session_user='modular_core_auth_prod' AND p_environment_tenant_id='modular-production')
  ) THEN
    RAISE EXCEPTION 'RUNNER_PAIRING_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;

  IF p_tenant_id='__system__' THEN
    RETURN p_environment_tenant_id='modular-development' AND EXISTS (
      SELECT 1 FROM public.users AS account
      JOIN public.tenants AS tenant ON tenant.id='__system__' AND tenant."isActive" IS TRUE
      WHERE account.id=p_user_id AND account."role"::text='admin' AND account."isDisabled" IS FALSE
    );
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.tenant_users AS membership
    JOIN public.tenants AS tenant ON tenant.id=membership.tenant_id AND tenant."isActive" IS TRUE
    WHERE membership.user_id=p_user_id AND membership.tenant_id=p_tenant_id
      AND membership.is_active IS TRUE
  );
END $function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.assert_modular_runner_pairing_access(integer,varchar,varchar) FROM PUBLIC;
--> statement-breakpoint
ALTER FUNCTION public.assert_modular_runner_pairing_access(integer,varchar,varchar) OWNER TO modular_chat_mission_owner;
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
  IF EXISTS (SELECT 1 FROM public.modular_runner_pairing_relays WHERE environment_tenant_id=v_environment
      AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId' AND status IN ('requested','claimed','link_ready')
      AND expires_at>now()) THEN RETURN jsonb_build_object('status','already_pending'); END IF;
  INSERT INTO public.modular_runner_pairing_relays(environment_tenant_id,tenant_id,requested_by,runner_id,expires_at)
    VALUES(v_environment,v->>'tenantId',(v->>'userId')::integer,v->>'runnerId',v_expires) RETURNING id INTO v_id;
  RETURN jsonb_build_object('status','requested','relayId',v_id,'expiresAt',v_expires);
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
    RETURN jsonb_build_object('status','denied'); END IF;
  SELECT * INTO v_row FROM public.modular_runner_pairing_relays WHERE id=(v->>'relayId')::uuid
    AND tenant_id=v->>'tenantId' AND requested_by=(v->>'userId')::integer AND environment_tenant_id=v_environment;
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
  ALTER FUNCTION public.create_modular_runner_pairing_relay(jsonb) OWNER TO modular_chat_mission_owner;
  ALTER FUNCTION public.get_modular_runner_pairing_relay(jsonb) OWNER TO modular_chat_mission_owner;
END $ownership$;
