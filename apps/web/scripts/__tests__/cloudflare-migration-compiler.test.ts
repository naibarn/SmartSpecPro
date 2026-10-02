import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { runMigrationCommand } from "../cloudflare-migration/compiler";

const tempRoots: string[] = [];

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "smartaihub-migration-"));
  tempRoots.push(root);
  const manifestPath = join(root, "input.json");
  const outputDir = join(root, "migration");
  const manifest = {
    schemaVersion: 1,
    observedAt: "2026-09-28T00:00:00.000Z",
    environment: "local",
    retirementClaim: false,
    inventoryEvidence: {
      hostProcessInventoryComplete: false,
      runtimeTrafficVerified: false,
      targetAccountProof: false,
      productionProof: false,
    },
    reconciledSignals: [
      { path: "apps/web/server/index.ts", line: 1, code: "TIMER_OR_SCHEDULE", disposition: "infrastructure", owner: "platform", evidence: "reviewed fixture: timer is a no-op" },
      { path: "apps/web/server/db.ts", line: 1, code: "POSTGRES_SESSION_FEATURE", disposition: "infrastructure", owner: "platform", evidence: "fixture only; not used for Hyperdrive state" },
    ],
    sourceRoots: ["apps/web/server", "python-backend/app"],
    components: [
      {
        id: "api",
        name: "API service",
        kind: "service",
        active: true,
        owner: "platform",
        sourcePaths: ["apps/web/server/index.ts"],
        dependsOn: [],
        requestedPlacement: "WORKERS_WITH_REFACTOR",
        evidence: { methodRuntimeProbePassed: true, bundlePassed: true },
        requiredRefactors: ["replace node-only API"],
        networkEgress: ["postgres"],
        filesystemDependencies: [],
        secretBindingNames: ["CLOUDFLARE_SEARCH_CACHE_TOKEN"],
        triggerInventoryComplete: true,
        schedules: [],
        triggers: [],
      },
      {
        id: "media-job",
        name: "Media generation operation",
        kind: "business_job",
        active: true,
        owner: "media",
        sourcePaths: ["python-backend/app/tasks/media_tasks.py"],
        dependsOn: [],
        requestedPlacement: "CONTAINER_REQUIRED",
        evidence: { methodRuntimeProbePassed: true },
        requiredRefactors: [],
        networkEgress: ["provider-api"],
        filesystemDependencies: ["temporary workspace"],
        secretBindingNames: ["IMAGE_PROVIDER_SECRET"],
        triggerInventoryComplete: true,
        schedules: [],
        triggers: [
          {
            id: "provider-callback",
            kind: "callback",
            businessEffect: true,
            owner: "media",
            canonicalWorkerJob: true,
            outboxIntent: true,
            persistedBeforeFirstSideEffect: true,
          },
        ],
      },
    ],
  };
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
  await mkdir(join(root, "apps/web/server"), { recursive: true });
  await mkdir(join(root, "apps/web/server/__tests__"), { recursive: true });
  await mkdir(join(root, "python-backend/app/tasks"), { recursive: true });
  await writeFile(join(root, "apps/web/server/index.ts"), "setInterval(() => {}, 1000);\n", "utf8");
  await writeFile(join(root, "apps/web/server/db.ts"), "SELECT pg_advisory_xact_lock(1);\n", "utf8");
  await writeFile(join(root, "apps/web/server/__tests__/ignored.test.ts"), "getRedisClient();\n", "utf8");
  await writeFile(join(root, "python-backend/app/tasks/media_tasks.py"), "pass\n", "utf8");
  await writeFile(join(root, ".env"), "SECRET_CANARY=should-not-be-read-or-emitted\n", "utf8");
  return { root, manifestPath, outputDir, manifest };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("Spec 245 migration compatibility compiler", () => {
  it.each(["inspect", "classify", "verify", "plan", "report"] as const)(
    "%s emits deterministic, schema-complete artifacts from a bounded manifest",
    async command => {
      const fixture = await fixtureRoot();
      const result = await runMigrationCommand({
        command,
        manifestPath: fixture.manifestPath,
        rootPath: fixture.root,
        outputDir: fixture.outputDir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.artifacts).toEqual(expect.arrayContaining([
        "compatibility-inventory.json",
        "dependency-graph.json",
        "runtime-placement.yaml",
        "required-refactors.yaml",
        "migration-waves.yaml",
        "secret-bindings.redacted.yaml",
        "network-egress-map.yaml",
        "filesystem-dependency-map.yaml",
        "cron-service-map.yaml",
        "compatibility-report.md",
      ]));
      const first = await Promise.all(result.artifacts.map(name => readFile(join(fixture.outputDir, name), "utf8")));
      await runMigrationCommand({ command, manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
      const second = await Promise.all(result.artifacts.map(name => readFile(join(fixture.outputDir, name), "utf8")));
      expect(second).toEqual(first);
    },
  );

  it("keeps import or bundle-only compatibility claims blocked", async () => {
    const fixture = await fixtureRoot();
    fixture.manifest.components[0].evidence = { packageImportPassed: true, bundlePassed: true };
    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    const result = await runMigrationCommand({ command: "classify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });

    expect(result.components.find((component: any) => component.id === "api")?.primaryPlacement).toBe("BLOCKED");
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "RUNTIME_METHOD_EVIDENCE_REQUIRED", componentId: "api" }));
  });

  it("blocks full retirement for unknown owners or business effects before canonical job and outbox persistence", async () => {
    const fixture = await fixtureRoot();
    fixture.manifest.retirementClaim = true;
    fixture.manifest.inventoryEvidence = {
      hostProcessInventoryComplete: true,
      runtimeTrafficVerified: true,
      targetAccountProof: true,
      productionProof: true,
    };
    fixture.manifest.components[1].triggers[0].outboxIntent = false;
    fixture.manifest.components[1].triggers[0].persistedBeforeFirstSideEffect = false;
    fixture.manifest.components.push({
      ...fixture.manifest.components[0],
      id: "unknown-callback",
      owner: "",
      requestedPlacement: undefined,
      triggers: [{ id: "detached", kind: "in_process", businessEffect: true, owner: "", canonicalWorkerJob: false, outboxIntent: false, persistedBeforeFirstSideEffect: false }],
    });
    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });

    expect(result.exitCode).toBe(1);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "BACKGROUND_JOB_OUTBOX_REQUIRED", componentId: "media-job" }),
      expect.objectContaining({ code: "COMPONENT_OWNER_REQUIRED", componentId: "unknown-callback" }),
      expect.objectContaining({ code: "BACKGROUND_JOB_OUTBOX_REQUIRED", componentId: "unknown-callback" }),
    ]));
  });

  it("does not emit secret values or execute hook-shaped input", async () => {
    const fixture = await fixtureRoot();
    const secretCanary = "migration-secret-canary-9c12f7";
    const sideEffectMarker = join(fixture.root, "must-not-exist");
    await runMigrationCommand({ command: "report", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });

    const { readdir } = await import("node:fs/promises");
    const names = await readdir(fixture.outputDir);
    const output = (await Promise.all(names.map(name => readFile(join(fixture.outputDir, name), "utf8")))).join("\n");
    expect(output).not.toContain(secretCanary);
    expect(output).toContain("[REDACTED]");

    fixture.manifest.lifecycleHook = `touch ${sideEffectMarker}`;
    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
    await expect(runMigrationCommand({ command: "report", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir }))
      .rejects.toThrow("MIGRATION_MANIFEST_INVALID");
    await expect(readFile(sideEffectMarker, "utf8")).rejects.toThrow();
  });

  it("reports candidate async/Redis signals without treating test files or environment files as runtime evidence", async () => {
    const fixture = await fixtureRoot();
    const result = await runMigrationCommand({ command: "inspect", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
    const inventory = JSON.parse(await readFile(join(fixture.outputDir, "compatibility-inventory.json"), "utf8"));

    expect(inventory.scan.staticFindings).toContainEqual({ path: "apps/web/server/index.ts", line: 1, code: "TIMER_OR_SCHEDULE" });
    expect(inventory.scan.staticFindings).toContainEqual({ path: "apps/web/server/db.ts", line: 1, code: "POSTGRES_SESSION_FEATURE" });
    expect(inventory.scan.staticFindings.some((finding: any) => finding.code === "REDIS_DEPENDENCY")).toBe(false);
    expect(inventory.scan.discoveredFiles).not.toContain("apps/web/server/__tests__/ignored.test.ts");
    expect(inventory.scan.discoveredFiles).not.toContain(".env");
    expect(result.inventory.scan.staticFindingsBoundary).toContain("candidate-signals-only");
  });

  it("scans source files above 1 MB while keeping an explicit upper size bound", async () => {
    const fixture = await fixtureRoot();
    const largeSource = join(fixture.root, "apps/web/server/large.ts");
    const oversizedSource = join(fixture.root, "apps/web/server/oversized.ts");
    await writeFile(largeSource, `${"x".repeat(1_100_000)}\nsetInterval(() => {}, 1000);\n`, "utf8");
    await writeFile(oversizedSource, "x".repeat(2_000_001), "utf8");

    const result = await runMigrationCommand({ command: "inspect", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });

    expect(result.inventory.scan.staticFindings).toContainEqual({ path: "apps/web/server/large.ts", line: 2, code: "TIMER_OR_SCHEDULE" });
    expect(result.inventory.scan.scanProblems).toContainEqual({ path: "apps/web/server/oversized.ts", code: "SOURCE_FILE_TOO_LARGE" });
    expect(result.inventory.scan.scanProblems).not.toContainEqual({ path: "apps/web/server/large.ts", code: "SOURCE_FILE_TOO_LARGE" });
  });

  it("makes verify fail until every source signal is reconciled by an owner and evidence", async () => {
    const fixture = await fixtureRoot();
    fixture.manifest.reconciledSignals = [];
    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });

    expect(result.exitCode).toBe(1);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "STATIC_SIGNAL_UNRECONCILED" }));
    expect(result.blockers.filter(blocker => blocker.code === "STATIC_SIGNAL_UNRECONCILED")).toHaveLength(2);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "STATIC_SIGNAL_UNRECONCILED", sourcePath: "apps/web/server/index.ts", sourceLine: 1, signalCode: "TIMER_OR_SCHEDULE" }));
    expect(result.inventory.scan.staticFindings).toHaveLength(2);
  });

  it("requires business source signals to map to an active persisted worker job trigger", async () => {
    const fixture = await fixtureRoot();
    fixture.manifest.reconciledSignals = [{ path: "apps/web/server/index.ts", line: 1, code: "TIMER_OR_SCHEDULE", disposition: "business_job", owner: "media", evidence: "reviewed trigger", componentId: "media-job", triggerId: "missing-trigger" }];
    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });

    expect(result.exitCode).toBe(1);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "STATIC_SIGNAL_JOB_MAPPING_UNVERIFIED", componentId: "media-job", triggerId: "missing-trigger" }));
  });

  it("fails verification when a declared source root is missing", async () => {
    const fixture = await fixtureRoot();
    fixture.manifest.sourceRoots = ["missing-runtime-source"];
    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });

    expect(result.exitCode).toBe(1);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "SOURCE_SCAN_INCOMPLETE" }));
  });

  it("blocks missing trigger inventory and duplicate scheduler ownership", async () => {
    const fixture = await fixtureRoot();
    fixture.manifest.components[1].triggerInventoryComplete = false;
    fixture.manifest.components[0].schedules = ["nightly-refresh"];
    fixture.manifest.components[1].schedules = ["nightly-refresh"];
    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    const result = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });

    expect(result.exitCode).toBe(1);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "TRIGGER_INVENTORY_INCOMPLETE", componentId: "media-job" }),
      expect.objectContaining({ code: "SCHEDULE_OWNER_DUPLICATE" }),
    ]));

    fixture.manifest.components[1].triggerInventoryComplete = true;
    fixture.manifest.components[1].triggers = [];
    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");
    const missingTrigger = await runMigrationCommand({ command: "verify", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir });
    expect(missingTrigger.blockers).toContainEqual(expect.objectContaining({ code: "BUSINESS_JOB_TRIGGER_REQUIRED", componentId: "media-job" }));
  });

  it("rejects manifest and output symlinks before reading or writing through them", async () => {
    const fixture = await fixtureRoot();
    const outside = await mkdtemp(join(tmpdir(), "smartaihub-migration-outside-"));
    tempRoots.push(outside);
    const outsideManifest = join(outside, "outside.json");
    await writeFile(outsideManifest, JSON.stringify(fixture.manifest), "utf8");
    await symlink(outsideManifest, join(fixture.root, "linked.json"));
    await expect(runMigrationCommand({ command: "verify", manifestPath: "linked.json", rootPath: fixture.root, outputDir: fixture.outputDir }))
      .rejects.toThrow("MANIFEST_PATH_SYMLINK");

    await rm(fixture.outputDir, { recursive: true, force: true });
    await symlink(outside, fixture.outputDir);
    await expect(runMigrationCommand({ command: "report", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir }))
      .rejects.toThrow("OUTPUT_PATH_SYMLINK");
    await expect(readFile(join(outside, "compatibility-report.md"), "utf8")).rejects.toThrow();
  });

  it("rejects secret-like free text before emitting artifacts", async () => {
    const fixture = await fixtureRoot();
    fixture.manifest.components[0].owner = "sk_live_do_not_emit_1234567890";
    await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    await expect(runMigrationCommand({ command: "report", manifestPath: fixture.manifestPath, rootPath: fixture.root, outputDir: fixture.outputDir }))
      .rejects.toThrow("MIGRATION_MANIFEST_SECRET_LIKE_TEXT");
    await expect(readFile(join(fixture.outputDir, "compatibility-report.md"), "utf8")).rejects.toThrow();
  });
});
