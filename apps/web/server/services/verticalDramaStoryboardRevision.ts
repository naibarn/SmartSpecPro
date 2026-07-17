import { createHash } from "node:crypto";

export type StoryboardDerivedArtifactStatus = "current" | "stale";

export interface StoryboardArtifactProvenance {
  sourceRevision: string;
  status: StoryboardDerivedArtifactStatus;
  reason?: "storyboard_changed";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "_storyboardRevision" && key !== "_storyboardProvenance")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

export function computeStoryboardRevision(storyboard: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(storyboard ?? null)))
    .digest("hex");
}

export function stampStoryboardRevision<T extends Record<string, unknown>>(
  storyboard: T,
): T & { _storyboardRevision: string } {
  return { ...storyboard, _storyboardRevision: computeStoryboardRevision(storyboard) };
}

export function stampArtifactForStoryboard<T extends Record<string, unknown>>(
  artifact: T,
  storyboard: unknown,
): T & { _storyboardProvenance: StoryboardArtifactProvenance } {
  return {
    ...artifact,
    _storyboardProvenance: {
      sourceRevision: computeStoryboardRevision(storyboard),
      status: "current",
    },
  };
}

export function markArtifactStale<T>(artifact: T, storyboard: unknown): T {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return artifact;
  const record = artifact as Record<string, unknown>;
  const existing = record._storyboardProvenance as Partial<StoryboardArtifactProvenance> | undefined;
  return {
    ...record,
    _storyboardProvenance: {
      sourceRevision: existing?.sourceRevision ?? computeStoryboardRevision(storyboard),
      status: "stale",
      reason: "storyboard_changed",
    },
  } as T;
}

export function storyboardArtifactStatus(
  artifact: unknown,
  storyboard: unknown,
): "current" | "stale" | "unknown" {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return "unknown";
  const provenance = (artifact as Record<string, unknown>)._storyboardProvenance as
    | Partial<StoryboardArtifactProvenance>
    | undefined;
  if (!provenance?.sourceRevision) return "unknown";
  if (provenance.status === "stale") return "stale";
  return provenance.sourceRevision === computeStoryboardRevision(storyboard) ? "current" : "stale";
}
