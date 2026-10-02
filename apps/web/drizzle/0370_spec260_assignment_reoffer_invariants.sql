DROP INDEX IF EXISTS "emergency_assignments_active_scope_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_assignments_active_task_responder_unique"
  ON "emergency_assignments" ("tenantId", "taskId", "responderUserId")
  WHERE "taskId" IS NOT NULL AND "status" IN ('offered', 'accepted', 'en_route', 'working');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_assignments_active_need_responder_unique"
  ON "emergency_assignments" ("tenantId", "caseId", "needId", "responderUserId")
  WHERE "taskId" IS NULL AND "needId" IS NOT NULL AND "status" IN ('offered', 'accepted', 'en_route', 'working');
