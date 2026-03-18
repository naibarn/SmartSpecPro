diff --git a/apps/web/server/services/featureFlags.ts b/apps/web/server/services/featureFlags.ts
index 89ba8abf..8c0fd325 100644
--- a/apps/web/server/services/featureFlags.ts
+++ b/apps/web/server/services/featureFlags.ts
@@ -87,3 +87,23 @@ export async function setTenantFeatureFlag(
     value ? "true" : "false",
   );
 }
+
+/**
+ * Read a raw string value from the Redis feature-flag namespace.
+ *
+ * Used for string-valued settings like `skillOrchestratorMaxLevel` that cannot
+ * be stored in the boolean-only TenantFeatureFlags interface.
+ *
+ * Returns null if the key is not set (caller should apply its own default).
+ */
+export async function getTenantFeatureFlagValue(
+  flagName: string,
+  tenantId: string,
+): Promise<string | null> {
+  try {
+    const redis = getRedisClient();
+    return await redis.get(`feature-flag:${flagName}:${tenantId}`);
+  } catch {
+    return null;
+  }
+}
diff --git a/apps/web/server/services/tenantFeatureFlagService.ts b/apps/web/server/services/tenantFeatureFlagService.ts
index 03a7c88b..c30086de 100644
--- a/apps/web/server/services/tenantFeatureFlagService.ts
+++ b/apps/web/server/services/tenantFeatureFlagService.ts
@@ -39,6 +39,7 @@ const REDIS_SYNCED_FLAGS: ReadonlySet<TenantFeatureFlagKey> = new Set([
   "workflowBrowserSessionNodes",
   "publicApi",
   "multimodalMemory",
+  "skillOrchestrator",
 ]);
 
 /**
diff --git a/apps/web/shared/featureFlags.ts b/apps/web/shared/featureFlags.ts
index d6712194..54ab3b45 100644
--- a/apps/web/shared/featureFlags.ts
+++ b/apps/web/shared/featureFlags.ts
@@ -25,6 +25,7 @@ export interface TenantFeatureFlags {
   workflowBrowserSessionNodes: boolean; // F18 — Workflow collaborative Browser Session nodes
   publicApi: boolean; // F19 — Public API & External Agent Gateway
   multimodalMemory: boolean; // F20 — Multimodal chat memory (image analysis, embedding, retrieval)
+  skillOrchestrator: boolean; // F21 — Hybrid Skill Orchestrator (multi-skill routing)
 }
 
 export type TenantFeatureFlagKey = keyof TenantFeatureFlags;
@@ -54,6 +55,7 @@ export const ALLOWED_FEATURE_FLAGS: ReadonlySet<string> = new Set<TenantFeatureF
   "workflowBrowserSessionNodes",
   "publicApi",
   "multimodalMemory",
+  "skillOrchestrator",
 ]);
 
 /**
@@ -82,4 +84,5 @@ export const FEATURE_FLAG_DEFAULTS: Readonly<TenantFeatureFlags> = {
   workflowBrowserSessionNodes: false,
   publicApi: false,
   multimodalMemory: false,
+  skillOrchestrator: false,
 };
diff --git a/apps/web/shared/orchestration/constants.ts b/apps/web/shared/orchestration/constants.ts
new file mode 100644
index 00000000..ab09a9c2
--- /dev/null
+++ b/apps/web/shared/orchestration/constants.ts
@@ -0,0 +1,42 @@
+/**
+ * Configuration constants for the Hybrid Skill Orchestrator (Feature 045).
+ */
+
+/** Max time to wait for classifier LLM response (ms) */
+export const CLASSIFIER_TIMEOUT_MS = 3000;
+
+/** Error rate threshold (0-1) that triggers the circuit breaker */
+export const CLASSIFIER_CIRCUIT_BREAKER_THRESHOLD = 0.2;
+
+/** How long the circuit breaker stays open after tripping (ms) — 5 minutes */
+export const CLASSIFIER_CIRCUIT_BREAKER_COOLDOWN_MS = 300_000;
+
+/** Sliding window size for circuit breaker error tracking */
+export const CLASSIFIER_CIRCUIT_BREAKER_WINDOW = 100;
+
+/** Maximum iterations for the COMPLEX agent loop */
+export const AGENT_MAX_ITERATIONS = 5;
+
+/** Maximum wall-clock time for the agent loop (ms) — 30 seconds */
+export const AGENT_MAX_DURATION_MS = 30_000;
+
+/** Confidence threshold: auto-route without confirmation */
+export const CONFIDENCE_AUTO_ROUTE = 0.85;
+
+/** Confidence threshold: show soft confirmation form */
+export const CONFIDENCE_SOFT_CONFIRM = 0.70;
+
+/** Confidence threshold: below this, treat as no match */
+export const CONFIDENCE_ASK_USER = 0.50;
+
+/** Max fields in a skill schema before requiring a separate extraction LLM call */
+export const COMBINED_EXTRACTION_MAX_FIELDS = 10;
+
+/** Timeout for polling async skill completion in pipelines (ms) — 60 seconds */
+export const ASYNC_SKILL_POLL_TIMEOUT_MS = 60_000;
+
+/** Max level setting type for tenant configuration */
+export type SkillOrchestratorMaxLevel = "disabled" | "simple" | "compound" | "complex";
+
+/** Default max level for new tenants — simple only until admin elevates */
+export const ORCHESTRATOR_MAX_LEVEL_DEFAULT: SkillOrchestratorMaxLevel = "simple";
diff --git a/apps/web/shared/orchestration/types.ts b/apps/web/shared/orchestration/types.ts
new file mode 100644
index 00000000..4faa93da
--- /dev/null
+++ b/apps/web/shared/orchestration/types.ts
@@ -0,0 +1,126 @@
+/**
+ * Shared types for the Hybrid Skill Orchestrator (Feature 045).
+ *
+ * These types are used across classifier, extractor, pipeline engine,
+ * agent loop, result merger, and frontend components.
+ */
+
+/** How complex the user's request is */
+export type OrchestrationLevel = "simple" | "compound" | "complex";
+
+/** How multiple skills should be executed */
+export type OrchestrationStrategy = "single" | "parallel" | "sequential" | "agent";
+
+/** Per-step error handling in COMPOUND pipelines */
+export type ErrorStrategy = "fail-fast" | "continue" | "retry";
+
+/** One skill matched by the intent classifier */
+export interface ClassifiedSkill {
+  skillId: string;
+  confidence: number;
+  reason: string;
+  extractedParams: Record<string, unknown>;
+  missingRequiredParams: string[];
+}
+
+/** Output of the intent classifier (Section 3) */
+export interface ClassificationResult {
+  level: OrchestrationLevel;
+  skills: ClassifiedSkill[];
+  strategy: OrchestrationStrategy;
+  reasoning: string;
+}
+
+/** One step in a COMPOUND pipeline (Section 6) */
+export interface PipelineStep {
+  id: string;
+  skillId: string;
+  params: Record<string, unknown>;
+  dependsOn: string[];
+  inputMapping: Record<string, string>;
+  errorStrategy: ErrorStrategy;
+}
+
+/** One action chosen by the LLM in the COMPLEX agent loop (Section 7) */
+export interface AgentAction {
+  type: "execute_skill" | "execute_parallel" | "quality_check" | "revise_plan" | "done";
+  skillId?: string;
+  skills?: Array<{ skillId: string; params: Record<string, unknown> }>;
+  params?: Record<string, unknown>;
+  reasoning: string;
+}
+
+/** One section within a multi-skill orchestration result */
+export interface OrchestrationResultSection {
+  skillId: string;
+  type: "text" | "image" | "video" | "audio" | "error";
+  content?: string;
+  urls?: string[];
+  metadata: { creditsUsed: number; durationMs: number };
+}
+
+/** UI-safe projection of a skill's input schema field */
+export interface OrchestrationFieldProjection {
+  name: string;
+  label: string;
+  type: "text" | "number" | "select" | "boolean";
+  options?: string[];
+  required: boolean;
+  default?: unknown;
+}
+
+/** Data sent to frontend when parameter confirmation is needed */
+export interface OrchestrationConfirmationData {
+  skillId: string;
+  prefilledParams: Record<string, unknown>;
+  missingFields: string[];
+  schema: OrchestrationFieldProjection[];
+}
+
+/** Structured error codes for orchestration failures */
+export type OrchestrationErrorCode =
+  | "insufficient_credits"
+  | "classifier_timeout"
+  | "skill_not_found"
+  | "pipeline_failed"
+  | "agent_budget_exceeded"
+  | "agent_timeout"
+  | "partial_failure";
+
+/** Unified result returned by the orchestrator */
+export interface OrchestrationResult {
+  sections: OrchestrationResultSection[];
+  summary?: string;
+  totalCreditsUsed: number;
+  totalDurationMs: number;
+  traceId: string;
+  orchestrationLevel: OrchestrationLevel;
+  classificationLatencyMs: number;
+  needsConfirmation?: boolean;
+  confirmationData?: OrchestrationConfirmationData;
+  error?: {
+    code: OrchestrationErrorCode;
+    message: string;
+    affectedSkills?: string[];
+  };
+}
+
+/** Output of the parameter extractor (Section 4) */
+export interface ParamExtractionResult {
+  params: Record<string, unknown>;
+  missingRequired: string[];
+  confidence: number;
+  needsConfirmation: boolean;
+}
+
+/** Options passed to the main orchestrateSkill() entry point */
+export interface OrchestrateOptions {
+  userId: number;
+  tenantId: string;
+  conversationId?: number;
+  skillSettings?: unknown;
+  userToken: string;
+  budget?: number;
+  maxLevel?: OrchestrationLevel;
+  fallbackToRegex?: boolean;
+}
