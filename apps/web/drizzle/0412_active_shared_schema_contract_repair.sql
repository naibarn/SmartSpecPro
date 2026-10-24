-- Forward-only repair of active shared schema drift.
-- No historical migration/ledger rewrite and no retired-store replay.
-- Naive library/callback timestamps are UTC; preserve their instants.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='library_index_job_status') THEN
    CREATE TYPE public."library_index_job_status" AS ENUM ('pending', 'processing', 'retry_pending', 'completed', 'failed');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='library_item_status') THEN
    CREATE TYPE public."library_item_status" AS ENUM ('draft', 'ready', 'indexing', 'archived', 'failed');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='library_visibility') THEN
    CREATE TYPE public."library_visibility" AS ENUM ('private', 'team', 'public');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='live_browser_actor_type') THEN
    CREATE TYPE public."live_browser_actor_type" AS ENUM ('agent', 'user', 'system', 'policy');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='live_browser_assist_request_type') THEN
    CREATE TYPE public."live_browser_assist_request_type" AS ENUM ('decision', 'field_input', 'review_page', 'takeover_required');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='live_browser_control_mode') THEN
    CREATE TYPE public."live_browser_control_mode" AS ENUM ('observe', 'approve_only', 'takeover', 'agent_control');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='live_browser_event_type') THEN
    CREATE TYPE public."live_browser_event_type" AS ENUM ('session_created', 'session_state_changed', 'stream_ready', 'frame_updated', 'url_changed', 'command_queued', 'command_started', 'command_completed', 'command_failed', 'assist_requested', 'assist_resolved', 'approval_requested', 'approval_resolved', 'takeover_started', 'takeover_lease_expiring', 'takeover_ended', 'incident', 'agent_started', 'agent_resumed', 'navigation_completed', 'session_completed', 'session_failed');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='live_browser_session_status') THEN
    CREATE TYPE public."live_browser_session_status" AS ENUM ('created', 'provisioning', 'ready', 'agent_running', 'waiting_for_human', 'human_controlling', 'waiting_for_runtime_recovery', 'failed_recovery_required', 'completed', 'cancelled', 'failed', 'expired');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='media_callback_dlq_status') THEN
    CREATE TYPE public."media_callback_dlq_status" AS ENUM ('pending', 'reprocessed', 'discarded');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='media_callback_event_status') THEN
    CREATE TYPE public."media_callback_event_status" AS ENUM ('pending', 'processing', 'retry_pending', 'completed', 'failed');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_chunks"'::regclass AND a.attname='created_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_chunks" ALTER COLUMN "created_at" DROP DEFAULT;
    ALTER TABLE public."library_chunks" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_index_jobs"'::regclass AND a.attname='completed_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "completed_at" DROP DEFAULT;
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "completed_at" TYPE timestamp with time zone USING "completed_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_index_jobs"'::regclass AND a.attname='created_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "created_at" DROP DEFAULT;
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_index_jobs"'::regclass AND a.attname='next_retry_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "next_retry_at" DROP DEFAULT;
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "next_retry_at" TYPE timestamp with time zone USING "next_retry_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_index_jobs"'::regclass AND a.attname='run_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "run_at" DROP DEFAULT;
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "run_at" TYPE timestamp with time zone USING "run_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_index_jobs"'::regclass AND a.attname='started_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "started_at" DROP DEFAULT;
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "started_at" TYPE timestamp with time zone USING "started_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_index_jobs"'::regclass AND a.attname='status' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(24)') THEN
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "status" TYPE library_index_job_status USING "status"::text::public."library_index_job_status";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_index_jobs"'::regclass AND a.attname='updated_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "updated_at" DROP DEFAULT;
    ALTER TABLE public."library_index_jobs" ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_items"'::regclass AND a.attname='created_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_items" ALTER COLUMN "created_at" DROP DEFAULT;
    ALTER TABLE public."library_items" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_items"'::regclass AND a.attname='deleted_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_items" ALTER COLUMN "deleted_at" DROP DEFAULT;
    ALTER TABLE public."library_items" ALTER COLUMN "deleted_at" TYPE timestamp with time zone USING "deleted_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_items"'::regclass AND a.attname='status' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(32)') THEN
    ALTER TABLE public."library_items" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE public."library_items" ALTER COLUMN "status" TYPE library_item_status USING "status"::text::public."library_item_status";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_items"'::regclass AND a.attname='updated_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_items" ALTER COLUMN "updated_at" DROP DEFAULT;
    ALTER TABLE public."library_items" ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_items"'::regclass AND a.attname='visibility' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(16)') THEN
    ALTER TABLE public."library_items" ALTER COLUMN "visibility" DROP DEFAULT;
    ALTER TABLE public."library_items" ALTER COLUMN "visibility" TYPE library_visibility USING "visibility"::text::public."library_visibility";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_links"'::regclass AND a.attname='created_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_links" ALTER COLUMN "created_at" DROP DEFAULT;
    ALTER TABLE public."library_links" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_permissions"'::regclass AND a.attname='created_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_permissions" ALTER COLUMN "created_at" DROP DEFAULT;
    ALTER TABLE public."library_permissions" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_permissions"'::regclass AND a.attname='expires_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_permissions" ALTER COLUMN "expires_at" DROP DEFAULT;
    ALTER TABLE public."library_permissions" ALTER COLUMN "expires_at" TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."library_permissions"'::regclass AND a.attname='updated_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."library_permissions" ALTER COLUMN "updated_at" DROP DEFAULT;
    ALTER TABLE public."library_permissions" ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_assist_requests"'::regclass AND a.attname='contextJson' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='json') THEN
    ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "contextJson" DROP DEFAULT;
    ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "contextJson" TYPE jsonb USING "contextJson"::jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_assist_requests"'::regclass AND a.attname='requestType' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(32)') THEN
    ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "requestType" DROP DEFAULT;
    ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "requestType" TYPE live_browser_assist_request_type USING "requestType"::text::public."live_browser_assist_request_type";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_assist_requests"'::regclass AND a.attname='responseJson' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='json') THEN
    ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "responseJson" DROP DEFAULT;
    ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "responseJson" TYPE jsonb USING "responseJson"::jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_control_transfers"'::regclass AND a.attname='fromActorType' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(32)') THEN
    ALTER TABLE public."live_browser_control_transfers" ALTER COLUMN "fromActorType" DROP DEFAULT;
    ALTER TABLE public."live_browser_control_transfers" ALTER COLUMN "fromActorType" TYPE live_browser_actor_type USING "fromActorType"::text::public."live_browser_actor_type";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_control_transfers"'::regclass AND a.attname='toActorType' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(32)') THEN
    ALTER TABLE public."live_browser_control_transfers" ALTER COLUMN "toActorType" DROP DEFAULT;
    ALTER TABLE public."live_browser_control_transfers" ALTER COLUMN "toActorType" TYPE live_browser_actor_type USING "toActorType"::text::public."live_browser_actor_type";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_events"'::regclass AND a.attname='actorType' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(32)') THEN
    ALTER TABLE public."live_browser_events" ALTER COLUMN "actorType" DROP DEFAULT;
    ALTER TABLE public."live_browser_events" ALTER COLUMN "actorType" TYPE live_browser_actor_type USING "actorType"::text::public."live_browser_actor_type";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_events"'::regclass AND a.attname='eventType' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(64)') THEN
    ALTER TABLE public."live_browser_events" ALTER COLUMN "eventType" DROP DEFAULT;
    ALTER TABLE public."live_browser_events" ALTER COLUMN "eventType" TYPE live_browser_event_type USING "eventType"::text::public."live_browser_event_type";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_events"'::regclass AND a.attname='payloadJson' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='json') THEN
    ALTER TABLE public."live_browser_events" ALTER COLUMN "payloadJson" DROP DEFAULT;
    ALTER TABLE public."live_browser_events" ALTER COLUMN "payloadJson" TYPE jsonb USING "payloadJson"::jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_idempotency_keys"'::regclass AND a.attname='responseJson' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='json') THEN
    ALTER TABLE public."live_browser_idempotency_keys" ALTER COLUMN "responseJson" DROP DEFAULT;
    ALTER TABLE public."live_browser_idempotency_keys" ALTER COLUMN "responseJson" TYPE jsonb USING "responseJson"::jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_sessions"'::regclass AND a.attname='browserContextRef' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='json') THEN
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "browserContextRef" DROP DEFAULT;
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "browserContextRef" TYPE jsonb USING "browserContextRef"::jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_sessions"'::regclass AND a.attname='controllerActorType' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(32)') THEN
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "controllerActorType" DROP DEFAULT;
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "controllerActorType" TYPE live_browser_actor_type USING "controllerActorType"::text::public."live_browser_actor_type";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_sessions"'::regclass AND a.attname='controlMode' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(64)') THEN
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "controlMode" DROP DEFAULT;
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "controlMode" TYPE live_browser_control_mode USING "controlMode"::text::public."live_browser_control_mode";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_sessions"'::regclass AND a.attname='policyContextJson' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='json') THEN
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "policyContextJson" DROP DEFAULT;
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "policyContextJson" TYPE jsonb USING "policyContextJson"::jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_sessions"'::regclass AND a.attname='status' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(64)') THEN
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "status" TYPE live_browser_session_status USING "status"::text::public."live_browser_session_status";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."live_browser_sessions"'::regclass AND a.attname='streamRef' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='json') THEN
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "streamRef" DROP DEFAULT;
    ALTER TABLE public."live_browser_sessions" ALTER COLUMN "streamRef" TYPE jsonb USING "streamRef"::jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."media_callback_dlq"'::regclass AND a.attname='created_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."media_callback_dlq" ALTER COLUMN "created_at" DROP DEFAULT;
    ALTER TABLE public."media_callback_dlq" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."media_callback_dlq"'::regclass AND a.attname='resolved_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."media_callback_dlq" ALTER COLUMN "resolved_at" DROP DEFAULT;
    ALTER TABLE public."media_callback_dlq" ALTER COLUMN "resolved_at" TYPE timestamp with time zone USING "resolved_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."media_callback_dlq"'::regclass AND a.attname='status' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(24)') THEN
    ALTER TABLE public."media_callback_dlq" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE public."media_callback_dlq" ALTER COLUMN "status" TYPE media_callback_dlq_status USING "status"::text::public."media_callback_dlq_status";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."media_callback_events"'::regclass AND a.attname='created_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."media_callback_events" ALTER COLUMN "created_at" DROP DEFAULT;
    ALTER TABLE public."media_callback_events" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."media_callback_events"'::regclass AND a.attname='next_retry_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."media_callback_events" ALTER COLUMN "next_retry_at" DROP DEFAULT;
    ALTER TABLE public."media_callback_events" ALTER COLUMN "next_retry_at" TYPE timestamp with time zone USING "next_retry_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."media_callback_events"'::regclass AND a.attname='processed_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."media_callback_events" ALTER COLUMN "processed_at" DROP DEFAULT;
    ALTER TABLE public."media_callback_events" ALTER COLUMN "processed_at" TYPE timestamp with time zone USING "processed_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."media_callback_events"'::regclass AND a.attname='status' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(24)') THEN
    ALTER TABLE public."media_callback_events" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE public."media_callback_events" ALTER COLUMN "status" TYPE media_callback_event_status USING "status"::text::public."media_callback_event_status";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."media_callback_events"'::regclass AND a.attname='updated_at' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='timestamp without time zone') THEN
    ALTER TABLE public."media_callback_events" ALTER COLUMN "updated_at" DROP DEFAULT;
    ALTER TABLE public."media_callback_events" ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public."multimodal_memory_vectors" ALTER COLUMN "embedding" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public."public_api_audit_log" ALTER COLUMN "apiKeyId" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."tenants" ALTER COLUMN "createdAt" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public."tenants" ALTER COLUMN "isActive" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public."tenants" ALTER COLUMN "updatedAt" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."vector_index_records"'::regclass AND a.attname='status' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)='character varying(24)') THEN
    ALTER TABLE public."vector_index_records" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE public."vector_index_records" ALTER COLUMN "status" TYPE vector_projection_status USING "status"::text::public."vector_projection_status";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public."library_chunks" ALTER COLUMN "content_type" SET DEFAULT 'text';
--> statement-breakpoint
ALTER TABLE public."library_chunks" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."library_chunks" ALTER COLUMN "metadata" SET DEFAULT '{}'::json;
--> statement-breakpoint
ALTER TABLE public."library_index_jobs" ALTER COLUMN "attempt_count" SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public."library_index_jobs" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."library_index_jobs" ALTER COLUMN "max_attempts" SET DEFAULT 5;
--> statement-breakpoint
ALTER TABLE public."library_index_jobs" ALTER COLUMN "run_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."library_index_jobs" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE public."library_index_jobs" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."library_items" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."library_items" ALTER COLUMN "metadata" SET DEFAULT '{}'::json;
--> statement-breakpoint
ALTER TABLE public."library_items" ALTER COLUMN "status" SET DEFAULT 'ready';
--> statement-breakpoint
ALTER TABLE public."library_items" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."library_items" ALTER COLUMN "visibility" SET DEFAULT 'private';
--> statement-breakpoint
ALTER TABLE public."library_links" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."library_permissions" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."library_permissions" ALTER COLUMN "permission_level" SET DEFAULT 'read';
--> statement-breakpoint
ALTER TABLE public."library_permissions" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "contextJson" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "requestedAt" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "responseJson" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE public."live_browser_assist_requests" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE public."live_browser_control_transfers" ALTER COLUMN "createdAt" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."live_browser_events" ALTER COLUMN "createdAt" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."live_browser_events" ALTER COLUMN "payloadJson" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE public."live_browser_idempotency_keys" ALTER COLUMN "createdAt" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."live_browser_idempotency_keys" ALTER COLUMN "responseJson" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE public."live_browser_sessions" ALTER COLUMN "activeTabCount" SET DEFAULT 1;
--> statement-breakpoint
ALTER TABLE public."live_browser_sessions" ALTER COLUMN "browserContextRef" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE public."live_browser_sessions" ALTER COLUMN "controlMode" SET DEFAULT 'observe';
--> statement-breakpoint
ALTER TABLE public."live_browser_sessions" ALTER COLUMN "lastActivityAt" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."live_browser_sessions" ALTER COLUMN "policyContextJson" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE public."live_browser_sessions" ALTER COLUMN "sessionVersion" SET DEFAULT 1;
--> statement-breakpoint
ALTER TABLE public."live_browser_sessions" ALTER COLUMN "startedAt" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."live_browser_sessions" ALTER COLUMN "status" SET DEFAULT 'created';
--> statement-breakpoint
ALTER TABLE public."live_browser_sessions" ALTER COLUMN "streamRef" SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE public."media_callback_dlq" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."media_callback_dlq" ALTER COLUMN "payload" SET DEFAULT '{}'::json;
--> statement-breakpoint
ALTER TABLE public."media_callback_dlq" ALTER COLUMN "provider_name" SET DEFAULT 'kie_ai';
--> statement-breakpoint
ALTER TABLE public."media_callback_dlq" ALTER COLUMN "retry_count" SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public."media_callback_dlq" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE public."media_callback_events" ALTER COLUMN "attempt_count" SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public."media_callback_events" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."media_callback_events" ALTER COLUMN "max_attempts" SET DEFAULT 5;
--> statement-breakpoint
ALTER TABLE public."media_callback_events" ALTER COLUMN "payload" SET DEFAULT '{}'::json;
--> statement-breakpoint
ALTER TABLE public."media_callback_events" ALTER COLUMN "provider_name" SET DEFAULT 'kie_ai';
--> statement-breakpoint
ALTER TABLE public."media_callback_events" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE public."media_callback_events" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."tenants" ALTER COLUMN "createdAt" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."tenants" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."tenants" ALTER COLUMN "isActive" SET DEFAULT true;
--> statement-breakpoint
ALTER TABLE public."tenants" ALTER COLUMN "plan" SET DEFAULT 'FREE';
--> statement-breakpoint
ALTER TABLE public."tenants" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
--> statement-breakpoint
ALTER TABLE public."tenants" ALTER COLUMN "updatedAt" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."users" ALTER COLUMN "credits" SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public."users" ALTER COLUMN "isDisabled" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE public."users" ALTER COLUMN "plan" SET DEFAULT 'free';
--> statement-breakpoint
ALTER TABLE public."users" ALTER COLUMN "role" SET DEFAULT 'user';
--> statement-breakpoint
ALTER TABLE public."vector_index_records" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public."vector_index_records" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE public."vector_index_records" ALTER COLUMN "metric" SET DEFAULT 'cosine';
--> statement-breakpoint
ALTER TABLE public."vector_index_records" ALTER COLUMN "status" SET DEFAULT 'queued';
--> statement-breakpoint
ALTER TABLE public."vector_index_records" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_profiles_tenant_idx" ON "billing_profiles" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_subscriptions_tenant_status_idx" ON "billing_subscriptions" USING btree ("tenantId","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_subscriptions_user_idx" ON "billing_subscriptions" USING btree ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transactions_type_created_idx" ON "credit_transactions" USING btree ("type","createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_extractions_finance_draft_idx" ON "document_extractions" USING btree ("finance_draft_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_recurring_rules_counterparty_idx" ON "finance_recurring_rules" USING btree ("counterparty_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_counterparty_idx" ON "finance_transactions" USING btree ("counterparty_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_payment_destination_account_idx" ON "finance_transactions" USING btree ("payment_destination_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_payment_method_kind_idx" ON "finance_transactions" USING btree ("payment_method_kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_payment_source_account_idx" ON "finance_transactions" USING btree ("payment_source_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_events_domain_event_time_idx" ON "funnel_events" USING btree ("domain","eventTime");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "funnel_events_event_key_unique" ON "funnel_events" USING btree ("eventKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_events_name_event_time_idx" ON "funnel_events" USING btree ("eventName","eventTime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_events_tenant_event_time_idx" ON "funnel_events" USING btree ("tenantId","eventTime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_events_user_name_time_idx" ON "funnel_events" USING btree ("userId","eventName","eventTime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_audit_logs_invoice_idx" ON "invoice_audit_logs" USING btree ("invoiceId","createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_documents_invoice_language_idx" ON "invoice_documents" USING btree ("invoiceId","documentLanguage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_subscription_idx" ON "invoices" USING btree ("subscriptionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_tenant_status_idx" ON "invoices" USING btree ("tenantId","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_user_status_idx" ON "invoices" USING btree ("userId","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_config_global_unique" ON "menu_config" USING btree ("menu_item_id","platform") WHERE "menu_config"."tenant_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" USING btree ("createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_dispatches_invoice_idx" ON "notification_dispatches" USING btree ("invoiceId","notificationType");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_invoice_status_idx" ON "payments" USING btree ("invoiceId","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reconciliation_runs_entity_idx" ON "reconciliation_runs" USING btree ("entityType","entityId","createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_events_created_user_idx" ON "registration_events" USING btree ("createdAt","userId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seller_profiles_tenant_unique" ON "seller_profiles" USING btree ("tenantId") WHERE "tenantId" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_recovery_cases_invoice_idx" ON "support_recovery_cases" USING btree ("invoiceId","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_recovery_cases_payment_idx" ON "support_recovery_cases" USING btree ("paymentId","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_policies_stream_effective_idx" ON "tax_policies" USING btree ("stream","effectiveFrom");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_policies_tenant_stream_idx" ON "tax_policies" USING btree ("tenantId","stream");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vdd_ledger_owner_session_idx" ON "vertical_drama_draft_ledgers" USING btree ("tenantId","userId","draftSessionId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_series_bindings_active_root_unique" ON "worker_series_bindings" USING btree ("tenantId","workerId","seriesId","rootId");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."billing_effects"'::regclass AND conname='billing_effects_invoiceId_invoices_id_fk') THEN
    ALTER TABLE "billing_effects" ADD CONSTRAINT "billing_effects_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."billing_effects"'::regclass AND conname='billing_effects_paymentId_payments_id_fk') THEN
    ALTER TABLE "billing_effects" ADD CONSTRAINT "billing_effects_paymentId_payments_id_fk" FOREIGN KEY ("paymentId") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."billing_effects"'::regclass AND conname='billing_effects_subscriptionId_billing_subscriptions_id_fk') THEN
    ALTER TABLE "billing_effects" ADD CONSTRAINT "billing_effects_subscriptionId_billing_subscriptions_id_fk" FOREIGN KEY ("subscriptionId") REFERENCES "public"."billing_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."billing_migration_runs"'::regclass AND conname='billing_migration_runs_createdBy_users_id_fk') THEN
    ALTER TABLE "billing_migration_runs" ADD CONSTRAINT "billing_migration_runs_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."billing_profiles"'::regclass AND conname='billing_profiles_tenantId_tenants_id_fk') THEN
    ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."billing_profiles"'::regclass AND conname='billing_profiles_updatedBy_users_id_fk') THEN
    ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."billing_profiles"'::regclass AND conname='billing_profiles_userId_users_id_fk') THEN
    ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."billing_subscriptions"'::regclass AND conname='billing_subscriptions_tenantId_tenants_id_fk') THEN
    ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."billing_subscriptions"'::regclass AND conname='billing_subscriptions_userId_users_id_fk') THEN
    ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."capacity_assessments"'::regclass AND conname='capacity_assessments_requestedByUserId_users_id_fk') THEN
    ALTER TABLE "capacity_assessments" ADD CONSTRAINT "capacity_assessments_requestedByUserId_users_id_fk" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."commercial_payment_requests"'::regclass AND conname='commercial_payment_amounts_nonnegative') THEN
    ALTER TABLE public."commercial_payment_requests" ADD CONSTRAINT "commercial_payment_amounts_nonnegative" CHECK ("commercial_payment_requests"."reserved_minor" >= 0 AND "commercial_payment_requests"."captured_minor" >= 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."commercial_settlements"'::regclass AND conname='commercial_settlement_amounts_nonnegative') THEN
    ALTER TABLE public."commercial_settlements" ADD CONSTRAINT "commercial_settlement_amounts_nonnegative" CHECK ("commercial_settlements"."captured_minor" >= 0 AND "commercial_settlements"."released_minor" >= 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."commercial_spending_limits"'::regclass AND conname='commercial_spending_limits_nonnegative') THEN
    ALTER TABLE public."commercial_spending_limits" ADD CONSTRAINT "commercial_spending_limits_nonnegative" CHECK ("commercial_spending_limits"."global_cap_minor" >= 0 AND "commercial_spending_limits"."overdraft_limit_minor" >= 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."commercial_usage_receipts"'::regclass AND conname='commercial_usage_nonnegative') THEN
    ALTER TABLE public."commercial_usage_receipts" ADD CONSTRAINT "commercial_usage_nonnegative" CHECK ("commercial_usage_receipts"."quantity" >= 0 AND "commercial_usage_receipts"."amount_minor" >= 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."document_extractions"'::regclass AND conname='document_extractions_page_count_positive') THEN
    ALTER TABLE public."document_extractions" ADD CONSTRAINT "document_extractions_page_count_positive" CHECK ("document_extractions"."page_count" > 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."document_number_sequences"'::regclass AND conname='document_number_sequences_tenantId_tenants_id_fk') THEN
    ALTER TABLE "document_number_sequences" ADD CONSTRAINT "document_number_sequences_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."document_number_sequences"'::regclass AND conname='document_number_sequences_updatedBy_users_id_fk') THEN
    ALTER TABLE "document_number_sequences" ADD CONSTRAINT "document_number_sequences_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."emergency_hydro_observations"'::regclass AND conname='emergency_hydro_observations_sourceId_emergency_intel_sources_i') THEN
    ALTER TABLE "emergency_hydro_observations" ADD CONSTRAINT "emergency_hydro_observations_sourceId_emergency_intel_sources_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."emergency_intel_sources"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."finance_recurring_rules"'::regclass AND conname='finance_recurring_rules_amount_minor_positive') THEN
    ALTER TABLE public."finance_recurring_rules" ADD CONSTRAINT "finance_recurring_rules_amount_minor_positive" CHECK ("finance_recurring_rules"."amount_minor" > 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."finance_transactions"'::regclass AND conname='finance_transactions_amount_minor_positive') THEN
    ALTER TABLE public."finance_transactions" ADD CONSTRAINT "finance_transactions_amount_minor_positive" CHECK ("finance_transactions"."amount_minor" > 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."funnel_events"'::regclass AND conname='funnel_events_tenantId_tenants_id_fk') THEN
    ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."funnel_events"'::regclass AND conname='funnel_events_userId_users_id_fk') THEN
    ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoice_audit_logs"'::regclass AND conname='invoice_audit_logs_invoiceId_invoices_id_fk') THEN
    ALTER TABLE "invoice_audit_logs" ADD CONSTRAINT "invoice_audit_logs_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoice_config"'::regclass AND conname='invoice_config_tenantId_tenants_id_fk') THEN
    ALTER TABLE "invoice_config" ADD CONSTRAINT "invoice_config_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoice_documents"'::regclass AND conname='invoice_documents_invoiceId_invoices_id_fk') THEN
    ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoice_line_items"'::regclass AND conname='invoice_line_items_invoiceId_invoices_id_fk') THEN
    ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoices"'::regclass AND conname='invoices_subscriptionId_billing_subscriptions_id_fk') THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_billing_subscriptions_id_fk" FOREIGN KEY ("subscriptionId") REFERENCES "public"."billing_subscriptions"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoices"'::regclass AND conname='invoices_taxPolicyId_tax_policies_id_fk') THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_taxPolicyId_tax_policies_id_fk" FOREIGN KEY ("taxPolicyId") REFERENCES "public"."tax_policies"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoices"'::regclass AND conname='invoices_tenantId_tenants_id_fk') THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoices"'::regclass AND conname='invoices_userId_users_id_fk') THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."notification_dispatches"'::regclass AND conname='notification_dispatches_invoiceId_invoices_id_fk') THEN
    ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."notification_dispatches"'::regclass AND conname='notification_dispatches_userId_users_id_fk') THEN
    ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."payment_attempts"'::regclass AND conname='payment_attempts_paymentId_payments_id_fk') THEN
    ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_paymentId_payments_id_fk" FOREIGN KEY ("paymentId") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."payments"'::regclass AND conname='payments_invoiceId_invoices_id_fk') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."provider_admission_windows"'::regclass AND conname='provider_admission_windows_counts_check') THEN
    ALTER TABLE public."provider_admission_windows" ADD CONSTRAINT "provider_admission_windows_counts_check" CHECK ("usedCount" >= 0 AND "maxCount" > 0 AND "windowSeconds" > 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."reconciliation_runs"'::regclass AND conname='reconciliation_runs_createdBy_users_id_fk') THEN
    ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."seller_profiles"'::regclass AND conname='seller_profiles_tenantId_tenants_id_fk') THEN
    ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."seller_profiles"'::regclass AND conname='seller_profiles_updatedBy_users_id_fk') THEN
    ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."support_recovery_cases"'::regclass AND conname='support_recovery_cases_assignedAdminId_users_id_fk') THEN
    ALTER TABLE "support_recovery_cases" ADD CONSTRAINT "support_recovery_cases_assignedAdminId_users_id_fk" FOREIGN KEY ("assignedAdminId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."support_recovery_cases"'::regclass AND conname='support_recovery_cases_invoiceId_invoices_id_fk') THEN
    ALTER TABLE "support_recovery_cases" ADD CONSTRAINT "support_recovery_cases_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."support_recovery_cases"'::regclass AND conname='support_recovery_cases_paymentId_payments_id_fk') THEN
    ALTER TABLE "support_recovery_cases" ADD CONSTRAINT "support_recovery_cases_paymentId_payments_id_fk" FOREIGN KEY ("paymentId") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."support_recovery_cases"'::regclass AND conname='support_recovery_cases_tenantId_tenants_id_fk') THEN
    ALTER TABLE "support_recovery_cases" ADD CONSTRAINT "support_recovery_cases_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."support_recovery_cases"'::regclass AND conname='support_recovery_cases_userId_users_id_fk') THEN
    ALTER TABLE "support_recovery_cases" ADD CONSTRAINT "support_recovery_cases_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."tax_policies"'::regclass AND conname='tax_policies_createdBy_users_id_fk') THEN
    ALTER TABLE "tax_policies" ADD CONSTRAINT "tax_policies_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."tax_policies"'::regclass AND conname='tax_policies_tenantId_tenants_id_fk') THEN
    ALTER TABLE "tax_policies" ADD CONSTRAINT "tax_policies_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."tenants"'::regclass AND conname='tenants_ownerId_users_id_fk') THEN
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."tenants"'::regclass AND conname='tenants_primaryDomain_unique') THEN
    ALTER TABLE public."tenants" ADD CONSTRAINT "tenants_primaryDomain_unique" UNIQUE ("primaryDomain");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."vector_index_records"'::regclass AND conname='vector_index_records_dimensions_positive') THEN
    ALTER TABLE public."vector_index_records" ADD CONSTRAINT "vector_index_records_dimensions_positive" CHECK ("vector_index_records"."embedding_dimensions" > 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."vector_index_records"'::regclass AND conname='vector_index_records_metric_check') THEN
    ALTER TABLE public."vector_index_records" ADD CONSTRAINT "vector_index_records_metric_check" CHECK ("vector_index_records"."metric" IN ('cosine', 'euclidean', 'dot-product'));
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."workflow_studio_node_attempts"'::regclass AND conname='workflow_studio_node_attempts_nodeRunId_workflow_studio_node_ru') THEN
    ALTER TABLE "workflow_studio_node_attempts" ADD CONSTRAINT "workflow_studio_node_attempts_nodeRunId_workflow_studio_node_runs_id_fk" FOREIGN KEY ("nodeRunId") REFERENCES "public"."workflow_studio_node_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."workflow_studio_node_attempts"'::regclass AND conname='workflow_studio_node_attempts_runId_workflow_studio_runs_id_fk') THEN
    ALTER TABLE "workflow_studio_node_attempts" ADD CONSTRAINT "workflow_studio_node_attempts_runId_workflow_studio_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."workflow_studio_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."workflow_studio_node_runs"'::regclass AND conname='workflow_studio_node_runs_runId_workflow_studio_runs_id_fk') THEN
    ALTER TABLE "workflow_studio_node_runs" ADD CONSTRAINT "workflow_studio_node_runs_runId_workflow_studio_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."workflow_studio_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."presentation_asset_links"'::regclass AND conname='presentation_asset_links_deck_tenant_fk' AND NOT convalidated) THEN
    ALTER TABLE public."presentation_asset_links" VALIDATE CONSTRAINT "presentation_asset_links_deck_tenant_fk";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."presentation_asset_links"'::regclass AND conname='presentation_asset_links_library_item_tenant_fk' AND NOT convalidated) THEN
    ALTER TABLE public."presentation_asset_links" VALIDATE CONSTRAINT "presentation_asset_links_library_item_tenant_fk";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."presentation_asset_links"'::regclass AND conname='presentation_asset_links_slide_deck_fk' AND NOT convalidated) THEN
    ALTER TABLE public."presentation_asset_links" VALIDATE CONSTRAINT "presentation_asset_links_slide_deck_fk";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."vertical_drama_story_generation_runs"'::regclass AND conname='vd_assurance_domain_owner_pair_check' AND NOT convalidated) THEN
    ALTER TABLE public."vertical_drama_story_generation_runs" VALIDATE CONSTRAINT "vd_assurance_domain_owner_pair_check";
  END IF;
END $$;
