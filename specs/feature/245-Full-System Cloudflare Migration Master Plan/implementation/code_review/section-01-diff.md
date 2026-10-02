diff --git a/apps/web/package.json b/apps/web/package.json
index ec28a5c41..914311ff4 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -85,6 +85,7 @@
     "verify:cloudflare-local-readiness": "tsx scripts/verify-cloudflare-local-readiness.ts",
     "verify:cloudflare-target-readiness": "tsx scripts/verify-cloudflare-target-readiness.ts",
     "verify:cloudflare-runtime-target": "tsx scripts/verify-cloudflare-runtime-target.ts",
+    "smartaihub:migrate": "tsx scripts/smartaihub-migrate.ts",
     "verify:feature-192": "tsx scripts/verify-feature-192.ts",
     "verify:feature-192:focused": "tsx scripts/verify-feature-192-focused.ts",
     "inventory:feature-188": "tsx server/scripts/inventory-feature-188.ts",
diff --git a/apps/web/scripts/__tests__/cloudflare-migration-compiler.test.ts b/apps/web/scripts/__tests__/cloudflare-migration-compiler.test.ts
new file mode 100644
index 000000000..1c6a3a5a9
--- /dev/null
+++ b/apps/web/scripts/__tests__/cloudflare-migration-compiler.test.ts
@@ -0,0 +1,280 @@
+import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
+import { tmpdir } from "node:os";
+import { join } from "node:path";
+
+import { afterEach, describe, expect, it } from "vitest";
+import { runMigrationCommand } from "../cloudflare-migration/compiler";
+
+const tempRoots: string[] = [];
+
+async function fixtureRoot() {
+  const root = await mkdtemp(join(tmpdir(), "smartaihub-migration-"));
+  tempRoots.push(root);
+  const manifestPath = join(root, "input.json");
+  const outputDir = join(root, "migration");
+  const manifest = {
+    schemaVersion: 1,
+    observedAt: "2026-09-28T00:00:00.000Z",
+    environment: "local",
+    retirementClaim: false,
+    inventoryEvidence: {
+      hostProcessInventoryComplete: false,
+      runtimeTrafficVerified: false,
+      targetAccountProof: false,
+      productionProof: false,
+    },
+    reconciledSignals: [{ path: "apps/web/server/index.ts", line: 1, code: "TIMER_OR_SCHEDULE", disposition: "infrastructure", owner: "platform", evidence: "reviewed fixture: timer is a no-op" }],
+    sourceRoots: ["apps/web/server", "python-backend/app"],
+    components: [
+      {
+        id: "api",
+        name: "API service",
+        kind: "service",
+        active: true,
+        owner: "platform",
+        sourcePaths: ["apps/web/server/index.ts"],
+        dependsOn: [],
+        requestedPlacement: "WORKERS_WITH_REFACTOR",
+        evidence: { methodRuntimeProbePassed: true, bundlePassed: true },
+        requiredRefactors: ["replace node-only API"],
+        networkEgress: ["postgres"],
+        filesystemDependencies: [],
+        secretBindingNames: ["CLOUDFLARE_SEARCH_CACHE_TOKEN"],
+        triggerInventoryComplete: true,
+        schedules: [],
+        triggers: [],
+      },
+      {
+        id: "media-job",
+        name: "Media generation operation",
+        kind: "business_job",
+        active: true,
+        owner: "media",
+        sourcePaths: ["python-backend/app/tasks/media_tasks.py"],
+        dependsOn: [],
+        requestedPlacement: "CONTAINER_REQUIRED",
+        evidence: { methodRuntimeProbePassed: true },
+        requiredRefactors: [],
+        networkEgress: ["provider-api"],
+        filesystemDependencies: ["temporary workspace"],
+        secretBindingNames: ["IMAGE_PROVIDER_SECRET"],
+        triggerInventoryComplete: true,
+        schedules: [],
+        triggers: [
+          {
+            id: "provider-callback",
+            kind: "callback",
+            businessEffect: true,
+            owner: "media",
+            canonicalWorkerJob: true,
+            outboxIntent: true,
+            persistedBeforeFirstSideEffect: true,
+          },
+        ],
+      },
+    ],
+  };
+  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
+  await mkdir(join(root, "apps/web/server"), { recursive: true });
+  await mkdir(join(root, "apps/web/server/__tests__"), { recursive: true });
+  await mkdir(join(root, "python-backend/app/tasks"), { recursive: true });
+  await writeFile(join(root, "apps/web/server/index.ts"), "setInterval(() => {}, 1000);\n", "utf8");
+  await writeFile(join(root, "apps/web/server/__tests__/ignored.test.ts"), "getRedisClient();\n", "utf8");
+  await writeFile(join(root, "python-backend/app/tasks/media_tasks.py"), "pass\n", "utf8");
+  await writeFile(join(root, ".env"), "SECRET_CANARY=should-not-be-read-or-emitted\n", "utf8");
+  return { root, manifestPath, outputDir, manifest };
+}
+
+afterEach(async () => {
+  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
+});
+
+describe("Spec 245 migration compatibility compiler", () => {
+  it.each(["inspect", "classify", "verify", "plan", "report"] as const)(
+    "%s emits deterministic, schema-complete artifacts from a bounded manifest",
+    async command => {
+      const fixture = await fixtureRoot();
+      const result = await runMigrationCommand({
+        command,
+        manifestPath: fixture.manifestPath,
+        rootPath: fixture.root,
+        outputDir: fixture.outputDir,
+      });
+
+      expect(result.exitCode).toBe(0);
+      expect(result.artifacts).toEqual(expect.arrayContaining([
+        "compatibility-inventory.json",
+        "dependency-graph.json",
+        "runtime-placement.yaml",
+        "required-refactors.yaml",
+        "migration-waves.yaml",
+        "secret-bindings.redacted.yaml",
+        "network-egress-map.yaml",
+        "filesystem-dependency-map.yaml",
+        "cron-service-map.yaml",
+        "compatibility-report.md",
+      ]));
+      const first = await Promise.all(result.artifacts.map(name => readFile(join(fixture.outputDir, name), "utf8")));
+      await runMigrationCommand({ command, manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+      const second = await Promise.all(result.artifacts.map(name => readFile(join(fixture.outputDir, name), "utf8")));
+      expect(second).toEqual(first);
+    },
+  );
+
+  it("keeps import or bundle-only compatibility claims blocked", async () => {
+    const fixture = await fixtureRoot();
+    fixture.manifest.components[0].evidence = { packageImportPassed: true, bundlePassed: true };
+    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
+
+    const result = await runMigrationCommand({ command: "classify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+
+    expect(result.components.find((component: any) => component.id === "api")?.primaryPlacement).toBe("BLOCKED");
+    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "RUNTIME_METHOD_EVIDENCE_REQUIRED", componentId: "api" }));
+  });
+
+  it("blocks full retirement for unknown owners or business effects before canonical job and outbox persistence", async () => {
+    const fixture = await fixtureRoot();
+    fixture.manifest.retirementClaim = true;
+    fixture.manifest.inventoryEvidence = {
+      hostProcessInventoryComplete: true,
+      runtimeTrafficVerified: true,
+      targetAccountProof: true,
+      productionProof: true,
+    };
+    fixture.manifest.components[1].triggers[0].outboxIntent = false;
+    fixture.manifest.components[1].triggers[0].persistedBeforeFirstSideEffect = false;
+    fixture.manifest.components.push({
+      ...fixture.manifest.components[0],
+      id: "unknown-callback",
+      owner: "",
+      requestedPlacement: undefined,
+      triggers: [{ id: "detached", kind: "in_process", businessEffect: true, owner: "", canonicalWorkerJob: false, outboxIntent: false, persistedBeforeFirstSideEffect: false }],
+    });
+    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
+
+    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+
+    expect(result.exitCode).toBe(1);
+    expect(result.blockers).toEqual(expect.arrayContaining([
+      expect.objectContaining({ code: "BACKGROUND_JOB_OUTBOX_REQUIRED", componentId: "media-job" }),
+      expect.objectContaining({ code: "COMPONENT_OWNER_REQUIRED", componentId: "unknown-callback" }),
+      expect.objectContaining({ code: "BACKGROUND_JOB_OUTBOX_REQUIRED", componentId: "unknown-callback" }),
+    ]));
+  });
+
+  it("does not emit secret values or execute hook-shaped input", async () => {
+    const fixture = await fixtureRoot();
+    const secretCanary = "migration-secret-canary-9c12f7";
+    const sideEffectMarker = join(fixture.root, "must-not-exist");
+    await runMigrationCommand({ command: "report", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+
+    const { readdir } = await import("node:fs/promises");
+    const names = await readdir(fixture.outputDir);
+    const output = (await Promise.all(names.map(name => readFile(join(fixture.outputDir, name), "utf8")))).join("\n");
+    expect(output).not.toContain(secretCanary);
+    expect(output).toContain("[REDACTED]");
+
+    fixture.manifest.lifecycleHook = `touch ${sideEffectMarker}`;
+    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
+    await expect(runMigrationCommand({ command: "report", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir }))
+      .rejects.toThrow("MIGRATION_MANIFEST_INVALID");
+    await expect(readFile(sideEffectMarker, "utf8")).rejects.toThrow();
+  });
+
+  it("reports candidate async/Redis signals without treating test files or environment files as runtime evidence", async () => {
+    const fixture = await fixtureRoot();
+    const result = await runMigrationCommand({ command: "inspect", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+    const inventory = JSON.parse(await readFile(join(fixture.outputDir, "compatibility-inventory.json"), "utf8"));
+
+    expect(inventory.scan.staticFindings).toContainEqual({ path: "apps/web/server/index.ts", line: 1, code: "TIMER_OR_SCHEDULE" });
+    expect(inventory.scan.staticFindings.some((finding: any) => finding.code === "REDIS_DEPENDENCY")).toBe(false);
+    expect(inventory.scan.discoveredFiles).not.toContain("apps/web/server/__tests__/ignored.test.ts");
+    expect(inventory.scan.discoveredFiles).not.toContain(".env");
+    expect(result.inventory.scan.staticFindingsBoundary).toContain("candidate-signals-only");
+  });
+
+  it("makes verify fail until every source signal is reconciled by an owner and evidence", async () => {
+    const fixture = await fixtureRoot();
+    fixture.manifest.reconciledSignals = [];
+    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
+
+    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+
+    expect(result.exitCode).toBe(1);
+    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "STATIC_SIGNAL_UNRECONCILED" }));
+    expect(result.blockers.filter(blocker => blocker.code === "STATIC_SIGNAL_UNRECONCILED")).toHaveLength(1);
+    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "STATIC_SIGNAL_UNRECONCILED", sourcePath: "apps/web/server/index.ts", sourceLine: 1, signalCode: "TIMER_OR_SCHEDULE" }));
+    expect(result.inventory.scan.staticFindings).toHaveLength(1);
+  });
+
+  it("requires business source signals to map to an active persisted worker job trigger", async () => {
+    const fixture = await fixtureRoot();
+    fixture.manifest.reconciledSignals = [{ path: "apps/web/server/index.ts", line: 1, code: "TIMER_OR_SCHEDULE", disposition: "business_job", owner: "media", evidence: "reviewed trigger", componentId: "media-job", triggerId: "missing-trigger" }];
+    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
+
+    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+
+    expect(result.exitCode).toBe(1);
+    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "STATIC_SIGNAL_JOB_MAPPING_UNVERIFIED", componentId: "media-job", triggerId: "missing-trigger" }));
+  });
+
+  it("fails verification when a declared source root is missing", async () => {
+    const fixture = await fixtureRoot();
+    fixture.manifest.sourceRoots = ["missing-runtime-source"];
+    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
+
+    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+
+    expect(result.exitCode).toBe(1);
+    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "SOURCE_SCAN_INCOMPLETE" }));
+  });
+
+  it("blocks missing trigger inventory and duplicate scheduler ownership", async () => {
+    const fixture = await fixtureRoot();
+    fixture.manifest.components[1].triggerInventoryComplete = false;
+    fixture.manifest.components[0].schedules = ["nightly-refresh"];
+    fixture.manifest.components[1].schedules = ["nightly-refresh"];
+    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
+
+    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+
+    expect(result.exitCode).toBe(1);
+    expect(result.blockers).toEqual(expect.arrayContaining([
+      expect.objectContaining({ code: "TRIGGER_INVENTORY_INCOMPLETE", componentId: "media-job" }),
+      expect.objectContaining({ code: "SCHEDULE_OWNER_DUPLICATE" }),
+    ]));
+
+    fixture.manifest.components[1].triggerInventoryComplete = true;
+    fixture.manifest.components[1].triggers = [];
+    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
+    const missingTrigger = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
+    expect(missingTrigger.blockers).toContainEqual(expect.objectContaining({ code: "BUSINESS_JOB_TRIGGER_REQUIRED", componentId: "media-job" }));
+  });
+
+  it("rejects manifest and output symlinks before reading or writing through them", async () => {
+    const fixture = await fixtureRoot();
+    const outside = await mkdtemp(join(tmpdir(), "smartaihub-migration-outside-"));
+    tempRoots.push(outside);
+    const outsideManifest = join(outside, "outside.json");
+    await writeFile(outsideManifest, JSON.stringify(fixture.manifest), "utf8");
+    await symlink(outsideManifest, join(fixture.root, "linked.json"));
+    await expect(runMigrationCommand({ command: "verify", manifestPath: "linked.json", rootPath: fixture.root, outputDir: fixture.outputDir }))
+      .rejects.toThrow("MANIFEST_PATH_SYMLINK");
+
+    await rm(fixture.outputDir, { recursive: true, force: true });
+    await symlink(outside, fixture.outputDir);
+    await expect(runMigrationCommand({ command: "report", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir }))
+      .rejects.toThrow("OUTPUT_PATH_SYMLINK");
+    await expect(readFile(join(outside, "compatibility-report.md"), "utf8")).rejects.toThrow();
+  });
+
+  it("rejects secret-like free text before emitting artifacts", async () => {
+    const fixture = await fixtureRoot();
+    fixture.manifest.components[0].owner = "sk_live_do_not_emit_1234567890";
+    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
+
+    await expect(runMigrationCommand({ command: "report", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir }))
+      .rejects.toThrow("MIGRATION_MANIFEST_SECRET_LIKE_TEXT");
+    await expect(readFile(join(fixture.outputDir, "compatibility-report.md"), "utf8")).rejects.toThrow();
+  });
+});
diff --git a/apps/web/scripts/cloudflare-migration/README.md b/apps/web/scripts/cloudflare-migration/README.md
new file mode 100644
index 000000000..79d00e4ba
--- /dev/null
+++ b/apps/web/scripts/cloudflare-migration/README.md
@@ -0,0 +1,28 @@
+# Spec 245 Compatibility Compiler
+
+The `smartaihub:migrate` command compiles an owner-maintained JSON evidence manifest into the artifacts named by Spec 245 §2.1. It is a local planning and verification tool; it does not deploy, contact Cloudflare, connect to production, execute package hooks, inspect secret files, or certify a production inventory.
+
+## Commands
+
+```bash
+npm --workspace @smartspec/web run smartaihub:migrate -- inspect --manifest ops/feature-245/compatibility-manifest.json
+npm --workspace @smartspec/web run smartaihub:migrate -- classify --manifest ops/feature-245/compatibility-manifest.json
+npm --workspace @smartspec/web run smartaihub:migrate -- verify --manifest ops/feature-245/compatibility-manifest.json
+npm --workspace @smartspec/web run smartaihub:migrate -- plan --manifest ops/feature-245/compatibility-manifest.json
+npm --workspace @smartspec/web run smartaihub:migrate -- report --manifest ops/feature-245/compatibility-manifest.json
+```
+
+Commands write the same deterministic artifact set to `migration/` by default; pass `--out-dir` to write elsewhere. `inspect` scans declared source roots for file paths and candidate source signals. It never emits matched source lines. Candidate findings require owner/runtime reconciliation and are not proof of live production callers. `verify` exits nonzero when blockers remain or a requested retirement claim lacks complete evidence.
+
+## Evidence rules
+
+- Start from [`compatibility-manifest.example.json`](../../../../ops/feature-245/compatibility-manifest.example.json); copy it to the governed manifest path and add facts only with a named owner and evidence timestamp.
+- Do not place secrets, credentials, personal data, or environment-file contents in the manifest. Secret bindings are names only; generated values are always `[REDACTED]`.
+- Package import or bundle success alone is not runtime compatibility evidence. A compatible placement requires a method-level runtime probe recorded by the owner.
+- Every bounded business operation triggered by detached async work, callbacks, scheduled occurrences, startup/reconciliation, or a long-lived listener must map to canonical `worker_jobs` and an outbox intent before its first side effect.
+- Every active component must set `triggerInventoryComplete` only after those trigger classes have been reviewed. Business job components require at least one trigger; source-scan findings in `verify` need an exact `{path,line,code}` reconciliation with owner and evidence. A `business_job` disposition must point to a declared active component trigger whose canonical job and outbox proof are all true.
+- Duplicate schedule identifiers across active components block verification. The command reports source path/line/rule for every unreconciled finding, while printing only the first 20 diagnostics to the terminal; the complete blocker list stays in `compatibility-inventory.json`.
+- Unknown processes, schedules, routes, side effects, or owners remain blocked. An empty or static-only scan cannot establish retirement readiness.
+- The source scanner skips environment/key files, generated directories, tests, and symlinks. It reads bounded source files only for candidate-pattern matching and records path/line/rule without source snippets.
+
+The generated files are local evidence artifacts. Target bindings, live provider behavior, production traffic, database restoration, and Debian retirement require separate current environment proof.
diff --git a/apps/web/scripts/cloudflare-migration/compiler.ts b/apps/web/scripts/cloudflare-migration/compiler.ts
new file mode 100644
index 000000000..5dfbad7b3
--- /dev/null
+++ b/apps/web/scripts/cloudflare-migration/compiler.ts
@@ -0,0 +1,603 @@
+import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
+import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
+import { z } from "zod";
+
+export const MIGRATION_ARTIFACT_NAMES = [
+  "compatibility-inventory.json",
+  "dependency-graph.json",
+  "runtime-placement.yaml",
+  "required-refactors.yaml",
+  "migration-waves.yaml",
+  "secret-bindings.redacted.yaml",
+  "network-egress-map.yaml",
+  "filesystem-dependency-map.yaml",
+  "cron-service-map.yaml",
+  "compatibility-report.md",
+] as const;
+
+const PLACEMENTS = new Set([
+  "WORKERS_NATIVE",
+  "WORKERS_WITH_REFACTOR",
+  "PYTHON_WORKER_NATIVE",
+  "CONTAINER_REQUIRED",
+  "RUNNER_REQUIRED",
+  "MANAGED_EXTERNAL",
+  "EDGE_PROXY_ONLY",
+  "DECOMMISSION",
+  "BLOCKED",
+]);
+const TRIGGER_KINDS = new Set([
+  "detached_async",
+  "callback",
+  "scheduled_occurrence",
+  "startup_reconciliation",
+  "long_lived_listener",
+  "queue_delivery",
+]);
+const DEFAULT_SOURCE_ROOTS = ["apps/web/server", "apps/cloudflare/src", "python-backend/app", "systemd", "docker"];
+const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", "test-results", "__pycache__", "generated", "test", "tests", "__tests__", "e2e"]);
+const SECRET_FILE = /^(\.env($|\.)|.*\.(pem|key|p12|pfx|keystore)$)/i;
+const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/i;
+const SOURCE_SIGNALS: Array<{ code: string; pattern: RegExp }> = [
+  { code: "DETACHED_ASYNC", pattern: /asyncio\.create_task\s*\(|(?:^|\s)create_task\s*\(/ },
+  { code: "TIMER_OR_SCHEDULE", pattern: /\bsetInterval\s*\(|\bsetTimeout\s*\(|\bbeat_schedule\b|\bcrontab\s*\(/ },
+  { code: "CALLBACK_OR_LISTENER", pattern: /\.on\s*\(\s*["'`]|\bsubscribe\s*\(/ },
+  { code: "QUEUE_OR_JOB_TRANSPORT", pattern: /\bBullMQ\b|from\s+["']bullmq["']|\bdispatch_python_task\s*\(|@job_task_registry\.task/ },
+  { code: "REDIS_DEPENDENCY", pattern: /\bgetRedisClient\s*\(|\bRedis\.from_url\s*\(|from\s+["'](?:ioredis|redis)["']/ },
+  { code: "NATIVE_OR_PROCESS_DEPENDENCY", pattern: /from\s+["']node:(?:fs|child_process|worker_threads|net|tls)["']|\bsubprocess\.(?:run|Popen|check_output)\s*\(/ },
+];
+
+type RecordValue = Record<string, unknown>;
+
+const relativePathSchema = z.string().max(500).refine(value => Boolean(safePath(value)), "must be a safe relative path");
+const triggerSchema = z.object({
+  id: z.string().max(120),
+  kind: z.string().max(80),
+  businessEffect: z.boolean().default(false),
+  owner: z.string().max(160).optional(),
+  canonicalWorkerJob: z.boolean().optional(),
+  outboxIntent: z.boolean().optional(),
+  persistedBeforeFirstSideEffect: z.boolean().optional(),
+}).strict();
+const reconciledSignalSchema = z.object({
+  path: relativePathSchema,
+  line: z.number().int().positive(),
+  code: z.string().regex(/^[A-Z_]{2,80}$/),
+  disposition: z.enum(["infrastructure", "business_job", "false_positive"]),
+  owner: z.string().min(1).max(160),
+  evidence: z.string().min(1).max(500),
+  componentId: z.string().max(120).optional(),
+  triggerId: z.string().max(120).optional(),
+}).strict();
+const componentSchema = z.object({
+  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/),
+  name: z.string().max(200).optional(),
+  kind: z.string().max(80),
+  active: z.boolean().default(true),
+  owner: z.string().max(160).optional(),
+  sourcePaths: z.array(relativePathSchema).default([]),
+  dependsOn: z.array(z.string().max(120)).default([]),
+  requestedPlacement: z.string().max(80).optional(),
+  evidence: z.object({
+    methodRuntimeProbePassed: z.boolean().optional(),
+    packageImportPassed: z.boolean().optional(),
+    bundlePassed: z.boolean().optional(),
+    evidenceLevel: z.string().max(40).optional(),
+  }).strict().default({}),
+  requiredRefactors: z.array(z.string().max(500)).default([]),
+  networkEgress: z.array(z.string().max(200)).default([]),
+  filesystemDependencies: z.array(z.string().max(200)).default([]),
+  secretBindingNames: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{1,119}$/)).default([]),
+  triggerInventoryComplete: z.boolean().default(false),
+  schedules: z.array(z.string().max(200)).default([]),
+  triggers: z.array(triggerSchema).default([]),
+  migrationWave: z.string().max(80).optional(),
+}).strict();
+const manifestSchema = z.object({
+  schemaVersion: z.literal(1),
+  observedAt: z.string().max(80),
+  environment: z.enum(["local", "staging", "target", "production"]),
+  retirementClaim: z.boolean().default(false),
+  inventoryEvidence: z.object({
+    hostProcessInventoryComplete: z.boolean().default(false),
+    runtimeTrafficVerified: z.boolean().default(false),
+    targetAccountProof: z.boolean().default(false),
+    productionProof: z.boolean().default(false),
+  }).strict().default({}),
+  sourceRoots: z.array(relativePathSchema).optional(),
+  reconciledSignals: z.array(reconciledSignalSchema).default([]),
+  components: z.array(componentSchema),
+}).strict().superRefine((value, context) => {
+  const secretLike = /(?:bearer\s+[A-Za-z0-9._~-]{8,}|(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|password|private[_ -]?key)\s*[:=]\s*\S+|(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_-]{8,}|https?:\/\/[^/\s:]+:[^@\s]+@|postgres(?:ql)?:\/\/)/i;
+  const visit = (item: unknown, path: Array<string | number>): void => {
+    if (typeof item === "string" && secretLike.test(item)) {
+      context.addIssue({ code: z.ZodIssueCode.custom, path, message: "secret-like text is not allowed" });
+    } else if (Array.isArray(item)) {
+      item.forEach((child, index) => visit(child, [...path, index]));
+    } else if (isRecord(item)) {
+      for (const [key, child] of Object.entries(item)) {
+        if (key !== "secretBindingNames") visit(child, [...path, key]);
+      }
+    }
+  };
+  visit(value, []);
+});
+
+type Blocker = {
+  code: string;
+  componentId?: string;
+  triggerId?: string;
+  sourcePath?: string;
+  sourceLine?: number;
+  signalCode?: string;
+  message: string;
+};
+
+type ClassifiedComponent = RecordValue & {
+  id: string;
+  primaryPlacement: string;
+  active: boolean;
+};
+
+export type MigrationCommandResult = {
+  exitCode: number;
+  artifacts: string[];
+  blockers: Blocker[];
+  components: ClassifiedComponent[];
+  inventory: RecordValue;
+};
+
+function isRecord(value: unknown): value is RecordValue {
+  return typeof value === "object" && value !== null && !Array.isArray(value);
+}
+
+function asRecord(value: unknown): RecordValue {
+  return isRecord(value) ? value : {};
+}
+
+function asArray(value: unknown): unknown[] {
+  return Array.isArray(value) ? value : [];
+}
+
+function safeText(value: unknown, max = 500): string {
+  if (typeof value !== "string") return "";
+  return value.trim().slice(0, max);
+}
+
+function safePath(value: unknown): string | null {
+  const candidate = safeText(value, 500).replaceAll("\\", "/");
+  if (!candidate || candidate.startsWith("/") || /^[A-Za-z]:\//.test(candidate)) return null;
+  if (candidate.split("/").some(part => part === ".." || part === "")) return null;
+  if (candidate.split("/").some(part => SECRET_FILE.test(part))) return null;
+  return candidate;
+}
+
+function safeList(value: unknown, transform: (item: unknown) => string | null = item => safeText(item)): string[] {
+  return [...new Set(asArray(value).map(transform).filter((item): item is string => Boolean(item)))].sort();
+}
+
+function safeSecretNames(value: unknown): string[] {
+  return safeList(value, item => {
+    const name = safeText(item, 120);
+    return /^[A-Z][A-Z0-9_]{1,119}$/.test(name) ? name : null;
+  });
+}
+
+function validateManifest(manifest: unknown): { source: RecordValue; components: RecordValue[]; blockers: Blocker[] } {
+  const result = manifestSchema.safeParse(manifest);
+  if (!result.success) {
+    if (result.error.issues.some(issue => issue.message === "secret-like text is not allowed")) {
+      throw new Error("MIGRATION_MANIFEST_SECRET_LIKE_TEXT");
+    }
+    const issues = result.error.issues.map(issue => `${issue.path.join(".") || "manifest"}:${issue.code}`).join(",");
+    throw new Error(`MIGRATION_MANIFEST_INVALID:${issues}`);
+  }
+  const source = result.data as unknown as RecordValue;
+  const blockers: Blocker[] = [];
+  if (source.schemaVersion !== 1) {
+    blockers.push({ code: "MANIFEST_SCHEMA_VERSION_UNSUPPORTED", message: "Manifest schemaVersion must be 1." });
+  }
+  if (!Array.isArray(source.components)) {
+    blockers.push({ code: "COMPONENTS_ARRAY_REQUIRED", message: "Manifest components must be an array." });
+  }
+  const components = asArray(source.components).filter(isRecord);
+  if (!components.length) {
+    blockers.push({ code: "EMPTY_COMPONENT_INVENTORY", message: "No components were inventoried; this cannot establish migration readiness." });
+  }
+  const seen = new Set<string>();
+  for (const component of components) {
+    const id = safeText(component.id, 120);
+    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(id)) {
+      blockers.push({ code: "COMPONENT_ID_INVALID", message: "Each component needs a stable, safe id." });
+      continue;
+    }
+    if (seen.has(id)) blockers.push({ code: "COMPONENT_ID_DUPLICATE", componentId: id, message: "Component ids must be unique." });
+    seen.add(id);
+  }
+  return { source, components, blockers };
+}
+
+function normalizeComponent(component: RecordValue, blockers: Blocker[]): ClassifiedComponent {
+  const id = safeText(component.id, 120) || "invalid-component";
+  const active = component.active !== false;
+  const requested = safeText(component.requestedPlacement, 80);
+  const evidence = asRecord(component.evidence);
+  let primaryPlacement = PLACEMENTS.has(requested) ? requested : "BLOCKED";
+  if (active && requested && !PLACEMENTS.has(requested)) {
+    blockers.push({ code: "PLACEMENT_CLASSIFICATION_INVALID", componentId: id, message: "Requested placement is not a supported classification." });
+  }
+  if (active && primaryPlacement !== "BLOCKED" && evidence.methodRuntimeProbePassed !== true) {
+    primaryPlacement = "BLOCKED";
+    blockers.push({
+      code: "RUNTIME_METHOD_EVIDENCE_REQUIRED",
+      componentId: id,
+      message: "Import or bundle evidence alone cannot establish runtime compatibility.",
+    });
+  }
+  if (active && !safeText(component.owner, 160)) {
+    blockers.push({ code: "COMPONENT_OWNER_REQUIRED", componentId: id, message: "Active component has no accountable owner." });
+  }
+  const sourcePaths = safeList(component.sourcePaths, safePath);
+  for (const candidate of asArray(component.sourcePaths)) {
+    if (!safePath(candidate)) blockers.push({ code: "SOURCE_PATH_UNSAFE", componentId: id, message: "Unsafe source path was excluded." });
+  }
+  if (active && !sourcePaths.length) {
+    blockers.push({ code: "COMPONENT_SOURCE_REQUIRED", componentId: id, message: "Active component has no source/config ownership path." });
+  }
+  const triggers = asArray(component.triggers).filter(isRecord).map(trigger => {
+    const triggerId = safeText(trigger.id, 120) || "unknown-trigger";
+    const kind = safeText(trigger.kind, 80);
+    const businessEffect = trigger.businessEffect === true;
+    if (!TRIGGER_KINDS.has(kind)) {
+      blockers.push({ code: "TRIGGER_KIND_UNKNOWN", componentId: id, triggerId, message: "Trigger kind is not classified." });
+    }
+    if (businessEffect) {
+      if (!safeText(trigger.owner, 160)) {
+        blockers.push({ code: "TRIGGER_OWNER_REQUIRED", componentId: id, triggerId, message: "Business trigger has no accountable owner." });
+      }
+      if (trigger.canonicalWorkerJob !== true || trigger.outboxIntent !== true || trigger.persistedBeforeFirstSideEffect !== true) {
+        blockers.push({ code: "BACKGROUND_JOB_OUTBOX_REQUIRED", componentId: id, triggerId, message: "Business effects require canonical worker_jobs and outbox intent before the first side effect." });
+      }
+    }
+    return {
+      id: triggerId,
+      kind: TRIGGER_KINDS.has(kind) ? kind : "unknown",
+      businessEffect,
+      owner: safeText(trigger.owner, 160) || null,
+      canonicalWorkerJob: trigger.canonicalWorkerJob === true,
+      outboxIntent: trigger.outboxIntent === true,
+      persistedBeforeFirstSideEffect: trigger.persistedBeforeFirstSideEffect === true,
+    };
+  });
+  return {
+    id,
+    name: safeText(component.name, 200) || id,
+    kind: safeText(component.kind, 80) || "unknown",
+    active,
+    owner: safeText(component.owner, 160) || null,
+    sourcePaths,
+    dependsOn: safeList(component.dependsOn, item => safeText(item, 120) || null),
+    primaryPlacement,
+    requestedPlacement: PLACEMENTS.has(requested) ? requested : "BLOCKED",
+    evidence: {
+      methodRuntimeProbePassed: evidence.methodRuntimeProbePassed === true,
+      importPassed: evidence.packageImportPassed === true,
+      bundlePassed: evidence.bundlePassed === true,
+      evidenceLevel: safeText(evidence.evidenceLevel, 40) || "unknown",
+    },
+    requiredRefactors: safeList(component.requiredRefactors),
+    networkEgress: safeList(component.networkEgress),
+    filesystemDependencies: safeList(component.filesystemDependencies),
+    secretBindingNames: safeSecretNames(component.secretBindingNames),
+    triggerInventoryComplete: component.triggerInventoryComplete === true,
+    schedules: safeList(component.schedules),
+    triggers,
+    migrationWave: safeText(component.migrationWave, 80) || "unassigned",
+  };
+}
+
+function buildBlockers(manifest: RecordValue, components: ClassifiedComponent[], prior: Blocker[]): Blocker[] {
+  const blockers = [...prior];
+  const ids = new Set(components.map(component => component.id));
+  for (const component of components) {
+    if (!component.active) continue;
+    if (component.triggerInventoryComplete !== true) {
+      blockers.push({ code: "TRIGGER_INVENTORY_INCOMPLETE", componentId: component.id, message: "Active component has not completed detached work, callbacks, schedules, startup reconciliation, listeners and queue delivery inventory." });
+    }
+    if (component.kind === "business_job" && asArray(component.triggers).length === 0) {
+      blockers.push({ code: "BUSINESS_JOB_TRIGGER_REQUIRED", componentId: component.id, message: "Business jobs need at least one inventoried initiating trigger." });
+    }
+    if (component.primaryPlacement === "BLOCKED") {
+      blockers.push({ code: "COMPONENT_PLACEMENT_BLOCKED", componentId: component.id, message: "Active component has no proven compatible placement." });
+    }
+    for (const dependency of asArray(component.dependsOn).map(item => safeText(item, 120)).filter(Boolean)) {
+      if (!ids.has(dependency)) blockers.push({ code: "DEPENDENCY_UNRESOLVED", componentId: component.id, message: `Dependency '${dependency}' is not inventoried.` });
+    }
+  }
+  const scheduleOwners = new Map<string, string>();
+  for (const component of components.filter(item => item.active)) {
+    for (const schedule of asArray(component.schedules).map(item => safeText(item, 200)).filter(Boolean)) {
+      const existingOwner = scheduleOwners.get(schedule);
+      if (existingOwner && existingOwner !== component.id) {
+        blockers.push({ code: "SCHEDULE_OWNER_DUPLICATE", componentId: component.id, message: `Schedule '${schedule}' is also owned by '${existingOwner}'.` });
+      } else {
+        scheduleOwners.set(schedule, component.id);
+      }
+    }
+  }
+  if (manifest.retirementClaim === true) {
+    const evidence = asRecord(manifest.inventoryEvidence);
+    const required = ["hostProcessInventoryComplete", "runtimeTrafficVerified", "targetAccountProof", "productionProof"];
+    for (const key of required) {
+      if (evidence[key] !== true) blockers.push({ code: "RETIREMENT_EVIDENCE_REQUIRED", message: `Retirement claim requires '${key}' evidence.` });
+    }
+    if (!components.length) blockers.push({ code: "RETIREMENT_INVENTORY_EMPTY", message: "Retirement cannot be claimed from an empty inventory." });
+    const declaredRoots = new Set(safeList(manifest.sourceRoots ?? DEFAULT_SOURCE_ROOTS, safePath));
+    for (const requiredRoot of DEFAULT_SOURCE_ROOTS) {
+      if (!declaredRoots.has(requiredRoot)) blockers.push({ code: "RETIREMENT_SOURCE_COVERAGE_REQUIRED", message: "Full retirement must include every configured repository source root." });
+    }
+  }
+  const unique = new Map<string, Blocker>();
+  for (const blocker of blockers) {
+    const key = [blocker.code, blocker.componentId ?? "", blocker.triggerId ?? "", blocker.sourcePath ?? "", blocker.sourceLine ?? "", blocker.signalCode ?? ""].join(":");
+    if (!unique.has(key)) unique.set(key, blocker);
+  }
+  return [...unique.values()].sort((a, b) => `${a.code}:${a.componentId ?? ""}:${a.triggerId ?? ""}`.localeCompare(`${b.code}:${b.componentId ?? ""}:${b.triggerId ?? ""}`));
+}
+
+async function rejectSymlinkPath(path: string, errorCode: string): Promise<void> {
+  const absolute = resolve(path);
+  const root = parse(absolute).root;
+  const segments = absolute.slice(root.length).split(sep).filter(Boolean);
+  let current = root;
+  for (const segment of segments) {
+    current = join(current, segment);
+    try {
+      if ((await lstat(current)).isSymbolicLink()) throw new Error(errorCode);
+    } catch (error) {
+      if (error instanceof Error && error.message === errorCode) throw error;
+      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
+      throw error;
+    }
+  }
+}
+
+function reconcileStaticFindings(findings: Array<{ path: string; line: number; code: string }>, reconciliations: unknown[], components: ClassifiedComponent[]): Blocker[] {
+  const declarations = new Map(asArray(reconciliations).filter(isRecord).map(item => {
+    const key = `${safePath(item.path) ?? ""}:${Number(item.line)}:${safeText(item.code, 80)}`;
+    return [key, item] as const;
+  }));
+  const blockers: Blocker[] = [];
+  for (const finding of findings) {
+    const key = `${finding.path}:${finding.line}:${finding.code}`;
+    const declaration = declarations.get(key);
+    if (!declaration || !safeText(declaration.owner, 160) || !safeText(declaration.evidence, 500)) {
+      blockers.push({ code: "STATIC_SIGNAL_UNRECONCILED", sourcePath: finding.path, sourceLine: finding.line, signalCode: finding.code, message: "Static candidate signal has no owner-backed disposition." });
+      continue;
+    }
+  if (declaration.disposition === "business_job" && (!safeText(declaration.componentId, 120) || !safeText(declaration.triggerId, 120))) {
+      blockers.push({ code: "STATIC_SIGNAL_JOB_MAPPING_REQUIRED", sourcePath: finding.path, sourceLine: finding.line, signalCode: finding.code, message: "Business signal must map to a component and canonical trigger." });
+      continue;
+    }
+    if (declaration.disposition === "business_job") {
+      const component = components.find(item => item.id === declaration.componentId);
+      const trigger = asArray(component?.triggers).find(item => isRecord(item) && item.id === declaration.triggerId);
+      if (!component?.active || !isRecord(trigger) || trigger.businessEffect !== true || trigger.canonicalWorkerJob !== true || trigger.outboxIntent !== true || trigger.persistedBeforeFirstSideEffect !== true) {
+        blockers.push({ code: "STATIC_SIGNAL_JOB_MAPPING_UNVERIFIED", componentId: safeText(declaration.componentId, 120), triggerId: safeText(declaration.triggerId, 120), sourcePath: finding.path, sourceLine: finding.line, signalCode: finding.code, message: "Business signal does not map to an active canonical worker job and outbox trigger." });
+      }
+    }
+  }
+  return blockers;
+}
+
+function quoteYaml(value: string): string {
+  return JSON.stringify(value);
+}
+
+function toYaml(value: unknown, depth = 0): string {
+  const pad = "  ".repeat(depth);
+  if (value === null || value === undefined) return "null";
+  if (typeof value === "string") return quoteYaml(value);
+  if (typeof value === "number" || typeof value === "boolean") return String(value);
+  if (Array.isArray(value)) {
+    if (!value.length) return "[]";
+    return value.map(item => {
+      if (isRecord(item) || Array.isArray(item)) return `${pad}-\n${toYaml(item, depth + 1)}`;
+      return `${pad}- ${toYaml(item, 0)}`;
+    }).join("\n");
+  }
+  if (isRecord(value)) {
+    const entries = Object.entries(value);
+    if (!entries.length) return "{}";
+    return entries.map(([key, item]) => {
+      if (isRecord(item) || Array.isArray(item)) return `${pad}${key}:\n${toYaml(item, depth + 1)}`;
+      return `${pad}${key}: ${toYaml(item, 0)}`;
+    }).join("\n");
+  }
+  return "null";
+}
+
+type ScanProblem = { path: string; code: string };
+
+async function scanFiles(rootPath: string, roots: string[]): Promise<{ files: string[]; findings: Array<{ path: string; line: number; code: string }>; problems: ScanProblem[] }> {
+  const files: string[] = [];
+  const findings: Array<{ path: string; line: number; code: string }> = [];
+  const problems: ScanProblem[] = [];
+  const visited = new Set<string>();
+  if (!roots.length) problems.push({ path: "", code: "SOURCE_ROOTS_EMPTY" });
+  async function walk(path: string): Promise<void> {
+    const absolute = resolve(rootPath, path);
+    const rel = relative(rootPath, absolute);
+    if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return;
+    if (visited.has(absolute)) return;
+    visited.add(absolute);
+    try {
+      if ((await lstat(absolute)).isSymbolicLink()) {
+        problems.push({ path, code: "SOURCE_SYMLINK_SKIPPED" });
+        return;
+      }
+    } catch {
+      problems.push({ path, code: "SOURCE_ROOT_UNAVAILABLE" });
+      return;
+    }
+    let entries;
+    try { entries = await readdir(absolute, { withFileTypes: true }); } catch {
+      problems.push({ path, code: "SOURCE_DIRECTORY_UNREADABLE" });
+      return;
+    }
+    entries.sort((a, b) => a.name.localeCompare(b.name));
+    for (const entry of entries) {
+      if (entry.isSymbolicLink()) {
+        problems.push({ path: join(path, entry.name).split(sep).join("/"), code: "SOURCE_SYMLINK_SKIPPED" });
+        continue;
+      }
+      if (entry.isDirectory()) {
+        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) await walk(join(path, entry.name));
+      } else if (entry.isFile() && !SECRET_FILE.test(entry.name)) {
+        const relativePath = join(path, entry.name).split(sep).join("/");
+        files.push(relativePath);
+        if (SOURCE_FILE.test(entry.name)) {
+          try {
+            const contents = await readFile(join(absolute, entry.name), "utf8");
+            if (contents.length <= 1_000_000) {
+              const lines = contents.split(/\r?\n/);
+              lines.forEach((line, index) => {
+                for (const signal of SOURCE_SIGNALS) {
+                  if (signal.pattern.test(line)) findings.push({ path: relativePath, line: index + 1, code: signal.code });
+                }
+              });
+            } else problems.push({ path: relativePath, code: "SOURCE_FILE_TOO_LARGE" });
+          } catch {
+            problems.push({ path: relativePath, code: "SOURCE_FILE_UNREADABLE" });
+          }
+        }
+        if (files.length >= 50000) {
+          problems.push({ path, code: "SOURCE_SCAN_LIMIT_REACHED" });
+          return;
+        }
+      }
+    }
+  }
+  for (const root of roots.map(safePath).filter((item): item is string => Boolean(item))) await walk(root);
+  const sortedFiles = [...new Set(files)].sort();
+  findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.code.localeCompare(b.code));
+  problems.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
+  return { files: sortedFiles, findings, problems };
+}
+
+function buildArtifacts(manifest: RecordValue, components: ClassifiedComponent[], blockers: Blocker[], discoveredFiles: string[], staticFindings: Array<{ path: string; line: number; code: string }>, scanProblems: ScanProblem[]) {
+  const active = components.filter(component => component.active);
+  const inventory = {
+    schemaVersion: 1,
+    observedAt: safeText(manifest.observedAt, 80) || "unknown",
+    environment: safeText(manifest.environment, 40) || "unknown",
+    evidenceBoundary: "static-repository-manifest-only",
+    retirementClaim: manifest.retirementClaim === true,
+    inventoryEvidence: asRecord(manifest.inventoryEvidence),
+    scan: {
+      sourceRoots: safeList(manifest.sourceRoots ?? DEFAULT_SOURCE_ROOTS, safePath),
+      discoveredFileCount: discoveredFiles.length,
+      discoveredFiles,
+      staticFindings,
+      scanProblems,
+      staticFindingsBoundary: "candidate-signals-only-requires-owner-and-runtime-reconciliation",
+    },
+    completeness: blockers.length ? "BLOCKED_OR_PARTIAL" : "LOCAL_FIXTURE_PASS_NOT_PRODUCTION_CERTIFICATION",
+    components,
+    blockers,
+  };
+  const dependencyGraph = {
+    nodes: active.map(component => ({ id: component.id, owner: component.owner, placement: component.primaryPlacement })),
+    edges: active.flatMap(component => (component.dependsOn as string[]).map(target => ({ from: component.id, to: target }))),
+  };
+  const placement = {
+    schemaVersion: 1,
+    evidenceBoundary: "static-repository-manifest-only",
+    components: active.map(component => ({ id: component.id, owner: component.owner, placement: component.primaryPlacement, evidence: component.evidence })),
+  };
+  const refactors = { schemaVersion: 1, components: active.map(component => ({ id: component.id, items: component.requiredRefactors })) };
+  const waves = new Map<string, string[]>();
+  for (const component of active) {
+    const wave = component.migrationWave as string;
+    waves.set(wave, [...(waves.get(wave) ?? []), component.id]);
+  }
+  const wavePlan = { schemaVersion: 1, waves: [...waves].sort(([a], [b]) => a.localeCompare(b)).map(([id, componentIds]) => ({ id, componentIds: componentIds.sort() })) };
+  const secretMap = { schemaVersion: 1, bindings: active.flatMap(component => (component.secretBindingNames as string[]).map(name => ({ componentId: component.id, name, value: "[REDACTED]" }))) };
+  const networkMap = { schemaVersion: 1, components: active.map(component => ({ id: component.id, egress: component.networkEgress })) };
+  const filesystemMap = { schemaVersion: 1, components: active.map(component => ({ id: component.id, dependencies: component.filesystemDependencies })) };
+  const cronMap = { schemaVersion: 1, components: active.map(component => ({ id: component.id, schedules: component.schedules, triggers: component.triggers })) };
+  const report = [
+    "# Cloudflare Migration Compatibility Report",
+    "",
+    `- Environment: ${inventory.environment}`,
+    `- Observed at: ${inventory.observedAt}`,
+    `- Evidence boundary: ${inventory.evidenceBoundary}`,
+    `- Active components inventoried: ${active.length}`,
+    `- Static candidate files: ${discoveredFiles.length}`,
+    `- Retirement claim requested: ${inventory.retirementClaim}`,
+    `- Result: ${blockers.length ? "BLOCKED" : "local manifest checks passed; production not certified"}`,
+    "",
+    "## Blockers",
+    ...(blockers.length ? blockers.map(item => `- ${item.code}${item.componentId ? ` (${item.componentId})` : ""}${item.triggerId ? ` [${item.triggerId}]` : ""}: ${item.message}`) : ["- None from the supplied manifest; external completeness is not established by a static scan."]),
+    "",
+    "This report does not prove production process ownership, provider entitlement, deployment state, or Debian retirement.",
+    "",
+  ].join("\n");
+  return new Map<string, string>([
+    ["compatibility-inventory.json", `${JSON.stringify(inventory, null, 2)}\n`],
+    ["dependency-graph.json", `${JSON.stringify(dependencyGraph, null, 2)}\n`],
+    ["runtime-placement.yaml", `${toYaml(placement)}\n`],
+    ["required-refactors.yaml", `${toYaml(refactors)}\n`],
+    ["migration-waves.yaml", `${toYaml(wavePlan)}\n`],
+    ["secret-bindings.redacted.yaml", `${toYaml(secretMap)}\n`],
+    ["network-egress-map.yaml", `${toYaml(networkMap)}\n`],
+    ["filesystem-dependency-map.yaml", `${toYaml(filesystemMap)}\n`],
+    ["cron-service-map.yaml", `${toYaml(cronMap)}\n`],
+    ["compatibility-report.md", report],
+  ]);
+}
+
+export async function runMigrationCommand(options: Record<string, unknown>): Promise<MigrationCommandResult> {
+  const command = safeText(options.command, 32);
+  if (!["inspect", "classify", "verify", "plan", "report"].includes(command)) {
+    throw new Error("COMMAND_MUST_BE_INSPECT_CLASSIFY_VERIFY_PLAN_OR_REPORT");
+  }
+  const manifestArgument = safeText(options.manifestPath, 2000);
+  if (!manifestArgument) throw new Error("MANIFEST_PATH_REQUIRED");
+  const defaultRepoRoot = resolve(import.meta.dirname, "../../../..");
+  const rootPath = await realpath(resolve(safeText(options.rootPath, 2000) || defaultRepoRoot));
+  const manifestPath = resolve(rootPath, manifestArgument);
+  const manifestRelativePath = relative(rootPath, manifestPath);
+  if (manifestRelativePath.startsWith(`..${sep}`) || manifestRelativePath === ".." || isAbsolute(manifestRelativePath)) {
+    throw new Error("MANIFEST_PATH_OUTSIDE_ROOT");
+  }
+  await rejectSymlinkPath(manifestPath, "MANIFEST_PATH_SYMLINK");
+  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
+  const checked = validateManifest(parsed);
+  const sourceRoots = safeList(checked.source.sourceRoots ?? DEFAULT_SOURCE_ROOTS, safePath);
+  const scan = command === "inspect" || command === "verify" ? await scanFiles(rootPath, sourceRoots) : { files: [], findings: [], problems: [] };
+  const components = checked.components.map(component => normalizeComponent(component, checked.blockers));
+  const staticBlockers = command === "verify" ? reconcileStaticFindings(scan.findings, checked.source.reconciledSignals as unknown[], components) : [];
+  const scanBlockers = command === "verify" ? scan.problems.map(problem => ({ code: "SOURCE_SCAN_INCOMPLETE", sourcePath: problem.path, signalCode: problem.code, message: "Declared source could not be fully inspected." })) : [];
+  const blockers = buildBlockers(checked.source, components, [...checked.blockers, ...staticBlockers, ...scanBlockers]);
+  const artifacts = buildArtifacts(checked.source, components, blockers, scan.files, scan.findings, scan.problems);
+  const outputDir = resolve(safeText(options.outputDir, 2000) || join(rootPath, "migration"));
+  await rejectSymlinkPath(outputDir, "OUTPUT_PATH_SYMLINK");
+  await mkdir(outputDir, { recursive: true });
+  await rejectSymlinkPath(outputDir, "OUTPUT_PATH_SYMLINK");
+  if (await realpath(outputDir) !== outputDir) throw new Error("OUTPUT_PATH_SYMLINK");
+  for (const [name, content] of artifacts) {
+    const target = resolve(outputDir, name);
+    if (!target.startsWith(`${outputDir}${sep}`)) throw new Error("OUTPUT_PATH_INVALID");
+    await mkdir(dirname(target), { recursive: true });
+    await rejectSymlinkPath(target, "OUTPUT_PATH_SYMLINK");
+    await writeFile(target, content, { encoding: "utf8", mode: 0o600 });
+  }
+  return {
+    exitCode: command === "verify" && blockers.length ? 1 : 0,
+    artifacts: [...artifacts.keys()],
+    blockers,
+    components,
+    inventory: asRecord(JSON.parse(artifacts.get("compatibility-inventory.json") ?? "{}")),
+  };
+}
diff --git a/apps/web/scripts/smartaihub-migrate.ts b/apps/web/scripts/smartaihub-migrate.ts
new file mode 100644
index 000000000..0af50b051
--- /dev/null
+++ b/apps/web/scripts/smartaihub-migrate.ts
@@ -0,0 +1,40 @@
+import { runMigrationCommand } from "./cloudflare-migration/compiler";
+
+const [command, ...rawArgs] = process.argv.slice(2);
+const options: Record<string, unknown> = { command };
+const flags: Record<string, string> = {
+  "--manifest": "manifestPath",
+  "--root": "rootPath",
+  "--out-dir": "outputDir",
+};
+
+for (let index = 0; index < rawArgs.length; index += 1) {
+  const flag = rawArgs[index];
+  const key = flags[flag];
+  const value = rawArgs[index + 1];
+  if (!key || !value || value.startsWith("--")) {
+    console.error("Usage: smartaihub-migrate <inspect|classify|verify|plan|report> --manifest <json> [--root <repo>] [--out-dir <dir>]");
+    process.exit(2);
+  }
+  options[key] = value;
+  index += 1;
+}
+
+try {
+  const result = await runMigrationCommand(options);
+  console.log(JSON.stringify({
+    command,
+    exitCode: result.exitCode,
+    artifacts: result.artifacts,
+    blockerCount: result.blockers.length,
+    blockers: result.blockers.slice(0, 20),
+    blockersTruncated: result.blockers.length > 20,
+  }, null, 2));
+  process.exitCode = result.exitCode;
+} catch (error) {
+  console.error(JSON.stringify({
+    command,
+    error: error instanceof Error ? error.message : "MIGRATION_COMMAND_FAILED",
+  }));
+  process.exitCode = 2;
+}
diff --git a/ops/feature-245/compatibility-manifest.example.json b/ops/feature-245/compatibility-manifest.example.json
new file mode 100644
index 000000000..5ee7d9cb9
--- /dev/null
+++ b/ops/feature-245/compatibility-manifest.example.json
@@ -0,0 +1,21 @@
+{
+  "schemaVersion": 1,
+  "observedAt": "YYYY-MM-DDTHH:MM:SSZ",
+  "environment": "local",
+  "retirementClaim": false,
+  "inventoryEvidence": {
+    "hostProcessInventoryComplete": false,
+    "runtimeTrafficVerified": false,
+    "targetAccountProof": false,
+    "productionProof": false
+  },
+  "sourceRoots": [
+    "apps/web/server",
+    "apps/cloudflare/src",
+    "python-backend/app",
+    "systemd",
+    "docker"
+  ],
+  "reconciledSignals": [],
+  "components": []
+}
