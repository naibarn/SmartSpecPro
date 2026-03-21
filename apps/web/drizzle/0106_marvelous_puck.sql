CREATE TABLE "notification_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer,
	"name" varchar(100) NOT NULL,
	"url" text NOT NULL,
	"secretEncrypted" text NOT NULL,
	"categories" jsonb,
	"minSeverity" "reminder_priority",
	"isEnabled" boolean DEFAULT true NOT NULL,
	"lastDeliveredAt" timestamp with time zone,
	"failureCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_webhooks" ADD CONSTRAINT "notification_webhooks_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_webhooks" ADD CONSTRAINT "notification_webhooks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_webhooks_tenant_idx" ON "notification_webhooks" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "notification_webhooks_user_idx" ON "notification_webhooks" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_orch_notif_user_created" ON "orchestrator_notifications" USING btree ("userId","createdAt");