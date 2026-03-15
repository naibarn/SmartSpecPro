CREATE TABLE "auto_draft_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(128) NOT NULL,
	"userId" integer NOT NULL,
	"topicTemplate" text NOT NULL,
	"scheduleType" varchar(20) NOT NULL,
	"cronExpression" varchar(100),
	"runAt" timestamp with time zone,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"draftParams" jsonb NOT NULL,
	"notifyEmail" boolean DEFAULT true NOT NULL,
	"notifyWebhookUrl" text,
	"webhookSecretEncrypted" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"nextRun" timestamp with time zone,
	"lastRun" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_draft_schedules" ADD CONSTRAINT "auto_draft_schedules_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_draft_schedules_status_next_run_idx" ON "auto_draft_schedules" USING btree ("status","nextRun");--> statement-breakpoint
CREATE INDEX "auto_draft_schedules_tenant_idx" ON "auto_draft_schedules" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "auto_draft_schedules_user_idx" ON "auto_draft_schedules" USING btree ("userId");