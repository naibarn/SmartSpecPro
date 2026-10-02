CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36),
	"user_email" varchar(255),
	"user_role" varchar(50),
	"impersonator_id" varchar(36),
	"impersonator_email" varchar(255),
	"is_impersonated" varchar(10) DEFAULT 'false',
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(100),
	"resource_id" varchar(255),
	"method" varchar(10),
	"endpoint" varchar(500),
	"status_code" varchar(10),
	"details" json,
	"ip_address" varchar(45),
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ix_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_audit_logs_impersonator_id" ON "audit_logs" USING btree ("impersonator_id");--> statement-breakpoint
CREATE INDEX "ix_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "ix_audit_logs_resource_type" ON "audit_logs" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "ix_audit_logs_resource_id" ON "audit_logs" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "ix_audit_logs_endpoint" ON "audit_logs" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "ix_audit_logs_timestamp" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_user_timestamp" ON "audit_logs" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_action_timestamp" ON "audit_logs" USING btree ("action","timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_resource" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_audit_impersonator" ON "audit_logs" USING btree ("impersonator_id","timestamp");