import type { ProductionSpace, ProductionGoal, ProductionRunStatus } from "../../shared/mediaProduction";

function normalizeProductionWarning(value: unknown): string {
  const text = typeof value === "string"
    ? value
    : (() => {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value ?? "");
      }
    })();
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= 1000 ? normalized : `${normalized.slice(0, 997)}...`;
}

function normalizeProductionWarningArray(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(normalizeProductionWarning).filter(Boolean).slice(0, limit);
}

export function migrateProductionSpaceData(space: ProductionSpace): ProductionSpace {
  return {
    ...space,
    warnings: normalizeProductionWarningArray(space.warnings, 50),
    contextAssets: (space.contextAssets ?? []).map((asset) => ({
      ...asset,
      warnings: normalizeProductionWarningArray(asset.warnings, 20),
    })),
    shots: (space.shots ?? []).map((shot) => ({
      ...shot,
      mustShow: normalizeProductionWarningArray(shot.mustShow, 20),
      mustAvoid: normalizeProductionWarningArray(shot.mustAvoid, 20),
    })),
    flowNodes: (space.flowNodes ?? []).map((node) => ({
      ...node,
      readinessIssues: normalizeProductionWarningArray(node.readinessIssues, 20),
    })),
    productEvidenceManifest: space.productEvidenceManifest
      ? {
        ...space.productEvidenceManifest,
        warnings: normalizeProductionWarningArray(space.productEvidenceManifest.warnings, 50) ?? [],
        products: space.productEvidenceManifest.products.map((product) => ({
          ...product,
          reviewNotes: normalizeProductionWarningArray(product.reviewNotes, 20),
        })),
      }
      : space.productEvidenceManifest,
  };
}

export function upgradeProductionSpaceSchema(input: unknown): {
  ok: true;
  space: ProductionSpace;
} | {
  ok: false;
  reason: "missing_space" | "unsupported_future_schema" | "unsupported_legacy_schema";
  schemaVersion?: string;
  preservedInput: unknown;
} {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "missing_space", preservedInput: input };
  }
  const record = input as Partial<ProductionSpace> & { schemaVersion?: unknown };
  const rawSchemaVersion = (input as { schemaVersion?: unknown }).schemaVersion;
  const schemaVersion = typeof rawSchemaVersion === "string" ? rawSchemaVersion : undefined;
  if (schemaVersion !== "1.0.0") {
    return {
      ok: false,
      reason: schemaVersion && schemaVersion > "1.0.0"
        ? "unsupported_future_schema"
        : "unsupported_legacy_schema",
      schemaVersion,
      preservedInput: input,
    };
  }
  const space: ProductionSpace = {
    schemaVersion: "1.0.0",
    productionRunId: String(record.productionRunId ?? ""),
    version: Number(record.version ?? 1),
    status: (record.status ?? "goal_draft") as ProductionRunStatus,
    brief: {
      ...(record.brief ?? {}),
      summary: String(record.brief?.summary ?? "Untitled production"),
    },
    shots: Array.isArray(record.shots) ? record.shots : [],
    flowNodes: Array.isArray(record.flowNodes) ? record.flowNodes : [],
    flowEdges: Array.isArray(record.flowEdges) ? record.flowEdges : [],
    contextAssets: Array.isArray(record.contextAssets) ? record.contextAssets : [],
    productEvidenceManifest: record.productEvidenceManifest,
    shotProductUsage: record.shotProductUsage,
    layerVersions: record.layerVersions,
    approvalState: record.approvalState,
    actionAttempts: record.actionAttempts,
    auditEvents: record.auditEvents,
    metrics: record.metrics,
    planningSelection: record.planningSelection,
    generationDefaults: record.generationDefaults,
    storyConceptWizard: record.storyConceptWizard,
    downstreamResultRecords: record.downstreamResultRecords,
    cues: record.cues,
    warnings: record.warnings,
    featureFlags: record.featureFlags,
    accessPolicy: record.accessPolicy,
    updatedAt: record.updatedAt,
  };
  return {
    ok: true,
    space: migrateProductionSpaceData(space),
  };
}

export function adaptLegacyRunToProductionSpace(input: {
  productionRunId: string;
  version?: number;
  status?: string | null;
  goal?: Record<string, unknown> | null;
  productionBible?: Record<string, unknown> | null;
  assetPlan?: Record<string, unknown> | null;
  updatedAt?: Date | string | null;
}): ProductionSpace {
  const goalRecord = (input.goal && typeof input.goal === "object" ? input.goal : {}) as Record<string, unknown>;
  const goal = goalRecord as unknown as ProductionGoal;
  const bible = input.productionBible && typeof input.productionBible === "object" ? input.productionBible : {};
  const assetPlan = input.assetPlan && typeof input.assetPlan === "object" ? input.assetPlan : {};
  const legacyShots = Array.isArray((bible as any).shot_plan)
    ? (bible as any).shot_plan
    : Array.isArray((bible as any).shots)
      ? (bible as any).shots
      : [];

  const shots = legacyShots.map((shot: any, index: number) => ({
    id: String(shot.id ?? shot.shot_id ?? `shot-${index + 1}`),
    title: String(shot.title ?? shot.name ?? `Shot ${index + 1}`),
    order: Number(shot.order ?? index + 1),
    durationSeconds: Number.isFinite(Number(shot.durationSeconds ?? shot.duration_seconds))
      ? Number(shot.durationSeconds ?? shot.duration_seconds)
      : undefined,
    script: typeof shot.script === "string" ? shot.script : undefined,
    visualIntent: typeof shot.visual_intent === "string" ? shot.visual_intent : typeof shot.visualIntent === "string" ? shot.visualIntent : undefined,
    audioIntent: typeof shot.audio_intent === "string" ? shot.audio_intent : typeof shot.audioIntent === "string" ? shot.audioIntent : undefined,
    nodeIds: [`legacy-shot-${index + 1}`],
    status: "draft" as const,
  }));

  const flowNodes = shots.map((shot: { id: string; title: string; nodeIds: string[] }) => ({
    id: shot.nodeIds[0],
    kind: "video_shot" as const,
    title: shot.title,
    status: "draft" as const,
    shotId: shot.id,
    estimatedCredits: 0,
  }));

  const assetNodes = Array.isArray((assetPlan as any).nodes) ? (assetPlan as any).nodes : [];
  for (const [index, node] of assetNodes.entries()) {
    flowNodes.push({
      id: String(node.id ?? node.asset_id ?? `legacy-asset-${index + 1}`),
      kind: String(node.kind ?? "planning") as any,
      title: String(node.role ?? node.name ?? `Asset ${index + 1}`),
      status: String(node.status ?? "draft") as any,
      estimatedCredits: Number(node.estimatedCredits ?? node.credits ?? 0),
    });
  }

  return migrateProductionSpaceData({
    schemaVersion: "1.0.0",
    productionRunId: input.productionRunId,
    version: Number(input.version ?? 1),
    status: (input.status || "goal_draft") as ProductionRunStatus,
    brief: {
      ...goal,
      summary: String(goal.summary ?? goalRecord.goalSummary ?? goal.title ?? "Untitled production"),
    },
    shots,
    flowNodes,
    flowEdges: [],
    contextAssets: [],
    warnings: ["legacy_run_adapted"],
    updatedAt: input.updatedAt ? new Date(input.updatedAt).toISOString() : undefined,
  });
}
