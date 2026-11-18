-- Use the dedicated Runner authorization boundary for pairing approval.
-- The Chat workspace guard does not recognize the reserved DEV system tenant.
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

-- PostgreSQL requires CREATE on the schema even when replacing a function
-- already owned by this role. The grant is transaction-scoped and revoked
-- immediately after the replacement; the restricted owner keeps no standing
-- schema-creation privilege.
GRANT CREATE ON SCHEMA public TO modular_chat_mission_owner;
--> statement-breakpoint

SET LOCAL ROLE modular_chat_mission_owner;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.approve_modular_runner_pairing(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v jsonb:=p_request->0; v_environment varchar; v_pair public.modular_runner_pairings%ROWTYPE;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.assert_modular_runner_pairing_access((v->>'userId')::integer,v_environment,v->>'tenantId') THEN
    RETURN jsonb_build_object('status','denied'); END IF;
  SELECT * INTO v_pair FROM public.modular_runner_pairings WHERE user_code_hash=v->>'userCodeHash'
    AND environment_tenant_id=v_environment FOR UPDATE;
  IF NOT FOUND OR v_pair.status IN ('consumed','denied') THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF v_pair.expires_at<=now() THEN RETURN jsonb_build_object('status','expired'); END IF;
  IF v_pair.status='approved' THEN
    RETURN jsonb_build_object('status',CASE WHEN v_pair.tenant_id=v->>'tenantId'
      AND v_pair.approved_by=(v->>'userId')::integer THEN 'approved' ELSE 'denied' END);
  END IF;
  UPDATE public.modular_runner_pairings SET status='approved',tenant_id=v->>'tenantId',
    approved_by=(v->>'userId')::integer,approved_at=now() WHERE id=v_pair.id;
  RETURN jsonb_build_object('status','approved');
END $function$;
--> statement-breakpoint

RESET ROLE;
--> statement-breakpoint

REVOKE CREATE ON SCHEMA public FROM modular_chat_mission_owner;
