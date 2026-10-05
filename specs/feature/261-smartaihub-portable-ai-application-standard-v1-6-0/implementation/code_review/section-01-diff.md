diff --git a/packages/spaas-standard/package.json b/packages/spaas-standard/package.json
new file mode 100644
index 000000000..c6ac3888d
--- /dev/null
+++ b/packages/spaas-standard/package.json
@@ -0,0 +1,20 @@
+{
+  "name": "@smartspec/spaas-standard",
+  "version": "0.1.0",
+  "private": true,
+  "type": "module",
+  "main": "./src/index.ts",
+  "types": "./src/index.ts",
+  "exports": {
+    ".": {
+      "types": "./src/index.ts",
+      "import": "./src/index.ts"
+    }
+  },
+  "scripts": {
+    "test": "vitest run --config vitest.config.ts"
+  },
+  "devDependencies": {
+    "vitest": "^4.1.11"
+  }
+}
diff --git a/packages/spaas-standard/src/index.ts b/packages/spaas-standard/src/index.ts
new file mode 100644
index 000000000..2c6dc2f63
--- /dev/null
+++ b/packages/spaas-standard/src/index.ts
@@ -0,0 +1,35 @@
+export {
+  DEFAULT_VALIDATION_LIMITS,
+  DIAGNOSTIC_CODES,
+  STAGE_STATUSES,
+  VALIDATION_STAGES,
+  VALIDATION_STATUSES,
+} from "./model";
+export type {
+  CanonicalPackage,
+  Diagnostic,
+  DiagnosticCode,
+  DiagnosticSeverity,
+  ContextNeededValidationReport,
+  DependencyEdge,
+  FailedStageResult,
+  InvalidValidationReport,
+  ManifestExtension,
+  ManifestParseFailure,
+  ManifestParseResult,
+  ManifestParseSuccess,
+  ManifestSupportContext,
+  PackageEntry,
+  SpaasManifest,
+  SpaasValidationLimits,
+  SpaasValidationLimitOverrides,
+  PackageDigestMetadata,
+  PassedStageResult,
+  StageResult,
+  StageStatus,
+  ValidationReport,
+  ValidationStage,
+  ValidationStatus,
+  ValidValidationReport,
+  UnevaluatedStageResult,
+} from "./model";
diff --git a/packages/spaas-standard/src/model.ts b/packages/spaas-standard/src/model.ts
new file mode 100644
index 000000000..c47801251
--- /dev/null
+++ b/packages/spaas-standard/src/model.ts
@@ -0,0 +1,239 @@
+export const VALIDATION_STAGES = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"] as const;
+
+export type ValidationStage = (typeof VALIDATION_STAGES)[number];
+
+export const STAGE_STATUSES = ["passed", "failed", "not_evaluated"] as const;
+export type StageStatus = (typeof STAGE_STATUSES)[number];
+
+export const VALIDATION_STATUSES = ["valid", "invalid", "needs_context"] as const;
+export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];
+
+export const DIAGNOSTIC_CODES = [
+  "MANIFEST_SYNTAX_INVALID", "MANIFEST_DUPLICATE_KEY", "MANIFEST_DOCUMENT_INVALID",
+  "MANIFEST_SCHEMA_INVALID", "MANIFEST_API_UNSUPPORTED", "MANIFEST_SCHEMA_UNSUPPORTED",
+  "MANIFEST_FEATURE_UNSUPPORTED", "MANIFEST_OPTIONAL_FEATURE_UNSAFE", "MANIFEST_EXTENSION_UNSUPPORTED",
+  "MANIFEST_EXTENSION_CONFLICT", "MANIFEST_SECURITY_OVERRIDE", "MANIFEST_LIMIT_EXCEEDED",
+  "PACKAGE_PATH_INVALID", "PACKAGE_PATH_COLLISION", "PACKAGE_ENTRY_INVALID", "PACKAGE_LIMIT_EXCEEDED",
+  "PACKAGE_REFERENCE_MISSING", "COMPONENT_ID_DUPLICATE", "COMPONENT_KIND_UNKNOWN", "PACKAGE_SECTION_INVALID",
+  "DEPENDENCY_INVALID", "DEPENDENCY_UNRESOLVED", "DEPENDENCY_CYCLE", "DEPENDENCY_LIMIT_EXCEEDED",
+  "SECRET_EMBEDDED", "SECRET_SENSITIVE_PATH", "SECRET_SCAN_LIMIT_EXCEEDED", "SECRET_SCAN_INPUT_INVALID",
+  "DIGEST_INPUT_INVALID", "DIGEST_LIMIT_EXCEEDED", "DIGEST_EXCLUSION_UNSUPPORTED",
+  "VALIDATION_CONTEXT_MISSING", "VALIDATION_EVIDENCE_INVALID", "VALIDATION_PREREQUISITE_UNMET",
+] as const;
+
+export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];
+
+export type DiagnosticSeverity = "error" | "warning" | "info";
+
+/** A safe, stable finding. `message` must never contain package bytes or matched secret material. */
+export interface Diagnostic {
+  readonly code: DiagnosticCode;
+  readonly severity: DiagnosticSeverity;
+  readonly stage: ValidationStage;
+  readonly location: string;
+  readonly message: string;
+}
+
+export interface PassedStageResult {
+  readonly stage: ValidationStage;
+  readonly status: "passed";
+  readonly mandatory: boolean;
+  readonly diagnostics: readonly Diagnostic[];
+}
+
+export interface FailedStageResult {
+  readonly stage: ValidationStage;
+  readonly status: "failed";
+  readonly mandatory: boolean;
+  readonly diagnostics: readonly Diagnostic[];
+}
+
+export interface UnevaluatedStageResult {
+  readonly stage: ValidationStage;
+  readonly status: "not_evaluated";
+  readonly mandatory: boolean;
+  readonly reason: string;
+  readonly diagnostics: readonly Diagnostic[];
+}
+
+export type StageResult = PassedStageResult | FailedStageResult | UnevaluatedStageResult;
+
+type ValidStageResult<S extends ValidationStage> =
+  | (PassedStageResult & { readonly stage: S })
+  | (UnevaluatedStageResult & { readonly stage: S; readonly mandatory: false });
+type AllValidationStages = readonly [
+  StageResult & { readonly stage: "V1" },
+  StageResult & { readonly stage: "V2" },
+  StageResult & { readonly stage: "V3" },
+  StageResult & { readonly stage: "V4" },
+  StageResult & { readonly stage: "V5" },
+  StageResult & { readonly stage: "V6" },
+  StageResult & { readonly stage: "V7" },
+  StageResult & { readonly stage: "V8" },
+];
+type AllValidValidationStages = readonly [
+  ValidStageResult<"V1">, ValidStageResult<"V2">, ValidStageResult<"V3">, ValidStageResult<"V4">,
+  ValidStageResult<"V5">, ValidStageResult<"V6">, ValidStageResult<"V7">, ValidStageResult<"V8">,
+];
+
+export interface ValidValidationReport {
+  readonly status: "valid";
+  readonly profile: string;
+  /** Fixed order V1 through V8; mandatory checks cannot be unevaluated or failed. */
+  readonly stages: AllValidValidationStages;
+  readonly diagnostics: readonly Diagnostic[];
+}
+
+export interface InvalidValidationReport {
+  readonly status: "invalid";
+  readonly profile: string;
+  readonly stages: AllValidationStages;
+  readonly failedRequiredStage: FailedStageResult & { readonly mandatory: true };
+  readonly diagnostics: readonly Diagnostic[];
+}
+
+export interface ContextNeededValidationReport {
+  readonly status: "needs_context";
+  readonly profile: string;
+  readonly stages: AllValidationStages;
+  readonly missingRequiredStage: UnevaluatedStageResult & { readonly mandatory: true };
+  readonly diagnostics: readonly Diagnostic[];
+}
+
+export type ValidationReport = ValidValidationReport | InvalidValidationReport | ContextNeededValidationReport;
+
+export interface ManifestExtension {
+  readonly namespace: string;
+  readonly version: string;
+  readonly schema?: string;
+  readonly criticality: "required" | "optional" | "advisory" | "security_critical";
+  readonly config: Readonly<Record<string, unknown>>;
+  readonly fallback?: Readonly<{ policy: string; preservesSemantics: boolean }>;
+}
+
+export interface ManifestSupportContext {
+  readonly supportedApiVersions: readonly string[];
+  readonly supportedSchemaVersions: readonly string[];
+  readonly supportedRequiredFeatures: readonly string[];
+  readonly supportedOptionalFeatures: readonly string[];
+  readonly extensions: readonly {
+    readonly namespace: string;
+    readonly versions: readonly string[];
+    readonly criticalities: readonly ManifestExtension["criticality"][];
+  }[];
+}
+
+export interface SpaasManifest {
+  readonly apiVersion: string;
+  readonly kind: "AIApplication";
+  readonly metadata: Readonly<{
+    id: string;
+    name: string;
+    slug: string;
+    version: string;
+    description?: string;
+    labels?: Readonly<Record<string, string>>;
+    annotations?: Readonly<Record<string, string>>;
+  }>;
+  readonly compatibility: Readonly<{
+    minimumPlatformVersion: string;
+    manifestSchema: string;
+    requiredFeatures?: readonly string[];
+    optionalFeatures?: readonly string[];
+  }>;
+  readonly application: Readonly<Record<string, unknown>>;
+  readonly components: readonly Readonly<Record<string, unknown>>[];
+  readonly requires?: Readonly<Record<string, unknown>>;
+  readonly security?: Readonly<Record<string, unknown>>;
+  readonly privacy?: Readonly<Record<string, unknown>>;
+  readonly extensions?: readonly ManifestExtension[];
+  /** Safe unknown optional values retained separately from trusted core fields. */
+  readonly preservedOptional?: Readonly<Record<string, unknown>>;
+}
+
+export interface PackageEntry {
+  /** Untrusted logical relative name; canonical identity is assigned by the structural validator. */
+  readonly path: string;
+  readonly bytes: Uint8Array;
+  readonly kind: "file";
+}
+
+export interface CanonicalPackage {
+  readonly manifest: SpaasManifest;
+  readonly entries: readonly PackageEntry[];
+  readonly dependencies: readonly DependencyEdge[];
+  readonly digest?: PackageDigestMetadata;
+  readonly provenance: Readonly<{
+    schemaVersion: string;
+    parserVersion: string;
+    normalizationVersion: string;
+    profile: string;
+  }>;
+}
+
+export type DependencyEdge =
+  | Readonly<{ kind: "component"; from: string; to: string; required: boolean; versionRange?: string; immutable?: boolean }>
+  | Readonly<{ kind: "capability"; from: string; to: string; required: boolean; versionRange?: string }>;
+
+export interface PackageDigestMetadata {
+  readonly algorithm: "sha256";
+  readonly version: "spaas-package-v1";
+  readonly value: string;
+  readonly includedPaths: readonly string[];
+  readonly excludedPaths: readonly Readonly<{ path: string; reason: string }>[];
+}
+
+export interface ManifestParseSuccess {
+  readonly ok: true;
+  readonly manifest: SpaasManifest;
+}
+
+export interface ManifestParseFailure {
+  readonly ok: false;
+  readonly diagnostics: readonly Diagnostic[];
+}
+
+export type ManifestParseResult = ManifestParseSuccess | ManifestParseFailure;
+
+/** Positive safe integer ceilings. Every ceiling is inclusive; overrides may only lower defaults. */
+export interface SpaasValidationLimits {
+  /** Maximum UTF-8 manifest bytes. */
+  readonly manifestBytes: number;
+  /** Maximum nested YAML collections. */
+  readonly yamlDepth: number;
+  /** Maximum YAML scalar, sequence, and mapping nodes. */
+  readonly yamlNodes: number;
+  /** Maximum regular package entries. */
+  readonly packageEntries: number;
+  /** Maximum bytes in one package entry. */
+  readonly entryBytes: number;
+  /** Maximum aggregate bytes across entries. */
+  readonly aggregateBytes: number;
+  /** Maximum segments in a canonical relative path. */
+  readonly pathDepth: number;
+  /** Maximum UTF-8 bytes in one canonical path. */
+  readonly pathBytes: number;
+  /** Maximum dependency graph vertices. */
+  readonly graphNodes: number;
+  /** Maximum dependency graph edges. */
+  readonly graphEdges: number;
+  /** Maximum bytes scanned for embedded secrets. */
+  readonly scanBytes: number;
+}
+
+export type SpaasValidationLimitOverrides = Partial<SpaasValidationLimits>;
+
+/** Inclusive ceilings; a value equal to the limit is allowed. */
+export const DEFAULT_VALIDATION_LIMITS: Readonly<SpaasValidationLimits> = Object.freeze({
+  manifestBytes: 4 * 1024 * 1024,
+  yamlDepth: 64,
+  yamlNodes: 100_000,
+  packageEntries: 10_000,
+  entryBytes: 32 * 1024 * 1024,
+  aggregateBytes: 256 * 1024 * 1024,
+  pathDepth: 32,
+  pathBytes: 1024,
+  graphNodes: 20_000,
+  graphEdges: 100_000,
+  scanBytes: 64 * 1024 * 1024,
+});
diff --git a/packages/spaas-standard/tests/package-contract.test.ts b/packages/spaas-standard/tests/package-contract.test.ts
new file mode 100644
index 000000000..0b8d2e291
--- /dev/null
+++ b/packages/spaas-standard/tests/package-contract.test.ts
@@ -0,0 +1,72 @@
+import { readFile } from "node:fs/promises";
+import { describe, expect, it } from "vitest";
+import {
+  DEFAULT_VALIDATION_LIMITS,
+  DIAGNOSTIC_CODES,
+  STAGE_STATUSES,
+  VALIDATION_STAGES,
+  VALIDATION_STATUSES,
+} from "../src/index";
+
+const packageRoot = new URL("../", import.meta.url);
+
+describe("SPAAS package contract", () => {
+  it("declares the workspace identity and ESM public entrypoint", async () => {
+    const pkg = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));
+    expect(pkg.name).toBe("@smartspec/spaas-standard");
+    expect(pkg.type).toBe("module");
+    expect(pkg.exports["."].import).toBe("./src/index.ts");
+    expect(pkg.scripts.test).toContain("vitest run");
+  });
+
+  it("exports a fixed ordered set of all eight validation stages", () => {
+    expect(VALIDATION_STAGES).toEqual(["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"]);
+    expect(STAGE_STATUSES).toEqual(["passed", "failed", "not_evaluated"]);
+    expect(VALIDATION_STATUSES).toEqual(["valid", "invalid", "needs_context"]);
+    expect(DIAGNOSTIC_CODES).toContain("SECRET_EMBEDDED");
+    expect(DIAGNOSTIC_CODES).toContain("DEPENDENCY_CYCLE");
+  });
+
+  it("provides finite positive inclusive resource bounds", () => {
+    for (const limit of Object.values(DEFAULT_VALIDATION_LIMITS)) {
+      expect(Number.isSafeInteger(limit)).toBe(true);
+      expect(limit).toBeGreaterThan(0);
+      expect(Number.isFinite(limit)).toBe(true);
+    }
+    expect(DEFAULT_VALIDATION_LIMITS.entryBytes).toBeLessThanOrEqual(DEFAULT_VALIDATION_LIMITS.aggregateBytes);
+  });
+
+  it("defines safe diagnostics and discriminated validation contracts", async () => {
+    const source = await readFile(new URL("src/model.ts", packageRoot), "utf8");
+    expect(source).toContain('readonly reason: string');
+    expect(source).toContain('readonly status: "valid"');
+    expect(source).toContain('readonly status: "invalid"');
+    expect(source).toContain('readonly status: "needs_context"');
+    expect(source).toContain('readonly failedRequiredStage: FailedStageResult & { readonly mandatory: true }');
+    expect(source).toContain('readonly missingRequiredStage: UnevaluatedStageResult & { readonly mandatory: true }');
+    expect(source).toContain("type SpaasValidationLimitOverrides = Partial<SpaasValidationLimits>");
+    expect(source).not.toContain("function resolveValidationLimits");
+    expect(source).not.toContain("rawManifest");
+    expect(source).not.toContain("secretValue");
+  });
+
+  it("contains no retired-system imports or runtime/app coupling", async () => {
+    const { readdir } = await import("node:fs/promises");
+    const paths = ["src/index.ts", "src/model.ts", "package.json"];
+    const scan = async (dir: string): Promise<string[]> => {
+      const entries = await readdir(new URL(dir, packageRoot), { withFileTypes: true });
+      const found: string[] = [];
+      for (const entry of entries) {
+        const relative = `${dir}/${entry.name}`;
+        if (entry.isDirectory()) found.push(...(await scan(relative)));
+        else if (entry.name.endsWith(".ts") || entry.name === "package.json") found.push(relative);
+      }
+      return found;
+    };
+    const sourceFiles = [...new Set([...paths, ...(await scan("src"))])];
+    for (const path of sourceFiles) {
+      const source = await readFile(new URL(path, packageRoot), "utf8");
+      expect(source).not.toMatch(/(?:from\s+|import\s*\()["'][^"']*(?:apps\/web|agency|work\/request|workpacks|sandbox_jobs|opensandbox|docker|routers\/|database|runtime-adapter)/i);
+    }
+  });
+});
diff --git a/packages/spaas-standard/tsconfig.json b/packages/spaas-standard/tsconfig.json
new file mode 100644
index 000000000..5a24989cd
--- /dev/null
+++ b/packages/spaas-standard/tsconfig.json
@@ -0,0 +1,8 @@
+{
+  "extends": "../../tsconfig.base.json",
+  "compilerOptions": {
+    "outDir": "dist",
+    "rootDir": "src"
+  },
+  "include": ["src"]
+}
diff --git a/packages/spaas-standard/vitest.config.ts b/packages/spaas-standard/vitest.config.ts
new file mode 100644
index 000000000..faa6d98e1
--- /dev/null
+++ b/packages/spaas-standard/vitest.config.ts
@@ -0,0 +1,8 @@
+import { defineConfig } from "vitest/config";
+
+export default defineConfig({
+  test: {
+    environment: "node",
+    include: ["tests/**/*.test.ts"],
+  },
+});
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index 75e73e49f..14711f90f 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -893,6 +893,12 @@ importers:
         specifier: ^4.0.9
         version: 4.0.9

+  packages/spaas-standard:
+    devDependencies:
+      vitest:
+        specifier: ^4.1.11
+        version: 4.1.11(@opentelemetry/api@1.9.1)(@types/node@24.13.3)(@vitest/coverage-v8@4.1.11)(happy-dom@20.10.6)(jsdom@28.1.0(@noble/hashes@1.8.0))(vite@7.3.6(@types/node@24.13.3)(jiti@2.7.0)(lightningcss@1.32.0)(terser@5.49.0)(tsx@4.23.0))
+
   packages/ui:
     dependencies:
       '@hookform/resolvers':
diff --git a/specs/feature/261-smartaihub-portable-ai-application-standard-v1-6-0/sections/section-01-package-contract.md b/specs/feature/261-smartaihub-portable-ai-application-standard-v1-6-0/sections/section-01-package-contract.md
new file mode 100644
index 000000000..f556f80a3
--- /dev/null
+++ b/specs/feature/261-smartaihub-portable-ai-application-standard-v1-6-0/sections/section-01-package-contract.md
@@ -0,0 +1,99 @@
+# Section 01 — Package Contract
+
+## Purpose and boundary
+
+Create the standalone ESM workspace package that is the public, pure TypeScript boundary for Spec 261 Phase A: `@smartspec/spaas-standard` in `packages/spaas-standard`. This section establishes stable exports, model types, diagnostics, limits, and package test plumbing before schema parsing or filesystem/package validation exists.
+
+The package represents an untrusted SPAAS application artifact. It must never execute package files, import package modules, invoke scripts, contact providers, persist data, or depend on `apps/web`, runtime adapters, routers, database code, registry/lifecycle services, or retired systems. A directory called `workflows/` is inert package input only.
+
+This section deliberately does not implement manifest schemas/parsing, path inventory, graph validation, secret scanning, digesting, or V1–V8 composition. Those belong to dependent sections.
+
+## Ownership
+
+Create or modify only the package-contract surfaces below:
+
+| File | Responsibility |
+| --- | --- |
+| `packages/spaas-standard/package.json` | Workspace identity, ESM entrypoints, focused test script, and only existing workspace-compatible dependencies. |
+| `packages/spaas-standard/tsconfig.json` | Minimal package TypeScript configuration aligned with repository ESM conventions. |
+| `packages/spaas-standard/src/model.ts` | Public contract types, stable diagnostic vocabulary, result/status types, immutable package-input types, and named resource limits. |
+| `packages/spaas-standard/src/index.ts` | Curated stable public exports only. |
+| `packages/spaas-standard/tests/package-contract.test.ts` | Test-first coverage for package metadata and public-contract invariants. |
+
+Do not create a CLI in this section. Do not add a package-local copy of Zod, YAML, Vitest, or unrelated tooling when a workspace-provided dependency/configuration can be used.
+
+## Tests first
+
+Write `packages/spaas-standard/tests/package-contract.test.ts` before the production files it proves. The suite must cover the following observable contract:
+
+1. The package resolves as `@smartspec/spaas-standard`, declares ESM behavior, and its supported public entrypoint resolves to `src/index.ts` according to local workspace conventions.
+2. The entrypoint exposes the stable public contract types and values needed by later sections, without exposing implementation-private module paths as the supported API.
+3. Importing the entrypoint is side-effect free: it performs no filesystem enumeration, network access, provider call, process execution, or package-content execution.
+4. Package source and metadata do not introduce imports/callers for app routers, DB/persistence, runtime execution, provider adapters, Agency, `work/request`, `workpacks`, the legacy `/workflows` engine, OpenSandbox, `sandbox_jobs`, or Docker/OpenSandbox dispatch.
+5. Diagnostic objects can represent a stable machine-readable code, severity, validation stage, JSON-pointer-like location, and non-sensitive explanation; no type requires raw manifest text, source snippets, or secret values.
+6. Stage status is restricted to `passed`, `failed`, and `not_evaluated`; an overall result can distinguish `valid`, `invalid`, and `needs_context` without treating missing context as success.
+7. Package input and model types accept caller-supplied package entries and explicit compatibility/limit context; they do not require filesystem authority, a database, network credentials, or a runtime object.
+8. Named default limits and documented override shape exist for parser/inventory/scan consumers. Their contract permits bounded byte, node/depth, entry-count, per-entry-byte, aggregate-byte, graph, and scan workloads; values are finite positive integers and callers cannot disable limits through zero, negative, `NaN`, or infinity values.
+
+Keep the tests focused and package-scoped. The eventual command is `pnpm --filter @smartspec/spaas-standard test`; do not run a repository-wide typecheck.
+
+## Public contract design
+
+Implement the following type families in `src/model.ts`. Field-only interfaces/types and constants are appropriate; no implementation algorithms belong here.
+
+### Manifest and compatibility types
+
+- A `SpaasManifest` canonical manifest type with typed core identity/version fields and explicit containers for the package portions Phase A must inspect: metadata, compatibility, components, declared package sections, requirements, security/privacy declarations, and extensions.
+- The canonical model must preserve only extension/optional data whose omission is explicitly safe. Its type must carry preserved extension data separately from known core fields so unknown fields cannot silently become trusted core semantics.
+- `ManifestSupportContext` (or equivalent) must make supported API/schema versions, supported required/optional features, known extension namespaces/versions, and extension criticality support explicit inputs. It must not imply a provider, registry, or remote capability is available.
+- Model an extension declaration with namespace, version/schema identity, criticality (`required`, `optional`, `advisory`, or `security_critical`), configuration payload, and an explicit safe-omission/fallback assertion where optional preservation is requested.
+
+### Package input and canonical-model types
+
+- `PackageEntry` represents caller-provided untrusted content using a relative path and bytes, plus only non-authoritative metadata required for Phase A classification. It must not accept an executable callback, stream with ambient authority, host absolute path as canonical identity, or filesystem handle.
+- `CanonicalPackage` represents immutable validated/canonical state: canonical manifest, normalized entries, typed declared component/capability dependency edges, optional digest metadata, and validation provenance. Later sections populate those values through this contract.
+- Provide a small provenance type that can identify schema/parser/normalization contract versions and selected validation profile without claiming external checks occurred.
+
+### Diagnostics and validation result types
+
+- Define a finite string-union or readonly catalog for stable Phase A diagnostic codes. Reserve code groups for parser/schema, compatibility/extension, package path/structure, dependency, security/secret, digest, resource limit, and unavailable context. Codes must be stable and machine-readable; explanatory text is separate.
+- `Diagnostic` must include `code`, `severity` (`error`, `warning`, `info`), `stage`, normalized `location`, and a safe human explanation. Optional structured metadata must be an allowlisted, non-secret-safe record; never make raw matched input, YAML exception dumps, package bytes, stack traces, or credentials part of the public diagnostic contract.
+- Define `ValidationStage` as V1 through V8 and `StageResult` with only `passed`, `failed`, or `not_evaluated`, ordered diagnostics, and a stable context/unblock reason for `not_evaluated`.
+- Define `ValidationReport` / overall status so a required failure is `invalid`; a required unevaluated stage is `needs_context`; `valid` is reachable only when all required selected checks pass. These are contract definitions only; section 07 composes the report.
+- Define parser/result discriminated unions that make a successful canonical manifest mutually exclusive with failure diagnostics. Preserve source-format-neutral errors and avoid a thrown raw-parser-error API.
+
+### Limits
+
+Export named, readonly defaults plus a narrow `SpaasValidationLimits` override type. Later sections use these limits for manifest byte size, YAML nesting/node count, package entry count, per-entry and aggregate bytes, graph nodes/edges, and text scan bytes. Document each unit and inclusive boundary in comments. Merge/validation behavior belongs to the consuming parser/inventory/scan code, but this section must make every security/resource bound addressable and versionable.
+
+## Implementation steps
+
+1. Inspect root workspace/package conventions and create the smallest `packages/spaas-standard` ESM package metadata that pnpm recognizes. Keep `main`/`types`/exports aligned with the repository pattern of source TypeScript ESM packages.
+2. Create `src/model.ts` with the stable, field-only public types and readonly constants described above. Use `readonly` properties/collections where practical so the canonical model cannot be accidentally mutated after later validation succeeds.
+3. Create `src/index.ts` as the only supported public surface. Re-export model contracts intentionally; do not use a broad wildcard that would accidentally make future internal helpers public.
+4. Add the contract tests first, then write the minimum metadata/types/entrypoint necessary to make them pass.
+5. Confirm no dependency was added unless existing workspace packages cannot supply it. Schema/parser dependencies, if needed later, are introduced by Section 02 with the same constraint.
+
+## Acceptance criteria
+
+- `pnpm --filter @smartspec/spaas-standard test` can discover and run the focused contract suite once later test configuration is in place.
+- The package is a pure ESM workspace boundary with no app, database, runtime, provider, or retired-system coupling.
+- All downstream sections have stable types for manifests, input entries, extensions/features, diagnostics, limits, stage results, and canonical-package provenance.
+- Diagnostics and result states make it impossible for callers to confuse unavailable external context with a passed check, or to require raw/secret input in returned errors.
+- Resource bounds are named and typed before untrusted input is parsed or scanned.
+
+## Dependencies and handoff
+
+This is the first section and has no implementation dependency. Freeze exported names, diagnostic/stage semantics, and limits before Section 02 begins. Section 02 owns schema and parser behavior and consumes `SpaasManifest`, `ManifestSupportContext`, parser-result types, diagnostics, and parser limits from this section. Sections 03–07 consume the remaining package/diagnostic/stage contracts.
+
+## Verification boundary
+
+Run only the focused package test command and lightweight checks such as `git diff --check` after implementation. Do not run `npm run typecheck`, a repository-wide typecheck/build, browser/E2E suite, provider call, runtime execution, registry check, migration, or deployment as evidence for this section.
+
+## Implementation result
+
+- Created the ESM package metadata, package-local Vitest config, TypeScript config, model contracts, curated entrypoint and package contract tests.
+- Added fixed stage/status catalogs, stable diagnostic-code catalog, typed manifest/package/result contracts and finite inclusive resource limits.
+- Verification: `pnpm --filter @smartspec/spaas-standard test` — 1 file / 5 tests passed; `git diff --check` passed for the package and this section file.
+- Deviation: declared Vitest as a package-local development dependency so the standalone package test script resolves under pnpm filtering; Vitest is already present in the monorepo.
+- Review fixes: constrained `valid` reports to eight ordered stage results with no mandatory failure/unevaluated result; made missing-context reasons mandatory; added typed required/optional feature support, typed dependency/digest metadata, a partial limit-override type, broader retired-system and contract guards, and the package lockfile importer. Limit merge/runtime validation remains with consuming validators per this section's contract-only boundary.
