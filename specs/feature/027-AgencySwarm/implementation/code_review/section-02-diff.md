diff --git a/apps/web/drizzle/0041_classy_shockwave.sql b/apps/web/drizzle/0041_classy_shockwave.sql
new file mode 100644
index 0000000..ece4a62
--- /dev/null
+++ b/apps/web/drizzle/0041_classy_shockwave.sql
@@ -0,0 +1,99 @@
+ALTER TYPE "public"."credit_source_type" ADD VALUE 'agency' BEFORE 'other';--> statement-breakpoint
+ALTER TYPE "public"."sandbox_feature_type" ADD VALUE 'agency';--> statement-breakpoint
+CREATE TABLE "agencies" (
+	"id" varchar(36) PRIMARY KEY NOT NULL,
+	"tenantId" varchar(36) NOT NULL,
+	"slug" varchar(100) NOT NULL,
+	"name" varchar(255) NOT NULL,
+	"description" text,
+	"systemPrompt" text,
+	"creditMultiplier" numeric(5, 2) DEFAULT '1.00',
+	"maxAgents" integer DEFAULT 10,
+	"maxRunTimeSeconds" integer DEFAULT 600,
+	"status" varchar(20) DEFAULT 'draft' NOT NULL,
+	"isFallbackSafe" boolean DEFAULT false NOT NULL,
+	"isPublished" boolean DEFAULT false NOT NULL,
+	"createdBy" integer,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+CREATE TABLE "agency_agent_tools" (
+	"id" varchar(36) PRIMARY KEY NOT NULL,
+	"agentId" varchar(36) NOT NULL,
+	"toolId" varchar(36) NOT NULL,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+CREATE TABLE "agency_agents" (
+	"id" varchar(36) PRIMARY KEY NOT NULL,
+	"agencyId" varchar(36) NOT NULL,
+	"name" varchar(100) NOT NULL,
+	"description" text,
+	"instructions" text,
+	"model" varchar(100),
+	"modelSettings" json,
+	"isEntryPoint" boolean DEFAULT false NOT NULL,
+	"isOptional" boolean DEFAULT false NOT NULL,
+	"position" json,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+CREATE TABLE "agency_communication_flows" (
+	"id" varchar(36) PRIMARY KEY NOT NULL,
+	"agencyId" varchar(36) NOT NULL,
+	"fromAgentId" varchar(36) NOT NULL,
+	"toAgentId" varchar(36) NOT NULL,
+	"flowType" varchar(20) DEFAULT 'delegation' NOT NULL,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+CREATE TABLE "agency_conversations" (
+	"id" varchar(36) PRIMARY KEY NOT NULL,
+	"agencyId" varchar(36) NOT NULL,
+	"userId" integer NOT NULL,
+	"title" varchar(255) DEFAULT 'New Agency Chat' NOT NULL,
+	"totalCreditsUsed" numeric(12, 4) DEFAULT '0',
+	"messageCount" integer DEFAULT 0 NOT NULL,
+	"isArchived" boolean DEFAULT false NOT NULL,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+CREATE TABLE "agency_tools" (
+	"id" varchar(36) PRIMARY KEY NOT NULL,
+	"tenantId" varchar(36) NOT NULL,
+	"name" varchar(100) NOT NULL,
+	"description" text,
+	"toolType" varchar(20) NOT NULL,
+	"config" json,
+	"riskLevel" varchar(10) DEFAULT 'low' NOT NULL,
+	"requiresApproval" boolean DEFAULT false NOT NULL,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+ALTER TABLE "agencies" ADD CONSTRAINT "agencies_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agencies" ADD CONSTRAINT "agencies_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agency_agent_tools" ADD CONSTRAINT "agency_agent_tools_agentId_agency_agents_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agency_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agency_agent_tools" ADD CONSTRAINT "agency_agent_tools_toolId_agency_tools_id_fk" FOREIGN KEY ("toolId") REFERENCES "public"."agency_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agency_agents" ADD CONSTRAINT "agency_agents_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agency_communication_flows" ADD CONSTRAINT "agency_communication_flows_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agency_communication_flows" ADD CONSTRAINT "agency_communication_flows_fromAgentId_agency_agents_id_fk" FOREIGN KEY ("fromAgentId") REFERENCES "public"."agency_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agency_communication_flows" ADD CONSTRAINT "agency_communication_flows_toAgentId_agency_agents_id_fk" FOREIGN KEY ("toAgentId") REFERENCES "public"."agency_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agency_conversations" ADD CONSTRAINT "agency_conversations_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agency_conversations" ADD CONSTRAINT "agency_conversations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "agency_tools" ADD CONSTRAINT "agency_tools_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
+CREATE UNIQUE INDEX "agencies_tenant_slug_idx" ON "agencies" USING btree ("tenantId","slug");--> statement-breakpoint
+CREATE INDEX "agencies_tenant_idx" ON "agencies" USING btree ("tenantId");--> statement-breakpoint
+CREATE INDEX "agencies_created_by_idx" ON "agencies" USING btree ("createdBy");--> statement-breakpoint
+CREATE UNIQUE INDEX "agency_agent_tools_agent_tool_idx" ON "agency_agent_tools" USING btree ("agentId","toolId");--> statement-breakpoint
+CREATE INDEX "agency_agent_tools_tool_idx" ON "agency_agent_tools" USING btree ("toolId");--> statement-breakpoint
+CREATE INDEX "agency_agents_agency_idx" ON "agency_agents" USING btree ("agencyId");--> statement-breakpoint
+CREATE UNIQUE INDEX "agency_agents_agency_name_idx" ON "agency_agents" USING btree ("agencyId","name");--> statement-breakpoint
+CREATE INDEX "agency_comm_flows_agency_idx" ON "agency_communication_flows" USING btree ("agencyId");--> statement-breakpoint
+CREATE UNIQUE INDEX "agency_comm_flows_unique_idx" ON "agency_communication_flows" USING btree ("agencyId","fromAgentId","toAgentId");--> statement-breakpoint
+CREATE INDEX "agency_conversations_agency_user_idx" ON "agency_conversations" USING btree ("agencyId","userId");--> statement-breakpoint
+CREATE INDEX "agency_conversations_user_idx" ON "agency_conversations" USING btree ("userId");--> statement-breakpoint
+CREATE INDEX "agency_tools_tenant_idx" ON "agency_tools" USING btree ("tenantId");--> statement-breakpoint
+CREATE UNIQUE INDEX "agency_tools_tenant_name_idx" ON "agency_tools" USING btree ("tenantId","name");
\ No newline at end of file
diff --git a/apps/web/drizzle/schema.test.ts b/apps/web/drizzle/schema.test.ts
index 105b4b8..9344e58 100644
--- a/apps/web/drizzle/schema.test.ts
+++ b/apps/web/drizzle/schema.test.ts
@@ -1,6 +1,6 @@
 import { describe, test, expect } from 'vitest';
 import { getTableColumns } from 'drizzle-orm';
-import { userGroups, groupMembers, libraryPermissions, libraryItems, presentationExports, presentationSlides, presentationDecks } from './schema';
+import { userGroups, groupMembers, libraryPermissions, libraryItems, presentationExports, presentationSlides, presentationDecks, agencies, agencyAgents, agencyAgentTools, agencyTools, agencyCommunicationFlows, agencyConversations } from './schema';
 
 describe('user_groups table schema', () => {
   test('has required columns with correct types', () => {
@@ -229,3 +229,114 @@ describe('presentation_decks project audio column', () => {
     expect(cols.projectAudioTrack.notNull).toBeFalsy();
   });
 });
+
+// ==========================================
+// Section 027: Agency-Swarm Schema Tests
+// ==========================================
+
+describe('agencies table schema', () => {
+  test('has all required columns', () => {
+    const columns = getTableColumns(agencies);
+    expect(columns.id).toBeDefined();
+    expect(columns.tenantId).toBeDefined();
+    expect(columns.slug).toBeDefined();
+    expect(columns.name).toBeDefined();
+    expect(columns.description).toBeDefined();
+    expect(columns.systemPrompt).toBeDefined();
+    expect(columns.creditMultiplier).toBeDefined();
+    expect(columns.maxAgents).toBeDefined();
+    expect(columns.maxRunTimeSeconds).toBeDefined();
+    expect(columns.status).toBeDefined();
+    expect(columns.isFallbackSafe).toBeDefined();
+    expect(columns.isPublished).toBeDefined();
+    expect(columns.createdBy).toBeDefined();
+    expect(columns.createdAt).toBeDefined();
+    expect(columns.updatedAt).toBeDefined();
+  });
+
+  test('tenantId is not null (FK constraint)', () => {
+    const columns = getTableColumns(agencies);
+    expect(columns.tenantId.notNull).toBe(true);
+  });
+});
+
+describe('agency_agents table schema', () => {
+  test('has all required columns', () => {
+    const columns = getTableColumns(agencyAgents);
+    expect(columns.id).toBeDefined();
+    expect(columns.agencyId).toBeDefined();
+    expect(columns.name).toBeDefined();
+    expect(columns.description).toBeDefined();
+    expect(columns.instructions).toBeDefined();
+    expect(columns.model).toBeDefined();
+    expect(columns.modelSettings).toBeDefined();
+    expect(columns.isEntryPoint).toBeDefined();
+    expect(columns.isOptional).toBeDefined();
+    expect(columns.position).toBeDefined();
+    expect(columns.createdAt).toBeDefined();
+    expect(columns.updatedAt).toBeDefined();
+  });
+
+  test('agencyId is not null (FK constraint)', () => {
+    const columns = getTableColumns(agencyAgents);
+    expect(columns.agencyId.notNull).toBe(true);
+  });
+});
+
+describe('agency_agent_tools junction table schema', () => {
+  test('has all required columns', () => {
+    const columns = getTableColumns(agencyAgentTools);
+    expect(columns.id).toBeDefined();
+    expect(columns.agentId).toBeDefined();
+    expect(columns.toolId).toBeDefined();
+    expect(columns.createdAt).toBeDefined();
+  });
+
+  test('agentId and toolId are not null', () => {
+    const columns = getTableColumns(agencyAgentTools);
+    expect(columns.agentId.notNull).toBe(true);
+    expect(columns.toolId.notNull).toBe(true);
+  });
+});
+
+describe('agency_tools table schema', () => {
+  test('has all required columns', () => {
+    const columns = getTableColumns(agencyTools);
+    expect(columns.id).toBeDefined();
+    expect(columns.tenantId).toBeDefined();
+    expect(columns.name).toBeDefined();
+    expect(columns.description).toBeDefined();
+    expect(columns.toolType).toBeDefined();
+    expect(columns.config).toBeDefined();
+    expect(columns.riskLevel).toBeDefined();
+    expect(columns.requiresApproval).toBeDefined();
+    expect(columns.createdAt).toBeDefined();
+  });
+});
+
+describe('agency_communication_flows table schema', () => {
+  test('has all required columns', () => {
+    const columns = getTableColumns(agencyCommunicationFlows);
+    expect(columns.id).toBeDefined();
+    expect(columns.agencyId).toBeDefined();
+    expect(columns.fromAgentId).toBeDefined();
+    expect(columns.toAgentId).toBeDefined();
+    expect(columns.flowType).toBeDefined();
+    expect(columns.createdAt).toBeDefined();
+  });
+});
+
+describe('agency_conversations table schema', () => {
+  test('has all required columns', () => {
+    const columns = getTableColumns(agencyConversations);
+    expect(columns.id).toBeDefined();
+    expect(columns.agencyId).toBeDefined();
+    expect(columns.userId).toBeDefined();
+    expect(columns.title).toBeDefined();
+    expect(columns.totalCreditsUsed).toBeDefined();
+    expect(columns.messageCount).toBeDefined();
+    expect(columns.isArchived).toBeDefined();
+    expect(columns.createdAt).toBeDefined();
+    expect(columns.updatedAt).toBeDefined();
+  });
+});
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 8d5f54d..5d97d55 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -107,6 +107,7 @@ export const creditSourceTypeEnum = pgEnum("credit_source_type", [
   "brainstorm",
   "scheduler",
   "admin",
+  "agency",
   "other",
 ]);
 
@@ -146,7 +147,7 @@ export const sandboxNetworkActionEnum = pgEnum("sandbox_network_action", [
 ]);
 
 export const sandboxFeatureTypeEnum = pgEnum("sandbox_feature_type", [
-  "chat", "skill", "workflow", "library", "media", "presentation", "connector",
+  "chat", "skill", "workflow", "library", "media", "presentation", "connector", "agency",
 ]);
 
 /**
@@ -3893,3 +3894,141 @@ export const tenantSandboxPolicies = pgTable("tenant_sandbox_policies", {
 
 export type TenantSandboxPolicy = typeof tenantSandboxPolicies.$inferSelect;
 export type InsertTenantSandboxPolicy = typeof tenantSandboxPolicies.$inferInsert;
+
+// ==========================================
+// Section 027: Agency-Swarm Integration
+// ==========================================
+
+/**
+ * Agencies -- Multi-agent orchestration units.
+ * Each agency contains a team of AI agents with directional communication flows.
+ */
+export const agencies = pgTable("agencies", {
+  id: varchar("id", { length: 36 }).primaryKey(),
+  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  slug: varchar("slug", { length: 100 }).notNull(),
+  name: varchar("name", { length: 255 }).notNull(),
+  description: text("description"),
+  systemPrompt: text("systemPrompt"),
+  creditMultiplier: numeric("creditMultiplier", { precision: 5, scale: 2 }).default("1.00"),
+  maxAgents: integer("maxAgents").default(10),
+  maxRunTimeSeconds: integer("maxRunTimeSeconds").default(600),
+  status: varchar("status", { length: 20 }).default("draft").notNull(),
+  isFallbackSafe: boolean("isFallbackSafe").default(false).notNull(),
+  isPublished: boolean("isPublished").default(false).notNull(),
+  createdBy: integer("createdBy").references(() => users.id),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("agencies_tenant_slug_idx").on(t.tenantId, t.slug),
+  index("agencies_tenant_idx").on(t.tenantId),
+  index("agencies_created_by_idx").on(t.createdBy),
+]);
+
+export type Agency = typeof agencies.$inferSelect;
+export type InsertAgency = typeof agencies.$inferInsert;
+
+/**
+ * Agency Agents -- Individual AI agents within an agency.
+ * Each agent has its own model, instructions, and tool set.
+ */
+export const agencyAgents = pgTable("agency_agents", {
+  id: varchar("id", { length: 36 }).primaryKey(),
+  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id, { onDelete: "cascade" }),
+  name: varchar("name", { length: 100 }).notNull(),
+  description: text("description"),
+  instructions: text("instructions"),
+  model: varchar("model", { length: 100 }),
+  modelSettings: json("modelSettings").$type<{
+    max_tokens?: number;
+    temperature?: number;
+    top_p?: number;
+  }>(),
+  isEntryPoint: boolean("isEntryPoint").default(false).notNull(),
+  isOptional: boolean("isOptional").default(false).notNull(),
+  position: json("position").$type<{ x: number; y: number }>(),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("agency_agents_agency_idx").on(t.agencyId),
+  uniqueIndex("agency_agents_agency_name_idx").on(t.agencyId, t.name),
+]);
+
+export type AgencyAgent = typeof agencyAgents.$inferSelect;
+export type InsertAgencyAgent = typeof agencyAgents.$inferInsert;
+
+/**
+ * Agency Tools -- Tool definitions available to agency agents.
+ */
+export const agencyTools = pgTable("agency_tools", {
+  id: varchar("id", { length: 36 }).primaryKey(),
+  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id),
+  name: varchar("name", { length: 100 }).notNull(),
+  description: text("description"),
+  toolType: varchar("toolType", { length: 20 }).notNull(),
+  config: json("config").$type<Record<string, unknown>>(),
+  riskLevel: varchar("riskLevel", { length: 10 }).default("low").notNull(),
+  requiresApproval: boolean("requiresApproval").default(false).notNull(),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("agency_tools_tenant_idx").on(t.tenantId),
+  uniqueIndex("agency_tools_tenant_name_idx").on(t.tenantId, t.name),
+]);
+
+export type AgencyTool = typeof agencyTools.$inferSelect;
+export type InsertAgencyTool = typeof agencyTools.$inferInsert;
+
+/**
+ * Agency Agent Tools -- Junction table linking agents to their assigned tools.
+ */
+export const agencyAgentTools = pgTable("agency_agent_tools", {
+  id: varchar("id", { length: 36 }).primaryKey(),
+  agentId: varchar("agentId", { length: 36 }).notNull().references(() => agencyAgents.id, { onDelete: "cascade" }),
+  toolId: varchar("toolId", { length: 36 }).notNull().references(() => agencyTools.id, { onDelete: "cascade" }),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("agency_agent_tools_agent_tool_idx").on(t.agentId, t.toolId),
+  index("agency_agent_tools_tool_idx").on(t.toolId),
+]);
+
+export type AgencyAgentTool = typeof agencyAgentTools.$inferSelect;
+export type InsertAgencyAgentTool = typeof agencyAgentTools.$inferInsert;
+
+/**
+ * Agency Communication Flows -- Directional communication links between agents.
+ */
+export const agencyCommunicationFlows = pgTable("agency_communication_flows", {
+  id: varchar("id", { length: 36 }).primaryKey(),
+  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id, { onDelete: "cascade" }),
+  fromAgentId: varchar("fromAgentId", { length: 36 }).notNull().references(() => agencyAgents.id),
+  toAgentId: varchar("toAgentId", { length: 36 }).notNull().references(() => agencyAgents.id),
+  flowType: varchar("flowType", { length: 20 }).default("delegation").notNull(),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("agency_comm_flows_agency_idx").on(t.agencyId),
+  uniqueIndex("agency_comm_flows_unique_idx").on(t.agencyId, t.fromAgentId, t.toAgentId),
+]);
+
+export type AgencyCommunicationFlow = typeof agencyCommunicationFlows.$inferSelect;
+export type InsertAgencyCommunicationFlow = typeof agencyCommunicationFlows.$inferInsert;
+
+/**
+ * Agency Conversations -- Chat sessions between a user and an agency.
+ */
+export const agencyConversations = pgTable("agency_conversations", {
+  id: varchar("id", { length: 36 }).primaryKey(),
+  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id),
+  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
+  title: varchar("title", { length: 255 }).default("New Agency Chat").notNull(),
+  totalCreditsUsed: numeric("totalCreditsUsed", { precision: 12, scale: 4 }).default("0"),
+  messageCount: integer("messageCount").default(0).notNull(),
+  isArchived: boolean("isArchived").default(false).notNull(),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("agency_conversations_agency_user_idx").on(t.agencyId, t.userId),
+  index("agency_conversations_user_idx").on(t.userId),
+]);
+
+export type AgencyConversation = typeof agencyConversations.$inferSelect;
+export type InsertAgencyConversation = typeof agencyConversations.$inferInsert;
diff --git a/apps/web/server/routers/sandbox.ts b/apps/web/server/routers/sandbox.ts
index 9246487..9dda5b0 100644
--- a/apps/web/server/routers/sandbox.ts
+++ b/apps/web/server/routers/sandbox.ts
@@ -19,6 +19,26 @@ import { estimateCost, reserveCredits, refundReservedCredits } from "../services
 import { getArtifactUrl, getJobArtifactUrls } from "../services/sandbox/artifactAccess";
 import { internalFetch } from "../services/sandbox/dispatchService";
 
+type SandboxJobAccessContext = {
+  userId?: number | null;
+  tenantId?: string | null;
+  role?: string | null;
+};
+
+type SandboxJobOwnership = {
+  userId: number;
+  tenantId: string;
+};
+
+export function canAccessSandboxJob(
+  job: SandboxJobOwnership,
+  ctx: SandboxJobAccessContext,
+): boolean {
+  if (ctx.role === "admin") return true;
+  if (!ctx.tenantId || !ctx.userId) return false;
+  return job.tenantId === ctx.tenantId && job.userId === ctx.userId;
+}
+
 export const sandboxRouter = router({
   /**
    * Create a new sandbox job.
@@ -27,10 +47,10 @@ export const sandboxRouter = router({
     .input(
       z.object({
         featureType: z.enum([
-          "chat", "skill", "workflow", "library", "media", "presentation", "connector",
+          "chat", "skill", "workflow", "library", "media", "presentation", "connector", "agency",
         ]),
         executionMode: z.enum([
-          "sandbox-code", "sandbox-command", "sandbox-browser", "sandbox-file", "sandbox-media",
+          "sandbox-code", "sandbox-command", "sandbox-browser", "sandbox-file", "sandbox-media", "sandbox-python",
         ]),
         inputFiles: z
           .array(
@@ -130,8 +150,11 @@ export const sandboxRouter = router({
 
       const job = rows[0];
 
-      // Verify ownership or admin
-      if (job.tenantId !== ctx.tenantId && ctx.user?.role !== "admin") {
+      if (!canAccessSandboxJob(job, {
+        userId: ctx.user?.id,
+        tenantId: ctx.tenantId,
+        role: ctx.user?.role,
+      })) {
         throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
       }
 
@@ -176,7 +199,11 @@ export const sandboxRouter = router({
 
       const job = rows[0];
 
-      if (job.tenantId !== ctx.tenantId && ctx.user?.role !== "admin") {
+      if (!canAccessSandboxJob(job, {
+        userId: ctx.user?.id,
+        tenantId: ctx.tenantId,
+        role: ctx.user?.role,
+      })) {
         throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
       }
 
@@ -232,7 +259,11 @@ export const sandboxRouter = router({
 
       const job = rows[0];
 
-      if (job.tenantId !== ctx.tenantId && ctx.user?.role !== "admin") {
+      if (!canAccessSandboxJob(job, {
+        userId: ctx.user?.id,
+        tenantId: ctx.tenantId,
+        role: ctx.user?.role,
+      })) {
         throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
       }
 
@@ -272,7 +303,11 @@ export const sandboxRouter = router({
         if (!ctx.tenantId) {
           throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
         }
+        if (!ctx.user?.id) {
+          throw new TRPCError({ code: "BAD_REQUEST", message: "User context required" });
+        }
         conditions.push(eq(sandboxJobs.tenantId, ctx.tenantId));
+        conditions.push(eq(sandboxJobs.userId, ctx.user.id));
       }
 
       if (input.status) {
diff --git a/apps/web/server/services/creditService.ts b/apps/web/server/services/creditService.ts
index 7403903..d2faad9 100644
--- a/apps/web/server/services/creditService.ts
+++ b/apps/web/server/services/creditService.ts
@@ -14,7 +14,7 @@ export type TransactionType = "purchase" | "usage" | "bonus" | "refund" | "adjus
 export type CreditSourceType =
   | "chat" | "skill" | "media_image" | "media_video" | "media_audio"
   | "indexing" | "rag" | "stt" | "translation" | "brainstorm"
-  | "scheduler" | "admin" | "other";
+  | "scheduler" | "admin" | "agency" | "other";
 
 export class BudgetExceededError extends Error {
   public readonly monthlyLimit: number;
diff --git a/python-backend/app/core/database.py b/python-backend/app/core/database.py
index cdad3a2..5d37977 100644
--- a/python-backend/app/core/database.py
+++ b/python-backend/app/core/database.py
@@ -95,6 +95,8 @@ async def init_db():
         notification, user_preferences, custom_skill_prompt,
         # Sandbox execution
         sandbox,
+        # Agency-Swarm
+        agency,
     )
     async with engine.begin() as conn:
         await conn.run_sync(Base.metadata.create_all)
diff --git a/python-backend/app/models/__init__.py b/python-backend/app/models/__init__.py
index 0085fb2..dbef0d2 100644
--- a/python-backend/app/models/__init__.py
+++ b/python-backend/app/models/__init__.py
@@ -75,6 +75,9 @@ from .sandbox import (
     SandboxNetworkAction,
 )
 
+# Agency-Swarm multi-agent orchestration
+from .agency import AgencyMessage, AgencyRun, AgencyRunStatus
+
 __all__ = [
     # Existing
     "AuditLog",
@@ -154,4 +157,8 @@ __all__ = [
     "SandboxArtifactType",
     "SandboxFeatureType",
     "SandboxNetworkAction",
+    # Agency
+    "AgencyMessage",
+    "AgencyRun",
+    "AgencyRunStatus",
 ]
diff --git a/python-backend/app/models/agency.py b/python-backend/app/models/agency.py
new file mode 100644
index 0000000..e320c6e
--- /dev/null
+++ b/python-backend/app/models/agency.py
@@ -0,0 +1,140 @@
+"""
+Agency execution models for Agency-Swarm integration.
+
+High-write runtime tables managed by SQLAlchemy/Alembic.
+References to Drizzle-owned tables (agency_conversations, agencies) use
+plain columns without ForeignKey constraints -- referential integrity is
+enforced at the application level.
+"""
+
+import enum
+from datetime import datetime, timezone
+
+from sqlalchemy import (
+    BigInteger,
+    Boolean,
+    Column,
+    DateTime,
+    Integer,
+    Numeric,
+    String,
+    Text,
+    Index,
+)
+from sqlalchemy.dialects.postgresql import JSON
+
+from app.core.database import Base
+
+
+class AgencyRunStatus(str, enum.Enum):
+    """Lifecycle status for agency runs."""
+    QUEUED = "queued"
+    RUNNING = "running"
+    COMPLETED = "completed"
+    FAILED = "failed"
+    CANCELLED = "cancelled"
+
+
+class AgencyMessage(Base):
+    """Individual message within an agency conversation.
+
+    Stores messages from all participants (user, agents, system, tool calls).
+    Agent-to-agent messages may have PII redacted before storage.
+    """
+
+    __tablename__ = "agency_messages"
+
+    id = Column(BigInteger, primary_key=True, autoincrement=True)
+    conversation_id = Column(String(36), nullable=False, index=True)
+    agent_name = Column(String(100), nullable=True)
+    role = Column(String(20), nullable=False)  # user / assistant / system / tool
+    content = Column(Text, nullable=True)
+    input_tokens = Column(Integer, nullable=True)
+    output_tokens = Column(Integer, nullable=True)
+    credits_used = Column(Numeric(10, 4), nullable=True)
+    tool_calls = Column(JSON, nullable=True)
+    parent_message_id = Column(BigInteger, nullable=True)
+    pii_redacted = Column(Boolean, nullable=False, default=False)
+    created_at = Column(
+        DateTime(timezone=True),
+        nullable=False,
+        default=lambda: datetime.now(timezone.utc),
+    )
+
+    __table_args__ = (
+        Index("agency_messages_conv_idx", "conversation_id"),
+        Index("agency_messages_created_idx", "created_at"),
+    )
+
+    def to_dict(self):
+        """Convert to dictionary for API responses."""
+        return {
+            "id": self.id,
+            "conversationId": self.conversation_id,
+            "agentName": self.agent_name,
+            "role": self.role,
+            "content": self.content,
+            "inputTokens": self.input_tokens,
+            "outputTokens": self.output_tokens,
+            "creditsUsed": str(self.credits_used) if self.credits_used else None,
+            "toolCalls": self.tool_calls,
+            "parentMessageId": self.parent_message_id,
+            "piiRedacted": self.pii_redacted,
+            "createdAt": self.created_at.isoformat() if self.created_at else None,
+        }
+
+
+class AgencyRun(Base):
+    """Execution record for a single agency invocation.
+
+    Tracks the full lifecycle from queued through completion or failure,
+    including credit accounting (gateway cost + multiplier markup).
+    """
+
+    __tablename__ = "agency_runs"
+
+    id = Column(String(36), primary_key=True)
+    conversation_id = Column(String(36), nullable=False, index=True)
+    user_id = Column(Integer, nullable=False)
+    agency_id = Column(String(36), nullable=False)
+    tenant_id = Column(String(36), nullable=False)
+    status = Column(String(20), nullable=False, default=AgencyRunStatus.QUEUED.value)
+    total_gateway_cost = Column(Numeric(12, 4), nullable=True)
+    multiplier_markup = Column(Numeric(12, 4), nullable=True)
+    total_credits_used = Column(Numeric(12, 4), nullable=True)
+    started_at = Column(DateTime(timezone=True), nullable=True)
+    completed_at = Column(DateTime(timezone=True), nullable=True)
+    duration_ms = Column(Integer, nullable=True)
+    error_type = Column(String(50), nullable=True)
+    error_message = Column(Text, nullable=True)
+    step_count = Column(Integer, nullable=True)
+    retry_count = Column(Integer, nullable=True)
+    run_metadata = Column("metadata", JSON, nullable=True)
+
+    __table_args__ = (
+        Index("agency_runs_conv_idx", "conversation_id"),
+        Index("agency_runs_tenant_idx", "tenant_id"),
+        Index("agency_runs_user_idx", "user_id"),
+        Index("agency_runs_status_idx", "status"),
+    )
+
+    def to_dict(self):
+        """Convert to dictionary for API responses."""
+        return {
+            "id": self.id,
+            "conversationId": self.conversation_id,
+            "userId": self.user_id,
+            "agencyId": self.agency_id,
+            "tenantId": self.tenant_id,
+            "status": self.status,
+            "totalGatewayCost": str(self.total_gateway_cost) if self.total_gateway_cost else None,
+            "multiplierMarkup": str(self.multiplier_markup) if self.multiplier_markup else None,
+            "totalCreditsUsed": str(self.total_credits_used) if self.total_credits_used else None,
+            "startedAt": self.started_at.isoformat() if self.started_at else None,
+            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
+            "durationMs": self.duration_ms,
+            "errorType": self.error_type,
+            "errorMessage": self.error_message,
+            "stepCount": self.step_count,
+            "retryCount": self.retry_count,
+        }
diff --git a/python-backend/app/models/sandbox.py b/python-backend/app/models/sandbox.py
index 2765fa6..1cafd88 100644
--- a/python-backend/app/models/sandbox.py
+++ b/python-backend/app/models/sandbox.py
@@ -15,6 +15,7 @@ from sqlalchemy import (
     Boolean,
     Column,
     DateTime,
+    Enum as SAEnum,
     ForeignKey,
     Index,
     Integer,
@@ -28,6 +29,11 @@ from sqlalchemy.dialects.postgresql import JSONB
 from app.core.database import Base
 
 
+def _enum_values(enum_cls):
+    """Persist enum values (not enum member names) in PostgreSQL enum columns."""
+    return [member.value for member in enum_cls]
+
+
 class SandboxExecutionMode(str, enum.Enum):
     """Execution mode for sandbox jobs."""
     CODE = "code"
@@ -72,6 +78,7 @@ class SandboxFeatureType(str, enum.Enum):
     MEDIA = "media"
     PRESENTATION = "presentation"
     CONNECTOR = "connector"
+    AGENCY = "agency"
 
 
 class SandboxNetworkAction(str, enum.Enum):
@@ -148,14 +155,47 @@ class SandboxJob(Base):
     tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
     user_id = Column("userId", Integer, ForeignKey("users.id"), nullable=False)
 
-    feature_type = Column("featureType", String(16), nullable=False)
+    feature_type = Column(
+        "featureType",
+        SAEnum(
+            SandboxFeatureType,
+            name="sandbox_feature_type",
+            values_callable=_enum_values,
+            native_enum=True,
+            create_type=False,
+            validate_strings=True,
+        ),
+        nullable=False,
+    )
     feature_ref_id = Column("featureRefId", String(128), nullable=True)
-    execution_mode = Column("executionMode", String(16), nullable=False)
+    execution_mode = Column(
+        "executionMode",
+        SAEnum(
+            SandboxExecutionMode,
+            name="sandbox_execution_mode",
+            values_callable=_enum_values,
+            native_enum=True,
+            create_type=False,
+            validate_strings=True,
+        ),
+        nullable=False,
+    )
 
     sandbox_profile_id = Column("sandboxProfileId", Integer, ForeignKey("sandbox_profiles.id"), nullable=True)
     opensandbox_id = Column("opensandboxId", String(128), nullable=True)
 
-    status = Column(String(24), nullable=False, default=SandboxJobStatus.ACCEPTED.value)
+    status = Column(
+        SAEnum(
+            SandboxJobStatus,
+            name="sandbox_job_status",
+            values_callable=_enum_values,
+            native_enum=True,
+            create_type=False,
+            validate_strings=True,
+        ),
+        nullable=False,
+        default=SandboxJobStatus.ACCEPTED.value,
+    )
     status_reason = Column("statusReason", Text, nullable=True)
 
     image_uri = Column("imageUri", String(512), nullable=True)
diff --git a/python-backend/tests/unit/test_agency_models.py b/python-backend/tests/unit/test_agency_models.py
new file mode 100644
index 0000000..0bbbb16
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_models.py
@@ -0,0 +1,136 @@
+"""Tests for agency SQLAlchemy models (agency_messages, agency_runs)."""
+
+import pytest
+from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
+from sqlalchemy.pool import StaticPool
+from app.core.database import Base
+from app.models.agency import AgencyMessage, AgencyRun, AgencyRunStatus
+
+
+@pytest.fixture(scope="function")
+async def agency_db():
+    """Create in-memory SQLite DB with only agency tables for testing.
+
+    We create only agency-specific tables (not all Base.metadata) because
+    other models use JSONB columns which SQLite doesn't support.
+    """
+    engine = create_async_engine(
+        "sqlite+aiosqlite:///:memory:",
+        poolclass=StaticPool,
+        connect_args={"check_same_thread": False},
+    )
+    async with engine.begin() as conn:
+        await conn.run_sync(
+            lambda sync_conn: Base.metadata.create_all(
+                sync_conn,
+                tables=[AgencyMessage.__table__, AgencyRun.__table__],
+            )
+        )
+    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
+    async with session_factory() as session:
+        yield session
+    await engine.dispose()
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestAgencyMessage:
+    """Tests for the agency_messages SQLAlchemy model."""
+
+    async def test_create_message_without_fk_constraint(self, agency_db):
+        """agency_messages has no DB FK to agency_conversations (Drizzle-owned table)."""
+        msg = AgencyMessage(
+            id=1,  # explicit ID: SQLite BIGINT doesn't auto-increment
+            conversation_id="conv-uuid-1234",
+            agent_name="Researcher",
+            role="assistant",
+            content="Hello from agent",
+        )
+        agency_db.add(msg)
+        await agency_db.commit()
+        await agency_db.refresh(msg)
+        assert msg.id is not None
+        assert msg.conversation_id == "conv-uuid-1234"
+
+    async def test_pii_redacted_defaults_to_false(self, agency_db):
+        """pii_redacted flag defaults to False."""
+        msg = AgencyMessage(
+            id=2,
+            conversation_id="conv-uuid-1234",
+            agent_name="Writer",
+            role="assistant",
+            content="Some content",
+        )
+        agency_db.add(msg)
+        await agency_db.commit()
+        await agency_db.refresh(msg)
+        assert msg.pii_redacted is False
+
+    async def test_all_role_values_accepted(self, agency_db):
+        """role column accepts user, assistant, system, tool."""
+        for i, role in enumerate(("user", "assistant", "system", "tool"), start=10):
+            msg = AgencyMessage(
+                id=i,
+                conversation_id="conv-uuid-1234",
+                agent_name="Agent",
+                role=role,
+                content=f"Message with role {role}",
+            )
+            agency_db.add(msg)
+        await agency_db.commit()
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestAgencyRun:
+    """Tests for the agency_runs SQLAlchemy model."""
+
+    async def test_create_run_with_all_status_values(self, agency_db):
+        """agency_runs accepts all defined status values."""
+        for status in AgencyRunStatus:
+            run = AgencyRun(
+                id=f"run-{status.value}",
+                conversation_id="conv-uuid-1234",
+                user_id=1,
+                agency_id="agency-uuid-1234",
+                tenant_id="tenant-uuid-1234",
+                status=status.value,
+            )
+            agency_db.add(run)
+        await agency_db.commit()
+
+    async def test_total_credits_calculation(self, agency_db):
+        """total_credits_used = gateway_cost + multiplier_markup."""
+        run = AgencyRun(
+            id="run-cost-test",
+            conversation_id="conv-uuid-1234",
+            user_id=1,
+            agency_id="agency-uuid-1234",
+            tenant_id="tenant-uuid-1234",
+            status="completed",
+            total_gateway_cost=10.0,
+            multiplier_markup=5.0,
+            total_credits_used=15.0,
+        )
+        agency_db.add(run)
+        await agency_db.commit()
+        await agency_db.refresh(run)
+        assert float(run.total_credits_used) == float(run.total_gateway_cost) + float(run.multiplier_markup)
+
+    async def test_to_dict_returns_expected_shape(self, agency_db):
+        """to_dict() returns a dict with all expected keys."""
+        run = AgencyRun(
+            id="run-dict-test",
+            conversation_id="conv-uuid-1234",
+            user_id=1,
+            agency_id="agency-uuid-1234",
+            tenant_id="tenant-uuid-1234",
+            status="queued",
+        )
+        agency_db.add(run)
+        await agency_db.commit()
+        d = run.to_dict()
+        assert "id" in d
+        assert "status" in d
+        assert "conversationId" in d
+        assert "agencyId" in d
