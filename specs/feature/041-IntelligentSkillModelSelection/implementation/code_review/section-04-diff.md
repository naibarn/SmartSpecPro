diff --git a/apps/web/server/services/skillExecutionPolicy.test.ts b/apps/web/server/services/skillExecutionPolicy.test.ts
index 90d9d107..acb052c1 100644
--- a/apps/web/server/services/skillExecutionPolicy.test.ts
+++ b/apps/web/server/services/skillExecutionPolicy.test.ts
@@ -9,13 +9,21 @@ vi.mock("./enabledLlmModels", () => ({
   resolveEnabledLlmModelIdFromRows: vi.fn(),
 }));
 
+vi.mock("./intelligentModelSelector", () => ({
+  selectBestLlmModel: vi.fn(),
+  describeRequirementsMatch: vi.fn(),
+}));
+
 import {
   loadEnabledLlmModelRows,
   resolveEnabledLlmModelIdFromRows,
 } from "./enabledLlmModels";
+import { selectBestLlmModel, describeRequirementsMatch } from "./intelligentModelSelector";
 
 const mockLoadRows = vi.mocked(loadEnabledLlmModelRows);
 const mockResolveFromRows = vi.mocked(resolveEnabledLlmModelIdFromRows);
+const mockSelectBestLlmModel = vi.mocked(selectBestLlmModel);
+const mockDescribeRequirementsMatch = vi.mocked(describeRequirementsMatch);
 
 function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
   return {
@@ -33,13 +41,18 @@ function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
   };
 }
 
-const fakeRows: any[] = [{ providerName: "openai", modelId: "gpt-4o", providerModelId: "gpt-4o", defaultModel: "gpt-4o" }];
+const fakeRows: any[] = [
+  { providerName: "openai", modelId: "gpt-4o", providerModelId: "gpt-4o", defaultModel: "gpt-4o" },
+];
 
 describe("resolveSkillExecutionPolicy", () => {
   beforeEach(() => {
     mockLoadRows.mockReset();
     mockResolveFromRows.mockReset();
+    mockSelectBestLlmModel.mockReset();
+    mockDescribeRequirementsMatch.mockReset();
     mockLoadRows.mockResolvedValue(fakeRows);
+    mockDescribeRequirementsMatch.mockReturnValue({ matched: [], missing: [] });
   });
 
   it("uses skill llmModelId first when available and enabled", async () => {
@@ -173,3 +186,334 @@ describe("resolveSkillExecutionPolicy", () => {
     expect(mockLoadRows).toHaveBeenCalledTimes(1);
   });
 });
+
+// ─── Section 04: Requirements mode tests ───
+
+describe("resolveSkillExecutionPolicy — requirements mode", () => {
+  beforeEach(() => {
+    mockLoadRows.mockReset();
+    mockResolveFromRows.mockReset();
+    mockSelectBestLlmModel.mockReset();
+    mockDescribeRequirementsMatch.mockReset();
+    mockLoadRows.mockResolvedValue(fakeRows);
+    mockDescribeRequirementsMatch.mockReturnValue({ matched: ["supportsFunctionTools"], missing: [] });
+  });
+
+  it("uses requirements when skill.executionPolicy.requirements is set", async () => {
+    mockSelectBestLlmModel.mockReturnValue("claude-3-sonnet");
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(result.modelId).toBe("claude-3-sonnet");
+    expect(result.modelSource).toBe("requirements_match");
+  });
+
+  it("passes all enabled rows to selectBestLlmModel", async () => {
+    mockSelectBestLlmModel.mockReturnValue("claude-3-sonnet");
+
+    await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(mockSelectBestLlmModel).toHaveBeenCalledWith(
+      { supportsFunctionTools: true },
+      fakeRows,
+    );
+  });
+
+  it("falls back to llmModelId when requirements find no match", async () => {
+    mockSelectBestLlmModel.mockReturnValue(null);
+    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
+      if ((preferredModelIds ?? []).includes("gpt-4o")) return "gpt-4o";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        llmModelId: "gpt-4o",
+        executionPolicy: {
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(result.modelId).toBe("gpt-4o");
+    expect(result.modelSource).toBe("skill_llmModelId");
+    expect(result.requirementsFallback).toBe(true);
+  });
+
+  it("falls back to system default when requirements fail and no llmModelId", async () => {
+    mockSelectBestLlmModel.mockReturnValue(null);
+    mockResolveFromRows.mockReturnValue("system-default");
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(result.modelSource).toBe("system_default");
+    expect(result.requirementsFallback).toBe(true);
+  });
+
+  it("sets requirementsFallback=true when fallback was used", async () => {
+    mockSelectBestLlmModel.mockReturnValue(null);
+    mockResolveFromRows.mockReturnValue("fallback-model");
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(result.requirementsFallback).toBe(true);
+  });
+
+  it("sets requirementsFallback=false when requirements matched", async () => {
+    mockSelectBestLlmModel.mockReturnValue("matched-model");
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(result.requirementsFallback).toBe(false);
+  });
+
+  it("sets matchedCapabilities in result when requirements matched", async () => {
+    mockSelectBestLlmModel.mockReturnValue("matched-model");
+    const matchedRow = { modelId: "matched-model" };
+    mockLoadRows.mockResolvedValue([matchedRow] as any);
+    mockDescribeRequirementsMatch.mockReturnValue({
+      matched: ["supportsVision", "supportsFunctionTools"],
+      missing: [],
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          requirements: { supportsVision: true, supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(result.matchedCapabilities).toContain("supportsVision");
+    expect(result.matchedCapabilities).toContain("supportsFunctionTools");
+  });
+
+  it("hybrid mode: tries fixedModel first when fixedModel is enabled", async () => {
+    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
+      if ((preferredModelIds ?? []).includes("claude-3-opus")) return "claude-3-opus";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          mode: "hybrid",
+          fixedModel: "claude-3-opus",
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(result.modelId).toBe("claude-3-opus");
+    expect(result.modelSource).toBe("skill_fixedModel");
+    expect(mockSelectBestLlmModel).not.toHaveBeenCalled();
+  });
+
+  it("hybrid mode: falls through to requirements when fixedModel not enabled", async () => {
+    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
+      if ((preferredModelIds ?? []).includes("disabled-model")) return null;
+      return null;
+    });
+    mockSelectBestLlmModel.mockReturnValue("claude-3-sonnet");
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          mode: "hybrid",
+          fixedModel: "disabled-model",
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(result.modelSource).toBe("requirements_match");
+  });
+
+  it("fixed mode: skips requirements and uses existing cascade", async () => {
+    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
+      if ((preferredModelIds ?? []).includes("gpt-4-turbo")) return "gpt-4-turbo";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        llmModelId: "gpt-4-turbo",
+        executionPolicy: {
+          mode: "fixed",
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(mockSelectBestLlmModel).not.toHaveBeenCalled();
+    expect(result.modelId).toBe("gpt-4-turbo");
+    expect(result.modelSource).toBe("skill_llmModelId");
+  });
+
+  it("allowConversationOverride=false: conversationModel ignored when requirements fail", async () => {
+    mockSelectBestLlmModel.mockReturnValue(null);
+    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
+      // conv-model should NOT be in the array
+      if ((preferredModelIds ?? []).includes("conv-model")) return "conv-model";
+      return "system-default";
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          requirements: { supportsFunctionTools: true },
+          allowConversationOverride: false,
+        },
+      }),
+      conversationModel: "conv-model",
+    });
+
+    // Should NOT be conv-model since allowConversationOverride is false
+    expect(result.modelId).toBe("system-default");
+    expect(result.modelSource).toBe("system_default");
+  });
+
+  it("allowConversationOverride=true: conversationModel eligible when requirements fail", async () => {
+    mockSelectBestLlmModel.mockReturnValue(null);
+    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
+      if ((preferredModelIds ?? []).includes("conv-model")) return "conv-model";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: {
+          requirements: { supportsFunctionTools: true },
+          allowConversationOverride: true,
+        },
+      }),
+      conversationModel: "conv-model",
+    });
+
+    expect(result.modelId).toBe("conv-model");
+    expect(result.modelSource).toBe("conversation");
+  });
+
+  it("auto-detect: requirements take precedence over llmModelId when both present", async () => {
+    mockSelectBestLlmModel.mockReturnValue("claude-3-sonnet");
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        llmModelId: "gpt-4o",
+        executionPolicy: {
+          requirements: { supportsFunctionTools: true },
+        },
+      }),
+    });
+
+    expect(result.modelId).toBe("claude-3-sonnet");
+    expect(result.modelSource).toBe("requirements_match");
+  });
+});
+
+describe("resolveSkillExecutionPolicy — regression: no requirements", () => {
+  beforeEach(() => {
+    mockLoadRows.mockReset();
+    mockResolveFromRows.mockReset();
+    mockSelectBestLlmModel.mockReset();
+    mockDescribeRequirementsMatch.mockReset();
+    mockLoadRows.mockResolvedValue(fakeRows);
+  });
+
+  it("skill without requirements: llmModelId still works", async () => {
+    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
+      if ((preferredModelIds ?? []).includes("gpt-4o")) return "gpt-4o";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({ llmModelId: "gpt-4o" }),
+    });
+
+    expect(result.modelId).toBe("gpt-4o");
+    expect(result.modelSource).toBe("skill_llmModelId");
+    expect(mockSelectBestLlmModel).not.toHaveBeenCalled();
+  });
+
+  it("skill without requirements: defaultModel still works", async () => {
+    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
+      if ((preferredModelIds ?? []).includes("default-model")) return "default-model";
+      return null;
+    });
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill({ defaultModel: "default-model" }),
+    });
+
+    expect(result.modelId).toBe("default-model");
+    expect(result.modelSource).toBe("skill_defaultModel");
+  });
+
+  it("skill without requirements: conversation model still works", async () => {
+    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
+      if ((preferredModelIds ?? []).includes("conv-model")) return "conv-model";
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
+  it("skill without requirements: system default still works", async () => {
+    mockResolveFromRows.mockReturnValue("system-default");
+
+    const result = await resolveSkillExecutionPolicy({
+      skill: makeSkill(),
+    });
+
+    expect(result.modelId).toBe("system-default");
+    expect(result.modelSource).toBe("system_default");
+  });
+
+  it("skill with executionPolicy but empty requirements: treats as no requirements", async () => {
+    mockResolveFromRows.mockReturnValue("system-default");
+
+    await resolveSkillExecutionPolicy({
+      skill: makeSkill({
+        executionPolicy: { mode: undefined, requirements: {} },
+      }),
+    });
+
+    expect(mockSelectBestLlmModel).not.toHaveBeenCalled();
+  });
+});
diff --git a/apps/web/server/services/skillExecutionPolicy.ts b/apps/web/server/services/skillExecutionPolicy.ts
index 43b8cbae..81ce3bf3 100644
--- a/apps/web/server/services/skillExecutionPolicy.ts
+++ b/apps/web/server/services/skillExecutionPolicy.ts
@@ -2,15 +2,14 @@
  * Skill Execution Policy Resolution
  *
  * Resolves the effective model and provider routing for skill invocations.
- * Skill policy takes priority over conversation model — the conversation model
- * is only used as a fallback when the skill has no configured model.
- *
- * This is the compatibility bridge between legacy skill fields (defaultModel,
- * llmModelId, preferredProviderId) and future capability-first execution policy.
+ * Supports capability-aware model selection via requirements matching,
+ * with fallback to the legacy cascade (llmModelId → defaultModel → conversation → system default).
  */
 
 import type { SkillDefinition } from "@smartspec/skills";
 import { resolveEnabledLlmModelIdFromRows, loadEnabledLlmModelRows } from "./enabledLlmModels";
+import { selectBestLlmModel, describeRequirementsMatch } from "./intelligentModelSelector";
+import type { CapabilityRequirements } from "./intelligentModelSelector";
 
 export interface SkillExecutionPolicyInput {
   /** The skill being invoked */
@@ -27,20 +26,37 @@ export interface SkillExecutionPolicyResult {
   /** Whether to enforce the pinned provider with no fallback */
   strictProviderPin?: boolean;
   /** Source of the resolved model for auditing */
-  modelSource: "skill_llmModelId" | "skill_defaultModel" | "conversation" | "system_default";
+  modelSource:
+    | "skill_llmModelId"
+    | "skill_defaultModel"
+    | "conversation"
+    | "system_default"
+    | "requirements_match"
+    | "skill_fixedModel";
+  /** Capabilities the selected model satisfies (only when modelSource="requirements_match") */
+  matchedCapabilities?: string[];
+  /** True when requirements found no match and a fallback model was used */
+  requirementsFallback?: boolean;
+}
+
+/**
+ * Check if a requirements object has at least one meaningful key.
+ */
+function hasNonEmptyRequirements(
+  requirements: Record<string, unknown> | undefined | null,
+): boolean {
+  if (!requirements) return false;
+  return Object.values(requirements).some((v) => v !== undefined && v !== null);
 }
 
 /**
  * Resolve the effective execution policy for a skill invocation.
  *
- * Priority order:
- *   1. skill.llmModelId (explicit skill model configuration)
- *   2. skill.defaultModel (skill-level default)
- *   3. conversationModel (user's active conversation choice — fallback only)
- *   4. system default (from enabled models)
- *
- * Provider pin fields (preferredProviderId, strictProviderPin) are always
- * propagated from the skill definition when present.
+ * Mode semantics:
+ * - "requirements": use capability-aware selector, fallback to llmModelId/system default
+ * - "fixed": skip requirements, use existing cascade
+ * - "hybrid": try fixedModel first, then requirements, then cascade
+ * - undefined: auto-detect — use requirements if declared, else existing cascade
  *
  * Uses a single DB call to load rows, then resolves against them in-memory.
  */
@@ -61,7 +77,87 @@ export async function resolveSkillExecutionPolicy(
     strictProviderPin: skill.strictProviderPin,
   };
 
-  // Build priority array: skill policy first, conversation model as fallback
+  const policy = skill.executionPolicy;
+  const mode = policy?.mode;
+  const requirements = policy?.requirements;
+  const hasReqs = hasNonEmptyRequirements(requirements);
+  const allowConvOverride = policy?.allowConversationOverride ?? false;
+
+  // ─── Fixed mode: skip requirements, run existing cascade ───
+  if (mode === "fixed") {
+    return legacyCascade({ rows, base, skillLlmModelId, skillDefaultModel, convModel });
+  }
+
+  // ─── Hybrid mode: try fixedModel first ───
+  if (mode === "hybrid" && policy?.fixedModel) {
+    const fixedResolved = resolveEnabledLlmModelIdFromRows({
+      rows,
+      preferredModelIds: [policy.fixedModel],
+    });
+    if (fixedResolved) {
+      return { ...base, modelId: fixedResolved, modelSource: "skill_fixedModel" };
+    }
+    // fixedModel unavailable: fall through to requirements
+  }
+
+  // ─── Requirements matching (when applicable) ───
+  const shouldTryRequirements =
+    mode === "requirements" || mode === "hybrid" || (mode === undefined && hasReqs);
+
+  if (shouldTryRequirements && hasReqs) {
+    const matched = selectBestLlmModel(
+      requirements as Partial<CapabilityRequirements>,
+      rows,
+    );
+
+    if (matched) {
+      // Find the matching row for capability description
+      const matchedRow = rows.find((r) => r.modelId === matched);
+      const caps = matchedRow
+        ? describeRequirementsMatch(
+            requirements as Partial<CapabilityRequirements>,
+            matchedRow,
+          )
+        : { matched: [], missing: [] };
+
+      return {
+        ...base,
+        modelId: matched,
+        modelSource: "requirements_match",
+        matchedCapabilities: caps.matched,
+        requirementsFallback: false,
+      };
+    }
+
+    // Requirements found no match — fall through with requirementsFallback flag
+    return requirementsFallbackCascade({
+      rows,
+      base,
+      skillLlmModelId,
+      skillDefaultModel,
+      convModel,
+      allowConvOverride,
+      mode,
+    });
+  }
+
+  // ─── No requirements: existing cascade ───
+  return legacyCascade({ rows, base, skillLlmModelId, skillDefaultModel, convModel });
+}
+
+/**
+ * Legacy cascade: llmModelId → defaultModel → conversationModel → system default.
+ * Used when no requirements are active (fixed mode, or undefined mode without requirements).
+ */
+function legacyCascade(opts: {
+  rows: any[];
+  base: { preferredProviderId?: number; strictProviderPin?: boolean };
+  skillLlmModelId?: string;
+  skillDefaultModel?: string;
+  convModel?: string;
+}): SkillExecutionPolicyResult {
+  const { rows, base, skillLlmModelId, skillDefaultModel, convModel } = opts;
+
   const preferredIds = [skillLlmModelId, skillDefaultModel, convModel];
   const modelId = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: preferredIds });
 
@@ -69,7 +165,7 @@ export async function resolveSkillExecutionPolicy(
     return { ...base, modelId: null, modelSource: "system_default" };
   }
 
-  // Determine source by checking each candidate in priority order (in-memory, no DB)
+  // Determine source by checking each candidate in priority order
   if (skillLlmModelId) {
     const check = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: [skillLlmModelId] });
     if (check === modelId) {
@@ -91,3 +187,61 @@ export async function resolveSkillExecutionPolicy(
 
   return { ...base, modelId, modelSource: "system_default" };
 }
+
+/**
+ * Fallback cascade after requirements matching failed.
+ * Sets requirementsFallback: true on the result.
+ * Respects allowConversationOverride setting.
+ */
+function requirementsFallbackCascade(opts: {
+  rows: any[];
+  base: { preferredProviderId?: number; strictProviderPin?: boolean };
+  skillLlmModelId?: string;
+  skillDefaultModel?: string;
+  convModel?: string;
+  allowConvOverride: boolean;
+  mode?: string;
+}): SkillExecutionPolicyResult {
+  const { rows, base, skillLlmModelId, skillDefaultModel, convModel, allowConvOverride, mode } =
+    opts;
+
+  // In "requirements" mode, skip defaultModel as a fallback tier
+  const useDefaultModel = mode !== "requirements";
+  const useConvModel = allowConvOverride;
+
+  const preferredIds = [
+    skillLlmModelId,
+    useDefaultModel ? skillDefaultModel : undefined,
+    useConvModel ? convModel : undefined,
+  ];
+  const modelId = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: preferredIds });
+
+  if (!modelId) {
+    return { ...base, modelId: null, modelSource: "system_default", requirementsFallback: true };
+  }
+
+  // Determine source
+  if (skillLlmModelId) {
+    const check = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: [skillLlmModelId] });
+    if (check === modelId) {
+      return { ...base, modelId, modelSource: "skill_llmModelId", requirementsFallback: true };
+    }
+  }
+  if (useDefaultModel && skillDefaultModel) {
+    const check = resolveEnabledLlmModelIdFromRows({
+      rows,
+      preferredModelIds: [skillDefaultModel],
+    });
+    if (check === modelId) {
+      return { ...base, modelId, modelSource: "skill_defaultModel", requirementsFallback: true };
+    }
+  }
+  if (useConvModel && convModel) {
+    const check = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: [convModel] });
+    if (check === modelId) {
+      return { ...base, modelId, modelSource: "conversation", requirementsFallback: true };
+    }
+  }
+
+  return { ...base, modelId, modelSource: "system_default", requirementsFallback: true };
+}
