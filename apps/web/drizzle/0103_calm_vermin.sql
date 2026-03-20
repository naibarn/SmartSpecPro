CREATE TABLE "alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"metricName" varchar(100) NOT NULL,
	"operator" varchar(10) NOT NULL,
	"threshold" double precision NOT NULL,
	"windowMinutes" integer DEFAULT 5 NOT NULL,
	"severity" "reminder_priority" DEFAULT 'high' NOT NULL,
	"channels" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"targetRole" varchar(20),
	"targetUserId" integer,
	"cooldownMinutes" integer DEFAULT 10 NOT NULL,
	"lastTriggeredAt" timestamp with time zone,
	"isEnabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalation_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"triggerSeverity" "reminder_priority" NOT NULL,
	"triggerMinutes" integer NOT NULL,
	"escalateToRole" varchar(20),
	"escalateToUserId" integer,
	"escalateChannels" jsonb NOT NULL,
	"escalateMessage" text,
	"isEnabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"category" varchar(50) NOT NULL,
	"inApp" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	"telegram" boolean DEFAULT false NOT NULL,
	"minSeverity" "reminder_priority",
	"mutedUntil" timestamp with time zone,
	"emailDigestFrequency" varchar(10),
	"emailDigestHour" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_policies" ADD CONSTRAINT "escalation_policies_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_rules_tenant_enabled" ON "alert_rules" USING btree ("tenantId","isEnabled");--> statement-breakpoint
CREATE INDEX "escalation_policies_tenant_enabled" ON "escalation_policies" USING btree ("tenantId","isEnabled");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_category" ON "notification_preferences" USING btree ("userId","category");