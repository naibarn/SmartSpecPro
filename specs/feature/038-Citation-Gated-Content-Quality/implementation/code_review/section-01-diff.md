diff --git a/apps/web/server/services/skillFrontmatter.test.ts b/apps/web/server/services/skillFrontmatter.test.ts
new file mode 100644
index 00000000..f7ece94d
--- /dev/null
+++ b/apps/web/server/services/skillFrontmatter.test.ts
@@ -0,0 +1,258 @@
+import { describe, it, expect } from "vitest";
+import { parseSkillFile, parseExecutionPolicyContentFields, parseContentQuality } from "@smartspec/skills";
+
+describe("parseSkillFile — Spec 038 frontmatter fields", () => {
+  it("parses frontmatter with all Spec 038 execution_policy fields", () => {
+    const content = `---
+name: test-skill
+category: product_review
+execution_policy:
+  requires_web_search: true
+  requires_citations: true
+  requires_structured_output: true
+  thinking_level_hint: high
+  output_format: cms_review
+  max_tokens_hint: 8000
+---
+# Test Skill`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.name).toBe("test-skill");
+    const ep = result.metadata.execution_policy!;
+    expect(ep.requires_web_search).toBe(true);
+    expect(ep.requires_citations).toBe(true);
+    expect(ep.requires_structured_output).toBe(true);
+    expect(ep.thinking_level_hint).toBe("high");
+    expect(ep.output_format).toBe("cms_review");
+    expect(ep.max_tokens_hint).toBe(8000);
+    expect(result.warnings).toBeUndefined();
+  });
+
+  it("parses frontmatter with content_quality fields", () => {
+    const content = `---
+name: review-skill
+content_quality:
+  citation_required_for:
+    - critical
+    - major
+  min_citation_coverage: 0.7
+  disclosure_required: true
+  refresh_cadence_days: 30
+---
+# Review Skill`;
+
+    const result = parseSkillFile(content);
+    const cq = result.metadata.content_quality!;
+    expect(cq.citation_required_for).toEqual(["critical", "major"]);
+    expect(cq.min_citation_coverage).toBe(0.7);
+    expect(cq.disclosure_required).toBe(true);
+    expect(cq.refresh_cadence_days).toBe(30);
+    expect(result.warnings).toBeUndefined();
+  });
+
+  it("parses frontmatter with partial Spec 038 fields", () => {
+    const content = `---
+name: partial-skill
+execution_policy:
+  requires_web_search: true
+content_quality:
+  min_citation_coverage: 0.5
+---
+# Partial`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.execution_policy!.requires_web_search).toBe(true);
+    expect(result.metadata.execution_policy!.requires_citations).toBeUndefined();
+    expect(result.metadata.content_quality!.min_citation_coverage).toBe(0.5);
+    expect(result.metadata.content_quality!.citation_required_for).toBeUndefined();
+  });
+
+  it("parses legacy frontmatter without new fields (backward compatible)", () => {
+    const content = `---
+name: legacy-skill
+category: chat_assistant
+priority: 50
+---
+# Legacy Skill`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.name).toBe("legacy-skill");
+    expect(result.metadata.execution_policy).toBeUndefined();
+    expect(result.metadata.content_quality).toBeUndefined();
+    expect(result.warnings).toBeUndefined();
+  });
+
+  it("produces warnings for invalid thinking_level_hint", () => {
+    const content = `---
+name: bad-hint
+execution_policy:
+  thinking_level_hint: extreme
+---
+# Bad Hint`;
+
+    const result = parseSkillFile(content);
+    expect(result.warnings).toBeDefined();
+    expect(result.warnings![0]).toContain("Invalid thinking_level_hint");
+  });
+
+  it("produces warnings for invalid output_format", () => {
+    const content = `---
+name: bad-format
+execution_policy:
+  output_format: html
+---
+# Bad Format`;
+
+    const result = parseSkillFile(content);
+    expect(result.warnings).toBeDefined();
+    expect(result.warnings![0]).toContain("Invalid output_format");
+  });
+
+  it("produces warnings for invalid citation_required_for values", () => {
+    const content = `---
+name: bad-citation
+content_quality:
+  citation_required_for:
+    - critical
+    - trivial
+---
+# Bad Citation`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.content_quality!.citation_required_for).toEqual(["critical"]);
+    expect(result.warnings).toBeDefined();
+    expect(result.warnings![0]).toContain("Invalid citation_required_for");
+  });
+
+  it("produces warnings for out-of-range min_citation_coverage", () => {
+    const content = `---
+name: bad-coverage
+content_quality:
+  min_citation_coverage: 1.5
+---
+# Bad Coverage`;
+
+    const result = parseSkillFile(content);
+    expect(result.metadata.content_quality).toBeUndefined();
+    expect(result.warnings).toBeDefined();
+    expect(result.warnings![0]).toContain("min_citation_coverage");
+  });
+
+  it("handles both execution_policy and content_quality together", () => {
+    const content = `---
+name: full-skill
+execution_policy:
+  mode: requirements
+  requires_web_search: true
+  requires_citations: true
+  thinking_level_hint: medium
+  output_format: cms_article
+  requirements:
+    supportsWebSearch: true
+content_quality:
+  citation_required_for:
+    - critical
+    - major
+  min_citation_coverage: 0.6
+  disclosure_required: false
+  refresh_cadence_days: 30
+---
+# Full Skill`;
+
+    const result = parseSkillFile(content);
+    const ep = result.metadata.execution_policy!;
+    expect(ep.mode).toBe("requirements");
+    expect(ep.requires_web_search).toBe(true);
+    expect(ep.requirements?.supportsWebSearch).toBe(true);
+
+    const cq = result.metadata.content_quality!;
+    expect(cq.citation_required_for).toEqual(["critical", "major"]);
+    expect(cq.min_citation_coverage).toBe(0.6);
+    expect(cq.disclosure_required).toBe(false);
+    expect(result.warnings).toBeUndefined();
+  });
+});
+
+describe("parseExecutionPolicyContentFields", () => {
+  it("returns undefined for undefined input", () => {
+    expect(parseExecutionPolicyContentFields(undefined)).toBeUndefined();
+  });
+
+  it("returns undefined for empty object", () => {
+    expect(parseExecutionPolicyContentFields({})).toBeUndefined();
+  });
+
+  it("parses valid fields", () => {
+    const result = parseExecutionPolicyContentFields({
+      requires_web_search: true,
+      thinking_level_hint: "low",
+      output_format: "markdown",
+    });
+    expect(result).toEqual({
+      requires_web_search: true,
+      thinking_level_hint: "low",
+      output_format: "markdown",
+    });
+  });
+
+  it("coerces booleans", () => {
+    const result = parseExecutionPolicyContentFields({
+      requires_web_search: 1,
+      requires_citations: 0,
+    });
+    expect(result!.requires_web_search).toBe(true);
+    expect(result!.requires_citations).toBe(false);
+  });
+});
+
+describe("parseContentQuality", () => {
+  it("returns undefined quality for undefined input", () => {
+    const { quality } = parseContentQuality(undefined);
+    expect(quality).toBeUndefined();
+  });
+
+  it("returns undefined quality for empty object", () => {
+    const { quality } = parseContentQuality({});
+    expect(quality).toBeUndefined();
+  });
+
+  it("parses all valid fields", () => {
+    const { quality, warnings } = parseContentQuality({
+      citation_required_for: ["critical", "minor"],
+      min_citation_coverage: 0.8,
+      disclosure_required: true,
+      refresh_cadence_days: 60,
+    });
+    expect(quality).toEqual({
+      citation_required_for: ["critical", "minor"],
+      min_citation_coverage: 0.8,
+      disclosure_required: true,
+      refresh_cadence_days: 60,
+    });
+    expect(warnings).toHaveLength(0);
+  });
+
+  it("filters invalid citation levels with warning", () => {
+    const { quality, warnings } = parseContentQuality({
+      citation_required_for: ["critical", "unknown"],
+    });
+    expect(quality!.citation_required_for).toEqual(["critical"]);
+    expect(warnings).toHaveLength(1);
+  });
+
+  it("rejects min_citation_coverage > 1", () => {
+    const { quality, warnings } = parseContentQuality({
+      min_citation_coverage: 2.0,
+    });
+    expect(quality).toBeUndefined();
+    expect(warnings).toHaveLength(1);
+  });
+
+  it("rejects negative min_citation_coverage", () => {
+    const { quality, warnings } = parseContentQuality({
+      min_citation_coverage: -0.1,
+    });
+    expect(quality).toBeUndefined();
+    expect(warnings).toHaveLength(1);
+  });
+});
diff --git a/packages/skills/src/parser.ts b/packages/skills/src/parser.ts
index 5b6e7a2d..5145d277 100644
--- a/packages/skills/src/parser.ts
+++ b/packages/skills/src/parser.ts
@@ -6,19 +6,45 @@
  */
 
 import yaml from "js-yaml";
-import type { SkillMetadata, TriggerRule, PatternRule } from "./types";
+import type { SkillMetadata, TriggerRule, PatternRule, SkillExecutionPolicyConfig, SkillContentQuality } from "./types";
 
 /**
  * Parse a skill.md file — extract YAML frontmatter and markdown content
  */
-export function parseSkillFile(content: string): { metadata: SkillMetadata; content: string } {
+export function parseSkillFile(content: string): { metadata: SkillMetadata; content: string; warnings?: string[] } {
   if (content.startsWith("---")) {
     const parts = content.split("---");
     if (parts.length >= 3) {
       try {
         const frontmatter = yaml.load(parts[1], { schema: yaml.JSON_SCHEMA }) as SkillMetadata;
         const body = parts.slice(2).join("---").trim();
-        return { metadata: frontmatter || {}, content: body };
+        const metadata = frontmatter || {} as SkillMetadata;
+        const warnings: string[] = [];
+
+        // Validate and merge Spec 038 execution_policy content fields
+        const execPolicy = metadata.execution_policy ?? metadata.executionPolicy;
+        if (execPolicy && typeof execPolicy === "object") {
+          const contentFields = parseExecutionPolicyContentFields(execPolicy as Record<string, unknown>);
+          if (contentFields) {
+            const w = (contentFields as any).__warnings as string[] | undefined;
+            if (w) {
+              warnings.push(...w);
+              delete (contentFields as any).__warnings;
+            }
+          }
+        }
+
+        // Validate content_quality
+        const rawCQ = metadata.content_quality ?? metadata.contentQuality;
+        if (rawCQ && typeof rawCQ === "object") {
+          const { quality, warnings: cqWarnings } = parseContentQuality(rawCQ as Record<string, unknown>);
+          warnings.push(...cqWarnings);
+          // Replace raw YAML with validated version (or clear if invalid)
+          metadata.content_quality = quality;
+          metadata.contentQuality = quality;
+        }
+
+        return { metadata, content: body, warnings: warnings.length > 0 ? warnings : undefined };
       } catch {
         return { metadata: {} as SkillMetadata, content };
       }
@@ -176,6 +202,101 @@ export function parseTriggerPatternsLegacy(patterns: string[] | null | undefined
     .filter((r): r is RegExp => r !== null);
 }
 
+const VALID_THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;
+const VALID_OUTPUT_FORMATS = ["cms_article", "cms_review", "markdown", "json"] as const;
+const VALID_CITATION_LEVELS = ["critical", "major", "minor"] as const;
+
+/**
+ * Parse and validate execution_policy fields from Spec 038 (content quality).
+ * Invalid enum values are silently dropped (warning-level, not error).
+ */
+export function parseExecutionPolicyContentFields(
+  raw: Record<string, unknown> | undefined
+): Pick<SkillExecutionPolicyConfig, "requires_web_search" | "requires_citations" | "requires_structured_output" | "thinking_level_hint" | "output_format" | "max_tokens_hint"> | undefined {
+  if (!raw || typeof raw !== "object") return undefined;
+
+  const result: Record<string, unknown> = {};
+  const warnings: string[] = [];
+
+  if ("requires_web_search" in raw) result.requires_web_search = Boolean(raw.requires_web_search);
+  if ("requires_citations" in raw) result.requires_citations = Boolean(raw.requires_citations);
+  if ("requires_structured_output" in raw) result.requires_structured_output = Boolean(raw.requires_structured_output);
+
+  if ("thinking_level_hint" in raw) {
+    const val = String(raw.thinking_level_hint);
+    if ((VALID_THINKING_LEVELS as readonly string[]).includes(val)) {
+      result.thinking_level_hint = val;
+    } else {
+      warnings.push(`Invalid thinking_level_hint: "${val}"`);
+    }
+  }
+
+  if ("output_format" in raw) {
+    const val = String(raw.output_format);
+    if ((VALID_OUTPUT_FORMATS as readonly string[]).includes(val)) {
+      result.output_format = val;
+    } else {
+      warnings.push(`Invalid output_format: "${val}"`);
+    }
+  }
+
+  if ("max_tokens_hint" in raw) {
+    const num = Number(raw.max_tokens_hint);
+    if (!isNaN(num) && num > 0) result.max_tokens_hint = num;
+  }
+
+  if (warnings.length > 0) {
+    (result as Record<string, unknown>).__warnings = warnings;
+  }
+
+  return Object.keys(result).length > 0 ? result as any : undefined;
+}
+
+/**
+ * Parse and validate content_quality fields from Spec 038.
+ */
+export function parseContentQuality(
+  raw: Record<string, unknown> | undefined
+): { quality: SkillContentQuality | undefined; warnings: string[] } {
+  if (!raw || typeof raw !== "object") return { quality: undefined, warnings: [] };
+
+  const result: SkillContentQuality = {};
+  const warnings: string[] = [];
+
+  if ("citation_required_for" in raw && Array.isArray(raw.citation_required_for)) {
+    const valid = raw.citation_required_for.filter((v: unknown) =>
+      (VALID_CITATION_LEVELS as readonly string[]).includes(String(v))
+    );
+    const invalid = raw.citation_required_for.filter((v: unknown) =>
+      !(VALID_CITATION_LEVELS as readonly string[]).includes(String(v))
+    );
+    if (invalid.length > 0) {
+      warnings.push(`Invalid citation_required_for values: ${invalid.join(", ")}`);
+    }
+    if (valid.length > 0) result.citation_required_for = valid as ("critical" | "major" | "minor")[];
+  }
+
+  if ("min_citation_coverage" in raw) {
+    const num = Number(raw.min_citation_coverage);
+    if (!isNaN(num) && num >= 0 && num <= 1) {
+      result.min_citation_coverage = num;
+    } else {
+      warnings.push(`Invalid min_citation_coverage: "${raw.min_citation_coverage}" (must be 0.0-1.0)`);
+    }
+  }
+
+  if ("disclosure_required" in raw) result.disclosure_required = Boolean(raw.disclosure_required);
+  if ("refresh_cadence_days" in raw) {
+    const num = Number(raw.refresh_cadence_days);
+    if (!isNaN(num) && num > 0) result.refresh_cadence_days = num;
+  }
+
+  return {
+    quality: Object.keys(result).length > 0 ? result : undefined,
+    warnings,
+  };
+}
+
 /**
  * Normalize skill metadata from frontmatter (handles snake_case / camelCase variants)
  */
diff --git a/packages/skills/src/types.ts b/packages/skills/src/types.ts
index 61820bc9..a8ad8a79 100644
--- a/packages/skills/src/types.ts
+++ b/packages/skills/src/types.ts
@@ -132,6 +132,9 @@ export interface SkillDefinition {
    * instead of relying solely on llmModelId/defaultModel.
    */
   executionPolicy?: SkillExecutionPolicyConfig;
+
+  /** Content quality constraints for citation-gated publishing */
+  contentQuality?: SkillContentQuality;
 }
 
 /**
@@ -183,6 +186,44 @@ export interface SkillExecutionPolicyConfig {
 
   /** Fallback behavior: "error" | "use_default" */
   fallbackPolicy?: "error" | "use_default";
+
+  // --- Spec 038: Citation-gated content quality fields ---
+
+  /** Whether this skill requires web search grounding for citations */
+  requires_web_search?: boolean;
+
+  /** Whether this skill requires citations on claims */
+  requires_citations?: boolean;
+
+  /** Whether this skill requires structured (JSON) output */
+  requires_structured_output?: boolean;
+
+  /** Hint for provider thinking/reasoning level */
+  thinking_level_hint?: "minimal" | "low" | "medium" | "high";
+
+  /** Output format hint for CMS integration */
+  output_format?: "cms_article" | "cms_review" | "markdown" | "json";
+
+  /** Hint for max tokens to request from the model */
+  max_tokens_hint?: number;
+}
+
+/**
+ * Content quality constraints for citation-gated publishing.
+ * Declared in skill.md frontmatter under `content_quality:`.
+ */
+export interface SkillContentQuality {
+  /** Claim severity levels that require citations */
+  citation_required_for?: ("critical" | "major" | "minor")[];
+
+  /** Minimum fraction of claims that must have citations (0.0 - 1.0) */
+  min_citation_coverage?: number;
+
+  /** Whether the output must include a disclosure statement */
+  disclosure_required?: boolean;
+
+  /** How often (days) this content should be refreshed. null = never */
+  refresh_cadence_days?: number;
 }
 
 /**
@@ -228,6 +269,9 @@ export interface SkillMetadata {
   requires_browser?: boolean;
   max_runtime_seconds?: number;
   max_input_mb?: number;
+  // Content quality constraints (Spec 038)
+  content_quality?: SkillContentQuality;
+  contentQuality?: SkillContentQuality;
 }
 
 export interface SkillDetectionResult {
