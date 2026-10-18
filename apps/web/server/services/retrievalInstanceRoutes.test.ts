import { describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";

import { retrievalInstanceRoutes } from "../../drizzle/schema.ts";
import type { DrizzleDB } from "../db";

import {
  AI_SEARCH_CAPACITY_LIMITS,
  assessAiSearchCapacity,
  RetrievalInstanceRouteError,
  resolveRetrievalInstanceRoute,
  validateRetrievalInstanceRoute,
} from "./retrievalInstanceRoutes";

function route(
  overrides: Partial<Parameters<typeof validateRetrievalInstanceRoute>[0]> = {}
) {
  return {
    tenantId: "tenant-a",
    environment: "dev" as const,
    topologyMode: "pooled" as const,
    namespace: "smartaihub-dev",
    instanceIds: ["tenant-pool-01-rag-v2"],
    sourceClassRoutes: { library: ["tenant-pool-01-rag-v2"] },
    shardPolicy: { strategy: "stable_source_hash" },
    capacityState: "healthy" as const,
    profileVersion: "rag-v2",
    enabled: false,
    ...overrides,
  };
}

function databaseWithRoute(routeRow: ReturnType<typeof route>) {
  const limit = vi.fn().mockResolvedValue([
    {
      id: "route-id",
      ...routeRow,
    },
  ]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as unknown as DrizzleDB, limit };
}

describe("SPEC-229 AI Search route registry contracts", () => {
  it("keeps tenant/environment as the route identity and stores explicit routing metadata", () => {
    const columns = getTableColumns(retrievalInstanceRoutes);
    expect(columns.tenantId).toBeDefined();
    expect(columns.environment).toBeDefined();
    expect(columns.instanceIds).toBeDefined();
    expect(columns.sourceClassRoutes).toBeDefined();
    expect(columns.capacityState).toBeDefined();
    expect(columns.enabled.notNull).toBe(true);
  });

  it("accepts only explicit routes whose class mappings target listed instances", () => {
    expect(() => validateRetrievalInstanceRoute(route())).not.toThrow();
    expect(() =>
      validateRetrievalInstanceRoute(
        route({
          sourceClassRoutes: { library: ["unregistered-instance"] },
        })
      )
    ).toThrowError(
      new RetrievalInstanceRouteError(
        "RETRIEVAL_ROUTE_SOURCE_CLASS_MAPPING_INVALID"
      )
    );
  });

  it("rejects namespace/environment mismatch, duplicate instances and fanout over 10", () => {
    expect(() =>
      validateRetrievalInstanceRoute(route({ namespace: "smartaihub-prod" }))
    ).toThrow("RETRIEVAL_ROUTE_NAMESPACE_ENVIRONMENT_MISMATCH");
    expect(() =>
      validateRetrievalInstanceRoute(route({ instanceIds: ["x", "x"] }))
    ).toThrow("RETRIEVAL_ROUTE_INSTANCE_SET_INVALID");
    const ids = Array.from(
      { length: 11 },
      (_, index) => `tenant-shard-${index}`
    );
    expect(() =>
      validateRetrievalInstanceRoute(
        route({
          instanceIds: ids,
          sourceClassRoutes: { library: ids },
        })
      )
    ).toThrow("RETRIEVAL_ROUTE_INSTANCE_SET_INVALID");
  });

  it("fails closed on malformed runtime JSON instead of leaking a TypeError", () => {
    expect(() =>
      validateRetrievalInstanceRoute(
        route({ instanceIds: null as unknown as string[] })
      )
    ).toThrow("RETRIEVAL_ROUTE_INSTANCE_SET_INVALID");
    expect(() =>
      validateRetrievalInstanceRoute(
        route({
          sourceClassRoutes: [] as unknown as Record<string, string[]>,
        })
      )
    ).toThrow("RETRIEVAL_ROUTE_CONFIGURATION_INVALID");
    expect(() =>
      validateRetrievalInstanceRoute(
        route({
          capacityState: "unexpected" as "healthy",
        })
      )
    ).toThrow("RETRIEVAL_ROUTE_CONFIGURATION_INVALID");
  });

  it("resolves only registered classes and enforces the capacity/fanout contract", async () => {
    const { db } = databaseWithRoute(
      route({
        instanceIds: ["tenant-shard-a", "tenant-shard-b"],
        sourceClassRoutes: {
          library: ["tenant-shard-a"],
          help: ["tenant-shard-b"],
        },
      })
    );
    await expect(
      resolveRetrievalInstanceRoute(db, {
        tenantId: "tenant-a",
        environment: "dev",
        sourceClasses: ["library", "help"],
      })
    ).resolves.toMatchObject({
      routeId: "route-id",
      tenantId: "tenant-a",
      namespace: "smartaihub-dev",
      instanceIds: ["tenant-shard-a", "tenant-shard-b"],
      profileVersion: "rag-v2",
    });
    await expect(
      resolveRetrievalInstanceRoute(db, {
        tenantId: "tenant-a",
        environment: "dev",
        sourceClasses: ["unregistered"],
      })
    ).rejects.toThrow("RETRIEVAL_ROUTE_SOURCE_CLASS_UNMAPPED");

    const blocked = databaseWithRoute(route({ capacityState: "full" }));
    await expect(
      resolveRetrievalInstanceRoute(blocked.db, {
        tenantId: "tenant-a",
        environment: "dev",
        sourceClasses: ["library"],
      })
    ).rejects.toThrow("RETRIEVAL_ROUTE_CAPACITY_BLOCKED");
  });

  it("forecasts ACL, version, blue/green and growth overlap against SPEC limits", () => {
    expect(
      assessAiSearchCapacity({
        currentProjectionFiles: 300_000,
        aclProjectionCopies: 10_000,
        versionOverlapCopies: 10_000,
        blueGreenOverlapCopies: 10_000,
        projectedGrowthFiles: 15_000,
        largestProjectionBytes: 3_000_000,
      })
    ).toMatchObject({
      projectedFiles: 345_000,
      state: "healthy",
      canAcceptNewProjection: true,
    });
    expect(
      assessAiSearchCapacity({
        currentProjectionFiles: 330_000,
        aclProjectionCopies: 20_000,
        versionOverlapCopies: 20_000,
        blueGreenOverlapCopies: 20_000,
        projectedGrowthFiles: 20_000,
        largestProjectionBytes: 3_500_001,
      })
    ).toMatchObject({
      projectedFiles: 410_000,
      state: "rebalance_required",
      canAcceptNewProjection: false,
      reasons: ["PROJECTION_EXCEEDS_SOFT_LIMIT", "REBALANCE_REQUIRED"],
    });
    expect(
      assessAiSearchCapacity({
        currentProjectionFiles: 20_000,
        aclProjectionCopies: 0,
        versionOverlapCopies: 0,
        blueGreenOverlapCopies: 0,
        projectedGrowthFiles: 1,
        largestProjectionBytes: 3_600_000,
      })
    ).toMatchObject({
      state: "warning",
      canAcceptNewProjection: false,
      reasons: ["PROJECTION_EXCEEDS_SOFT_LIMIT"],
    });
    expect(AI_SEARCH_CAPACITY_LIMITS).toMatchObject({
      hybridWarningFiles: 350_000,
      hybridRebalanceTargetFiles: 400_000,
      hybridHardLimitFiles: 500_000,
      maxInstancesPerRequest: 10,
    });
  });

  it("fails closed on invalid capacity inputs and provider hard-limit projections", () => {
    expect(() =>
      assessAiSearchCapacity({
        currentProjectionFiles: -1,
        aclProjectionCopies: 0,
        versionOverlapCopies: 0,
        blueGreenOverlapCopies: 0,
        projectedGrowthFiles: 0,
        largestProjectionBytes: 1,
      })
    ).toThrow("RETRIEVAL_CAPACITY_FORECAST_INVALID");
    expect(
      assessAiSearchCapacity({
        currentProjectionFiles: 500_001,
        aclProjectionCopies: 0,
        versionOverlapCopies: 0,
        blueGreenOverlapCopies: 0,
        projectedGrowthFiles: 0,
        largestProjectionBytes: 4_000_001,
      })
    ).toMatchObject({
      state: "full",
      canAcceptNewProjection: false,
      reasons: [
        "PROJECTION_EXCEEDS_PROVIDER_HARD_LIMIT",
        "PROJECTED_FILES_EXCEED_PROVIDER_HARD_LIMIT",
      ],
    });
  });
});
