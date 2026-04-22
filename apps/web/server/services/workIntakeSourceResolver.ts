import crypto from "crypto";

import type {
  ApprovalSourceSnapshot,
  PreflightSourceRef,
  WorkIntakeActorContext,
  WorkIntakeSourceDiagnostic,
  WorkIntakeSourceScope,
} from "../../shared/workOrchestrator";

export interface WorkIntakeSourceSeed {
  sourceType: PreflightSourceRef["sourceType"];
  sourceId: string;
  label?: string | null;
  required?: boolean;
  trust?: PreflightSourceRef["trust"];
  freshness?: PreflightSourceRef["freshness"];
  availability?: "available" | "unavailable";
  requesterMessage?: string | null;
  adminDetail?: string | null;
  integrityMarker?: {
    approvedExcerpt?: string | null;
    summary?: string | null;
    versionMarker?: string | null;
    contentHash?: string | null;
    sanitizationState?: ApprovalSourceSnapshot["sanitizationState"];
  } | null;
}

export interface ResolveWorkIntakeSourcesInput {
  actorContext: WorkIntakeActorContext;
  sourceRefs?: readonly WorkIntakeSourceSeed[] | null;
  selectedSourceIds?: readonly string[] | null;
  maxSources?: number;
}

export interface ResolveWorkIntakeSourcesResult {
  sourceRefs: PreflightSourceRef[];
  selectedSourceIds: string[];
  diagnostics: WorkIntakeSourceDiagnostic[];
  integrityMarkers: Record<
    string,
    {
      sourceId: string;
      approvedExcerpt: string;
      summary: string;
      versionMarker: string | null;
      contentHash: string | null;
      sanitizationState: ApprovalSourceSnapshot["sanitizationState"];
    }
  >;
}

function scopeFor(
  sourceType: PreflightSourceRef["sourceType"],
): WorkIntakeSourceScope {
  return sourceType;
}

function defaultLabel(source: WorkIntakeSourceSeed): string {
  switch (source.sourceType) {
    case "case":
      return `Case ${source.sourceId}`;
    case "request":
      return `Request ${source.sourceId}`;
    case "conversation":
      return `Conversation ${source.sourceId}`;
    case "workpack_run":
      return `Workpack run ${source.sourceId}`;
    case "role_routine_run":
      return `Role routine run ${source.sourceId}`;
    case "library_context_pack":
      return `Context pack ${source.sourceId}`;
    case "memory":
      return `Memory ${source.sourceId}`;
    case "policy":
      return `Policy ${source.sourceId}`;
    case "manual":
    default:
      return `Source ${source.sourceId}`;
  }
}

function normalizeSeeds(
  seeds: readonly WorkIntakeSourceSeed[] | null | undefined,
): WorkIntakeSourceSeed[] {
  return (seeds ?? []).map(seed => {
    const sourceId = seed.sourceId.trim();
    if (!sourceId) {
      throw new Error("SOURCE_REF_INVALID");
    }

    return {
      sourceType: seed.sourceType,
      sourceId,
      label: seed.label?.trim() || defaultLabel(seed),
      required: seed.required ?? true,
      trust: seed.trust ?? "derived",
      freshness: seed.freshness ?? "unknown",
      availability: seed.availability ?? "available",
      requesterMessage: seed.requesterMessage?.trim() || null,
      adminDetail: seed.adminDetail?.trim() || null,
      integrityMarker: seed.integrityMarker ?? null,
    };
  });
}

function normalizeSelectedIds(values: readonly string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map(value => value.trim()).filter(Boolean));
}

function buildFallbackContentHash(seed: WorkIntakeSourceSeed): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        sourceType: seed.sourceType,
        sourceId: seed.sourceId,
        label: seed.label,
        trust: seed.trust,
        freshness: seed.freshness,
        summary: seed.integrityMarker?.summary ?? null,
        versionMarker: seed.integrityMarker?.versionMarker ?? null,
      }),
    )
    .digest("hex");
}

export function resolveWorkIntakeSources(
  input: ResolveWorkIntakeSourcesInput,
): ResolveWorkIntakeSourcesResult {
  const seeds = normalizeSeeds(input.sourceRefs);
  const explicitSelectedIds = normalizeSelectedIds(input.selectedSourceIds);
  const hasExplicitSelection = explicitSelectedIds.size > 0;
  const allowedScopes = new Set(input.actorContext.allowedSourceScopes);
  const maxSources = Math.max(1, input.maxSources ?? 12);

  const sourceRefs: PreflightSourceRef[] = [];
  const selectedSourceIds: string[] = [];
  const diagnostics: WorkIntakeSourceDiagnostic[] = [];
  const integrityMarkers: ResolveWorkIntakeSourcesResult["integrityMarkers"] = {};

  for (const seed of seeds) {
    const selected = hasExplicitSelection
      ? explicitSelectedIds.has(seed.sourceId)
      : Boolean(seed.required);

    if (!selected) {
      diagnostics.push({
        sourceId: seed.sourceId,
        sourceType: seed.sourceType,
        included: false,
        selected: false,
        code: "source_not_selected",
        message: `${seed.label} was not selected for the compiled brief.`,
        trust: seed.trust ?? "derived",
        freshness: seed.freshness ?? "unknown",
        requesterMessage: "This source is available but not selected.",
        adminDetail: null,
      });
      continue;
    }

    const scope = scopeFor(seed.sourceType);
    if (!allowedScopes.has(scope)) {
      const privateVaultLocked =
        (scope === "memory" ||
          scope === "library_context_pack" ||
          scope === "policy") &&
        !input.actorContext.privateVaultUnlocked;

      diagnostics.push({
        sourceId: seed.sourceId,
        sourceType: seed.sourceType,
        included: false,
        selected: true,
        code: privateVaultLocked
          ? "source_private_vault_locked"
          : "source_scope_not_allowed",
        message: privateVaultLocked
          ? `${seed.label} is locked until the private vault is unlocked.`
          : `${seed.label} is outside the actor's allowed source scope.`,
        trust: seed.trust ?? "derived",
        freshness: seed.freshness ?? "unknown",
        requesterMessage: privateVaultLocked
          ? "Unlock the required private source before review."
          : "This source is not available in the current review scope.",
        adminDetail: privateVaultLocked
          ? "private_vault_locked"
          : `scope_not_allowed:${scope}`,
      });
      continue;
    }

    if (seed.availability === "unavailable") {
      diagnostics.push({
        sourceId: seed.sourceId,
        sourceType: seed.sourceType,
        included: false,
        selected: true,
        code: "source_selected_but_unavailable",
        message: `${seed.label} is no longer available for this review.`,
        trust: seed.trust ?? "derived",
        freshness: seed.freshness ?? "unknown",
        requesterMessage:
          seed.requesterMessage ??
          "This source is no longer available for the current review.",
        adminDetail: seed.adminDetail ?? "source_unavailable",
      });
      continue;
    }

    if (sourceRefs.length >= maxSources && !seed.required) {
      diagnostics.push({
        sourceId: seed.sourceId,
        sourceType: seed.sourceType,
        included: false,
        selected: true,
        code: "source_budget_exceeded",
        message: `${seed.label} was omitted because the compiled-brief source budget was exceeded.`,
        trust: seed.trust ?? "derived",
        freshness: seed.freshness ?? "unknown",
        requesterMessage: "The preview omitted this optional source to keep the brief bounded.",
        adminDetail: `max_sources_exceeded:${maxSources}`,
      });
      continue;
    }

    const normalizedRef: PreflightSourceRef = {
      sourceType: seed.sourceType,
      sourceId: seed.sourceId,
      label: seed.label ?? defaultLabel(seed),
      required: seed.required ?? true,
      trust: seed.trust ?? "derived",
      freshness: seed.freshness ?? "unknown",
    };

    sourceRefs.push(normalizedRef);
    selectedSourceIds.push(seed.sourceId);
    integrityMarkers[seed.sourceId] = {
      sourceId: seed.sourceId,
      approvedExcerpt: seed.integrityMarker?.approvedExcerpt ?? "",
      summary:
        seed.integrityMarker?.summary ??
        `${normalizedRef.label} (${normalizedRef.trust}, ${normalizedRef.freshness})`,
      versionMarker:
        seed.integrityMarker?.versionMarker ?? normalizedRef.freshness,
      contentHash:
        seed.integrityMarker?.contentHash ?? buildFallbackContentHash(seed),
      sanitizationState:
        seed.integrityMarker?.sanitizationState ?? "summary_only",
    };
    diagnostics.push({
      sourceId: seed.sourceId,
      sourceType: seed.sourceType,
      included: true,
      selected: true,
      code: "source_included",
      message: `${normalizedRef.label} was included in the compiled brief.`,
      trust: normalizedRef.trust,
      freshness: normalizedRef.freshness,
      requesterMessage: "Included in the compiled brief.",
      adminDetail: null,
    });
  }

  return {
    sourceRefs,
    selectedSourceIds,
    diagnostics,
    integrityMarkers,
  };
}
