diff --git a/apps/web/client/src/test-setup.ts b/apps/web/client/src/test-setup.ts
index ca10fa2..a7e6d5c 100644
--- a/apps/web/client/src/test-setup.ts
+++ b/apps/web/client/src/test-setup.ts
@@ -75,29 +75,31 @@ class ResizeObserverMock {
 }
 (globalThis as any).ResizeObserver = ResizeObserverMock;
 
-// Mock matchMedia
-Object.defineProperty(window, 'matchMedia', {
-  writable: true,
-  value: vi.fn().mockImplementation(query => ({
-    matches: false,
-    media: query,
-    onchange: null,
-    addListener: vi.fn(),
-    removeListener: vi.fn(),
-    addEventListener: vi.fn(),
-    removeEventListener: vi.fn(),
-    dispatchEvent: vi.fn(),
-  })),
-});
-
 // RTL auto-cleanup may not trigger with custom module resolution,
 // so register it explicitly. Dynamic import ensures the hook is active first.
 import { afterEach, vi } from "vitest";
 
-afterEach(async () => {
-  const { cleanup } = await import("@testing-library/react");
-  cleanup();
-});
+// Mock matchMedia — only in jsdom/browser environments
+if (typeof window !== "undefined") {
+  Object.defineProperty(window, 'matchMedia', {
+    writable: true,
+    value: vi.fn().mockImplementation(query => ({
+      matches: false,
+      media: query,
+      onchange: null,
+      addListener: vi.fn(),
+      removeListener: vi.fn(),
+      addEventListener: vi.fn(),
+      removeEventListener: vi.fn(),
+      dispatchEvent: vi.fn(),
+    })),
+  });
+
+  afterEach(async () => {
+    const { cleanup } = await import("@testing-library/react");
+    cleanup();
+  });
+}
 
 // Add jest-dom matchers
 import "@testing-library/jest-dom/vitest";
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 661dfb1..4a26fdc 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -999,7 +999,7 @@ export const tenantPages = pgTable("tenant_pages", {
   /** Structured content sections (JSON) */
   sections: json("sections").$type<Array<{
     id: string;
-    type: "hero" | "features" | "testimonials" | "cta" | "content" | "gallery" | "pricing" | "faq" | "team" | "contact" | "custom";
+    type: "hero" | "features" | "testimonials" | "cta" | "content" | "gallery" | "pricing" | "faq" | "team" | "contact" | "custom" | "stats" | "process";
     title?: string;
     subtitle?: string;
     content?: string;
@@ -2651,6 +2651,27 @@ export const workflowTemplates = pgTable("workflow_templates", {
   /** Full-text search vector (auto-generated from name + description) */
   searchVector: text("searchVector"), // tsvector in migration SQL
 
+  // --- Feature 017: Gallery columns ---
+
+  /** Pre-generated SVG topology diagram (generated at seed time by workflowSvgGenerator) */
+  previewSvg: text("previewSvg"),
+
+  /** Industry/sector tags for gallery filtering (e.g. ["E-commerce", "Retail"]) */
+  industry: json("industry").$type<string[]>(),
+
+  /** Number of nodes in the workflow (computed from workflowJson.nodes.length at seed time) */
+  stepCount: integer("stepCount"),
+
+  /** Rough setup effort in minutes (provided in template JSON, displayed in Gallery) */
+  estimatedSetupMinutes: integer("estimatedSetupMinutes"),
+
+  /**
+   * Stable slug identifier for idempotent upserts (e.g. "tpl-001").
+   * Used as the ON CONFLICT target in the seeder script.
+   * Must be unique across all templates.
+   */
+  templateKey: varchar("templateKey", { length: 50 }).unique(),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
diff --git a/apps/web/server/__tests__/workflowTemplates.schema.test.ts b/apps/web/server/__tests__/workflowTemplates.schema.test.ts
new file mode 100644
index 0000000..f388375
--- /dev/null
+++ b/apps/web/server/__tests__/workflowTemplates.schema.test.ts
@@ -0,0 +1,40 @@
+/**
+ * Static schema introspection tests for Feature 017 column additions.
+ * These verify the Drizzle schema definition object — not live DB state.
+ */
+import { describe, it, expect } from "vitest";
+import { workflowTemplates } from "../../drizzle/schema";
+
+describe("workflowTemplates schema — Feature 017 columns", () => {
+  it("includes 'previewSvg' text column", () => {
+    expect(workflowTemplates.previewSvg).toBeDefined();
+  });
+
+  it("includes 'industry' json column typed as string[]", () => {
+    expect(workflowTemplates.industry).toBeDefined();
+  });
+
+  it("includes 'stepCount' integer column", () => {
+    expect(workflowTemplates.stepCount).toBeDefined();
+  });
+
+  it("includes 'estimatedSetupMinutes' integer column", () => {
+    expect(workflowTemplates.estimatedSetupMinutes).toBeDefined();
+  });
+
+  it("includes 'templateKey' varchar(50) column with unique constraint", () => {
+    expect(workflowTemplates.templateKey).toBeDefined();
+  });
+
+  it("does NOT define 'usageCount' (correct name is downloadCount)", () => {
+    expect(Object.keys(workflowTemplates)).not.toContain("usageCount");
+  });
+
+  it("retains existing 'tags' json column (not duplicated)", () => {
+    expect(workflowTemplates.tags).toBeDefined();
+  });
+
+  it("retains existing 'downloadCount' column", () => {
+    expect(workflowTemplates.downloadCount).toBeDefined();
+  });
+});
