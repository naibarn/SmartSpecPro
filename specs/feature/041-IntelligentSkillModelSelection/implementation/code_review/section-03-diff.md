diff --git a/apps/web/server/services/enabledLlmModels.ts b/apps/web/server/services/enabledLlmModels.ts
index 519e4e0a..f41384cc 100644
--- a/apps/web/server/services/enabledLlmModels.ts
+++ b/apps/web/server/services/enabledLlmModels.ts
@@ -4,11 +4,25 @@ import { llmProviders, modelProviderMap } from "../../drizzle/schema";
 import { getDb } from "../db";
 import { buildModelLookupCandidates } from "./modelLookup";
 
-type EnabledLlmModelRow = {
+export type EnabledLlmModelRow = {
   providerName: string;
   modelId: string;
   providerModelId: string;
   defaultModel: string | null;
+  // Capability columns (from model_provider_map)
+  supportsVision: boolean | null;
+  supportsFunctionTools: boolean | null;
+  supportsStructuredOutputs: boolean | null;
+  supportsWebSearch: boolean | null;
+  supportsCodeExecution: boolean | null;
+  supportsComputerUse: boolean | null;
+  supportsBackground: boolean | null;
+  supportsResponses: boolean | null;
+  // Sizing and ranking
+  contextLength: number | null;
+  priority: number;
+  priorityLocked: boolean | null;
+  isFree: boolean;
 };
 
 function trimModelId(value: string | null | undefined): string {
@@ -91,6 +105,20 @@ export async function loadEnabledLlmModelRows(): Promise<EnabledLlmModelRow[]> {
       modelId: modelProviderMap.modelId,
       providerModelId: modelProviderMap.providerModelId,
       defaultModel: llmProviders.defaultModel,
+      // Capability columns
+      supportsVision: modelProviderMap.supportsVision,
+      supportsFunctionTools: modelProviderMap.supportsFunctionTools,
+      supportsStructuredOutputs: modelProviderMap.supportsStructuredOutputs,
+      supportsWebSearch: modelProviderMap.supportsWebSearch,
+      supportsCodeExecution: modelProviderMap.supportsCodeExecution,
+      supportsComputerUse: modelProviderMap.supportsComputerUse,
+      supportsBackground: modelProviderMap.supportsBackground,
+      supportsResponses: modelProviderMap.supportsResponses,
+      // Sizing and ranking
+      contextLength: modelProviderMap.contextLength,
+      priority: modelProviderMap.priority,
+      priorityLocked: modelProviderMap.priorityLocked,
+      isFree: modelProviderMap.isFree,
     })
     .from(modelProviderMap)
     .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
@@ -106,6 +134,18 @@ export async function loadEnabledLlmModelRows(): Promise<EnabledLlmModelRow[]> {
     modelId: row.modelId,
     providerModelId: row.providerModelId,
     defaultModel: row.defaultModel,
+    supportsVision: row.supportsVision,
+    supportsFunctionTools: row.supportsFunctionTools,
+    supportsStructuredOutputs: row.supportsStructuredOutputs,
+    supportsWebSearch: row.supportsWebSearch,
+    supportsCodeExecution: row.supportsCodeExecution,
+    supportsComputerUse: row.supportsComputerUse,
+    supportsBackground: row.supportsBackground,
+    supportsResponses: row.supportsResponses,
+    contextLength: row.contextLength,
+    priority: row.priority,
+    priorityLocked: row.priorityLocked,
+    isFree: row.isFree,
   }));
 }
 
diff --git a/apps/web/server/services/intelligentModelSelector.test.ts b/apps/web/server/services/intelligentModelSelector.test.ts
index dd7724b6..71c1c41d 100644
--- a/apps/web/server/services/intelligentModelSelector.test.ts
+++ b/apps/web/server/services/intelligentModelSelector.test.ts
@@ -1,8 +1,12 @@
 import { describe, it, expect } from "vitest";
 import {
   computeModelPriority,
+  selectBestLlmModel,
+  describeRequirementsMatch,
   type ModelPriorityInput,
+  type CapabilityRequirements,
 } from "./intelligentModelSelector";
+import type { EnabledLlmModelRow } from "./enabledLlmModels";
 
 const DAY = 86400; // seconds
 
@@ -152,3 +156,174 @@ describe("computeModelPriority", () => {
     expect(a).toBe(b);
   });
 });
+
+// ─── Section 03: selectBestLlmModel + describeRequirementsMatch ───
+
+function makeRow(
+  modelId: string,
+  overrides: Partial<EnabledLlmModelRow> = {},
+): EnabledLlmModelRow {
+  return {
+    providerName: "test-provider",
+    modelId,
+    providerModelId: modelId,
+    defaultModel: null,
+    supportsVision: false,
+    supportsFunctionTools: false,
+    supportsStructuredOutputs: false,
+    supportsWebSearch: false,
+    supportsCodeExecution: false,
+    supportsComputerUse: false,
+    supportsBackground: false,
+    supportsResponses: false,
+    contextLength: null,
+    priority: 50,
+    priorityLocked: false,
+    isFree: false,
+    ...overrides,
+  };
+}
+
+describe("selectBestLlmModel", () => {
+  it("returns modelId of first qualifying model sorted by priority", () => {
+    const rows = [
+      makeRow("gpt-4o", { priority: 10, supportsFunctionTools: true }),
+      makeRow("claude-3", { priority: 5, supportsFunctionTools: true }),
+    ];
+    const result = selectBestLlmModel(
+      { supportsFunctionTools: true },
+      rows,
+    );
+    expect(result).toBe("claude-3");
+  });
+
+  it("returns null when no row satisfies requirements", () => {
+    const rows = [
+      makeRow("text-only", { supportsFunctionTools: false }),
+    ];
+    const result = selectBestLlmModel(
+      { supportsFunctionTools: true },
+      rows,
+    );
+    expect(result).toBeNull();
+  });
+
+  it("AND logic: excludes models missing any single required capability", () => {
+    const rows = [
+      makeRow("partial", {
+        supportsFunctionTools: true,
+        supportsStructuredOutputs: false,
+      }),
+    ];
+    const result = selectBestLlmModel(
+      { supportsFunctionTools: true, supportsStructuredOutputs: true },
+      rows,
+    );
+    expect(result).toBeNull();
+  });
+
+  it("false requirements do not filter out capable models", () => {
+    const rows = [
+      makeRow("capable", { supportsFunctionTools: true }),
+    ];
+    const result = selectBestLlmModel(
+      { supportsFunctionTools: false },
+      rows,
+    );
+    expect(result).toBe("capable");
+  });
+
+  it("contextLength filter excludes models with insufficient context", () => {
+    const rows = [
+      makeRow("small", { contextLength: 4096, priority: 1 }),
+      makeRow("large", { contextLength: 128000, priority: 2 }),
+    ];
+    const result = selectBestLlmModel(
+      { contextLength: 32000 },
+      rows,
+    );
+    expect(result).toBe("large");
+  });
+
+  it("contextLength filter excludes models with null contextLength", () => {
+    const rows = [
+      makeRow("unknown-ctx", { contextLength: null, priority: 1 }),
+      makeRow("known-large", { contextLength: 128000, priority: 2 }),
+    ];
+    const result = selectBestLlmModel(
+      { contextLength: 32000 },
+      rows,
+    );
+    expect(result).toBe("known-large");
+  });
+
+  it("returns null for empty rows array", () => {
+    const result = selectBestLlmModel(
+      { supportsFunctionTools: true },
+      [],
+    );
+    expect(result).toBeNull();
+  });
+
+  it("returns first model when requirements object is empty", () => {
+    const rows = [
+      makeRow("model-a", { priority: 20 }),
+      makeRow("model-b", { priority: 10 }),
+    ];
+    const result = selectBestLlmModel({}, rows);
+    expect(result).toBe("model-b");
+  });
+
+  it("does not require capabilities not in requirements object", () => {
+    const rows = [
+      makeRow("tools-only", {
+        supportsFunctionTools: true,
+        supportsVision: false,
+        priority: 5,
+      }),
+    ];
+    const result = selectBestLlmModel(
+      { supportsFunctionTools: true },
+      rows,
+    );
+    expect(result).toBe("tools-only");
+  });
+});
+
+describe("describeRequirementsMatch", () => {
+  it("lists matched capabilities correctly", () => {
+    const requirements: Partial<CapabilityRequirements> = {
+      supportsFunctionTools: true,
+      supportsVision: true,
+    };
+    const row = makeRow("model-a", {
+      supportsFunctionTools: true,
+      supportsVision: true,
+    });
+    const result = describeRequirementsMatch(requirements, row);
+    expect(result.matched).toContain("supportsFunctionTools");
+    expect(result.matched).toContain("supportsVision");
+    expect(result.missing).toHaveLength(0);
+  });
+
+  it("lists missing capabilities correctly", () => {
+    const requirements: Partial<CapabilityRequirements> = {
+      supportsFunctionTools: true,
+      supportsVision: true,
+    };
+    const row = makeRow("model-a", {
+      supportsFunctionTools: true,
+      supportsVision: false,
+    });
+    const result = describeRequirementsMatch(requirements, row);
+    expect(result.matched).toContain("supportsFunctionTools");
+    expect(result.missing).toContain("supportsVision");
+  });
+
+  it("returns empty arrays when requirements is empty", () => {
+    const row = makeRow("model-a", { supportsFunctionTools: true });
+    const result = describeRequirementsMatch({}, row);
+    expect(result.matched).toHaveLength(0);
+    expect(result.missing).toHaveLength(0);
+  });
+});
diff --git a/apps/web/server/services/intelligentModelSelector.ts b/apps/web/server/services/intelligentModelSelector.ts
index cf066af1..64f373f7 100644
--- a/apps/web/server/services/intelligentModelSelector.ts
+++ b/apps/web/server/services/intelligentModelSelector.ts
@@ -2,9 +2,11 @@
  * Intelligent Model Selector — Feature 041
  *
  * Section 02: computeModelPriority (pure scoring function)
- * Section 03 will add: selectBestLlmModel, describeRequirementsMatch
+ * Section 03: selectBestLlmModel, describeRequirementsMatch
  */
 
+import type { EnabledLlmModelRow } from "./enabledLlmModels";
+
 /**
  * Minimum model data needed to compute a priority score.
  * Sourced from model_provider_map + llmProviders.availableModels JSON.
@@ -101,3 +103,131 @@ export function computeModelPriority(model: ModelPriorityInput): number {
     capabilityScore(model);
   return Math.max(1, Math.round(100 - total));
 }
+
+// ─── Section 03: Capability-Aware Selector ───
+
+/**
+ * Requirements that a skill can declare for model selection.
+ * All fields are optional. Only `true` boolean values act as filters.
+ * `false` values are ignored (they do not exclude models that have the capability).
+ */
+export interface CapabilityRequirements {
+  supportsVision?: boolean;
+  supportsFunctionTools?: boolean;
+  supportsStructuredOutputs?: boolean;
+  supportsWebSearch?: boolean;
+  supportsCodeExecution?: boolean;
+  supportsComputerUse?: boolean;
+  supportsBackground?: boolean;
+  supportsResponses?: boolean;
+  /** Minimum context window size in tokens. */
+  contextLength?: number;
+}
+
+const CAPABILITY_KEYS: ReadonlyArray<
+  keyof Omit<CapabilityRequirements, "contextLength">
+> = [
+  "supportsVision",
+  "supportsFunctionTools",
+  "supportsStructuredOutputs",
+  "supportsWebSearch",
+  "supportsCodeExecution",
+  "supportsComputerUse",
+  "supportsBackground",
+  "supportsResponses",
+] as const;
+
+/**
+ * Given a set of capability requirements and a list of enabled model rows,
+ * return the modelId of the best matching model, or null if none qualifies.
+ *
+ * Algorithm:
+ * 1. Filter rows by boolean capability requirements (AND logic).
+ *    Only `true` requirements filter; `false` requirements are ignored.
+ * 2. If contextLength requirement is set, exclude rows where
+ *    row.contextLength is null or row.contextLength < requirements.contextLength.
+ * 3. Sort qualifying rows by priority ASC (lower number = higher priority).
+ * 4. Return first row's modelId, or null.
+ *
+ * NOTE: disallowedModels filtering is deferred to v2.
+ */
+export function selectBestLlmModel(
+  requirements: Partial<CapabilityRequirements>,
+  rows: EnabledLlmModelRow[],
+): string | null {
+  if (rows.length === 0) {
+    return null;
+  }
+
+  // Step 1: Filter by boolean capabilities (AND logic)
+  let candidates = rows.filter((row) => {
+    for (const key of CAPABILITY_KEYS) {
+      if (requirements[key] === true) {
+        if (row[key] !== true) {
+          return false;
+        }
+      }
+    }
+    return true;
+  });
+
+  // Step 2: Filter by contextLength
+  if (
+    requirements.contextLength != null &&
+    requirements.contextLength > 0
+  ) {
+    candidates = candidates.filter((row) => {
+      if (row.contextLength == null) {
+        return false;
+      }
+      return row.contextLength >= requirements.contextLength!;
+    });
+  }
+
+  // Step 3: Sort by priority ASC (lower = higher priority)
+  candidates.sort((a, b) => a.priority - b.priority);
+
+  // Step 4: Return first match
+  // TODO v2: apply disallowedModels filter here
+  return candidates[0]?.modelId ?? null;
+}
+
+/**
+ * Human-readable description of which capabilities a row matches
+ * and which it is missing, relative to given requirements.
+ * Only boolean requirements set to `true` are evaluated.
+ */
+export function describeRequirementsMatch(
+  requirements: Partial<CapabilityRequirements>,
+  row: EnabledLlmModelRow,
+): { matched: string[]; missing: string[] } {
+  const matched: string[] = [];
+  const missing: string[] = [];
+
+  for (const key of CAPABILITY_KEYS) {
+    if (requirements[key] !== true) {
+      continue;
+    }
+    if (row[key] === true) {
+      matched.push(key);
+    } else {
+      missing.push(key);
+    }
+  }
+
+  if (
+    requirements.contextLength != null &&
+    requirements.contextLength > 0
+  ) {
+    if (
+      row.contextLength != null &&
+      row.contextLength >= requirements.contextLength
+    ) {
+      matched.push("contextLength");
+    } else {
+      missing.push("contextLength");
+    }
+  }
+
+  return { matched, missing };
+}
