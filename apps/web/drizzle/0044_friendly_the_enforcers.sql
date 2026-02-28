DO $$ BEGIN
  CREATE TYPE "public"."settlement_status" AS ENUM('completed', 'partial', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TYPE "public"."credit_source_type" ADD VALUE IF NOT EXISTS 'creator_revenue' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'creator_fee';--> statement-breakpoint
CREATE TABLE "creator_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"runId" varchar(36) NOT NULL,
	"entityType" varchar(20) NOT NULL,
	"entityId" varchar(36) NOT NULL,
	"runnerId" integer NOT NULL,
	"creatorId" integer NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"totalFee" integer NOT NULL,
	"actualCharged" integer NOT NULL,
	"creatorShare" integer NOT NULL,
	"platformShare" integer NOT NULL,
	"platformSharePct" integer NOT NULL,
	"debitTransactionId" integer,
	"creditTransactionId" integer,
	"status" "settlement_status" DEFAULT 'completed' NOT NULL,
	"idempotencyKey" varchar(256),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "creatorFeeCredits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "platformSharePct" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_settlements" ADD CONSTRAINT "creator_settlements_runnerId_users_id_fk" FOREIGN KEY ("runnerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_settlements" ADD CONSTRAINT "creator_settlements_creatorId_users_id_fk" FOREIGN KEY ("creatorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_settlements" ADD CONSTRAINT "creator_settlements_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_settlements" ADD CONSTRAINT "creator_settlements_debitTransactionId_credit_transactions_id_fk" FOREIGN KEY ("debitTransactionId") REFERENCES "public"."credit_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_settlements" ADD CONSTRAINT "creator_settlements_creditTransactionId_credit_transactions_id_fk" FOREIGN KEY ("creditTransactionId") REFERENCES "public"."credit_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_settlements_idempotency_key_unique" ON "creator_settlements" USING btree ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "creator_settlements_creator_idx" ON "creator_settlements" USING btree ("creatorId");--> statement-breakpoint
CREATE INDEX "creator_settlements_runner_idx" ON "creator_settlements" USING btree ("runnerId");--> statement-breakpoint
CREATE INDEX "creator_settlements_entity_idx" ON "creator_settlements" USING btree ("entityType","entityId");--> statement-breakpoint
CREATE INDEX "creator_settlements_run_idx" ON "creator_settlements" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "creator_settlements_tenant_idx" ON "creator_settlements" USING btree ("tenantId");