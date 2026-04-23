import type {
  CompiledWorkBrief,
  GovernedContextSnapshot,
  WorkIntakeActorContext,
  WorkIntakeSourceDiagnostic,
  PreflightSourceRef,
} from "../../shared/workOrchestrator";

export interface CompileWorkBriefInput {
  actorContext: WorkIntakeActorContext;
  title: string;
  objective?: string | null;
  sourceRefs: readonly PreflightSourceRef[];
  selectedSourceIds: readonly string[];
  diagnostics: readonly WorkIntakeSourceDiagnostic[];
  generatedAt?: Date | string;
  maxSummaryChars?: number;
}

export interface CompileWorkBriefResult {
  brief: CompiledWorkBrief;
  governedContext: GovernedContextSnapshot;
}

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date().toISOString();
}

function redactPotentialSecrets(value: string): string {
  return value
    .replace(/\bsk-[A-Za-z0-9]+\b/g, "sk-[REDACTED]")
    .replace(/\bapi[-_ ]?key[:= ]+[^\s,;]+/gi, "api-key [REDACTED]")
    .replace(/\btoken[:= ]+[^\s,;]+/gi, "token [REDACTED]");
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function buildTrustSummary(sourceRefs: readonly PreflightSourceRef[]) {
  return {
    trustedCount: sourceRefs.filter(source => source.trust === "trusted").length,
    derivedCount: sourceRefs.filter(source => source.trust === "derived").length,
    untrustedCount: sourceRefs.filter(source => source.trust === "untrusted").length,
  };
}

function buildFreshnessSummary(sourceRefs: readonly PreflightSourceRef[]) {
  return {
    currentCount: sourceRefs.filter(source => source.freshness === "current").length,
    recentCount: sourceRefs.filter(source => source.freshness === "recent").length,
    staleCount: sourceRefs.filter(source => source.freshness === "stale").length,
    unknownCount: sourceRefs.filter(source => source.freshness === "unknown").length,
  };
}

export function compileWorkBrief(
  input: CompileWorkBriefInput,
): CompileWorkBriefResult {
  const generatedAt = toIsoDate(input.generatedAt);
  const summaryBudget = Math.max(120, input.maxSummaryChars ?? 560);
  const includedLabels = input.sourceRefs.map(source =>
    redactPotentialSecrets(source.label),
  );
  const omittedDiagnostics = input.diagnostics.filter(
    diagnostic => !diagnostic.included,
  );

  const summaryParts = [
    redactPotentialSecrets(input.objective?.trim() || input.title.trim()),
    includedLabels.length > 0
      ? `Included sources: ${includedLabels.join(", ")}`
      : "No additional linked sources were included.",
    omittedDiagnostics.length > 0
      ? `Omitted sources: ${omittedDiagnostics
          .map(diagnostic => redactPotentialSecrets(diagnostic.message))
          .join(" ")}`
      : null,
  ].filter((part): part is string => Boolean(part));

  const brief: CompiledWorkBrief = {
    title: redactPotentialSecrets(input.title.trim()),
    objective: input.objective?.trim()
      ? redactPotentialSecrets(input.objective.trim())
      : null,
    summary: truncate(summaryParts.join(" "), summaryBudget),
    sourceRefs: input.sourceRefs.map(source => ({
      ...source,
      label: redactPotentialSecrets(source.label),
    })),
    approvalSnapshots: [],
    generatedAt,
  };

  return {
    brief,
    governedContext: {
      actorContext: input.actorContext,
      sourceRefs: brief.sourceRefs,
      selectedSourceIds: [...input.selectedSourceIds],
      diagnostics: input.diagnostics.map(diagnostic => ({
        ...diagnostic,
        message: redactPotentialSecrets(diagnostic.message),
        requesterMessage: diagnostic.requesterMessage
          ? redactPotentialSecrets(diagnostic.requesterMessage)
          : null,
        adminDetail: input.actorContext.previewAccessLevel === "admin_diagnostic"
          ? diagnostic.adminDetail ?? null
          : null,
      })),
      trustSummary: buildTrustSummary(brief.sourceRefs),
      freshnessSummary: buildFreshnessSummary(brief.sourceRefs),
      generatedAt,
    },
  };
}
