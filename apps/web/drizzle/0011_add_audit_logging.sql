-- Phase 2: Audit logging schema changes
-- Extends providerUsageLog with trace/error/type columns
-- Adds apiAuditEvents table for media/skill structured logging

ALTER TABLE "provider_usage_log" ADD COLUMN "traceId" varchar(32);
ALTER TABLE "provider_usage_log" ADD COLUMN "errorMessage" text;
ALTER TABLE "provider_usage_log" ADD COLUMN "requestType" varchar(32);
CREATE INDEX "provider_usage_log_trace_id" ON "provider_usage_log" ("traceId");

CREATE TABLE "api_audit_events" (
  "id" serial PRIMARY KEY,
  "traceId" varchar(32) NOT NULL,
  "eventType" varchar(64) NOT NULL,
  "userId" integer REFERENCES "users"("id"),
  "endpoint" varchar(512),
  "model" varchar(128),
  "provider" varchar(64),
  "statusCode" integer,
  "errorMessage" text,
  "responseTimeMs" integer,
  "creditsCharged" integer DEFAULT 0,
  "costUsd" numeric(12,8),
  "skillSlug" varchar(100),
  "mediaType" varchar(20),
  "mediaTaskId" varchar(128),
  "metadata" json,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "api_audit_events_trace_id" ON "api_audit_events" ("traceId");
CREATE INDEX "api_audit_events_user_created" ON "api_audit_events" ("userId", "createdAt");
CREATE INDEX "api_audit_events_type_created" ON "api_audit_events" ("eventType", "createdAt");
