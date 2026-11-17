-- Admin-triggered pairing relay for the headless Modular DEV Runner.
-- The Runner still creates the actual one-time pairing challenge; this table
-- only carries a bounded request and its approval URL back to an admin.
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
    OR NOT pg_catalog.has_function_privilege(v_owner.oid,
      'public.assert_modular_chat_workspace_access(integer,character varying,character varying)','EXECUTE')
  THEN RAISE EXCEPTION 'MIGRATION_BOOTSTRAP_REQUIRED: verified Modular DEV migration authority is required'; END IF;
END $preflight$;
--> statement-breakpoint

CREATE TABLE public.modular_runner_pairing_relays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_tenant_id varchar(64) NOT NULL CHECK (environment_tenant_id IN ('modular-development','modular-production')),
  tenant_id varchar(36) NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  runner_id varchar(160) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','claimed','link_ready','approved','failed','expired')),
  verification_uri_complete text,
  pairing_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT modular_runner_pairing_relays_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT modular_runner_pairing_relays_url_state_check CHECK (
    (status IN ('link_ready','approved') AND verification_uri_complete IS NOT NULL AND pairing_expires_at IS NOT NULL)
    OR status NOT IN ('link_ready','approved'))
);
--> statement-breakpoint
CREATE INDEX modular_runner_pairing_relays_pending_idx
  ON public.modular_runner_pairing_relays(environment_tenant_id,runner_id,created_at)
  WHERE status IN ('requested','claimed','link_ready');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modular_runner_pairing_relays TO modular_chat_mission_owner;
--> statement-breakpoint

CREATE FUNCTION public.create_modular_runner_pairing_relay(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v jsonb:=p_request->0; v_environment varchar; v_id uuid; v_expires timestamptz;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  IF public.assert_modular_chat_workspace_access((v->>'userId')::integer,v_environment,v->>'tenantId') IS NULL THEN
    RETURN jsonb_build_object('status','denied'); END IF;
  -- The Runner can be offline while the admin is away. Keep the relay request
  -- for 60 minutes; after the Runner publishes a challenge, that challenge has
  -- its own 30-minute approval window.
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

CREATE FUNCTION public.claim_modular_runner_pairing_relay(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v jsonb:=p_request->0; v_environment varchar; v_row public.modular_runner_pairing_relays%ROWTYPE;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  UPDATE public.modular_runner_pairing_relays SET status='claimed',updated_at=now()
    WHERE id=(SELECT id FROM public.modular_runner_pairing_relays WHERE environment_tenant_id=v_environment
      AND runner_id=v->>'runnerId' AND status='requested' AND expires_at>now()
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','idle'); END IF;
  RETURN jsonb_build_object('status','claimed','relayId',v_row.id,'expiresAt',v_row.expires_at);
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.publish_modular_runner_pairing_relay(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v jsonb:=p_request->0; v_environment varchar;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  UPDATE public.modular_runner_pairing_relays SET status='link_ready',verification_uri_complete=v->>'verificationUriComplete',
    pairing_expires_at=(v->>'pairingExpiresAt')::timestamptz,expires_at=(v->>'pairingExpiresAt')::timestamptz,updated_at=now()
    WHERE id=(v->>'relayId')::uuid AND environment_tenant_id=v_environment AND runner_id=v->>'runnerId'
      AND status='claimed' AND expires_at>now()
      AND (v->>'pairingExpiresAt')::timestamptz>now()
      AND (v->>'pairingExpiresAt')::timestamptz<=now()+interval '31 minutes'
      AND v->>'verificationUriComplete' LIKE 'https://aimarkethubs.com/runner/approve?user_code=%';
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  RETURN jsonb_build_object('status','link_ready');
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.get_modular_runner_pairing_relay(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v jsonb:=p_request->0; v_environment varchar; v_row public.modular_runner_pairing_relays%ROWTYPE;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  IF public.assert_modular_chat_workspace_access((v->>'userId')::integer,v_environment,v->>'tenantId') IS NULL THEN
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

CREATE FUNCTION public.finish_modular_runner_pairing_relay(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v jsonb:=p_request->0; v_environment varchar;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  UPDATE public.modular_runner_pairing_relays SET status=CASE WHEN v->>'approved'='true' THEN 'approved' ELSE 'failed' END,
    updated_at=now() WHERE id=(v->>'relayId')::uuid AND environment_tenant_id=v_environment
      AND runner_id=v->>'runnerId' AND status='link_ready';
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  RETURN jsonb_build_object('status',CASE WHEN v->>'approved'='true' THEN 'approved' ELSE 'failed' END);
END $function$;
--> statement-breakpoint

DO $ownership$
DECLARE v_signature text;
BEGIN
  FOR v_signature IN SELECT * FROM (VALUES
    ('public.create_modular_runner_pairing_relay(jsonb)'),('public.claim_modular_runner_pairing_relay(jsonb)'),
    ('public.publish_modular_runner_pairing_relay(jsonb)'),('public.get_modular_runner_pairing_relay(jsonb)'),
    ('public.finish_modular_runner_pairing_relay(jsonb)')) AS f(signature)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',v_signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO modular_chat_mission_owner',v_signature);
  END LOOP;
END $ownership$;
--> statement-breakpoint
SET ROLE modular_chat_mission_owner;
DO $grants$
DECLARE v_signature text;
BEGIN
  FOR v_signature IN SELECT * FROM (VALUES
    ('public.create_modular_runner_pairing_relay(jsonb)'),('public.claim_modular_runner_pairing_relay(jsonb)'),
    ('public.publish_modular_runner_pairing_relay(jsonb)'),('public.get_modular_runner_pairing_relay(jsonb)'),
    ('public.finish_modular_runner_pairing_relay(jsonb)')) AS f(signature)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='modular_core_auth_dev') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO modular_core_auth_dev',v_signature);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='modular_core_auth_prod') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO modular_core_auth_prod',v_signature);
    END IF;
  END LOOP;
END $grants$;
RESET ROLE;
