-- Durable Modular Runner enrollment and credential lifecycle.
-- All runtime writes are exposed through narrowly scoped SECURITY DEFINER functions.
DO $preflight$
DECLARE
  v_executor pg_catalog.pg_roles%ROWTYPE;
  v_owner pg_catalog.pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO v_executor FROM pg_catalog.pg_roles WHERE rolname = current_user;
  SELECT * INTO v_owner FROM pg_catalog.pg_roles WHERE rolname = 'modular_chat_mission_owner';
  IF current_database() <> 'smartspec' OR v_executor.rolcanlogin IS NOT TRUE
    OR current_user <> 'smartspec_migrator_dev' OR v_executor.rolsuper OR v_executor.rolcreatedb
    OR v_executor.rolcreaterole OR v_executor.rolbypassrls OR v_executor.rolreplication OR v_executor.rolinherit
    OR NOT pg_catalog.pg_has_role(current_user, 'modular_chat_mission_owner', 'MEMBER')
    OR NOT pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE')
    OR NOT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
    OR v_owner.oid IS NULL OR v_owner.rolcanlogin OR v_owner.rolsuper OR v_owner.rolcreatedb
    OR v_owner.rolcreaterole OR v_owner.rolbypassrls OR v_owner.rolreplication OR v_owner.rolinherit
    OR NOT pg_catalog.has_schema_privilege(v_owner.oid, 'public', 'CREATE')
    OR NOT pg_catalog.has_function_privilege(v_owner.oid,
      'public.assert_modular_chat_workspace_access(integer,character varying,character varying)', 'EXECUTE')
    OR NOT pg_catalog.has_column_privilege(v_owner.oid, 'public.runner_nodes', 'runnerId', 'SELECT')
    OR NOT pg_catalog.has_column_privilege(v_owner.oid, 'public.runner_nodes', 'tenantId', 'SELECT')
    OR NOT pg_catalog.has_column_privilege(v_owner.oid, 'public.runner_nodes', 'ownerUserId', 'SELECT')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'runnerId', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'tenantId', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'ownerUserId', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'nodeKind', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'profile', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'deviceId', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'displayName', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'trustState', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'status', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'activeSessionId', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'updatedAt', 'INSERT WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'updatedAt', 'UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'revokedAt', 'UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'status', 'UPDATE WITH GRANT OPTION')
    OR NOT pg_catalog.has_column_privilege(current_user, 'public.runner_nodes', 'activeSessionId', 'UPDATE WITH GRANT OPTION')
  THEN RAISE EXCEPTION 'MIGRATION_BOOTSTRAP_REQUIRED: verified Modular DEV migration authority and restricted Mission owner capabilities are required'; END IF;
END $preflight$;
--> statement-breakpoint

CREATE TABLE public.modular_runner_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_tenant_id varchar(64) NOT NULL CHECK (environment_tenant_id IN ('modular-development','modular-production')),
  device_code_hash varchar(64) NOT NULL UNIQUE,
  pairing_nonce_hash varchar(64) NOT NULL,
  user_code_hash varchar(64) NOT NULL,
  runner_id varchar(160) NOT NULL,
  display_name varchar(255) NOT NULL,
  device_id varchar(160) NOT NULL,
  machine_fingerprint varchar(512) NOT NULL,
  public_key text NOT NULL,
  runner_version varchar(64) NOT NULL,
  runner_contracts jsonb NOT NULL,
  connect_revisions jsonb NOT NULL,
  runner_session_id uuid NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','consumed','denied')),
  tenant_id varchar(36) REFERENCES public.tenants(id) ON DELETE CASCADE,
  approved_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  consumed_at timestamptz,
  CONSTRAINT modular_runner_pairings_expiry_check CHECK (expires_at > created_at)
);
--> statement-breakpoint
CREATE UNIQUE INDEX modular_runner_pairings_user_code_live_uq
  ON public.modular_runner_pairings(user_code_hash) WHERE status IN ('pending','approved');
CREATE INDEX modular_runner_pairings_expiry_idx ON public.modular_runner_pairings(expires_at) WHERE status IN ('pending','approved');
--> statement-breakpoint

CREATE TABLE public.modular_runner_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_tenant_id varchar(64) NOT NULL CHECK (environment_tenant_id IN ('modular-development','modular-production')),
  tenant_id varchar(36) NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  runner_id varchar(160) NOT NULL REFERENCES public.runner_nodes("runnerId") ON DELETE CASCADE,
  device_id varchar(160) NOT NULL,
  machine_fingerprint varchar(512) NOT NULL,
  public_key text NOT NULL,
  runner_session_id uuid NOT NULL,
  control_jti varchar(64) NOT NULL,
  refresh_jti varchar(64) NOT NULL,
  refresh_token_hash varchar(64) NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT modular_runner_devices_identity_uq UNIQUE (environment_tenant_id, tenant_id, runner_id, device_id),
  CONSTRAINT modular_runner_devices_refresh_hash_uq UNIQUE (refresh_token_hash)
);
--> statement-breakpoint
CREATE INDEX modular_runner_devices_access_jti_idx ON public.modular_runner_devices(environment_tenant_id, control_jti) WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE TABLE public.modular_runner_proof_nonces (
  environment_tenant_id varchar(64) NOT NULL,
  tenant_id varchar(36) NOT NULL,
  runner_id varchar(160) NOT NULL,
  device_id varchar(160) NOT NULL,
  nonce varchar(36) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_tenant_id, tenant_id, runner_id, device_id, nonce)
);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modular_runner_pairings TO modular_chat_mission_owner;
GRANT SELECT, INSERT, UPDATE ON public.modular_runner_devices TO modular_chat_mission_owner;
GRANT SELECT, INSERT, DELETE ON public.modular_runner_proof_nonces TO modular_chat_mission_owner;
GRANT INSERT ("runnerId", "tenantId", "ownerUserId", "nodeKind", "profile", "deviceId", "displayName", "trustState", "status", "activeSessionId", "updatedAt"),
  UPDATE ("updatedAt", "revokedAt", "status", "activeSessionId") ON public.runner_nodes TO modular_chat_mission_owner;
GRANT SELECT ("runnerId", "tenantId", "ownerUserId", "nodeKind", "profile", "deviceId", "displayName",
  "trustState", "status", "activeSessionId", "updatedAt", "revokedAt")
  ON public.runner_nodes TO modular_chat_mission_owner;
--> statement-breakpoint

CREATE FUNCTION public.start_modular_runner_pairing(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v jsonb := p_request->0; v_environment varchar;
BEGIN
  v_environment := CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  DELETE FROM public.modular_runner_pairings WHERE environment_tenant_id=v_environment
    AND expires_at < now()-interval '1 day' AND status IN ('pending','approved','denied');
  DELETE FROM public.modular_runner_proof_nonces WHERE environment_tenant_id=v_environment
    AND expires_at < now()-interval '1 day';
  INSERT INTO public.modular_runner_pairings(environment_tenant_id,device_code_hash,pairing_nonce_hash,user_code_hash,
    runner_id,display_name,device_id,machine_fingerprint,public_key,runner_version,runner_contracts,connect_revisions,
    runner_session_id,expires_at)
  VALUES(v_environment,v->>'codeHash',v->>'nonceHash',v->>'userCodeHash',v->>'runnerId',v->>'displayName',
    v->>'deviceId',v->>'machineFingerprint',v->>'publicKey',v->>'runnerVersion',v->'runnerContracts',v->'connectRevisions',
    (v->>'runnerSessionId')::uuid,(v->>'expiresAt')::timestamptz);
  RETURN jsonb_build_object('status','pending');
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.approve_modular_runner_pairing(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v jsonb := p_request->0; v_environment varchar; v_pair public.modular_runner_pairings%ROWTYPE;
BEGIN
  v_environment := CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  IF public.assert_modular_chat_workspace_access((v->>'userId')::integer,v_environment,v->>'tenantId') IS NULL THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  SELECT * INTO v_pair FROM public.modular_runner_pairings WHERE user_code_hash=v->>'userCodeHash'
    AND environment_tenant_id=v_environment FOR UPDATE;
  IF NOT FOUND OR v_pair.status IN ('consumed','denied') THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF v_pair.expires_at <= now() THEN RETURN jsonb_build_object('status','expired'); END IF;
  IF v_pair.status='approved' THEN
    RETURN jsonb_build_object('status',CASE WHEN v_pair.tenant_id=v->>'tenantId'
      AND v_pair.approved_by=(v->>'userId')::integer THEN 'approved' ELSE 'denied' END);
  END IF;
  UPDATE public.modular_runner_pairings SET status='approved',tenant_id=v->>'tenantId',approved_by=(v->>'userId')::integer,approved_at=now()
    WHERE id=v_pair.id;
  RETURN jsonb_build_object('status','approved');
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.get_modular_runner_pairing(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v jsonb := p_request->0; v_environment varchar; v_pair public.modular_runner_pairings%ROWTYPE;
BEGIN
  v_environment := CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_pair FROM public.modular_runner_pairings WHERE device_code_hash=v->>'codeHash'
    AND pairing_nonce_hash=v->>'nonceHash' AND environment_tenant_id=v_environment;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF v_pair.expires_at <= now() AND v_pair.status IN ('pending','approved') THEN
    RETURN jsonb_build_object('status','expired');
  END IF;
  RETURN jsonb_build_object('status',v_pair.status,'runnerId',v_pair.runner_id,'displayName',v_pair.display_name,
    'tenantId',v_pair.tenant_id,'deviceId',v_pair.device_id,'machineFingerprint',v_pair.machine_fingerprint,
    'publicKey',v_pair.public_key,'runnerSessionId',v_pair.runner_session_id,'ownerUserId',v_pair.approved_by);
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.complete_modular_runner_pairing(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v jsonb := p_request->0; v_environment varchar; v_pair public.modular_runner_pairings%ROWTYPE;
BEGIN
  v_environment := CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_pair FROM public.modular_runner_pairings WHERE device_code_hash=v->>'codeHash'
    AND pairing_nonce_hash=v->>'nonceHash' AND environment_tenant_id=v_environment FOR UPDATE;
  IF NOT FOUND OR v_pair.status <> 'approved' OR v_pair.expires_at <= now() OR v_pair.tenant_id IS NULL THEN
    RETURN jsonb_build_object('status',CASE WHEN FOUND AND v_pair.expires_at<=now() THEN 'expired' ELSE 'denied' END);
  END IF;
  INSERT INTO public.runner_nodes("runnerId","tenantId","ownerUserId","nodeKind","profile","deviceId","displayName","trustState","status","activeSessionId","updatedAt")
  VALUES(v_pair.runner_id,v_pair.tenant_id,v_pair.approved_by,'local_device','local_device',v_pair.device_id,v_pair.display_name,'trusted','offline',v_pair.runner_session_id::varchar,now())
  ON CONFLICT("runnerId") DO UPDATE SET "updatedAt"=now(),"activeSessionId"=EXCLUDED."activeSessionId",status='offline'
  WHERE public.runner_nodes."tenantId"=EXCLUDED."tenantId" AND public.runner_nodes."ownerUserId"=EXCLUDED."ownerUserId"
    AND public.runner_nodes."deviceId"=EXCLUDED."deviceId" AND public.runner_nodes."revokedAt" IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  INSERT INTO public.modular_runner_devices(environment_tenant_id,tenant_id,runner_id,device_id,machine_fingerprint,public_key,
    runner_session_id,control_jti,refresh_jti,refresh_token_hash,refresh_expires_at)
  VALUES(v_environment,v_pair.tenant_id,v_pair.runner_id,v_pair.device_id,v_pair.machine_fingerprint,v_pair.public_key,
    v_pair.runner_session_id,(v->>'accessJti'),(v->>'refreshJti'),(v->>'refreshHash'),(v->>'refreshExpiresAt')::timestamptz)
  ON CONFLICT(environment_tenant_id,tenant_id,runner_id,device_id) DO UPDATE SET
    runner_session_id=EXCLUDED.runner_session_id,control_jti=EXCLUDED.control_jti,refresh_jti=EXCLUDED.refresh_jti,
    refresh_token_hash=EXCLUDED.refresh_token_hash,refresh_expires_at=EXCLUDED.refresh_expires_at,updated_at=now()
  WHERE public.modular_runner_devices.revoked_at IS NULL
    AND public.modular_runner_devices.machine_fingerprint=EXCLUDED.machine_fingerprint
    AND public.modular_runner_devices.public_key=EXCLUDED.public_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  UPDATE public.modular_runner_pairings SET status='consumed',consumed_at=now() WHERE id=v_pair.id;
  RETURN jsonb_build_object('status','approved','runnerId',v_pair.runner_id,'displayName',v_pair.display_name,
    'tenantId',v_pair.tenant_id,'deviceId',v_pair.device_id,'runnerSessionId',v_pair.runner_session_id);
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.rotate_modular_runner_refresh(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v jsonb := p_request->0; v_environment varchar; v_device public.modular_runner_devices%ROWTYPE;
BEGIN
  v_environment := CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_device FROM public.modular_runner_devices WHERE environment_tenant_id=v_environment
    AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId' AND device_id=v->>'deviceId'
    AND refresh_token_hash=v->>'oldRefreshHash' AND revoked_at IS NULL AND refresh_expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  UPDATE public.modular_runner_devices SET control_jti=v->>'accessJti',refresh_jti=v->>'refreshJti',
    refresh_token_hash=v->>'refreshHash',refresh_expires_at=(v->>'refreshExpiresAt')::timestamptz,updated_at=now()
    WHERE id=v_device.id;
  RETURN jsonb_build_object('status','approved','runnerId',v_device.runner_id,'tenantId',v_device.tenant_id,
    'deviceId',v_device.device_id,'runnerSessionId',v_device.runner_session_id);
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.get_modular_runner_device(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v jsonb := p_request->0; v_environment varchar; v_device public.modular_runner_devices%ROWTYPE;
BEGIN
  v_environment := CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_device FROM public.modular_runner_devices WHERE environment_tenant_id=v_environment
    AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId' AND device_id=v->>'deviceId'
    AND (control_jti=v->>'accessJti' OR refresh_jti=v->>'accessJti') AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  RETURN jsonb_build_object('status','approved','runnerId',v_device.runner_id,'tenantId',v_device.tenant_id,
    'deviceId',v_device.device_id,'machineFingerprint',v_device.machine_fingerprint,'publicKey',v_device.public_key,
    'runnerSessionId',v_device.runner_session_id);
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.consume_modular_runner_proof_nonce(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v jsonb := p_request->0; v_environment varchar;
BEGIN
  v_environment := CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.modular_runner_devices d WHERE d.environment_tenant_id=v_environment
    AND d.tenant_id=v->>'tenantId' AND d.runner_id=v->>'runnerId' AND d.device_id=v->>'deviceId' AND d.revoked_at IS NULL)
    OR (v->>'expiresAt')::timestamptz<=now() OR (v->>'expiresAt')::timestamptz>now()+interval '2 minutes' THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  INSERT INTO public.modular_runner_proof_nonces(environment_tenant_id,tenant_id,runner_id,device_id,nonce,expires_at)
  VALUES(v_environment,v->>'tenantId',v->>'runnerId',v->>'deviceId',v->>'nonce',(v->>'expiresAt')::timestamptz)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  RETURN jsonb_build_object('status','approved');
END $function$;
--> statement-breakpoint

CREATE FUNCTION public.revoke_modular_runner_device(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v jsonb := p_request->0; v_environment varchar;
BEGIN
  v_environment := CASE session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'
    WHEN 'modular_core_auth_prod' THEN 'modular-production' ELSE NULL END;
  IF v_environment IS NULL THEN RAISE EXCEPTION 'RUNNER_ENVIRONMENT_DENIED' USING ERRCODE='42501'; END IF;
  IF public.assert_modular_chat_workspace_access((v->>'userId')::integer,v_environment,v->>'tenantId') IS NULL THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  UPDATE public.modular_runner_devices SET revoked_at=now(),updated_at=now()
    WHERE environment_tenant_id=v_environment AND tenant_id=v->>'tenantId' AND runner_id=v->>'runnerId'
      AND device_id=v->>'deviceId' AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied'); END IF;
  UPDATE public.runner_nodes SET "revokedAt"=now(),status='revoked',"updatedAt"=now()
    WHERE "runnerId"=v->>'runnerId' AND "tenantId"=v->>'tenantId' AND "ownerUserId"=(v->>'userId')::integer;
  RETURN jsonb_build_object('status','approved');
END $function$;
--> statement-breakpoint

DO $ownership$
DECLARE v_name text; v_signature text;
BEGIN
  FOR v_name,v_signature IN SELECT * FROM (VALUES
    ('start_modular_runner_pairing','public.start_modular_runner_pairing(jsonb)'),
    ('approve_modular_runner_pairing','public.approve_modular_runner_pairing(jsonb)'),
    ('get_modular_runner_pairing','public.get_modular_runner_pairing(jsonb)'),
    ('complete_modular_runner_pairing','public.complete_modular_runner_pairing(jsonb)'),
    ('rotate_modular_runner_refresh','public.rotate_modular_runner_refresh(jsonb)'),
    ('get_modular_runner_device','public.get_modular_runner_device(jsonb)'),
    ('consume_modular_runner_proof_nonce','public.consume_modular_runner_proof_nonce(jsonb)'),
    ('revoke_modular_runner_device','public.revoke_modular_runner_device(jsonb)')) AS f(name,signature)
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
    ('public.start_modular_runner_pairing(jsonb)'),('public.approve_modular_runner_pairing(jsonb)'),
    ('public.get_modular_runner_pairing(jsonb)'),
    ('public.complete_modular_runner_pairing(jsonb)'),('public.rotate_modular_runner_refresh(jsonb)'),
    ('public.get_modular_runner_device(jsonb)'),('public.consume_modular_runner_proof_nonce(jsonb)'),
    ('public.revoke_modular_runner_device(jsonb)')) AS f(signature)
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
