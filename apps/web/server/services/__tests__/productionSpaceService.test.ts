import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { mediaProductionRuns, mediaProductionSpaces } from "../../../drizzle/schema";
import type { ProductionSpace } from "../../../shared/mediaProduction";
import {
  archiveProductionSpace,
  cancelProductionExecution,
  deleteProductionSpace,
  getProductionNodeConfig,
  getProductionSpace,
  importProductionDownstreamResult,
  repairProductionStaleOutputRefs,
  reconcilePendingProductionExecutions,
  reconcileProductionExecution,
  reconcileProductionProviderCallback,
  redactProductionSpaceExport,
  restoreProductionSpace,
  saveProductionBrief,
  saveProductionNodeConfig,
  saveProductionShot,
  saveProductionShotProductUse,
  saveProductionSpace,
  scheduleProductionExecution,
  updateProductionProductStoryboardAsset,
} from "../productionSpaceService";
import { adaptLegacyRunToProductionSpace, upgradeProductionSpaceSchema } from "../productionLegacyCompatibilityService";

const baseDate = new Date("2026-05-22T03:00:00.000Z");

function buildSpace(version = 1): ProductionSpace {
  return {
    schemaVersion: "1.0.0",
    productionRunId: "run-116",
    version,
    status: "plan_ready_for_review",
    brief: {
      title: "Director Project",
      summary: "Production Director canvas",
      productContext: { internalCost: 999 },
    },
    shots: [{
      id: "shot-1",
      title: "Opening",
      order: 1,
      nodeIds: ["node-video"],
      status: "ready",
    }],
    flowNodes: [{
      id: "node-video",
      kind: "video",
      title: "Video Shot",
      status: "ready",
      configSnapshot: {
        snapshotId: "config-1",
        version: 1,
        toolSurface: "video",
        adapter: "video",
        config: { prompt: "show product", providerSecret: "redact-me" },
        configHash: "hash-1",
        manuallyEdited: true,
      },
      outputRefs: [{
        outputRefId: "out-1",
        nodeId: "node-video",
        kind: "video",
        url: "https://cdn.example/video.mp4",
        providerTaskId: "provider-task-secret",
      }],
      estimatedCredits: 4,
    }],
    flowEdges: [],
    contextAssets: [{
      id: "asset-1",
      kind: "product_image",
      title: "Product",
      source: "library",
      url: "https://cdn.example/private-product.png",
      providerPayloadKey: "provider-payload-secret",
      provenance: { userToken: "redact-me" },
    } as any],
    productEvidenceManifest: {
      manifestId: "manifest-1",
      status: "ready",
      requiredClaimIds: [],
      warnings: [],
      products: [{
        id: "product-1",
        productId: "sku-1",
        title: "Product",
        imageUrl: "https://cdn.example/product.png",
        claimEvidence: [{
          claimId: "claim-1",
          evidenceIds: ["evidence-1"],
          status: "approved",
          riskLevel: "low",
          rawOcrText: "redact-me",
          reviewComment: "redact-me",
        } as any],
        provenance: { privateNote: "redact-me" },
      }],
    },
    featureFlags: {
      feature116RunOneNode: true,
      feature116RunOneShot: true,
      feature116BatchExecution: false,
    },
    generationDefaults: {
      imageModelId: "image-default",
      videoModelId: "video-default",
      imageModelSource: "project_default",
      videoModelSource: "project_default",
    },
    updatedAt: baseDate.toISOString(),
  };
}

function buildExecutableSpace(version = 1): ProductionSpace {
  return {
    ...buildSpace(version),
    status: "final_preflight_passed",
  };
}

function buildSpaceRow(space: ProductionSpace, userId = 7) {
  return {
    tenantId: "tenant-1",
    userId,
    productionRunId: space.productionRunId,
    version: space.version,
    space,
    status: space.status,
    archivedAt: null,
    deletedAt: null,
    createdAt: baseDate,
    updatedAt: baseDate,
  };
}

function createDb(options: {
  runUserId?: number;
  spaces?: Array<Record<string, any>>;
  runsSelectError?: Error;
  spacesSelectError?: Error;
} = {}) {
  const db = {
    runs: [{
      tenantId: "tenant-1",
      userId: options.runUserId ?? 7,
      productionRunId: "run-116",
      status: "plan_ready_for_review",
      goalVersion: 1,
      planVersion: 1,
      goal: {},
      productionBible: {},
      assetPlan: {},
      updatedAt: baseDate,
    }],
    spaces: options.spaces ?? [{
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      version: 1,
      space: buildSpace(1),
      status: "plan_ready_for_review",
      archivedAt: null,
      deletedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    }],
    insertedSpaces: [] as Array<Record<string, any>>,
    select() {
      let selectedTable: unknown;
      const query = {
        from(table: unknown) {
          selectedTable = table;
          return query;
        },
        where() {
          return query;
        },
        orderBy() {
          return query;
        },
        limit() {
          if (selectedTable === mediaProductionSpaces) {
            if (options.spacesSelectError) {
              return Promise.reject(options.spacesSelectError);
            }
            return Promise.resolve([...db.spaces].sort((a, b) => Number(b.version) - Number(a.version)).slice(0, 1));
          }
          if (selectedTable === mediaProductionRuns) {
            if (options.runsSelectError) {
              return Promise.reject(options.runsSelectError);
            }
            return Promise.resolve(db.runs.slice(0, 1));
          }
          return Promise.resolve([]);
        },
      };
      return query;
    },
    insert(table: unknown) {
      const insertQuery = {
        values(value: Record<string, any>) {
          if (table === mediaProductionSpaces) {
            const row = { id: db.spaces.length + 1, ...value };
            db.spaces.push(row);
            db.insertedSpaces.push(row);
          }
          return insertQuery;
        },
        onConflictDoUpdate() {
          return insertQuery;
        },
        returning() {
          if (table === mediaProductionSpaces) {
            return Promise.resolve([db.insertedSpaces[db.insertedSpaces.length - 1]]);
          }
          return Promise.resolve([db.runs[0]]);
        },
      };
      return insertQuery;
    },
  };
  return db;
}

describe("productionSpaceService", () => {
  it("keeps the ProductionSpace migration additive and no-data-loss by construction", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const migrationPath = path.resolve(testDir, "../../../drizzle/0183_production_space_node_canvas.sql");
    const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("create table if not exists \"media_production_spaces\"");
    expect(sql).toContain("\"productionrunid\" varchar");
    expect(sql).toContain("\"tenantid\" varchar");
    expect(sql).toContain("\"space\" jsonb");
    expect(sql).toContain("alter table \"media_production_spaces\" add column if not exists \"productionrunid\"");
    expect(sql).toContain("create index if not exists");
    expect(sql).not.toMatch(/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\s+\"?media_production_runs\"?/);
  });

  it("keeps production director base migrations idempotent for partially created tables", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const migrationPath = path.resolve(testDir, "../../../drizzle/0182_gemini_omni_provider_assets.sql");
    const hardeningMigrationPath = path.resolve(testDir, "../../../drizzle/0185_production_director_schema_hardening.sql");
    const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();
    const hardeningSql = fs.readFileSync(hardeningMigrationPath, "utf8").toLowerCase();
    const tables = [
      "media_provider_assets",
      "media_production_runs",
      "media_production_goal_versions",
      "media_production_plan_versions",
      "media_production_plan_verifications",
      "media_production_asset_plans",
      "media_production_approvals",
      "media_production_output_projections",
    ];

    for (const table of tables) {
      expect(sql).toContain(`create table if not exists "${table}"`);
      expect(sql).toContain(`alter table "${table}" add column if not exists`);
      expect(sql).toContain(`update "${table}"`);
      expect(hardeningSql).toContain(`create table if not exists "${table}"`);
      expect(hardeningSql).toContain(`alter table "${table}" add column if not exists`);
      expect(hardeningSql).toContain(`update "${table}"`);
    }
    expect(hardeningSql).toContain(`create table if not exists "media_production_spaces"`);
    expect(hardeningSql).toContain(`alter table "media_production_spaces" add column if not exists`);
    expect(hardeningSql).toContain(`create unique index if not exists "media_production_spaces_unique"`);
    expect(sql).not.toMatch(/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\s+\"?media_production_/);
    expect(hardeningSql).not.toMatch(/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\s+\"?media_production_/);
  });

  it("opens legacy runs deterministically without creating duplicate ProductionSpace rows", () => {
    const legacy = {
      productionRunId: "legacy-run-1",
      version: 7,
      status: "plan_ready_for_review",
      goal: {
        title: "Legacy Launch",
        summary: "Legacy summary",
        audience: "Founders",
        tabSnapshots: {
          image: { prompt: "legacy image" },
        },
      },
      productionBible: {
        shots: [{ id: "legacy-shot-a", title: "Legacy Shot", order: 1, script: "Line" }],
      },
      assetPlan: {
        nodes: [{ id: "legacy-asset-a", kind: "scene_reference", role: "reference", status: "draft" }],
      },
      updatedAt: baseDate,
    };

    const first = adaptLegacyRunToProductionSpace(legacy);
    const second = adaptLegacyRunToProductionSpace(legacy);

    expect(first).toEqual(second);
    expect(first.productionRunId).toBe("legacy-run-1");
    expect(first.brief).toMatchObject({ title: "Legacy Launch", summary: "Legacy summary", audience: "Founders" });
    expect(first.shots[0]).toMatchObject({ id: "legacy-shot-a", nodeIds: ["legacy-shot-1"] });
    expect(first.flowNodes.map((node) => node.id)).toEqual(["legacy-shot-1", "legacy-asset-a"]);
    expect(first.warnings).toContain("legacy_run_adapted");
  });

  it("upgrades v1 ProductionSpace fixtures read-safely and preserves future schemas for manual recovery", () => {
    const upgraded = upgradeProductionSpaceSchema({
      ...buildSpace(3),
      downstreamResultRecords: [{
        recordId: "downstream-1",
        sourceSpaceVersion: 3,
        target: "video_edit",
        status: "imported",
      }],
    });

    expect(upgraded).toMatchObject({ ok: true });
    if (upgraded.ok) {
      expect(upgraded.space).toMatchObject({
        productionRunId: "run-116",
        version: 3,
        brief: { summary: "Production Director canvas" },
        generationDefaults: {
          imageModelId: "image-default",
          videoModelId: "video-default",
        },
      });
      expect(upgraded.space.flowNodes[0].configSnapshot?.snapshotId).toBe("config-1");
      expect(upgraded.space.downstreamResultRecords?.[0]?.recordId).toBe("downstream-1");
    }

    const future = { ...buildSpace(4), schemaVersion: "9.0.0", customFutureField: { recover: true } };
    expect(upgradeProductionSpaceSchema(future)).toMatchObject({
      ok: false,
      reason: "unsupported_future_schema",
      schemaVersion: "9.0.0",
      preservedInput: future,
    });
  });

  it("migrates oversized ProductionSpace warning fields on read", async () => {
    const longWarning = `prompt payload ${"x".repeat(1_500)}`;
    const dirtySpace: ProductionSpace = {
      ...buildSpace(2),
      warnings: [longWarning],
      contextAssets: [{
        ...buildSpace(2).contextAssets[0],
        warnings: [{ raw: longWarning } as any],
      }],
      shots: [{
        ...buildSpace(2).shots[0],
        mustShow: [longWarning],
        mustAvoid: [{ raw: longWarning } as any],
      }],
      flowNodes: [{
        ...buildSpace(2).flowNodes[0],
        readinessIssues: [longWarning],
      }],
      productEvidenceManifest: {
        ...buildSpace(2).productEvidenceManifest!,
        warnings: [longWarning],
        products: [{
          ...buildSpace(2).productEvidenceManifest!.products[0],
          reviewNotes: [longWarning],
        }],
      },
    };
    const db = createDb({ spaces: [buildSpaceRow(dirtySpace)] });

    const result = await getProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
    });

    expect(result?.space.warnings?.[0]).toHaveLength(1_000);
    expect(result?.space.contextAssets[0].warnings?.[0]).toHaveLength(1_000);
    expect(result?.space.shots[0].mustShow?.[0]).toHaveLength(1_000);
    expect(result?.space.shots[0].mustAvoid?.[0]).toHaveLength(1_000);
    expect(result?.space.flowNodes[0].readinessIssues?.[0]).toHaveLength(1_000);
    expect(result?.space.productEvidenceManifest?.warnings[0]).toHaveLength(1_000);
    expect(result?.space.productEvidenceManifest?.products[0].reviewNotes?.[0]).toHaveLength(1_000);
  });

  it("falls back to the legacy run when ProductionSpace storage is not migrated yet", async () => {
    const db = createDb({
      spacesSelectError: Object.assign(
        new Error('Failed query: select from "media_production_spaces"; relation "media_production_spaces" does not exist'),
        { code: "42P01" },
      ),
    });

    const result = await getProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
    });

    expect(result).toMatchObject({
      source: "legacy",
      version: 1,
      space: { productionRunId: "run-116" },
    });
  });

  it("opens the latest ProductionSpace when legacy run storage is not migrated yet", async () => {
    const db = createDb({
      runsSelectError: Object.assign(
        new Error('Failed query: select from "media_production_runs"; relation "media_production_runs" does not exist'),
        { code: "42P01" },
      ),
    });

    const result = await getProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
    });

    expect(result).toMatchObject({
      source: "space",
      version: 1,
      space: { productionRunId: "run-116" },
    });
  });

  it("rejects stale expectedVersion without inserting a new version", async () => {
    const db = createDb();

    await expect(saveProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 0,
      space: buildSpace(1),
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "space_version_stale",
      cause: {
        schemaVersion: "production_conflict_v1",
        reason: "space_version_stale",
        productionRunId: "run-116",
        expected: { spaceVersion: 0 },
        current: { spaceVersion: 1 },
        safePreview: { canReloadLatest: true },
      },
    });
    expect(db.insertedSpaces).toHaveLength(0);
  });

  it("enforces the production run owner guard for cross-user access", async () => {
    const db = createDb({ runUserId: 99 });

    await expect(getProductionNodeConfig({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      nodeId: "node-video",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redacts node configs, output refs, URLs, and provenance from exports", () => {
    const exported = redactProductionSpaceExport(buildSpace(1));

    expect(exported.brief.productContext).toBeUndefined();
    expect(exported.flowNodes[0]).not.toHaveProperty("configSnapshot");
    expect(exported.flowNodes[0]).not.toHaveProperty("outputRefs");
    expect(exported.contextAssets[0]).not.toHaveProperty("url");
    expect(exported.contextAssets[0]).not.toHaveProperty("provenance");
    expect(exported.contextAssets[0]).not.toHaveProperty("providerPayloadKey");
    expect(exported.productEvidenceManifest?.products[0]).not.toHaveProperty("imageUrl");
    expect(exported.productEvidenceManifest?.products[0]).not.toHaveProperty("provenance");
    expect(exported.productEvidenceManifest?.products[0].claimEvidence[0]).toMatchObject({
      status: "approved",
      riskLevel: "low",
    });
    expect(exported.productEvidenceManifest?.products[0].claimEvidence[0].claimId).toMatch(/^claim-/);
    expect(exported.productEvidenceManifest?.products[0].claimEvidence[0].evidenceIds[0]).toMatch(/^evidence-/);
    expect(exported.flowNodes[0].id).not.toBe("node-video");
  });

  it("returns a node config snapshot from the latest production space", async () => {
    const db = createDb();

    const result = await getProductionNodeConfig({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      nodeId: "node-video",
    });

    expect(result).toMatchObject({
      nodeId: "node-video",
      version: 1,
      source: "space",
      configSnapshot: { snapshotId: "config-1", configHash: "hash-1" },
    });
  });

  it("archives, restores, and soft deletes by appending lifecycle versions", async () => {
    const db = createDb();

    const archived = await archiveProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
    });
    expect(archived.version).toBe(2);
    expect(archived.archivedAt).toEqual(expect.any(String));
    expect(archived.deletedAt).toBeNull();

    const restored = await restoreProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 2,
    });
    expect(restored.version).toBe(3);
    expect(restored.archivedAt).toBeNull();
    expect(restored.deletedAt).toBeNull();

    const deleted = await deleteProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 3,
    });
    expect(deleted.version).toBe(4);
    expect(deleted.deletedAt).toEqual(expect.any(String));
    expect(db.insertedSpaces.map((space) => space.changeKind)).toEqual(["archive", "restore", "delete"]);
  });

  it("guards brief and shot edits with independent layer versions", async () => {
    const db = createDb();

    await expect(saveProductionBrief({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      expectedBriefVersion: 99,
      brief: { title: "New", summary: "New summary" },
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "brief_version_stale",
      cause: { reason: "brief_version_stale", expected: { briefVersion: 99 }, current: { briefVersion: 1 } },
    });

    await expect(saveProductionShot({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      expectedShotVersion: 99,
      shot: { ...buildSpace(1).shots[0], title: "New shot" },
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "shot_version_stale",
      cause: { reason: "shot_version_stale", expected: { shotVersion: 99 }, current: { shotVersion: 1 } },
    });
  });

  it("blocks archived spaces before execution side effects", async () => {
    const archivedRow = { ...buildSpaceRow(buildExecutableSpace(1)), archivedAt: baseDate };
    const db = createDb({ spaces: [archivedRow] });
    const previousRunOne = process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    const previousDispatch = process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED;
    process.env.FEATURE116_RUN_ONE_NODE_ENABLED = "true";
    process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED = "true";
    const reserve = vi.fn();
    const dispatchNode = vi.fn();

    await expect(scheduleProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      scope: "node",
      targetId: "node-video",
      confirmed: true,
      userToken: "token",
      creditLedger: { reserve, refund: vi.fn() },
      mediaDispatcher: { dispatchNode },
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "production_space_archived_read_only" });
    expect(reserve).not.toHaveBeenCalled();
    expect(dispatchNode).not.toHaveBeenCalled();

    if (previousRunOne === undefined) delete process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    else process.env.FEATURE116_RUN_ONE_NODE_ENABLED = previousRunOne;
    if (previousDispatch === undefined) delete process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED;
    else process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED = previousDispatch;
  });

  it("enforces node-level config version guards and appends audit events", async () => {
    const db = createDb();

    await expect(saveProductionNodeConfig({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      nodeId: "node-video",
      expectedNodeVersion: 99,
      configSnapshot: {
        snapshotId: "config-2",
        version: 2,
        toolSurface: "video",
        adapter: "video",
        config: {},
        configHash: "hash-2",
      },
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "node_version_stale",
      cause: {
        schemaVersion: "production_conflict_v1",
        reason: "node_version_stale",
        expected: { nodeVersion: 99 },
        current: { nodeVersion: 1, spaceVersion: 1 },
        safePreview: { canReloadLatest: true },
      },
    });

    const saved = await saveProductionNodeConfig({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      nodeId: "node-video",
      expectedNodeVersion: 1,
      previousConfigSnapshotId: "config-1",
      configSnapshot: {
        snapshotId: "config-2",
        version: 2,
        toolSurface: "video",
        adapter: "video",
        config: { prompt: "safe" },
        configHash: "hash-2",
      },
    });

    expect(saved.space.flowNodes[0].configSnapshot?.snapshotId).toBe("config-2");
    expect(saved.space.auditEvents?.at(-1)?.action).toBe("node_config_save");
  });

  it("rejects Save-to-Node when the config adapter does not match the shared node catalog", async () => {
    const db = createDb();

    await expect(saveProductionNodeConfig({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      nodeId: "node-video",
      expectedNodeVersion: 1,
      configSnapshot: {
        snapshotId: "config-mismatch",
        version: 2,
        toolSurface: "image",
        adapter: "image",
        config: {},
        configHash: "hash-mismatch",
      },
    })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "production_node_tool_surface_mismatch",
    });
  });

  it("rejects deferred and preview-only nodes before scheduling execution", async () => {
    const previous = process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    process.env.FEATURE116_RUN_ONE_NODE_ENABLED = "true";
    try {
      const space = buildExecutableSpace(1);
      space.flowNodes[0] = {
        ...space.flowNodes[0],
        kind: "video_shot",
        configSnapshot: {
          snapshotId: "config-preview",
          version: 1,
          toolSurface: "production",
          adapter: "preview_only",
          config: {},
          configHash: "hash-preview",
        },
      };
      const db = createDb({ spaces: [buildSpaceRow(space)] });

      await expect(scheduleProductionExecution({
        db,
        tenantId: "tenant-1",
        userId: 7,
        productionRunId: "run-116",
        expectedVersion: 1,
        scope: "node",
        targetId: "node-video",
        confirmed: true,
      })).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: "production_node_adapter_preview_only",
      });
    } finally {
      if (previous === undefined) delete process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
      else process.env.FEATURE116_RUN_ONE_NODE_ENABLED = previous;
    }
  });

  it("does not allow broad saveSpace payloads to tamper server-controlled flags or product approval state", async () => {
    const db = createDb();
    const tampered = buildSpace(1);
    tampered.featureFlags = { feature116RunOneNode: true };
    tampered.productEvidenceManifest!.products[0].approvalState = "blocked";
    tampered.productEvidenceManifest!.products[0].claimEvidence[0].status = "blocked";

    const saved = await saveProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      space: tampered,
    });

    expect(saved.space.featureFlags).toEqual(buildSpace(1).featureFlags);
    expect(saved.space.productEvidenceManifest?.products[0].approvalState).not.toBe("blocked");
    expect(saved.space.productEvidenceManifest?.products[0].claimEvidence[0].status).toBe("approved");
  });

  it("requires server-side execution flags before scheduling provider-credit attempts", async () => {
    const db = createDb();

    await expect(scheduleProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      scope: "node",
      targetId: "node-video",
      confirmed: true,
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "production_execution_disabled:runOneNode" });
  });

  it("schedules, cancels, and refunds a confirmed run-one-node execution attempt", async () => {
    const db = createDb({ spaces: [buildSpaceRow(buildExecutableSpace(1))] });
    const previous = process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    process.env.FEATURE116_RUN_ONE_NODE_ENABLED = "true";

    const scheduled = await scheduleProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      scope: "node",
      targetId: "node-video",
      confirmed: true,
    });

    expect(scheduled.attempt).toMatchObject({
      scope: "node",
      status: "queued",
      nodeIds: ["node-video"],
      creditReserved: 4,
    });
    expect(scheduled.space.flowNodes[0].status).toBe("running");

    const cancelled = await cancelProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 2,
      attemptId: scheduled.attempt.attemptId,
      creditLedger: {
        reserve: vi.fn(),
        refund: vi.fn().mockResolvedValue({ transactionId: 2 }),
      },
    });

    expect(cancelled.attempt.status).toBe("cancelled");
    expect(cancelled.attempt.creditRefunded).toBe(4);
    expect(cancelled.space.flowNodes[0].status).toBe("cancelled");
    if (previous === undefined) {
      delete process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    } else {
      process.env.FEATURE116_RUN_ONE_NODE_ENABLED = previous;
    }
  });

  it("batch execution only schedules configured MVP executable nodes", async () => {
    const previousRunOne = process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    const previousRunShot = process.env.FEATURE116_RUN_ONE_SHOT_ENABLED;
    const previousBatch = process.env.FEATURE116_BATCH_EXECUTION_ENABLED;
    process.env.FEATURE116_RUN_ONE_NODE_ENABLED = "true";
    process.env.FEATURE116_RUN_ONE_SHOT_ENABLED = "true";
    process.env.FEATURE116_BATCH_EXECUTION_ENABLED = "true";
    const space: ProductionSpace = {
      ...buildExecutableSpace(1),
      featureFlags: {
        ...buildExecutableSpace(1).featureFlags,
        feature116BatchExecution: true,
      },
      flowNodes: [
        ...buildExecutableSpace(1).flowNodes,
        {
          id: "node-brief-preview",
          kind: "goal_brief",
          title: "Goal Brief",
          status: "ready",
          configSnapshot: {
            snapshotId: "preview-config",
            version: 1,
            toolSurface: "production",
            adapter: "preview_only",
            config: {},
            configHash: "preview-hash",
          },
        },
        {
          id: "node-draft-image",
          kind: "image",
          title: "Draft image without config",
          status: "draft",
        },
      ],
      shots: [{
        id: "shot-1",
        title: "Opening",
        order: 1,
        nodeIds: ["node-video", "node-brief-preview", "node-draft-image"],
        status: "ready",
      }],
    };
    const db = createDb({ spaces: [buildSpaceRow(space)] });

    const scheduled = await scheduleProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      scope: "batch",
      confirmed: true,
    });

    expect(scheduled.attempt).toMatchObject({
      scope: "batch",
      nodeIds: ["node-video"],
      shotIds: ["shot-1"],
      creditReserved: 4,
    });
    expect(scheduled.space.flowNodes.find((node) => node.id === "node-video")?.status).toBe("running");
    expect(scheduled.space.flowNodes.find((node) => node.id === "node-brief-preview")?.status).toBe("ready");
    expect(scheduled.space.flowNodes.find((node) => node.id === "node-draft-image")?.status).toBe("draft");
    if (previousRunOne === undefined) delete process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    else process.env.FEATURE116_RUN_ONE_NODE_ENABLED = previousRunOne;
    if (previousRunShot === undefined) delete process.env.FEATURE116_RUN_ONE_SHOT_ENABLED;
    else process.env.FEATURE116_RUN_ONE_SHOT_ENABLED = previousRunShot;
    if (previousBatch === undefined) delete process.env.FEATURE116_BATCH_EXECUTION_ENABLED;
    else process.env.FEATURE116_BATCH_EXECUTION_ENABLED = previousBatch;
  });

  it("orders batch execution by dependencies and skips completed unchanged nodes", async () => {
    const previousRunOne = process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    const previousRunShot = process.env.FEATURE116_RUN_ONE_SHOT_ENABLED;
    const previousBatch = process.env.FEATURE116_BATCH_EXECUTION_ENABLED;
    process.env.FEATURE116_RUN_ONE_NODE_ENABLED = "true";
    process.env.FEATURE116_RUN_ONE_SHOT_ENABLED = "true";
    process.env.FEATURE116_BATCH_EXECUTION_ENABLED = "true";
    const base = buildExecutableSpace(1);
    const space: ProductionSpace = {
      ...base,
      featureFlags: {
        ...base.featureFlags,
        feature116BatchExecution: true,
      },
      flowNodes: [
        {
          ...base.flowNodes[0],
          id: "node-video",
          status: "completed",
          outputRefs: [{
            outputRefId: "out-completed",
            nodeId: "node-video",
            kind: "video",
            url: "https://cdn.example/completed.mp4",
            configHash: "hash-1",
          }],
        },
        {
          id: "node-image",
          kind: "image",
          title: "Image",
          status: "ready",
          configSnapshot: {
            snapshotId: "config-image",
            version: 1,
            toolSurface: "image",
            adapter: "image",
            config: { prompt: "image" },
            configHash: "hash-image",
          },
          estimatedCredits: 2,
        },
        {
          id: "node-tts",
          kind: "tts",
          title: "TTS",
          status: "ready",
          configSnapshot: {
            snapshotId: "config-tts",
            version: 1,
            toolSurface: "audio",
            adapter: "tts",
            config: { text: "voice" },
            configHash: "hash-tts",
          },
          estimatedCredits: 1,
        },
      ],
      flowEdges: [
        { id: "image-tts", source: "node-image", target: "node-tts", kind: "dependency" },
      ],
      shots: [{
        id: "shot-1",
        title: "Opening",
        order: 1,
        nodeIds: ["node-tts", "node-video", "node-image"],
        status: "ready",
      }],
    };
    const db = createDb({ spaces: [buildSpaceRow(space)] });

    const scheduled = await scheduleProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      scope: "batch",
      confirmed: true,
    });

    expect(scheduled.attempt.nodeIds).toEqual(["node-image", "node-tts"]);
    expect(scheduled.attempt.creditReserved).toBe(3);
    expect(scheduled.space.flowNodes.find((node) => node.id === "node-video")?.status).toBe("completed");

    if (previousRunOne === undefined) delete process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    else process.env.FEATURE116_RUN_ONE_NODE_ENABLED = previousRunOne;
    if (previousRunShot === undefined) delete process.env.FEATURE116_RUN_ONE_SHOT_ENABLED;
    else process.env.FEATURE116_RUN_ONE_SHOT_ENABLED = previousRunShot;
    if (previousBatch === undefined) delete process.env.FEATURE116_BATCH_EXECUTION_ENABLED;
    else process.env.FEATURE116_BATCH_EXECUTION_ENABLED = previousBatch;
  });

  it("dispatches provider media tasks, reserves credits, and attaches task refs when live dispatch is enabled", async () => {
    const db = createDb({ spaces: [buildSpaceRow(buildExecutableSpace(1))] });
    const previousRunOne = process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    const previousDispatch = process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED;
    process.env.FEATURE116_RUN_ONE_NODE_ENABLED = "true";
    process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED = "true";
    const reserve = vi.fn().mockResolvedValue({ transactionId: 1 });
    const refund = vi.fn().mockResolvedValue({ transactionId: 2 });
    const dispatchNode = vi.fn().mockResolvedValue({
      id: "media-task-1",
      taskId: "provider-task-1",
      userId: "7",
      mediaType: "video",
      status: "processing",
      model: "video-model",
      prompt: "show product",
      createdAt: baseDate.toISOString(),
    });

    const scheduled = await scheduleProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      userToken: "user-token",
      productionRunId: "run-116",
      expectedVersion: 1,
      scope: "node",
      targetId: "node-video",
      confirmed: true,
      creditLedger: { reserve, refund },
      mediaDispatcher: { dispatchNode },
    });

    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ amount: 4, attemptId: scheduled.attempt.attemptId }));
    expect(dispatchNode).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      userToken: "user-token",
      node: expect.objectContaining({ id: "node-video" }),
    }));
    expect(scheduled.attempt).toMatchObject({
      status: "running",
      mediaTaskIds: ["media-task-1"],
      providerTaskIds: ["provider-task-1"],
      creditReserved: 4,
    });
    expect(scheduled.space.flowNodes[0].outputRefs?.at(-1)).toMatchObject({
      mediaTaskId: "media-task-1",
      providerTaskId: "provider-task-1",
    });

    if (previousRunOne === undefined) delete process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    else process.env.FEATURE116_RUN_ONE_NODE_ENABLED = previousRunOne;
    if (previousDispatch === undefined) delete process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED;
    else process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED = previousDispatch;
  });

  it("refunds reserved credits and marks provider failures when submission fails", async () => {
    const db = createDb({ spaces: [buildSpaceRow(buildExecutableSpace(1))] });
    const previousRunOne = process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    const previousDispatch = process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED;
    process.env.FEATURE116_RUN_ONE_NODE_ENABLED = "true";
    process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED = "true";
    const refund = vi.fn().mockResolvedValue({ transactionId: 2 });

    const scheduled = await scheduleProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      userToken: "user-token",
      productionRunId: "run-116",
      expectedVersion: 1,
      scope: "node",
      targetId: "node-video",
      confirmed: true,
      creditLedger: {
        reserve: vi.fn().mockResolvedValue({ transactionId: 1 }),
        refund,
      },
      mediaDispatcher: {
        dispatchNode: vi.fn().mockRejectedValue(new Error("provider down")),
      },
    });

    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 4, reason: "submission_failed" }));
    expect(scheduled.attempt).toMatchObject({
      status: "failed",
      creditRefunded: 4,
      errorCode: "provider_submission_failed",
    });
    expect(scheduled.space.metrics?.providerFailures).toBe(1);
    expect(scheduled.space.flowNodes[0].status).toBe("failed");

    if (previousRunOne === undefined) delete process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    else process.env.FEATURE116_RUN_ONE_NODE_ENABLED = previousRunOne;
    if (previousDispatch === undefined) delete process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED;
    else process.env.FEATURE116_PROVIDER_DISPATCH_ENABLED = previousDispatch;
  });

  it("reconciles completed media tasks into node outputs and charged attempt state", async () => {
    const space = buildSpace(1);
    space.actionAttempts = [{
      attemptId: "attempt-1",
      kind: "generate",
      scope: "node",
      status: "running",
      nodeIds: ["node-video"],
      shotIds: ["shot-1"],
      idempotencyKey: "idem-1",
      expectedSpaceVersion: 1,
      creditEstimate: 4,
      creditReserved: 4,
      creditSpent: 0,
      creditRefunded: 0,
      mediaTaskIds: ["media-task-1"],
      providerTaskIds: ["provider-task-1"],
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
    }];
    const db = createDb({ spaces: [{
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      version: 1,
      space,
      status: "final_generating",
      archivedAt: null,
      deletedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    }] });

    const reconciled = await reconcileProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      attemptId: "attempt-1",
      tasks: [{
        id: "media-task-1",
        taskId: "provider-task-1",
        userId: "7",
        mediaType: "video",
        status: "completed",
        model: "video-model",
        prompt: "show product",
        resultUrl: "https://cdn.example/generated.mp4",
        createdAt: baseDate.toISOString(),
        completedAt: baseDate.toISOString(),
      }],
    });

    expect(reconciled.attempt).toMatchObject({
      status: "completed",
      creditSpent: 4,
      creditRefunded: 0,
    });
    expect(reconciled.space.flowNodes[0]).toMatchObject({ status: "completed" });
    expect(reconciled.space.flowNodes[0].outputRefs?.at(-1)).toMatchObject({
      mediaTaskId: "media-task-1",
      url: "https://cdn.example/generated.mp4",
    });
  });

  it("reconciles completed media tasks back to the node that owns the task output ref", async () => {
    const space = buildSpace(1);
    space.shots[0].nodeIds = ["node-preview", "node-video"];
    space.flowNodes = [
      {
        id: "node-preview",
        kind: "handoff",
        title: "Preview only",
        status: "running",
        configSnapshot: {
          snapshotId: "config-preview",
          version: 1,
          toolSurface: "production",
          adapter: "preview_only",
          config: {},
          configHash: "preview-hash",
        },
      },
      {
        ...space.flowNodes[0],
        status: "running",
        outputRefs: [{
          outputRefId: "out-node-video-media-task-1",
          nodeId: "node-video",
          kind: "video",
          mediaTaskId: "media-task-1",
          providerTaskId: "provider-task-1",
        }],
      },
    ];
    space.actionAttempts = [{
      attemptId: "attempt-1",
      kind: "generate",
      scope: "shot",
      status: "running",
      nodeIds: ["node-preview", "node-video"],
      shotIds: ["shot-1"],
      idempotencyKey: "idem-1",
      expectedSpaceVersion: 1,
      creditEstimate: 4,
      creditReserved: 4,
      creditSpent: 0,
      creditRefunded: 0,
      mediaTaskIds: ["media-task-1"],
      providerTaskIds: ["provider-task-1"],
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
    }];
    const db = createDb({ spaces: [{
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      version: 1,
      space,
      status: "final_generating",
      archivedAt: null,
      deletedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    }] });

    const reconciled = await reconcileProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      attemptId: "attempt-1",
      tasks: [{
        id: "media-task-1",
        taskId: "provider-task-1",
        userId: "7",
        mediaType: "video",
        status: "completed",
        model: "video-model",
        prompt: "show product",
        resultUrl: "https://cdn.example/generated.mp4",
        createdAt: baseDate.toISOString(),
        completedAt: baseDate.toISOString(),
      }],
    });

    expect(reconciled.space.flowNodes[0].id).toBe("node-preview");
    expect(reconciled.space.flowNodes[0].outputRefs).toBeUndefined();
    expect(reconciled.space.flowNodes[1].id).toBe("node-video");
    expect(reconciled.space.flowNodes[1].outputRefs?.at(-1)).toMatchObject({
      nodeId: "node-video",
      mediaTaskId: "media-task-1",
      url: "https://cdn.example/generated.mp4",
    });
  });

  it("allows shared collaborators according to read/write/execute permission levels", async () => {
    const sharedSpace = buildSpace(1);
    sharedSpace.accessPolicy = {
      ownerUserId: 7,
      collaborators: [
        { userId: 8, level: "read" },
        { userId: 9, level: "execute", canExecute: true },
        { userId: 10, level: "write" },
      ],
    };
    const db = createDb({ spaces: [{
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      version: 1,
      space: sharedSpace,
      status: "plan_ready_for_review",
      archivedAt: null,
      deletedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    }] });

    await expect(getProductionNodeConfig({
      db,
      tenantId: "tenant-1",
      userId: 8,
      productionRunId: "run-116",
      nodeId: "node-video",
    })).resolves.toMatchObject({ nodeId: "node-video" });

    await expect(saveProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 8,
      productionRunId: "run-116",
      expectedVersion: 1,
      space: sharedSpace,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const tampered = {
      ...sharedSpace,
      accessPolicy: {
        ownerUserId: 7,
        collaborators: [{ userId: 10, level: "owner" as const }],
      },
    };
    const saved = await saveProductionSpace({
      db,
      tenantId: "tenant-1",
      userId: 10,
      productionRunId: "run-116",
      expectedVersion: 1,
      space: tampered,
    });
    expect(saved.space.accessPolicy?.collaborators?.find((item) => item.userId === 10)?.level).toBe("write");
  });

  it("refunds the original credit owner and blocks stale cancellation side effects", async () => {
    const space = buildSpace(1);
    space.accessPolicy = {
      ownerUserId: 7,
      collaborators: [{ userId: 9, level: "execute", canExecute: true }],
    };
    space.actionAttempts = [{
      attemptId: "attempt-1",
      kind: "generate",
      scope: "node",
      status: "running",
      actorUserId: 7,
      creditOwnerUserId: 7,
      nodeIds: ["node-video"],
      shotIds: ["shot-1"],
      idempotencyKey: "idem-1",
      expectedSpaceVersion: 1,
      creditEstimate: 4,
      creditReserved: 4,
      creditSpent: 0,
      creditRefunded: 0,
      mediaTaskIds: ["media-task-1"],
      providerTaskIds: ["provider-task-1"],
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
    }];
    const db = createDb({ spaces: [{
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      version: 1,
      space,
      status: "final_generating",
      archivedAt: null,
      deletedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    }] });
    const refund = vi.fn().mockResolvedValue({ transactionId: 2 });
    const cancelTask = vi.fn().mockResolvedValue({
      id: "media-task-1",
      userId: "7",
      mediaType: "video",
      status: "cancelled",
      model: "video-model",
      prompt: "show product",
      createdAt: baseDate.toISOString(),
    });

    await expect(cancelProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 9,
      userToken: "user-token",
      productionRunId: "run-116",
      expectedVersion: 0,
      attemptId: "attempt-1",
      creditLedger: { reserve: vi.fn(), refund },
      mediaDispatcher: { dispatchNode: vi.fn(), cancelTask },
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(refund).not.toHaveBeenCalled();
    expect(cancelTask).not.toHaveBeenCalled();

    const cancelled = await cancelProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 9,
      userToken: "user-token",
      productionRunId: "run-116",
      expectedVersion: 1,
      attemptId: "attempt-1",
      creditLedger: { reserve: vi.fn(), refund },
      mediaDispatcher: { dispatchNode: vi.fn(), cancelTask },
    });
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, amount: 4 }));
    expect(cancelled.attempt.creditRefunded).toBe(4);
  });

  it("does not double-refund completed or cancelled attempts during reconciliation", async () => {
    const space = buildSpace(1);
    space.actionAttempts = [{
      attemptId: "attempt-cancelled",
      kind: "generate",
      scope: "node",
      status: "cancelled",
      actorUserId: 7,
      creditOwnerUserId: 7,
      nodeIds: ["node-video"],
      shotIds: ["shot-1"],
      idempotencyKey: "idem-cancelled",
      expectedSpaceVersion: 1,
      creditEstimate: 4,
      creditReserved: 4,
      creditSpent: 0,
      creditRefunded: 4,
      mediaTaskIds: ["media-task-1"],
      providerTaskIds: ["provider-task-1"],
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
      cancelledAt: baseDate.toISOString(),
    }];
    const db = createDb({ spaces: [{
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      version: 1,
      space,
      status: "cancelled",
      archivedAt: null,
      deletedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    }] });
    const refund = vi.fn();

    const reconciled = await reconcileProductionExecution({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      attemptId: "attempt-cancelled",
      creditLedger: { reserve: vi.fn(), refund },
      tasks: [{
        id: "media-task-1",
        userId: "7",
        mediaType: "video",
        status: "failed",
        model: "video-model",
        prompt: "show product",
        createdAt: baseDate.toISOString(),
      }],
    });

    expect(reconciled.reconciledTaskIds).toEqual([]);
    expect(refund).not.toHaveBeenCalled();
  });

  it("reconciles provider callbacks without polling and verifies the credit ledger", async () => {
    const space = buildExecutableSpace(1);
    space.status = "final_generating";
    space.flowNodes[0].status = "running";
    space.flowNodes[0].outputRefs = [{
      outputRefId: "out-node-video-media-task-1",
      nodeId: "node-video",
      kind: "video",
      mediaTaskId: "media-task-1",
      providerTaskId: "provider-task-1",
    }];
    space.actionAttempts = [{
      attemptId: "attempt-1",
      kind: "generate",
      scope: "node",
      status: "running",
      actorUserId: 7,
      creditOwnerUserId: 7,
      nodeIds: ["node-video"],
      shotIds: ["shot-1"],
      idempotencyKey: "idem-1",
      expectedSpaceVersion: 1,
      creditEstimate: 4,
      creditReserved: 4,
      creditSpent: 0,
      creditRefunded: 0,
      mediaTaskIds: ["media-task-1"],
      providerTaskIds: ["provider-task-1"],
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
    }];
    const db = createDb({ spaces: [buildSpaceRow(space)] });
    const verify = vi.fn().mockResolvedValue({ ok: true, reserved: 4, spent: 4, refunded: 0 });

    const reconciled = await reconcileProductionProviderCallback({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      task: {
        id: "media-task-1",
        taskId: "provider-task-1",
        userId: "7",
        mediaType: "video",
        status: "completed",
        model: "video-model",
        prompt: "show product",
        resultUrl: "https://cdn.example/generated.mp4",
        createdAt: baseDate.toISOString(),
        completedAt: baseDate.toISOString(),
      },
      creditLedger: { reserve: vi.fn(), refund: vi.fn(), verify },
    });

    expect(verify).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      tenantId: "tenant-1",
      productionRunId: "run-116",
      attempt: expect.objectContaining({ status: "completed", creditSpent: 4 }),
    }));
    expect(reconciled.attempt.status).toBe("completed");
    expect(reconciled.space.status).toBe("final_qa_passed");
    expect(reconciled.space.metrics?.creditReconciliationRuns).toBe(1);
    expect(reconciled.space.metrics?.reconciledExecutionAttempts).toBe(1);
  });

  it("runs the pending execution poller and reports credit ledger mismatches", async () => {
    const space = buildExecutableSpace(1);
    space.status = "final_generating";
    space.flowNodes[0].status = "running";
    space.flowNodes[0].outputRefs = [{
      outputRefId: "out-node-video-media-task-1",
      nodeId: "node-video",
      kind: "video",
      mediaTaskId: "media-task-1",
      providerTaskId: "provider-task-1",
    }];
    space.actionAttempts = [{
      attemptId: "attempt-1",
      kind: "generate",
      scope: "node",
      status: "running",
      actorUserId: 7,
      creditOwnerUserId: 7,
      nodeIds: ["node-video"],
      shotIds: ["shot-1"],
      idempotencyKey: "idem-1",
      expectedSpaceVersion: 1,
      creditEstimate: 4,
      creditReserved: 4,
      creditSpent: 0,
      creditRefunded: 0,
      mediaTaskIds: ["media-task-1"],
      providerTaskIds: ["provider-task-1"],
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
    }];
    const db = createDb({ spaces: [buildSpaceRow(space)] });
    const getTask = vi.fn().mockResolvedValue({
      id: "media-task-1",
      taskId: "provider-task-1",
      userId: "7",
      mediaType: "video",
      status: "completed",
      model: "video-model",
      prompt: "show product",
      resultUrl: "https://cdn.example/generated.mp4",
      createdAt: baseDate.toISOString(),
      completedAt: baseDate.toISOString(),
    });
    const verify = vi.fn().mockResolvedValue({
      ok: false,
      reserved: 4,
      spent: 3,
      refunded: 0,
      mismatchAmount: 1,
      reason: "spent_less_than_reserved",
    });

    const summary = await reconcilePendingProductionExecutions({
      db,
      tenantId: "tenant-1",
      userId: 7,
      userToken: "user-token",
      mediaDispatcher: { dispatchNode: vi.fn(), getTask },
      creditLedger: { reserve: vi.fn(), refund: vi.fn(), verify },
    });

    expect(getTask).toHaveBeenCalledWith({ mediaTaskId: "media-task-1", userToken: "user-token" });
    expect(summary).toMatchObject({ scannedSpaces: 1, pendingAttempts: 1, reconciledAttempts: 1, skippedAttempts: 0 });
    const latestSpace = db.spaces.at(-1)?.space as ProductionSpace;
    expect(latestSpace.metrics?.creditMismatches).toBe(1);
    expect(latestSpace.metrics?.creditAlertCount).toBe(1);
  });

  it("records provider callback misses when the pending poller lacks task status credentials", async () => {
    const space = buildExecutableSpace(1);
    space.status = "final_generating";
    space.actionAttempts = [{
      attemptId: "attempt-1",
      kind: "generate",
      scope: "node",
      status: "running",
      actorUserId: 7,
      creditOwnerUserId: 7,
      nodeIds: ["node-video"],
      shotIds: ["shot-1"],
      idempotencyKey: "idem-1",
      expectedSpaceVersion: 1,
      creditEstimate: 4,
      creditReserved: 4,
      creditSpent: 0,
      creditRefunded: 0,
      mediaTaskIds: ["media-task-1"],
      providerTaskIds: ["provider-task-1"],
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
    }];
    const db = createDb({ spaces: [buildSpaceRow(space)] });

    const summary = await reconcilePendingProductionExecutions({
      db,
      tenantId: "tenant-1",
      userId: 7,
      mediaDispatcher: { dispatchNode: vi.fn() },
      creditLedger: { reserve: vi.fn(), refund: vi.fn() },
    });

    expect(summary.skippedAttempts).toBe(1);
    expect(summary.alerts[0]).toMatchObject({
      code: "provider_callback_missing",
      attemptId: "attempt-1",
    });
    const latestSpace = db.spaces.at(-1)?.space as ProductionSpace;
    expect(latestSpace.metrics?.providerCallbackMisses).toBe(1);
    expect(latestSpace.metrics?.pendingExecutionAttempts).toBe(1);
  });

  it("keeps product evidence actions structured and rejects evidence ids as claim ids", async () => {
    const db = createDb();

    await expect(saveProductionShotProductUse({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      shotProductUse: {
        shotId: "shot-1",
        productStoryboardAssetIds: ["product-1"],
        claimIds: ["evidence-1"],
        evidenceIds: ["evidence-1"],
      },
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "invalid_product_claim_id" });

    const saved = await saveProductionShotProductUse({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      shotProductUse: {
        shotId: "shot-1",
        productStoryboardAssetIds: ["product-1"],
        claimIds: ["claim-1"],
        evidenceIds: ["evidence-1"],
        frameStrategy: "image_reference",
        requiredVisualAccuracy: "strict",
      },
    });
    expect(saved.space.shotProductUsage?.[0]).toMatchObject({ shotId: "shot-1", claimIds: ["claim-1"] });

    const updated = await updateProductionProductStoryboardAsset({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 2,
      productAssetId: "product-1",
      action: "update_role",
      patch: { role: "hero", approvalState: "blocked" },
    });
    expect(updated.space.productEvidenceManifest?.products[0]).toMatchObject({ role: "hero" });
    expect(updated.space.productEvidenceManifest?.products[0].approvalState).not.toBe("blocked");
  });

  it("repairs stale output refs without crashing export", async () => {
    const space = buildSpace(1);
    space.flowNodes[0].outputRefs = [{
      outputRefId: "out-stale",
      nodeId: "node-video",
      kind: "video",
      mediaId: "media-1",
    }];
    const db = createDb({ spaces: [{
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      version: 1,
      space,
      status: "plan_ready_for_review",
      archivedAt: null,
      deletedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    }] });

    const repaired = await repairProductionStaleOutputRefs({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
    });

    expect(repaired.repairedOutputRefIds).toEqual(["out-stale"]);
    expect(repaired.space.flowNodes[0].outputRefs?.[0].libraryItemId).toBe("media-1");
  });

  it("imports downstream results without overwriting locked shots or nodes", async () => {
    const space = buildSpace(1);
    space.shots[0].locked = true;
    space.flowNodes[0].locked = true;
    const db = createDb({ spaces: [buildSpaceRow(space)] });

    const imported = await importProductionDownstreamResult({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      result: {
        recordId: "video-edit-import-1",
        sourceSpaceVersion: 1,
        target: "video_edit",
        selectedTakeRefs: [{
          outputRefId: "take-1",
          nodeId: "node-video",
          kind: "video",
          url: "https://cdn.example/take-1.mp4",
        }],
        timelineCueUpdates: [{
          id: "cue-1",
          shotId: "shot-1",
          startSeconds: 0,
          endSeconds: 4,
          kind: "shot",
          label: "Locked cue update",
        }],
        productWarningResolutions: [{
          productAssetId: "product-1",
          claimId: "claim-1",
          status: "approved",
          warning: "Resolved in review.",
        }],
        manualApprovals: [
          { targetId: "shot-1", targetKind: "shot", approved: true },
          { targetId: "node-video", targetKind: "node", approved: true },
        ],
      },
    });

    expect(imported.record.status).toBe("conflict");
    expect(imported.skippedLockedIds).toEqual(expect.arrayContaining(["node-video", "shot-1"]));
    expect(imported.space.flowNodes[0].outputRefs?.some((ref) => ref.outputRefId === "take-1")).toBe(false);
    expect(imported.space.cues ?? []).toHaveLength(0);
    expect(imported.space.downstreamResultRecords?.[0]).toMatchObject({
      recordId: "video-edit-import-1",
      status: "conflict",
      target: "video_edit",
    });
    expect(imported.space.productEvidenceManifest?.products[0].claimEvidence[0].status).toBe("approved");
    expect(imported.space.metrics?.handoffEvents).toBe(1);
    expect(imported.space.metrics?.handoffFailures).toBe(1);
  });

  it("rejects downstream imports from stale source space versions", async () => {
    const db = createDb();

    await expect(importProductionDownstreamResult({
      db,
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      expectedVersion: 1,
      result: {
        recordId: "stale-import",
        sourceSpaceVersion: 0,
        target: "storyboard_review",
      },
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "downstream_source_version_stale",
      cause: {
        reason: "downstream_source_version_stale",
        expected: { sourceSpaceVersion: 0 },
        current: { spaceVersion: 1 },
      },
    });
  });
});
