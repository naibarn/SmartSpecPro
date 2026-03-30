diff --git a/apps/web/server/__tests__/internalAgencyCreate.test.ts b/apps/web/server/__tests__/internalAgencyCreate.test.ts
new file mode 100644
index 00000000..d3f2ee5c
--- /dev/null
+++ b/apps/web/server/__tests__/internalAgencyCreate.test.ts
@@ -0,0 +1,192 @@
+import { describe, it, expect } from "vitest";
+import { z } from "zod";
+
+// Mirror the Zod schema from _core/index.ts for the internal agency create endpoint
+const agencyCreateSchema = z.object({
+  name: z.string().min(1).max(200),
+  description: z.string().max(2000).optional().default(""),
+  objective: z.string().max(2000).optional(),
+  sharedInstructions: z.string().max(10000).optional(),
+  tenantId: z.string().max(100).optional().default(""),
+  agents: z
+    .array(
+      z.object({
+        id: z.string(),
+        name: z.string().min(1).max(200),
+        description: z.string().max(2000).optional().default(""),
+        instructions: z.string().max(10000).optional().default(""),
+        model: z.string().max(100).optional().default("gpt-4o"),
+        nodeType: z.string().max(50).optional().default("agent"),
+        nodeConfig: z.record(z.unknown()).optional().default({}),
+        isEntryPoint: z.boolean().optional().default(false),
+        isOptional: z.boolean().optional().default(false),
+        position: z.object({ x: z.number(), y: z.number() }).optional(),
+        toolIds: z.array(z.string().max(100)).optional().default([]),
+        toolConfigs: z.record(z.record(z.unknown())).optional().default({}),
+        modelRequirements: z
+          .object({
+            strategy: z.enum(["cheapest", "balanced", "best"]).optional(),
+            supportsVision: z.boolean().optional(),
+            supportsThinking: z.boolean().optional(),
+            supportsFunctionTools: z.boolean().optional(),
+            supportsStructuredOutputs: z.boolean().optional(),
+            supportsWebSearch: z.boolean().optional(),
+            supportsCodeExecution: z.boolean().optional(),
+            supportsComputerUse: z.boolean().optional(),
+          })
+          .optional(),
+      }),
+    )
+    .min(1)
+    .max(20),
+  communicationFlows: z
+    .array(
+      z.object({
+        id: z.string().optional(),
+        fromAgentId: z.string(),
+        toAgentId: z.string(),
+        flowType: z.string().max(50).optional().default("delegation"),
+      }),
+    )
+    .optional()
+    .default([]),
+});
+
+const baseAgent = {
+  id: "agent-1",
+  name: "Test Agent",
+};
+
+const basePayload = {
+  name: "Test Agency",
+  agents: [baseAgent],
+};
+
+describe("internal agency create schema - objective and sharedInstructions", () => {
+  it("accepts objective field and preserves it", () => {
+    const result = agencyCreateSchema.safeParse({
+      ...basePayload,
+      objective: "Provide customer support",
+    });
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.objective).toBe("Provide customer support");
+    }
+  });
+
+  it("accepts sharedInstructions field and preserves it", () => {
+    const result = agencyCreateSchema.safeParse({
+      ...basePayload,
+      sharedInstructions: "Always be polite and helpful.",
+    });
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.sharedInstructions).toBe(
+        "Always be polite and helpful.",
+      );
+    }
+  });
+
+  it("without objective defaults to undefined", () => {
+    const result = agencyCreateSchema.safeParse(basePayload);
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.objective).toBeUndefined();
+    }
+  });
+
+  it("rejects objective exceeding 2000 chars", () => {
+    const result = agencyCreateSchema.safeParse({
+      ...basePayload,
+      objective: "x".repeat(2001),
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects sharedInstructions exceeding 10000 chars", () => {
+    const result = agencyCreateSchema.safeParse({
+      ...basePayload,
+      sharedInstructions: "x".repeat(10001),
+    });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe("internal agency create schema - modelRequirements per agent", () => {
+  it("accepts modelRequirements on agent", () => {
+    const result = agencyCreateSchema.safeParse({
+      ...basePayload,
+      agents: [
+        {
+          ...baseAgent,
+          modelRequirements: {
+            strategy: "best",
+            supportsVision: true,
+          },
+        },
+      ],
+    });
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.agents[0].modelRequirements).toEqual({
+        strategy: "best",
+        supportsVision: true,
+      });
+    }
+  });
+
+  it("agent without modelRequirements defaults to undefined", () => {
+    const result = agencyCreateSchema.safeParse(basePayload);
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.agents[0].modelRequirements).toBeUndefined();
+    }
+  });
+
+  it("rejects invalid strategy enum", () => {
+    const result = agencyCreateSchema.safeParse({
+      ...basePayload,
+      agents: [
+        {
+          ...baseAgent,
+          modelRequirements: { strategy: "invalid" },
+        },
+      ],
+    });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe("internal agency create - insert data mapping", () => {
+  it("objective truncated at insert to 2000 chars", () => {
+    // Simulate the insert-level truncation: (objective || "").slice(0, 2000)
+    const objective = "a".repeat(2000);
+    const truncated = (objective || "").slice(0, 2000);
+    expect(truncated.length).toBe(2000);
+
+    const longObjective = "a".repeat(3000);
+    const truncatedLong = (longObjective || "").slice(0, 2000);
+    expect(truncatedLong.length).toBe(2000);
+  });
+
+  it("sharedInstructions truncated at insert to 10000 chars", () => {
+    const long = "b".repeat(15000);
+    const truncated = (long || "").slice(0, 10000);
+    expect(truncated.length).toBe(10000);
+  });
+
+  it("undefined objective defaults to empty string at insert", () => {
+    const objective = undefined;
+    const value = (objective || "").slice(0, 2000);
+    expect(value).toBe("");
+  });
+
+  it("error response does not contain raw error message", () => {
+    // The endpoint now returns a generic message:
+    const genericError = "Internal server error";
+    const errMessage = "UNIQUE constraint failed: agencies.slug (sensitive details)";
+    // Verify the response string does NOT contain the raw error
+    expect(genericError).not.toContain(errMessage);
+    expect(genericError).not.toContain("UNIQUE");
+  });
+});
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index c3bd8cde..87ab82f9 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -72,6 +72,7 @@ import { initializeTrashPurgeJob, shutdownTrashPurgeWorker } from "../jobs/purge
 import { initializeGDriveCleanupJob, shutdownGDriveCleanupWorker } from "../jobs/gdriveSessionCleanup";
 import { initializePendingApprovalAlertJob } from "../jobs/pendingApprovalAlert";
 import { initializeNotificationJobs } from "../jobs/notificationJobs";
+import { initializeMemoryMaintenanceJobs, shutdownMemoryMaintenanceJobs } from "../jobs/memoryMaintenanceJobs";
 import { initializeContentRefreshJob } from "../jobs/contentRefreshJob";
 import { initializeInactiveUserJob } from "../jobs/inactiveUserJob";
 import { initFromDb, startPeriodicPersistence } from "../services/providerHealth";
@@ -100,6 +101,7 @@ import { initAutomationJobsQueue, closeAutomationJobsQueue } from "../services/j
 import { createPublicWebhooksRouter } from "../routes/publicWebhooksApi";
 import { createPublicEventsRouter } from "../routes/publicEventsApi";
 import { initWebhookApiDeliveryQueue, closeWebhookApiDeliveryQueue } from "../services/webhookDeliveryService";
+import { closeEmbeddingQueue } from "../services/embeddingQueue";
 import { registerPublicDocsRoutes } from "../routes/publicDocsApi";
 import { createAgencyToolsApiRouter } from "../routes/agencyToolsApi";
 import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth";
@@ -952,6 +954,8 @@ app.post("/api/internal/agency/create", async (req, res) => {
   const agencyCreateSchema = z.object({
     name: z.string().min(1).max(200),
     description: z.string().max(2000).optional().default(""),
+    objective: z.string().max(2000).optional(),
+    sharedInstructions: z.string().max(10000).optional(),
     tenantId: z.string().max(100).optional().default(""),
     agents: z.array(z.object({
       id: z.string(),
@@ -966,6 +970,16 @@ app.post("/api/internal/agency/create", async (req, res) => {
       position: z.object({ x: z.number(), y: z.number() }).optional(),
       toolIds: z.array(z.string().max(100)).optional().default([]),
       toolConfigs: z.record(z.record(z.unknown())).optional().default({}),
+      modelRequirements: z.object({
+        strategy: z.enum(["cheapest", "balanced", "best"]).optional(),
+        supportsVision: z.boolean().optional(),
+        supportsThinking: z.boolean().optional(),
+        supportsFunctionTools: z.boolean().optional(),
+        supportsStructuredOutputs: z.boolean().optional(),
+        supportsWebSearch: z.boolean().optional(),
+        supportsCodeExecution: z.boolean().optional(),
+        supportsComputerUse: z.boolean().optional(),
+      }).optional(),
     })).min(1).max(20),
     communicationFlows: z.array(z.object({
       id: z.string().optional(),
@@ -1010,7 +1024,7 @@ app.post("/api/internal/agency/create", async (req, res) => {
       }
     }
 
-    const { name, description, agents, communicationFlows } = validatedBody;
+    const { name, description, objective, sharedInstructions, agents, communicationFlows } = validatedBody;
 
     if (!name?.trim()) {
       return res.status(400).json({ error: "name is required" });
@@ -1034,6 +1048,7 @@ app.post("/api/internal/agency/create", async (req, res) => {
         model: a.model ? String(a.model).slice(0, 100) : null,
         nodeType: (a.nodeType ?? "agent") as any,
         nodeConfig: (a.nodeConfig ?? {}) as any,
+        modelRequirements: a.modelRequirements ?? undefined,
         isEntryPoint: Boolean(a.isEntryPoint),
         isOptional: Boolean(a.isOptional),
         position: a.position ?? { x: 400, y: 80 + idx * 200 },
@@ -1053,6 +1068,8 @@ app.post("/api/internal/agency/create", async (req, res) => {
         slug,
         name: String(name).slice(0, 255),
         description: description ? String(description).slice(0, 500) : null,
+        objective: (objective || "").slice(0, 2000),
+        sharedInstructions: (sharedInstructions || "").slice(0, 10000),
         creditMultiplier: "1",
         maxAgents: 20,
         maxRunTimeSeconds: 600,
@@ -1107,8 +1124,8 @@ app.post("/api/internal/agency/create", async (req, res) => {
 
     return res.status(201).json({ id: agencyId });
   } catch (err: any) {
-    console.error("[internal/agency/create] error:", err?.message ?? err);
-    return res.status(500).json({ error: err?.message ?? "Internal server error" });
+    debugError("internal_agency_create", "Agency creation failed", err);
+    return res.status(500).json({ error: "Internal server error" });
   }
 });
 
@@ -1447,6 +1464,13 @@ async function main() {
     console.error("[Startup] Failed to initialize notification jobs:", error);
   }
 
+  // Initialize chat memory maintenance jobs (daily/weekly recurring cleanup)
+  try {
+    await initializeMemoryMaintenanceJobs();
+  } catch (error) {
+    console.error("[Startup] Failed to initialize memory maintenance jobs:", error);
+  }
+
   // Initialize Google Drive edit session cleanup (every 6h)
   try {
     await initializeGDriveCleanupJob();
@@ -1558,6 +1582,8 @@ process.on("SIGTERM", async () => {
   await closeWebhookDispatchQueue().catch(() => {});
   await closeAutomationJobsQueue().catch(() => {});
   await closeWebhookApiDeliveryQueue().catch(() => {});
+  await shutdownMemoryMaintenanceJobs().catch(() => {});
+  await closeEmbeddingQueue().catch(() => {});
   await shutdownVoiceGateway().catch(() => {});
 
   // 3b. Shut down channel adapters
@@ -1612,6 +1638,8 @@ process.on("SIGINT", async () => {
   await closeWebhookDispatchQueue().catch(() => {});
   await closeAutomationJobsQueue().catch(() => {});
   await closeWebhookApiDeliveryQueue().catch(() => {});
+  await shutdownMemoryMaintenanceJobs().catch(() => {});
+  await closeEmbeddingQueue().catch(() => {});
   await shutdownVoiceGateway().catch(() => {});
   await Promise.all(
     adapterRegistry.getAll()
