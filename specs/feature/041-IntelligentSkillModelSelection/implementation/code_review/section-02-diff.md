diff --git a/apps/web/server/services/intelligentModelSelector.test.ts b/apps/web/server/services/intelligentModelSelector.test.ts
new file mode 100644
index 00000000..03b3db8d
--- /dev/null
+++ b/apps/web/server/services/intelligentModelSelector.test.ts
@@ -0,0 +1,115 @@
+import { describe, it, expect } from "vitest";
+import {
+  computeModelPriority,
+  type ModelPriorityInput,
+} from "./intelligentModelSelector";
+
+const DAY = 86400; // seconds
+
+describe("computeModelPriority", () => {
+  it("returns lower number for newer model (recency wins)", () => {
+    const now = Date.now() / 1000;
+    const modelA: ModelPriorityInput = { createdAt: now - 7 * DAY }; // 7 days old
+    const modelB: ModelPriorityInput = { createdAt: now - 800 * DAY }; // 2+ years old
+    expect(computeModelPriority(modelA)).toBeLessThan(
+      computeModelPriority(modelB),
+    );
+  });
+
+  it("returns lower number for free model over paid", () => {
+    const modelA: ModelPriorityInput = { isFree: true };
+    const modelB: ModelPriorityInput = {
+      isFree: false,
+      pricingInput: "5",
+      pricingOutput: "5",
+    };
+    expect(computeModelPriority(modelA)).toBeLessThan(
+      computeModelPriority(modelB),
+    );
+  });
+
+  it("returns lower number for model with more capabilities", () => {
+    const modelA: ModelPriorityInput = {
+      supportsFunctionTools: true,
+      supportsStructuredOutputs: true,
+      supportsWebSearch: true,
+      supportsCodeExecution: true,
+      supportsComputerUse: true,
+      supportsBackground: true,
+      supportsResponses: true,
+      supportsVision: true,
+    };
+    const modelB: ModelPriorityInput = {};
+    expect(computeModelPriority(modelA)).toBeLessThan(
+      computeModelPriority(modelB),
+    );
+  });
+
+  it("never returns 0 or negative", () => {
+    // Worst case: old model, expensive, no capabilities
+    const model: ModelPriorityInput = {
+      createdAt: Date.now() / 1000 - 1000 * DAY,
+      pricingInput: "50",
+      pricingOutput: "50",
+    };
+    const priority = computeModelPriority(model);
+    expect(priority).toBeGreaterThanOrEqual(1);
+  });
+
+  it("never returns more than 100", () => {
+    // Best case: brand new, free, all capabilities
+    const model: ModelPriorityInput = {
+      createdAt: Date.now() / 1000,
+      isFree: true,
+      supportsFunctionTools: true,
+      supportsStructuredOutputs: true,
+      supportsWebSearch: true,
+      supportsCodeExecution: true,
+      supportsComputerUse: true,
+      supportsBackground: true,
+      supportsResponses: true,
+      supportsVision: true,
+    };
+    const priority = computeModelPriority(model);
+    expect(priority).toBeLessThanOrEqual(100);
+    // Should actually be 1 (the minimum)
+    expect(priority).toBe(1);
+  });
+
+  it("returns mid-range value for unknown createdAt", () => {
+    const now = Date.now() / 1000;
+    const unknown: ModelPriorityInput = { createdAt: undefined };
+    const recent: ModelPriorityInput = { createdAt: now - 15 * DAY }; // 40 pts
+    const old: ModelPriorityInput = { createdAt: now - 500 * DAY }; // 10 pts
+    // Unknown gets 15 pts recency, so priority should be between recent and old
+    const unknownPriority = computeModelPriority(unknown);
+    const recentPriority = computeModelPriority(recent);
+    const oldPriority = computeModelPriority(old);
+    expect(unknownPriority).toBeGreaterThan(recentPriority);
+    expect(unknownPriority).toBeLessThan(oldPriority);
+  });
+
+  it("returns mid-range value for unknown pricing", () => {
+    const cheap: ModelPriorityInput = { pricingInput: "0.1", pricingOutput: "0.1" };
+    const expensive: ModelPriorityInput = { pricingInput: "20", pricingOutput: "20" };
+    const unknown: ModelPriorityInput = { pricingInput: null, pricingOutput: null };
+    const cheapPriority = computeModelPriority(cheap);
+    const expensivePriority = computeModelPriority(expensive);
+    const unknownPriority = computeModelPriority(unknown);
+    expect(unknownPriority).toBeGreaterThan(cheapPriority);
+    expect(unknownPriority).toBeLessThan(expensivePriority);
+  });
+
+  it("is deterministic — same input always returns same output", () => {
+    const model: ModelPriorityInput = {
+      createdAt: Date.now() / 1000 - 60 * DAY,
+      pricingInput: "3",
+      pricingOutput: "6",
+      supportsFunctionTools: true,
+      supportsVision: true,
+    };
+    const a = computeModelPriority(model);
+    const b = computeModelPriority(model);
+    expect(a).toBe(b);
+  });
+});
diff --git a/apps/web/server/services/intelligentModelSelector.ts b/apps/web/server/services/intelligentModelSelector.ts
new file mode 100644
index 00000000..67f2c449
--- /dev/null
+++ b/apps/web/server/services/intelligentModelSelector.ts
@@ -0,0 +1,90 @@
+/**
+ * Intelligent Model Selector — Feature 041
+ *
+ * Section 02: computeModelPriority (pure scoring function)
+ * Section 03 will add: selectBestLlmModel, describeRequirementsMatch
+ */
+
+/**
+ * Minimum model data needed to compute a priority score.
+ * Sourced from model_provider_map + llmProviders.availableModels JSON.
+ */
+export interface ModelPriorityInput {
+  createdAt?: number | null;
+  pricingInput?: string | number | null;
+  pricingOutput?: string | number | null;
+  isFree?: boolean | null;
+  supportsFunctionTools?: boolean | null;
+  supportsStructuredOutputs?: boolean | null;
+  supportsWebSearch?: boolean | null;
+  supportsCodeExecution?: boolean | null;
+  supportsComputerUse?: boolean | null;
+  supportsBackground?: boolean | null;
+  supportsResponses?: boolean | null;
+  supportsVision?: boolean | null;
+}
+
+const DAY_MS = 86_400_000;
+
+const CAPABILITY_FLAGS: (keyof ModelPriorityInput)[] = [
+  "supportsFunctionTools",
+  "supportsStructuredOutputs",
+  "supportsWebSearch",
+  "supportsCodeExecution",
+  "supportsComputerUse",
+  "supportsBackground",
+  "supportsResponses",
+  "supportsVision",
+];
+
+function recencyScore(createdAt: number | null | undefined): number {
+  if (createdAt == null) return 15;
+  const ageMs = Date.now() - createdAt * 1000;
+  const ageDays = ageMs / DAY_MS;
+  if (ageDays <= 30) return 40;
+  if (ageDays <= 90) return 30;
+  if (ageDays <= 365) return 20;
+  return 10;
+}
+
+function costScore(model: ModelPriorityInput): number {
+  if (model.isFree) return 30;
+
+  const input = parseFloat(String(model.pricingInput ?? ""));
+  const output = parseFloat(String(model.pricingOutput ?? ""));
+
+  if (isNaN(input) && isNaN(output)) return 15;
+
+  const avg = isNaN(input)
+    ? output
+    : isNaN(output)
+      ? input
+      : (input + output) / 2;
+
+  if (avg < 0.5) return 25;
+  if (avg <= 2) return 20;
+  if (avg <= 5) return 15;
+  if (avg <= 15) return 10;
+  return 5;
+}
+
+function capabilityScore(model: ModelPriorityInput): number {
+  let count = 0;
+  for (const flag of CAPABILITY_FLAGS) {
+    if (model[flag] === true) count++;
+  }
+  return Math.floor((count / 8) * 30);
+}
+
+/**
+ * Compute a priority score for a model.
+ * Lower number = higher priority in ORDER BY priority ASC queries.
+ * Range: 1–99. Pure function, deterministic, no side effects.
+ */
+export function computeModelPriority(model: ModelPriorityInput): number {
+  const total =
+    recencyScore(model.createdAt) +
+    costScore(model) +
+    capabilityScore(model);
+  return Math.max(1, Math.round(100 - total));
+}
