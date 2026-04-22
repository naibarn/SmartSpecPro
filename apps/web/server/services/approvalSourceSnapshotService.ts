import crypto from "crypto";

import type {
  ApprovalSourceSnapshot,
  PreflightSourceRef,
} from "../../shared/workOrchestrator";

export interface CaptureApprovalSnapshotsInput {
  sourceRefs: readonly PreflightSourceRef[];
  selectedSourceIds?: readonly string[] | null;
  privateVaultUnlocked?: boolean;
  capturedAt?: Date | string;
  integrityMarkers?: Record<
    string,
    {
      approvedExcerpt?: string | null;
      summary?: string | null;
      versionMarker?: string | null;
      contentHash?: string | null;
      sanitizationState?: ApprovalSourceSnapshot["sanitizationState"];
    }
  >;
}

export interface ApprovalSnapshotDriftResult {
  hasDrift: boolean;
  reasonCode:
    | "matching_sources"
    | "missing_required_source"
    | "source_hash_mismatch";
  driftedSourceIds: string[];
}

type SourceIntegrityMarker = NonNullable<
  CaptureApprovalSnapshotsInput["integrityMarkers"]
>[string];

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date().toISOString();
}

function stableHash(source: Pick<
  PreflightSourceRef,
  "sourceType" | "sourceId" | "label" | "trust" | "freshness"
>): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        label: source.label,
        trust: source.trust,
        freshness: source.freshness,
      }),
    )
    .digest("hex");
}

function resolveContentHash(
  source: PreflightSourceRef,
  integrityMarker: SourceIntegrityMarker | undefined,
): string {
  return integrityMarker?.contentHash?.trim() || stableHash(source);
}

export function captureApprovalSnapshots(
  input: CaptureApprovalSnapshotsInput,
): ApprovalSourceSnapshot[] {
  const selected = new Set((input.selectedSourceIds ?? []).map(value => value.trim()));
  const hasExplicitSelection = selected.size > 0;
  const capturedAt = toIsoDate(input.capturedAt);

  return input.sourceRefs
    .filter(source => !hasExplicitSelection || selected.has(source.sourceId))
    .map(source => {
      const integrityMarker = input.integrityMarkers?.[source.sourceId];
      return {
        source,
        approvedExcerpt: integrityMarker?.approvedExcerpt ?? "",
        summary:
          integrityMarker?.summary ??
          `${source.label} (${source.trust}, ${source.freshness})`,
        contentHash: resolveContentHash(source, integrityMarker),
        versionMarker:
          integrityMarker?.versionMarker?.trim() || source.freshness,
        privateVaultUnlocked: Boolean(input.privateVaultUnlocked),
        sanitizationState:
          integrityMarker?.sanitizationState ?? "summary_only",
        capturedAt,
      };
    });
}

export function compareApprovalSnapshots(
  snapshots: readonly ApprovalSourceSnapshot[],
  sourceRefs: readonly PreflightSourceRef[],
  integrityMarkers?: CaptureApprovalSnapshotsInput["integrityMarkers"],
): ApprovalSnapshotDriftResult {
  const sourceMap = new Map(sourceRefs.map(source => [source.sourceId, source]));
  const driftedSourceIds: string[] = [];

  for (const snapshot of snapshots) {
    const current = sourceMap.get(snapshot.source.sourceId);
    if (!current) {
      driftedSourceIds.push(snapshot.source.sourceId);
      return {
        hasDrift: true,
        reasonCode: "missing_required_source",
        driftedSourceIds,
      };
    }

    const integrityMarker = integrityMarkers?.[snapshot.source.sourceId];
    const currentHash = resolveContentHash(current, integrityMarker);
    const currentVersionMarker =
      integrityMarker?.versionMarker?.trim() || current.freshness;

    if (
      (snapshot.contentHash && snapshot.contentHash !== currentHash) ||
      (snapshot.versionMarker &&
        currentVersionMarker &&
        snapshot.versionMarker !== currentVersionMarker)
    ) {
      driftedSourceIds.push(snapshot.source.sourceId);
    }
  }

  return driftedSourceIds.length > 0
    ? {
        hasDrift: true,
        reasonCode: "source_hash_mismatch",
        driftedSourceIds,
      }
    : {
        hasDrift: false,
        reasonCode: "matching_sources",
        driftedSourceIds: [],
      };
}
