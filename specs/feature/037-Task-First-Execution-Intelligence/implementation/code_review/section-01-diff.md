diff --git a/apps/web/server/routers/chat.ts b/apps/web/server/routers/chat.ts
index 6b5cd3d..b1bdeab 100644
--- a/apps/web/server/routers/chat.ts
+++ b/apps/web/server/routers/chat.ts
@@ -48,7 +48,7 @@ import { eq, and, like } from "drizzle-orm";
 import { checkRateLimit } from "../middleware/distributedRateLimit";
 import { auditLogger } from "../services/auditLogger";
 import { checkAbuseGuard, hashPrompt } from "../services/abuseGuard";
-import { resolveEnabledLlmModelId } from "../services/enabledLlmModels";
+import { resolveSkillExecutionPolicy } from "../services/skillExecutionPolicy";
 
 // ── Security: forbidden patterns in LLM-generated skillContent ───────────────
 const ISC_FORBIDDEN_PATTERNS = [
@@ -1426,18 +1426,19 @@ export const chatRouter = router({
           llmMessages.push({ role: "user", content: userPrompt || `Use ${skill.name}` });
         }
 
-        // Determine model: conversation model > skill-configured model > enabled default
+        // Determine model: skill policy first, conversation model as fallback
         let conversationModel: string | null | undefined;
-        // 1. Use skill's llmModelId or defaultModel if configured
-        const skillModelId = (skill as any).llmModelId || (skill as any).defaultModel;
-        // 2. Override with conversation model if available (user's active choice)
         if (input.conversationId) {
           const conversation = await getConversationById(input.conversationId, ctx.user.id);
           if (conversation?.model) {
             conversationModel = conversation.model;
           }
         }
-        const llmModel = await resolveEnabledLlmModelId([conversationModel, skillModelId]);
+        const executionPolicy = await resolveSkillExecutionPolicy({
+          skill,
+          conversationModel,
+        });
+        const llmModel = executionPolicy.modelId;
         if (!llmModel) {
           return {
             success: false,
@@ -1464,7 +1465,7 @@ export const chatRouter = router({
           };
         }
 
-        debugLog("Chat", `[executeSkill] LLM skill '${input.skillId}' mode='${executionMode}', model=${llmModel}, providerModel=${provider.providerModelId}, provider=${provider.providerName}, refImages=${refImageUrls.length}`);
+        debugLog("Chat", `[executeSkill] LLM skill '${input.skillId}' mode='${executionMode}', model=${llmModel}, modelSource=${executionPolicy.modelSource}, providerModel=${provider.providerModelId}, provider=${provider.providerName}, refImages=${refImageUrls.length}`);
 
         try {
           // Call provider API directly (same approach as proxyChatWithCredits)
diff --git a/apps/web/server/services/skillExecutionPolicy.test.ts b/apps/web/server/services/skillExecutionPolicy.test.ts
new file mode 100644
index 0000000..4e3e887
--- /dev/null
+++ b/apps/web/server/services/skillExecutionPolicy.test.ts
@@ -0,0 +1,157 @@
+import { describe, expect, it, vi, beforeEach } from "vitest";
+
+import type { SkillDefinition } from "@smartspec/skills";
+import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
+
+// Mock resolveEnabledLlmModelId to avoid DB dependency
+vi.mock("./enabledLlmModels", () => ({
+  resolveEnabledLlmModelId: vi.fn(),
+}));
+
+import { resolveEnabledLlmModelId } from "./enabledLlmModels";
+const mockResolve = vi.mocked(resolveEnabledLlmModelId);
+
+function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
+  return {
+    id: "test-skill",
+    name: "Test Skill",
+    description: "A test skill",
+    icon: "sparkles",
+    type: "chat-assistant",
+    triggers: [],
+    requiresExplicit: false,
+    creditMultiplier: 1,
+    enabledByDefault: true,
+    priority: 50,
+    ...overrides,
+  };
+}
+
+describe("resolveSkillExecutionPolicy", () => {
+  beforeEach(() => {
+    mockResolve.mockReset();
+  });
+
+  it("uses skill llmModelId first when available and enabled", async () => {
+    mockResolve.mockImplementation(async (ids) => {
+      const first = (ids ?? [])[0];
+      if (first === "skill-model") return "skill-model";
+      if (first === "conv-model") return "conv-model";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({ llmModelId: "skill-model" }),
+      conversationModel: "conv-model",
+    });
+
+    expect(result.modelId).toBe("skill-model");
+    expect(result.modelSource).toBe("skill_llmModelId");
+  });
+
+  it("falls back to skill defaultModel when llmModelId is not set", async () => {
+    mockResolve.mockImplementation(async (ids) => {
+      const first = (ids ?? [])[0];
+      if (first === "default-model") return "default-model";
+      if (first === "conv-model") return "conv-model";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({ defaultModel: "default-model" }),
+      conversationModel: "conv-model",
+    });
+
+    expect(result.modelId).toBe("default-model");
+    expect(result.modelSource).toBe("skill_defaultModel");
+  });
+
+  it("falls back to conversation model when skill has no model configured", async () => {
+    mockResolve.mockImplementation(async (ids) => {
+      const first = (ids ?? [])[0];
+      if (first === "conv-model") return "conv-model";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill(),
+      conversationModel: "conv-model",
+    });
+
+    expect(result.modelId).toBe("conv-model");
+    expect(result.modelSource).toBe("conversation");
+  });
+
+  it("falls back to system default when nothing else matches", async () => {
+    mockResolve.mockImplementation(async (ids) => {
+      if ((ids ?? []).length === 0 || !(ids ?? [])[0]) return "system-default";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill(),
+      conversationModel: null,
+    });
+
+    expect(result.modelId).toBe("system-default");
+    expect(result.modelSource).toBe("system_default");
+  });
+
+  it("does NOT let conversation model override skill llmModelId", async () => {
+    // This is the key behavioral test: skill policy > conversation model
+    mockResolve.mockImplementation(async (ids) => {
+      const first = (ids ?? [])[0];
+      if (first === "skill-model") return "skill-model";
+      if (first === "conv-model") return "conv-model";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({ llmModelId: "skill-model" }),
+      conversationModel: "conv-model",
+    });
+
+    // skill-model should win, not conv-model
+    expect(result.modelId).toBe("skill-model");
+    expect(result.modelSource).toBe("skill_llmModelId");
+  });
+
+  it("propagates preferredProviderId from skill", async () => {
+    mockResolve.mockResolvedValue("any-model");
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({ preferredProviderId: 42 }),
+    });
+
+    expect(result.preferredProviderId).toBe(42);
+  });
+
+  it("propagates strictProviderPin from skill", async () => {
+    mockResolve.mockResolvedValue("any-model");
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({ strictProviderPin: true, preferredProviderId: 5 }),
+    });
+
+    expect(result.strictProviderPin).toBe(true);
+    expect(result.preferredProviderId).toBe(5);
+  });
+
+  it("skips disabled skill model and falls back to conversation", async () => {
+    // skill has llmModelId but it's disabled (resolves to null)
+    mockResolve.mockImplementation(async (ids) => {
+      const first = (ids ?? [])[0];
+      if (first === "disabled-skill-model") return null;
+      if (first === "conv-model") return "conv-model";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({ llmModelId: "disabled-skill-model" }),
+      conversationModel: "conv-model",
+    });
+
+    expect(result.modelId).toBe("conv-model");
+    expect(result.modelSource).toBe("conversation");
+  });
+});
diff --git a/apps/web/server/services/skillExecutionPolicy.ts b/apps/web/server/services/skillExecutionPolicy.ts
new file mode 100644
index 0000000..4282c1d
--- /dev/null
+++ b/apps/web/server/services/skillExecutionPolicy.ts
@@ -0,0 +1,84 @@
+/**
+ * Skill Execution Policy Resolution
+ *
+ * Resolves the effective model and provider routing for skill invocations.
+ * Skill policy takes priority over conversation model — the conversation model
+ * is only used as a fallback when the skill has no configured model.
+ *
+ * This is the compatibility bridge between legacy skill fields (defaultModel,
+ * llmModelId, preferredProviderId) and future capability-first execution policy.
+ */
+
+import type { SkillDefinition } from "@smartspec/skills";
+import { resolveEnabledLlmModelId } from "./enabledLlmModels";
+
+export interface SkillExecutionPolicyInput {
+  /** The skill being invoked */
+  skill: SkillDefinition;
+  /** The conversation's currently selected model (user's active choice) */
+  conversationModel?: string | null;
+}
+
+export interface SkillExecutionPolicyResult {
+  /** The resolved LLM model ID to use */
+  modelId: string | null;
+  /** Optional pinned provider ID from skill configuration */
+  preferredProviderId?: number;
+  /** Whether to enforce the pinned provider with no fallback */
+  strictProviderPin?: boolean;
+  /** Source of the resolved model for auditing */
+  modelSource: "skill_llmModelId" | "skill_defaultModel" | "conversation" | "system_default";
+}
+
+/**
+ * Resolve the effective execution policy for a skill invocation.
+ *
+ * Priority order:
+ *   1. skill.llmModelId (explicit skill model configuration)
+ *   2. skill.defaultModel (skill-level default)
+ *   3. conversationModel (user's active conversation choice — fallback only)
+ *   4. system default (from enabled models)
+ *
+ * Provider pin fields (preferredProviderId, strictProviderPin) are always
+ * propagated from the skill definition when present.
+ */
+export async function resolveSkillExecutionPolicy(
+  input: SkillExecutionPolicyInput,
+): Promise<SkillExecutionPolicyResult> {
+  const { skill, conversationModel } = input;
+
+  const skillLlmModelId = skill.llmModelId || undefined;
+  const skillDefaultModel = skill.defaultModel || undefined;
+
+  // Try each candidate in priority order to determine both modelId and source
+  const candidates: Array<{
+    id: string | undefined;
+    source: SkillExecutionPolicyResult["modelSource"];
+  }> = [
+    { id: skillLlmModelId, source: "skill_llmModelId" },
+    { id: skillDefaultModel, source: "skill_defaultModel" },
+    { id: conversationModel ?? undefined, source: "conversation" },
+  ];
+
+  for (const candidate of candidates) {
+    if (!candidate.id) continue;
+    const resolved = await resolveEnabledLlmModelId([candidate.id]);
+    if (resolved) {
+      return {
+        modelId: resolved,
+        preferredProviderId: skill.preferredProviderId,
+        strictProviderPin: skill.strictProviderPin,
+        modelSource: candidate.source,
+      };
+    }
+  }
+
+  // Fall back to system default (no preferred model)
+  const systemDefault = await resolveEnabledLlmModelId([]);
+  return {
+    modelId: systemDefault,
+    preferredProviderId: skill.preferredProviderId,
+    strictProviderPin: skill.strictProviderPin,
+    modelSource: "system_default",
+  };
+}
