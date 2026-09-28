SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "llm_inference_credit_reservations" (
  "reservationId" varchar(256) PRIMARY KEY NOT NULL,
  "sourceTransactionId" integer NOT NULL UNIQUE REFERENCES "credit_transactions"("id") ON DELETE RESTRICT,
  "idempotencyKey" varchar(256) NOT NULL UNIQUE,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "principalRef" varchar(256) NOT NULL,
  "reservedCredits" integer NOT NULL,
  "settledCredits" integer NOT NULL DEFAULT 0,
  "status" varchar(16) NOT NULL DEFAULT 'reserved',
  "expiresAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_credit_reservation_amount_check"
    CHECK ("reservedCredits" > 0 AND "settledCredits" >= 0 AND "settledCredits" <= "reservedCredits"),
  CONSTRAINT "llm_inference_credit_reservation_status_check"
    CHECK ("status" IN ('reserved', 'closing', 'closed'))
);
--> statement-breakpoint
CREATE INDEX "llm_inference_credit_reservation_scope_status_idx"
  ON "llm_inference_credit_reservations" ("tenantId", "userId", "status", "expiresAt");
--> statement-breakpoint
CREATE TABLE "llm_inference_credit_settlements" (
  "reservationId" varchar(256) NOT NULL REFERENCES "llm_inference_credit_reservations"("reservationId") ON DELETE RESTRICT,
  "settlementKey" varchar(256) NOT NULL UNIQUE,
  "chargedCostMicros" bigint NOT NULL,
  "chargedCredits" integer NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_credit_settlements_pk" PRIMARY KEY ("reservationId", "settlementKey"),
  CONSTRAINT "llm_inference_credit_settlement_amount_check"
    CHECK ("chargedCostMicros" >= 0 AND "chargedCredits" > 0)
);
--> statement-breakpoint
CREATE INDEX "llm_inference_attempts_unsettled_completed_idx"
  ON "llm_inference_attempts" ("terminalAt", "attemptId")
  WHERE "status" = 'terminal'
    AND "outcome" = 'completed'
    AND "chargedCostMicros" IS NOT NULL;
