-- Durable HTTPS control receipts plus canonical Runner/Harness registry updates.
-- This is a replay/idempotency index, not a second execution event ledger.
DO $preflight$
DECLARE v_executor pg_catalog.pg_roles%ROWTYPE; v_owner pg_catalog.pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO v_executor FROM pg_catalog.pg_roles WHERE rolname=current_user;
  SELECT * INTO v_owner FROM pg_catalog.pg_roles WHERE rolname='modular_chat_mission_owner';
  IF current_database()<>'smartspec' OR current_user<>'smartspec_migrator_dev'
    OR v_executor.rolcanlogin IS NOT TRUE OR v_executor.rolsuper OR v_executor.rolcreatedb
    OR v_executor.rolcreaterole OR v_executor.rolbypassrls OR v_executor.rolreplication OR v_executor.rolinherit
    OR NOT pg_catalog.pg_has_role(current_user,'modular_chat_mission_owner','MEMBER')
    OR NOT pg_catalog.has_database_privilege(current_user,current_database(),'CREATE')
    OR NOT pg_catalog.has_schema_privilege(current_user,'public','CREATE')
    OR v_owner.oid IS NULL OR v_owner.rolcanlogin OR v_owner.rolsuper OR v_owner.rolcreatedb
    OR v_owner.rolcreaterole OR v_owner.rolbypassrls OR v_owner.rolreplication OR v_owner.rolinherit
    OR NOT pg_catalog.has_schema_privilege(v_owner.oid,'public','CREATE')
    OR NOT pg_catalog.has_column_privilege(current_user,'public.runner_nodes','runnerId','UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user,'public.runner_nodes','lastSeenAt','UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user,'public.runner_nodes','status','UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user,'public.runner_nodes','updatedAt','UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user,'public.runner_nodes','currentSnapshotRevision','UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user,'public.runner_nodes','currentSnapshotJson','UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user,'public.runner_nodes','snapshotObservedAt','UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user,'public.runner_nodes','snapshotExpiresAt','UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user,'public.runner_capability_snapshots','runnerId','INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_table_privilege(current_user,'public.runner_capability_snapshots','SELECT WITH GRANT OPTION')
    OR NOT pg_catalog.has_table_privilege(current_user,'public.runner_harness_instances','INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_table_privilege(current_user,'public.runner_harness_instances','UPDATE WITH GRANT OPTION')
  THEN RAISE EXCEPTION 'MIGRATION_BOOTSTRAP_REQUIRED: verified Modular DEV migration grants are required'; END IF;
END $preflight$;
--> statement-breakpoint

CREATE TABLE public.modular_runner_control_receipts (
  environment_tenant_id varchar(64) NOT NULL CHECK (environment_tenant_id IN ('modular-development','modular-production')),
  tenant_id varchar(36) NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  runner_id varchar(160) NOT NULL REFERENCES public.runner_nodes("runnerId") ON DELETE CASCADE,
  device_id varchar(160) NOT NULL,
  runner_session_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  idempotency_key varchar(200) NOT NULL,
  body_sha256 varchar(64) NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
  event_type varchar(64) NOT NULL CHECK (event_type IN ('runner.capabilities.update','runner.reconcile')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_tenant_id,tenant_id,runner_id,device_id,idempotency_key),
  UNIQUE (environment_tenant_id,tenant_id,runner_id,device_id,runner_session_id,sequence)
);
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public.modular_runner_control_receipts TO modular_chat_mission_owner;
GRANT UPDATE ("lastSeenAt","status","currentSnapshotRevision","currentSnapshotJson","snapshotObservedAt","snapshotExpiresAt","updatedAt") ON public.runner_nodes TO modular_chat_mission_owner;
GRANT SELECT ("runnerId","tenantId","status","trustState","revokedAt") ON public.runner_nodes TO modular_chat_mission_owner;
GRANT SELECT ("runnerId","revision","idempotencyKey") ON public.runner_capability_snapshots TO modular_chat_mission_owner;
GRANT INSERT ("id","runnerId","tenantId","revision","idempotencyKey","observedAt","expiresAt","snapshotJson")
  ON public.runner_capability_snapshots TO modular_chat_mission_owner;
GRANT SELECT ("tenantId","runnerId","adapterId","toolId","displayName","adapterVersion","trustState","availabilityState",
  "workspaceIds","capabilitySnapshotRevision","provenanceJson","expiresAt","revokedAt")
  ON public.runner_harness_instances TO modular_chat_mission_owner;
GRANT INSERT ("tenantId","runnerId","adapterId","toolId","displayName","adapterVersion","trustState","availabilityState",
  "workspaceIds","capabilitySnapshotRevision","provenanceJson","registeredAt","lastHeartbeatAt","expiresAt","updatedAt")
  ON public.runner_harness_instances TO modular_chat_mission_owner;
GRANT UPDATE ("displayName","adapterVersion","trustState","availabilityState","workspaceIds","capabilitySnapshotRevision",
  "provenanceJson","lastHeartbeatAt","expiresAt","revokedAt","updatedAt") ON public.runner_harness_instances TO modular_chat_mission_owner;
--> statement-breakpoint

CREATE FUNCTION public.record_modular_runner_control(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  v jsonb:=p_request->0; e jsonb; payload jsonb; snap jsonb; tool jsonb;
  v_environment varchar; v_device public.modular_runner_devices%ROWTYPE;
  v_runner_allowed boolean; v_existing public.modular_runner_control_receipts%ROWTYPE;
  v_event_type varchar; v_revision varchar; v_observed timestamptz; v_expires timestamptz;
  v_trust varchar; v_availability varchar; v_auth varchar; v_health varchar;
BEGIN
  v_environment:=CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL OR v_environment<>(v->>'environmentTenantId') THEN
    RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501';
  END IF;
  e:=v->'envelope'; payload:=e->'payload'; v_event_type:=payload->>'type';
  SELECT * INTO v_device FROM public.modular_runner_devices d WHERE d.environment_tenant_id=v_environment
    AND d.tenant_id=v->>'tenantId' AND d.runner_id=v->>'runnerId' AND d.device_id=v->>'deviceId'
    AND d.runner_session_id=(v->>'runnerSessionId')::uuid AND d.control_jti=v->>'accessJti'
    AND d.revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  SELECT EXISTS(SELECT 1 FROM public.runner_nodes r WHERE r."runnerId"=v->>'runnerId'
    AND r."tenantId"=v->>'tenantId' AND r."deviceId"=v->>'deviceId' AND r."revokedAt" IS NULL AND r.status<>'revoked')
    INTO v_runner_allowed;
  IF NOT v_runner_allowed THEN RETURN jsonb_build_object('status','denied'); END IF;
  DELETE FROM public.modular_runner_control_receipts WHERE environment_tenant_id=v_environment
    AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId' AND created_at<now()-interval '7 days';
  SELECT * INTO v_existing FROM public.modular_runner_control_receipts WHERE environment_tenant_id=v_environment
    AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId' AND device_id=v->>'deviceId'
    AND idempotency_key=v->>'idempotencyKey';
  IF FOUND THEN
    IF v_existing.sequence=(v->>'sequence')::bigint AND v_existing.body_sha256=v->>'bodySha256'
      AND v_existing.runner_session_id=(v->>'runnerSessionId')::uuid THEN
      RETURN jsonb_build_object('status','duplicate');
    END IF;
    RETURN jsonb_build_object('status','out_of_order');
  END IF;
  IF EXISTS (SELECT 1 FROM public.modular_runner_control_receipts WHERE environment_tenant_id=v_environment
    AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId' AND device_id=v->>'deviceId'
    AND runner_session_id=(v->>'runnerSessionId')::uuid AND sequence >= (v->>'sequence')::bigint) THEN
    RETURN jsonb_build_object('status','out_of_order');
  END IF;
  IF v_event_type NOT IN ('runner.capabilities.update','runner.reconcile') THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  INSERT INTO public.modular_runner_control_receipts(environment_tenant_id,tenant_id,runner_id,device_id,runner_session_id,
    sequence,idempotency_key,body_sha256,event_type)
  VALUES(v_environment,v->>'tenantId',v->>'runnerId',v->>'deviceId',(v->>'runnerSessionId')::uuid,
    (v->>'sequence')::bigint,v->>'idempotencyKey',v->>'bodySha256',v_event_type);
  UPDATE public.runner_nodes SET "lastSeenAt"=now(),status='online',"updatedAt"=now()
    WHERE "runnerId"=v->>'runnerId' AND "tenantId"=v->>'tenantId';
  IF v_event_type='runner.capabilities.update' THEN
    snap:=payload->'snapshot'; v_revision:=snap->>'revision';
    v_observed:=(snap->>'observedAt')::timestamptz; v_expires:=(snap->>'expiresAt')::timestamptz;
    IF v_revision IS NULL OR v_observed>now()+interval '1 minute' OR v_expires<=now()
      OR v_expires>now()+interval '10 minutes' THEN RAISE EXCEPTION 'RUNNER_SNAPSHOT_INVALID'; END IF;
    INSERT INTO public.runner_capability_snapshots("id","runnerId","tenantId","revision","idempotencyKey","observedAt","expiresAt","snapshotJson")
    VALUES(gen_random_uuid()::varchar,v->>'runnerId',v->>'tenantId',v_revision,v->>'idempotencyKey',v_observed,v_expires,snap)
    ON CONFLICT ("runnerId","revision") DO NOTHING;
    UPDATE public.runner_nodes SET "currentSnapshotRevision"=v_revision,"currentSnapshotJson"=snap,
      "snapshotObservedAt"=v_observed,"snapshotExpiresAt"=v_expires,"updatedAt"=now()
      WHERE "runnerId"=v->>'runnerId' AND "tenantId"=v->>'tenantId';
    UPDATE public.runner_harness_instances SET "availabilityState"='stale',"updatedAt"=now()
      WHERE "tenantId"=v->>'tenantId' AND "runnerId"=v->>'runnerId' AND "revokedAt" IS NULL;
    FOR tool IN SELECT value FROM jsonb_array_elements(COALESCE(snap->'toolInventory','[]'::jsonb)) LOOP
      IF NULLIF(tool->>'adapterId','') IS NULL OR NULLIF(tool->>'toolId','') IS NULL THEN CONTINUE; END IF;
      v_trust:=CASE tool->>'trustState' WHEN 'ready' THEN 'trusted' WHEN 'degraded' THEN 'degraded'
        WHEN 'revoked' THEN 'revoked' WHEN 'quarantined' THEN 'quarantined' ELSE 'pending' END;
      v_availability:=CASE tool->>'availabilityState' WHEN 'available' THEN 'available' WHEN 'busy' THEN 'busy'
        WHEN 'disabled' THEN 'disabled' ELSE 'unavailable' END;
      v_auth:=COALESCE(tool->>'authState','unknown'); v_health:=COALESCE(tool->>'healthState','unknown');
      INSERT INTO public.runner_harness_instances("tenantId","runnerId","adapterId","toolId","displayName","adapterVersion",
        "trustState","availabilityState","workspaceIds","capabilitySnapshotRevision","provenanceJson","registeredAt","lastHeartbeatAt","expiresAt","updatedAt")
      VALUES(v->>'tenantId',v->>'runnerId',tool->>'adapterId',tool->>'toolId',COALESCE(tool->>'displayName',tool->>'toolId'),
        NULLIF(tool->>'version',''),v_trust,v_availability,COALESCE(snap->'workspaceIds','[]'::jsonb),v_revision,
        jsonb_build_object('authState',v_auth,'healthState',v_health,
          'inventoryTrustState',CASE WHEN v_trust='trusted' THEN 'ready' ELSE v_trust END,
          'capabilities',COALESCE(snap->'capabilities','[]'::jsonb),'source','authenticated-runner-snapshot'),
        now(),now(),v_expires,now())
      ON CONFLICT ("tenantId","runnerId","adapterId","toolId") DO UPDATE SET
        "displayName"=EXCLUDED."displayName","adapterVersion"=EXCLUDED."adapterVersion","trustState"=EXCLUDED."trustState",
        "availabilityState"=EXCLUDED."availabilityState","workspaceIds"=EXCLUDED."workspaceIds",
        "capabilitySnapshotRevision"=EXCLUDED."capabilitySnapshotRevision","provenanceJson"=EXCLUDED."provenanceJson",
        "lastHeartbeatAt"=now(),"expiresAt"=EXCLUDED."expiresAt","revokedAt"=NULL,"updatedAt"=now();
    END LOOP;
  END IF;
  RETURN jsonb_build_object('status','applied');
END $function$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.record_modular_runner_control(jsonb) FROM PUBLIC;
ALTER FUNCTION public.record_modular_runner_control(jsonb) OWNER TO modular_chat_mission_owner;
SET ROLE modular_chat_mission_owner;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.record_modular_runner_control(jsonb) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.record_modular_runner_control(jsonb) TO modular_core_auth_prod;
  END IF;
END $grants$;
RESET ROLE;
