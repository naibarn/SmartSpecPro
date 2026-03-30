CREATE TABLE IF NOT EXISTS "monitoring_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"checkType" text NOT NULL,
	"status" text NOT NULL,
	"details" json,
	"alertSent" boolean DEFAULT false NOT NULL,
	"alertChannel" text,
	"source" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitoring_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"channel" text NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledgedBy" integer,
	"acknowledgedAt" timestamp with time zone,
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_metrics_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"memoryUsedMb" integer NOT NULL,
	"memoryTotalMb" integer NOT NULL,
	"memoryPercent" real NOT NULL,
	"cpuPercent" real,
	"diskUsedGb" real,
	"diskTotalGb" real,
	"serviceStatuses" json,
	"processRestartCounts" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_checks_check_type" ON "monitoring_checks" USING btree ("checkType");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_checks_status" ON "monitoring_checks" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_checks_created_at" ON "monitoring_checks" USING btree ("createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_alerts_severity" ON "monitoring_alerts" USING btree ("severity");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_alerts_acknowledged" ON "monitoring_alerts" USING btree ("acknowledged");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_alerts_created_at" ON "monitoring_alerts" USING btree ("createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_system_metrics_history_created_at" ON "system_metrics_history" USING btree ("createdAt");
