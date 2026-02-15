import type { MediaJobSpec } from "../../shared/types/mediaJob";

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function normalizeTenantIdValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }

  return null;
}

function parseTenantAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((value) => normalizeTenantIdValue(value))
    .filter((value): value is string => Boolean(value));
  if (!ids.length) return null;
  return new Set(ids);
}

export function isTextClipEnabledForTenant(tenantId: unknown): boolean {
  const enabled = parseBoolean(process.env.TEXT_CLIP_T1_ENABLED, true);
  if (!enabled) return false;

  const allowlist = parseTenantAllowlist(process.env.TEXT_CLIP_T1_ENABLED_TENANTS);
  if (!allowlist) return true;

  const normalized = normalizeTenantIdValue(tenantId);
  if (!normalized) return false;
  return allowlist.has(normalized);
}

export function hasTextSemanticsInJobSpec(spec: Pick<MediaJobSpec, "inputs"> | null | undefined): boolean {
  const tracks = spec?.inputs?.project?.tracks;
  if (!Array.isArray(tracks)) return false;

  return tracks.some((track) => {
    if (track?.type === "subtitle") return true;
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    return clips.some((clip) => typeof clip?.textConfig === "object" && clip?.textConfig !== null);
  });
}

export function assertTextClipRolloutEnabledForSpec(
  spec: Pick<MediaJobSpec, "inputs"> | null | undefined,
  tenantId: unknown,
): void {
  if (!hasTextSemanticsInJobSpec(spec)) return;
  if (isTextClipEnabledForTenant(tenantId)) return;
  throw new Error("Text clip rollout is disabled for this tenant cohort");
}
