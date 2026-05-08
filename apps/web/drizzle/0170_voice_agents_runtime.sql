DO $$ BEGIN
  ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'voice_agent';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE voice_agent_provider AS ENUM ('elevenlabs');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE voice_agent_surface AS ENUM ('chat', 'work_os', 'team_room', 'agency');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE voice_agent_connection_type AS ENUM ('webrtc_token', 'websocket_signed_url', 'server_relay');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE voice_agent_session_status AS ENUM ('created', 'connecting', 'active', 'ended', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE voice_agent_billing_status AS ENUM ('reserved', 'settled', 'released', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE voice_agent_event_source AS ENUM ('user', 'agent', 'tool', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE voice_agent_redaction_status AS ENUM ('not_required', 'redacted', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE voice_agent_tool_call_status AS ENUM ('received', 'denied', 'queued', 'running', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS voice_agent_configs (
  id serial PRIMARY KEY,
  tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE cascade,
  provider voice_agent_provider NOT NULL DEFAULT 'elevenlabs',
  external_agent_id varchar(128) NOT NULL,
  display_name varchar(160) NOT NULL,
  description text,
  credential_provider_name varchar(64) NOT NULL DEFAULT 'elevenlabs',
  branch_id varchar(128),
  environment varchar(64),
  default_language varchar(16),
  server_location varchar(32) NOT NULL DEFAULT 'us',
  retention_policy varchar(32) NOT NULL DEFAULT 'default',
  allowed_surfaces json NOT NULL DEFAULT '["chat"]'::json,
  allowed_tools json NOT NULL DEFAULT '["chat.create_message"]'::json,
  config_json json NOT NULL DEFAULT '{}'::json,
  is_enabled boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_result json,
  created_by_user_id integer REFERENCES users(id) ON DELETE set null,
  updated_by_user_id integer REFERENCES users(id) ON DELETE set null,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_configs_tenant_provider_agent_unique
  ON voice_agent_configs (tenant_id, provider, external_agent_id);
CREATE INDEX IF NOT EXISTS voice_agent_configs_tenant_enabled_idx
  ON voice_agent_configs (tenant_id, is_enabled);
CREATE INDEX IF NOT EXISTS voice_agent_configs_provider_idx
  ON voice_agent_configs (provider);

CREATE TABLE IF NOT EXISTS voice_agent_sessions (
  id serial PRIMARY KEY,
  tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE cascade,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  conversation_id integer NOT NULL REFERENCES conversations(id) ON DELETE cascade,
  config_id integer NOT NULL REFERENCES voice_agent_configs(id) ON DELETE restrict,
  provider voice_agent_provider NOT NULL DEFAULT 'elevenlabs',
  provider_conversation_id varchar(128),
  surface voice_agent_surface NOT NULL DEFAULT 'chat',
  connection_type voice_agent_connection_type NOT NULL DEFAULT 'webrtc_token',
  connection_expires_at timestamptz,
  status voice_agent_session_status NOT NULL DEFAULT 'created',
  billing_status voice_agent_billing_status NOT NULL DEFAULT 'reserved',
  credit_reservation_transaction_id integer REFERENCES credit_transactions(id) ON DELETE set null,
  idempotency_key varchar(256) NOT NULL,
  provider_duration_seconds integer,
  provider_cost_cents integer,
  transcript_pending boolean NOT NULL DEFAULT false,
  error_code varchar(128),
  error_message text,
  metadata_json json NOT NULL DEFAULT '{}'::json,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_sessions_user_idempotency_unique
  ON voice_agent_sessions (tenant_id, user_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_sessions_provider_conversation_unique
  ON voice_agent_sessions (tenant_id, provider_conversation_id)
  WHERE provider_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS voice_agent_sessions_tenant_user_created_idx
  ON voice_agent_sessions (tenant_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS voice_agent_sessions_tenant_conversation_created_idx
  ON voice_agent_sessions (tenant_id, conversation_id, created_at);
CREATE INDEX IF NOT EXISTS voice_agent_sessions_status_idx
  ON voice_agent_sessions (status);

CREATE TABLE IF NOT EXISTS voice_agent_events (
  id serial PRIMARY KEY,
  session_id integer NOT NULL REFERENCES voice_agent_sessions(id) ON DELETE cascade,
  tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE cascade,
  provider_event_id varchar(160),
  event_type varchar(80) NOT NULL,
  source voice_agent_event_source NOT NULL DEFAULT 'system',
  sequence integer NOT NULL,
  text text,
  payload_json json NOT NULL DEFAULT '{}'::json,
  redaction_status voice_agent_redaction_status NOT NULL DEFAULT 'not_required',
  conversation_message_id integer REFERENCES messages(id) ON DELETE set null,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_events_session_sequence_unique
  ON voice_agent_events (session_id, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_events_provider_event_unique
  ON voice_agent_events (session_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS voice_agent_events_tenant_received_idx
  ON voice_agent_events (tenant_id, received_at);
CREATE INDEX IF NOT EXISTS voice_agent_events_session_received_idx
  ON voice_agent_events (session_id, received_at);

CREATE TABLE IF NOT EXISTS voice_agent_tool_calls (
  id serial PRIMARY KEY,
  session_id integer NOT NULL REFERENCES voice_agent_sessions(id) ON DELETE cascade,
  tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE cascade,
  provider_tool_call_id varchar(160),
  idempotency_key varchar(256) NOT NULL,
  tool_name varchar(128) NOT NULL,
  status voice_agent_tool_call_status NOT NULL DEFAULT 'received',
  input_json json NOT NULL DEFAULT '{}'::json,
  output_json json,
  policy_decision_json json NOT NULL DEFAULT '{}'::json,
  error_code varchar(128),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_tool_calls_session_idempotency_unique
  ON voice_agent_tool_calls (session_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_tool_calls_provider_tool_unique
  ON voice_agent_tool_calls (session_id, provider_tool_call_id)
  WHERE provider_tool_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS voice_agent_tool_calls_tenant_tool_started_idx
  ON voice_agent_tool_calls (tenant_id, tool_name, started_at);
CREATE INDEX IF NOT EXISTS voice_agent_tool_calls_status_idx
  ON voice_agent_tool_calls (status);
