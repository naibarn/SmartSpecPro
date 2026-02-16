CREATE TABLE IF NOT EXISTS "funnel_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "domain" varchar(255),
  "userId" integer,
  "eventName" varchar(128) NOT NULL,
  "eventTime" timestamp with time zone NOT NULL,
  "eventKey" varchar(255) NOT NULL,
  "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "funnel_events_event_key_unique" ON "funnel_events" USING btree ("eventKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_events_tenant_event_time_idx" ON "funnel_events" USING btree ("tenantId","eventTime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_events_domain_event_time_idx" ON "funnel_events" USING btree ("domain","eventTime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_events_name_event_time_idx" ON "funnel_events" USING btree ("eventName","eventTime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_events_user_name_time_idx" ON "funnel_events" USING btree ("userId","eventName","eventTime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_events_created_user_idx" ON "registration_events" USING btree ("createdAt","userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" USING btree ("createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transactions_type_created_idx" ON "credit_transactions" USING btree ("type","createdAt");
