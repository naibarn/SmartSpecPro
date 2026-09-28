SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "llm_inference_chat_response_deliveries" (
  "attemptId" varchar(256) PRIMARY KEY
    REFERENCES "llm_inference_attempts"("attemptId") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "conversationId" integer NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "idempotencyHash" varchar(64) NOT NULL UNIQUE,
  "content" text,
  "inputTokens" integer NOT NULL DEFAULT 0,
  "outputTokens" integer NOT NULL DEFAULT 0,
  "creditsUsed" numeric(10,4) NOT NULL DEFAULT 0,
  "modelUsed" varchar(100),
  "skillUsed" varchar(100),
  "traceId" varchar(32),
  "runtimeMetadata" jsonb,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_chat_response_delivery_status_check"
    CHECK (("status" = 'pending' AND "content" IS NOT NULL) OR ("status" = 'delivered' AND "content" IS NULL)),
  CONSTRAINT "llm_inference_chat_response_delivery_usage_check"
    CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0 AND "creditsUsed" >= 0)
);
--> statement-breakpoint
CREATE INDEX "llm_inference_chat_response_pending_idx"
  ON "llm_inference_chat_response_deliveries" ("createdAt", "attemptId")
  WHERE "status" = 'pending';
