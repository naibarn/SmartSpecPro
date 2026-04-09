import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const workpackLifecycleStateEnum = pgEnum("workpack_lifecycle_state", [
  "draft",
  "clarification_needed",
  "needs_review",
  "ready",
  "simulating",
  "supervised",
  "autonomous",
  "paused",
  "retired",
  "archived",
]);

export const workpackAutonomyModeEnum = pgEnum("workpack_autonomy_mode", [
  "draft",
  "supervised",
  "autonomous",
]);

export const workpackPromotionStateEnum = pgEnum("workpack_promotion_state", [
  "unpromoted",
  "candidate",
  "approved",
  "promoted",
  "reverted",
  "blocked",
]);

export const workpackRunStatusEnum = pgEnum("workpack_run_status", [
  "queued",
  "running",
  "awaiting_approval",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
]);

export const workpacks = pgTable("workpacks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  goal: text("goal").notNull(),
  domainPack: text("domain_pack").notNull(),
  lifecycleState: workpackLifecycleStateEnum("lifecycle_state").notNull(),
  autonomyMode: workpackAutonomyModeEnum("autonomy_mode").notNull(),
  promotionState: workpackPromotionStateEnum("promotion_state").notNull(),
  currentVersionId: text("current_version_id").notNull(),
  caseSourceIdsJson: jsonb("case_source_ids_json").notNull().default([]),
  policyProfileJson: jsonb("policy_profile_json").notNull().default({}),
  runtimePreferenceHintsJson: jsonb("runtime_preference_hints_json").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => ({
  tenantIdx: index("workpacks_tenant_idx").on(table.tenantId),
  lifecycleIdx: index("workpacks_lifecycle_idx").on(table.lifecycleState),
}));

export const workpackVersions = pgTable("workpack_versions", {
  id: text("id").primaryKey(),
  workpackId: text("workpack_id").notNull(),
  versionNumber: text("version_number").notNull(),
  playbookJson: jsonb("playbook_json").notNull(),
  executionPlanJson: jsonb("execution_plan_json"),
  connectorMapsJson: jsonb("connector_maps_json").notNull().default([]),
  fixtureCatalogJson: jsonb("fixture_catalog_json").notNull().default([]),
  compilerMetadataJson: jsonb("compiler_metadata_json").notNull().default({}),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  workpackIdx: index("workpack_versions_workpack_idx").on(table.workpackId),
}));

export const workpackRuns = pgTable("workpack_runs", {
  id: text("id").primaryKey(),
  workpackId: text("workpack_id").notNull(),
  versionId: text("version_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  status: workpackRunStatusEnum("status").notNull(),
  autonomyMode: workpackAutonomyModeEnum("autonomy_mode").notNull(),
  plannedStepsJson: jsonb("planned_steps_json").notNull().default([]),
  actualStepsJson: jsonb("actual_steps_json").notNull().default([]),
  approvalsJson: jsonb("approvals_json").notNull().default([]),
  artifactsJson: jsonb("artifacts_json").notNull().default([]),
  connectorSummariesJson: jsonb("connector_summaries_json").notNull().default([]),
  notes: text("notes").notNull().default(""),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (table) => ({
  workpackIdx: index("workpack_runs_workpack_idx").on(table.workpackId),
  tenantIdx: index("workpack_runs_tenant_idx").on(table.tenantId),
}));
