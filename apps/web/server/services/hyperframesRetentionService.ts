import type {
  HyperframesArtifactKind,
  HyperframesRetentionClass,
} from "@shared/hyperframes/contracts";

export interface HyperframesRetentionRule {
  artifactKind: HyperframesArtifactKind;
  retentionClass: HyperframesRetentionClass;
  defaultRetentionHours: number;
  preserveWhenLibraryOwned: boolean;
}

export const HYPERFRAMES_RETENTION_RULES: HyperframesRetentionRule[] = [
  {
    artifactKind: "hyperframes_input_json",
    retentionClass: "review",
    defaultRetentionHours: 24 * 30,
    preserveWhenLibraryOwned: true,
  },
  {
    artifactKind: "hyperframes_composition_html",
    retentionClass: "review",
    defaultRetentionHours: 24 * 7,
    preserveWhenLibraryOwned: false,
  },
  {
    artifactKind: "hyperframes_snapshot",
    retentionClass: "temporary",
    defaultRetentionHours: 24 * 7,
    preserveWhenLibraryOwned: false,
  },
  {
    artifactKind: "hyperframes_snapshot",
    retentionClass: "review",
    defaultRetentionHours: 24 * 30,
    preserveWhenLibraryOwned: false,
  },
  {
    artifactKind: "hyperframes_render_mp4",
    retentionClass: "review",
    defaultRetentionHours: 24 * 7,
    preserveWhenLibraryOwned: true,
  },
  {
    artifactKind: "hyperframes_render_mp4",
    retentionClass: "library",
    defaultRetentionHours: 24 * 365 * 10,
    preserveWhenLibraryOwned: true,
  },
  {
    artifactKind: "hyperframes_render_webm",
    retentionClass: "review",
    defaultRetentionHours: 24 * 7,
    preserveWhenLibraryOwned: true,
  },
  {
    artifactKind: "hyperframes_render_webm",
    retentionClass: "library",
    defaultRetentionHours: 24 * 365 * 10,
    preserveWhenLibraryOwned: true,
  },
  {
    artifactKind: "hyperframes_subtitle_vtt",
    retentionClass: "review",
    defaultRetentionHours: 24 * 7,
    preserveWhenLibraryOwned: true,
  },
  {
    artifactKind: "hyperframes_subtitle_vtt",
    retentionClass: "library",
    defaultRetentionHours: 24 * 365 * 10,
    preserveWhenLibraryOwned: true,
  },
  {
    artifactKind: "hyperframes_manifest",
    retentionClass: "audit",
    defaultRetentionHours: 24 * 90,
    preserveWhenLibraryOwned: true,
  },
  {
    artifactKind: "hyperframes_sanitized_log",
    retentionClass: "audit",
    defaultRetentionHours: 24 * 30,
    preserveWhenLibraryOwned: false,
  },
];

export interface HyperframesRetentionArtifact {
  artifactId: string;
  artifactKind: HyperframesArtifactKind;
  retentionClass: HyperframesRetentionClass;
  createdAt: Date;
  libraryOwned?: boolean;
  activeJob?: boolean;
  locked?: boolean;
  retryGraceUntil?: Date | null;
}

export interface HyperframesRetentionPurgeAuditEvent {
  action: "hyperframes_retention_purge_dry_run" | "hyperframes_retention_purge";
  tenantId?: string | null;
  dryRun: boolean;
  eligibleCount: number;
  deletedCount: number;
  failedCount: number;
  redacted: true;
}

export function dryRunHyperframesRetentionPurge(input: {
  artifacts: HyperframesRetentionArtifact[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const eligible = input.artifacts.filter(artifact => {
    const rule = HYPERFRAMES_RETENTION_RULES.find(
      item =>
        item.artifactKind === artifact.artifactKind &&
        item.retentionClass === artifact.retentionClass
    );
    if (!rule) return false;
    if (artifact.libraryOwned && rule.preserveWhenLibraryOwned) return false;
    if (artifact.activeJob || artifact.locked) return false;
    if (artifact.retryGraceUntil && artifact.retryGraceUntil > now) return false;
    const ageHours =
      (now.getTime() - artifact.createdAt.getTime()) / (60 * 60 * 1000);
    return ageHours >= rule.defaultRetentionHours;
  });
  return {
    dryRun: true,
    eligibleCount: eligible.length,
    eligibleArtifactIds: eligible.map(artifact => artifact.artifactId),
    preservedCount: input.artifacts.length - eligible.length,
  };
}

export async function purgeHyperframesRetentionArtifacts(input: {
  artifacts: HyperframesRetentionArtifact[];
  now?: Date;
  dryRun?: boolean;
  deleteArtifact?: (artifact: HyperframesRetentionArtifact) => Promise<void> | void;
}) {
  const dryRun = input.dryRun ?? true;
  const plan = dryRunHyperframesRetentionPurge({
    artifacts: input.artifacts,
    now: input.now,
  });
  if (dryRun) {
    return {
      ...plan,
      deletedCount: 0,
      deletedArtifactIds: [] as string[],
      failed: [] as Array<{ artifactId: string; message: string }>,
    };
  }
  if (!input.deleteArtifact) {
    throw new Error("deleteArtifact adapter is required for destructive purge");
  }
  const eligibleById = new Map(
    input.artifacts.map(artifact => [artifact.artifactId, artifact])
  );
  const deletedArtifactIds: string[] = [];
  const failed: Array<{ artifactId: string; message: string }> = [];
  for (const artifactId of plan.eligibleArtifactIds) {
    const artifact = eligibleById.get(artifactId);
    if (!artifact) continue;
    try {
      await input.deleteArtifact(artifact);
      deletedArtifactIds.push(artifactId);
    } catch (error) {
      failed.push({
        artifactId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    dryRun: false,
    eligibleCount: plan.eligibleCount,
    eligibleArtifactIds: plan.eligibleArtifactIds,
    preservedCount: plan.preservedCount,
    deletedCount: deletedArtifactIds.length,
    deletedArtifactIds,
    failed,
  };
}

export async function runHyperframesRetentionPurgeJob(input: {
  tenantId?: string | null;
  now?: Date;
  dryRun?: boolean;
  loadArtifacts: () => Promise<HyperframesRetentionArtifact[]> | HyperframesRetentionArtifact[];
  deleteArtifact?: (artifact: HyperframesRetentionArtifact) => Promise<void> | void;
  recordAuditEvent?: (event: HyperframesRetentionPurgeAuditEvent) => Promise<void> | void;
}) {
  const artifacts = await input.loadArtifacts();
  const result = await purgeHyperframesRetentionArtifacts({
    artifacts,
    now: input.now,
    dryRun: input.dryRun ?? true,
    deleteArtifact: input.deleteArtifact,
  });
  const audit: HyperframesRetentionPurgeAuditEvent = {
    action: result.dryRun
      ? "hyperframes_retention_purge_dry_run"
      : "hyperframes_retention_purge",
    tenantId: input.tenantId ?? null,
    dryRun: result.dryRun,
    eligibleCount: result.eligibleCount,
    deletedCount: result.deletedCount,
    failedCount: result.failed.length,
    redacted: true,
  };
  await input.recordAuditEvent?.(audit);
  return {
    ...result,
    audit,
    auditPersisted: Boolean(input.recordAuditEvent),
  };
}
