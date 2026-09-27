-- D3.49 additive candidate only. This is not in the canonical migration journal.
-- The D3.39 fresh baseline omits the existing Python AuditLog table although
-- ApprovalDBService/AuditService require it. Existing full schemas are unchanged.
CREATE TABLE IF NOT EXISTS "audit_logs" (
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
CREATE INDEX IF NOT EXISTS "idx_audit_user_timestamp" ON "audit_logs" ("user_id", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_audit_action_timestamp" ON "audit_logs" ("action", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_audit_resource" ON "audit_logs" ("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "idx_audit_impersonator" ON "audit_logs" ("impersonator_id", "timestamp");
CREATE INDEX IF NOT EXISTS "ix_audit_logs_action" ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "ix_audit_logs_endpoint" ON "audit_logs" ("endpoint");
CREATE INDEX IF NOT EXISTS "ix_audit_logs_impersonator_id" ON "audit_logs" ("impersonator_id");
CREATE INDEX IF NOT EXISTS "ix_audit_logs_resource_id" ON "audit_logs" ("resource_id");
CREATE INDEX IF NOT EXISTS "ix_audit_logs_resource_type" ON "audit_logs" ("resource_type");
CREATE INDEX IF NOT EXISTS "ix_audit_logs_timestamp" ON "audit_logs" ("timestamp");
CREATE INDEX IF NOT EXISTS "ix_audit_logs_user_id" ON "audit_logs" ("user_id");
