import crypto from "crypto";

import type { PreflightRevisionFingerprint } from "../../shared/workOrchestrator";

export interface BuildPreflightRevisionFingerprintInput {
  requestTitle: string;
  requestObjective?: string | null;
  linkedConversationIds?: readonly string[] | null;
  linkedWorkpackRunIds?: readonly string[] | null;
  linkedRoleRoutineRunIds?: readonly string[] | null;
  selectedSourceIds?: readonly string[] | null;
  policyInputs?: Record<string, unknown> | null;
  explicitTeamId?: string | null;
  generatedAt?: Date | string;
}

export interface PreflightRevisionComparison {
  stale: boolean;
  reasonCode: "matching_revision" | "missing_approved_revision" | "revision_mismatch";
  approvedFingerprint: string | null;
  currentFingerprint: string;
}

function normalizeString(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeStringList(values: readonly string[] | null | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map(value => value.trim()).filter(Boolean)),
  ).sort();
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function digestPolicy(policyInputs: Record<string, unknown> | null | undefined): string | null {
  if (!policyInputs || Object.keys(policyInputs).length === 0) {
    return null;
  }
  return crypto.createHash("sha256").update(stableJson(policyInputs)).digest("hex");
}

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date().toISOString();
}

export function buildPreflightRevisionFingerprint(
  input: BuildPreflightRevisionFingerprintInput,
): PreflightRevisionFingerprint {
  const normalizedInputs = {
    requestTitle: normalizeString(input.requestTitle),
    requestObjective: normalizeOptionalString(input.requestObjective),
    linkedConversationIds: normalizeStringList(input.linkedConversationIds),
    linkedWorkpackRunIds: normalizeStringList(input.linkedWorkpackRunIds),
    linkedRoleRoutineRunIds: normalizeStringList(input.linkedRoleRoutineRunIds),
    selectedSourceIds: normalizeStringList(input.selectedSourceIds),
    policyDigest: digestPolicy(input.policyInputs),
    explicitTeamId: normalizeOptionalString(input.explicitTeamId),
  };
  const fingerprint = crypto
    .createHash("sha256")
    .update(stableJson(normalizedInputs))
    .digest("hex");

  return {
    algorithm: "sha256-json-v1",
    fingerprint,
    inputs: normalizedInputs,
    generatedAt: toIsoDate(input.generatedAt),
  };
}

export function comparePreflightRevision(
  approvedRevision: Pick<PreflightRevisionFingerprint, "fingerprint"> | null | undefined,
  currentRevision: Pick<PreflightRevisionFingerprint, "fingerprint">,
): PreflightRevisionComparison {
  if (!approvedRevision?.fingerprint) {
    return {
      stale: true,
      reasonCode: "missing_approved_revision",
      approvedFingerprint: null,
      currentFingerprint: currentRevision.fingerprint,
    };
  }
  if (approvedRevision.fingerprint !== currentRevision.fingerprint) {
    return {
      stale: true,
      reasonCode: "revision_mismatch",
      approvedFingerprint: approvedRevision.fingerprint,
      currentFingerprint: currentRevision.fingerprint,
    };
  }
  return {
    stale: false,
    reasonCode: "matching_revision",
    approvedFingerprint: approvedRevision.fingerprint,
    currentFingerprint: currentRevision.fingerprint,
  };
}
