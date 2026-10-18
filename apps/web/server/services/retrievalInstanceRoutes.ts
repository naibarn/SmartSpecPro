import { and, eq } from "drizzle-orm";

import {
  retrievalInstanceRoutes,
  type InsertRetrievalInstanceRoute,
} from "../../drizzle/schema.ts";
import type { DrizzleDB } from "../db";

export const AI_SEARCH_CAPACITY_LIMITS = Object.freeze({
  hybridWarningFiles: 350_000,
  hybridRebalanceTargetFiles: 400_000,
  hybridHardLimitFiles: 500_000,
  projectionSoftLimitBytes: 3_500_000,
  projectionHardLimitBytes: 4_000_000,
  maxInstancesPerRequest: 10,
});

export type RetrievalRouteEnvironment = "dev" | "staging" | "prod";
export type RetrievalTopologyMode =
  "shared" | "dedicated" | "pooled" | "sharded";
export type RetrievalCapacityState =
  "unknown" | "healthy" | "warning" | "rebalance_required" | "full";

export interface RetrievalInstanceRouteInput {
  tenantId: string;
  environment: RetrievalRouteEnvironment;
  topologyMode: RetrievalTopologyMode;
  namespace: string;
  instanceIds: string[];
  sourceClassRoutes: Record<string, string[]>;
  shardPolicy: Record<string, unknown>;
  capacityState: RetrievalCapacityState;
  profileVersion: string;
  enabled: boolean;
}

export interface RetrievalCapacityForecast {
  currentProjectionFiles: number;
  aclProjectionCopies: number;
  versionOverlapCopies: number;
  blueGreenOverlapCopies: number;
  projectedGrowthFiles: number;
  largestProjectionBytes: number;
}

export interface RetrievalCapacityAssessment {
  projectedFiles: number;
  largestProjectionBytes: number;
  state: RetrievalCapacityState;
  canAcceptNewProjection: boolean;
  reasons: string[];
}

export class RetrievalInstanceRouteError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RetrievalInstanceRouteError";
  }
}

const INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ENVIRONMENT_NAMESPACE: Record<RetrievalRouteEnvironment, string> = {
  dev: "smartaihub-dev",
  staging: "smartaihub-staging",
  prod: "smartaihub-prod",
};

export function validateRetrievalInstanceRoute(
  input: RetrievalInstanceRouteInput
): void {
  if (
    !["dev", "staging", "prod"].includes(input.environment) ||
    !["shared", "dedicated", "pooled", "sharded"].includes(
      input.topologyMode
    ) ||
    !["unknown", "healthy", "warning", "rebalance_required", "full"].includes(
      input.capacityState
    )
  ) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_ROUTE_CONFIGURATION_INVALID"
    );
  }
  if (
    typeof input.tenantId !== "string" ||
    !input.tenantId.trim() ||
    input.tenantId.length > 36
  ) {
    throw new RetrievalInstanceRouteError("RETRIEVAL_ROUTE_TENANT_INVALID");
  }
  if (input.namespace !== ENVIRONMENT_NAMESPACE[input.environment]) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_ROUTE_NAMESPACE_ENVIRONMENT_MISMATCH"
    );
  }
  if (
    !Array.isArray(input.instanceIds) ||
    input.instanceIds.length < 1 ||
    input.instanceIds.length >
      AI_SEARCH_CAPACITY_LIMITS.maxInstancesPerRequest ||
    new Set(input.instanceIds).size !== input.instanceIds.length ||
    input.instanceIds.some(id => !INSTANCE_ID_PATTERN.test(id))
  ) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_ROUTE_INSTANCE_SET_INVALID"
    );
  }
  if (
    typeof input.profileVersion !== "string" ||
    !input.profileVersion.trim() ||
    input.profileVersion.length > 64
  ) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_ROUTE_PROFILE_VERSION_INVALID"
    );
  }
  if (
    !input.sourceClassRoutes ||
    typeof input.sourceClassRoutes !== "object" ||
    Array.isArray(input.sourceClassRoutes) ||
    !input.shardPolicy ||
    typeof input.shardPolicy !== "object" ||
    Array.isArray(input.shardPolicy)
  ) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_ROUTE_CONFIGURATION_INVALID"
    );
  }
  for (const [sourceClass, instances] of Object.entries(
    input.sourceClassRoutes
  )) {
    if (
      !sourceClass.trim() ||
      !Array.isArray(instances) ||
      instances.length === 0 ||
      instances.some(id => !input.instanceIds.includes(id))
    ) {
      throw new RetrievalInstanceRouteError(
        "RETRIEVAL_ROUTE_SOURCE_CLASS_MAPPING_INVALID"
      );
    }
  }
}

export function assessAiSearchCapacity(
  forecast: RetrievalCapacityForecast
): RetrievalCapacityAssessment {
  const values = Object.values(forecast);
  if (
    values.some(value => !Number.isSafeInteger(value) || value < 0) ||
    forecast.largestProjectionBytes === 0
  ) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_CAPACITY_FORECAST_INVALID"
    );
  }
  const projectedFiles =
    forecast.currentProjectionFiles +
    forecast.aclProjectionCopies +
    forecast.versionOverlapCopies +
    forecast.blueGreenOverlapCopies +
    forecast.projectedGrowthFiles;
  if (!Number.isSafeInteger(projectedFiles)) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_CAPACITY_FORECAST_INVALID"
    );
  }
  const reasons: string[] = [];
  if (
    forecast.largestProjectionBytes >
    AI_SEARCH_CAPACITY_LIMITS.projectionHardLimitBytes
  ) {
    reasons.push("PROJECTION_EXCEEDS_PROVIDER_HARD_LIMIT");
  } else if (
    forecast.largestProjectionBytes >
    AI_SEARCH_CAPACITY_LIMITS.projectionSoftLimitBytes
  ) {
    reasons.push("PROJECTION_EXCEEDS_SOFT_LIMIT");
  }
  if (projectedFiles > AI_SEARCH_CAPACITY_LIMITS.hybridHardLimitFiles) {
    reasons.push("PROJECTED_FILES_EXCEED_PROVIDER_HARD_LIMIT");
  } else if (
    projectedFiles >= AI_SEARCH_CAPACITY_LIMITS.hybridRebalanceTargetFiles
  ) {
    reasons.push("REBALANCE_REQUIRED");
  } else if (projectedFiles >= AI_SEARCH_CAPACITY_LIMITS.hybridWarningFiles) {
    reasons.push("CAPACITY_WARNING");
  }
  const hardLimitReached = reasons.some(reason =>
    reason.includes("HARD_LIMIT")
  );
  const state: RetrievalCapacityState = hardLimitReached
    ? "full"
    : reasons.includes("REBALANCE_REQUIRED")
      ? "rebalance_required"
      : reasons.length > 0
        ? "warning"
        : "healthy";
  return {
    projectedFiles,
    largestProjectionBytes: forecast.largestProjectionBytes,
    state,
    canAcceptNewProjection:
      !hardLimitReached &&
      state !== "rebalance_required" &&
      !reasons.includes("PROJECTION_EXCEEDS_SOFT_LIMIT"),
    reasons,
  };
}

export async function saveRetrievalInstanceRoute(
  db: DrizzleDB,
  input: RetrievalInstanceRouteInput
) {
  validateRetrievalInstanceRoute(input);
  const [route] = await db
    .insert(retrievalInstanceRoutes)
    .values(input satisfies InsertRetrievalInstanceRoute)
    .onConflictDoUpdate({
      target: [
        retrievalInstanceRoutes.tenantId,
        retrievalInstanceRoutes.environment,
      ],
      set: {
        topologyMode: input.topologyMode,
        namespace: input.namespace,
        instanceIds: input.instanceIds,
        sourceClassRoutes: input.sourceClassRoutes,
        shardPolicy: input.shardPolicy,
        capacityState: input.capacityState,
        profileVersion: input.profileVersion,
        enabled: input.enabled,
        updatedAt: new Date(),
      },
    })
    .returning();
  return route;
}

/**
 * Resolve only an explicitly registered tenant/environment route. The caller
 * must pass trusted source classes and the provider layer still applies the
 * authorization filter; missing or unsafe routes never fall back to a derived
 * instance name or an unfiltered provider query.
 */
export async function resolveRetrievalInstanceRoute(
  db: DrizzleDB,
  input: {
    tenantId: string;
    environment: RetrievalRouteEnvironment;
    sourceClasses: string[];
  }
) {
  const [route] = await db
    .select()
    .from(retrievalInstanceRoutes)
    .where(
      and(
        eq(retrievalInstanceRoutes.tenantId, input.tenantId),
        eq(retrievalInstanceRoutes.environment, input.environment),
        eq(retrievalInstanceRoutes.enabled, true)
      )
    )
    .limit(1);
  if (!route)
    throw new RetrievalInstanceRouteError("RETRIEVAL_ROUTE_NOT_CONFIGURED");
  validateRetrievalInstanceRoute({
    tenantId: route.tenantId,
    environment: route.environment as RetrievalRouteEnvironment,
    topologyMode: route.topologyMode as RetrievalTopologyMode,
    namespace: route.namespace,
    instanceIds: route.instanceIds,
    sourceClassRoutes: route.sourceClassRoutes,
    shardPolicy: route.shardPolicy,
    capacityState: route.capacityState as RetrievalCapacityState,
    profileVersion: route.profileVersion,
    enabled: route.enabled,
  });
  if (
    route.capacityState === "full" ||
    route.capacityState === "rebalance_required"
  ) {
    throw new RetrievalInstanceRouteError("RETRIEVAL_ROUTE_CAPACITY_BLOCKED");
  }
  if (
    !Array.isArray(input.sourceClasses) ||
    input.sourceClasses.length === 0 ||
    input.sourceClasses.some(
      sourceClass => typeof sourceClass !== "string" || !sourceClass.trim()
    )
  ) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_ROUTE_SOURCE_CLASSES_REQUIRED"
    );
  }
  const instanceIds = [
    ...new Set(
      input.sourceClasses.flatMap(sourceClass => {
        const mapped = route.sourceClassRoutes[sourceClass];
        if (!mapped?.length) {
          throw new RetrievalInstanceRouteError(
            "RETRIEVAL_ROUTE_SOURCE_CLASS_UNMAPPED"
          );
        }
        return mapped;
      })
    ),
  ];
  if (instanceIds.some(id => !route.instanceIds.includes(id))) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_ROUTE_INSTANCE_SET_INVALID"
    );
  }
  if (instanceIds.length > AI_SEARCH_CAPACITY_LIMITS.maxInstancesPerRequest) {
    throw new RetrievalInstanceRouteError(
      "RETRIEVAL_ROUTE_FANOUT_LIMIT_EXCEEDED"
    );
  }
  return {
    routeId: route.id,
    tenantId: route.tenantId,
    environment: route.environment,
    namespace: route.namespace,
    topologyMode: route.topologyMode,
    instanceIds,
    profileVersion: route.profileVersion,
    capacityState: route.capacityState,
  };
}
