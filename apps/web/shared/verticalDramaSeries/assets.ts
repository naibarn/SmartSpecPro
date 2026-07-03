/**
 * Vertical Drama Series — Asset record parity snapshot + redaction helpers (spec §7.1).
 *
 * `VerticalDramaAssetRecordSnapshot` mirrors the GitHub guide's per-asset ledger
 * (face + QC fields). Provider-hosted / local fields must be redacted before
 * browser exposure — see `redactAssetRecordSnapshot` / `redactProviderPayload`.
 */

import type { VerticalDramaPipelineStage } from "./contracts";

/**
 * Per-asset ledger snapshot for parity with the upstream guide (spec §7.1).
 * `qc_status` and `contains_human_face` must round-trip for parity.
 */
export type VerticalDramaAssetRecordSnapshot = {
  asset_id: string;
  run_id: string;
  stage: VerticalDramaPipelineStage | string;
  asset_type:
    | "character_reference"
    | "product_reference"
    | "start_frame"
    | "video_clip"
    | "audio"
    | "subtitle"
    | "thumbnail"
    | string;
  local_path?: string;
  file_id?: string;
  image_url?: string;
  mediaAssetId?: string;
  contains_human_face?: boolean;
  approved: boolean;
  qc_status: "pending" | "passed" | "failed" | "needs_repair" | string;
  created_at: string;
};

/**
 * Fields that must never reach the browser directly unless signed through the
 * approved asset service or transformed into a tenant-scoped `mediaAssetId`.
 */
export const VERTICAL_DRAMA_REDACTED_ASSET_FIELDS = [
  "local_path",
  "file_id",
  "image_url",
] as const;

/** Browser-safe projection of an asset snapshot — strips local/provider fields (spec §7.1). */
export type RedactedVerticalDramaAssetRecordSnapshot = Omit<
  VerticalDramaAssetRecordSnapshot,
  "local_path" | "file_id" | "image_url"
>;

/**
 * Strip `local_path`, `file_id`, and temporary `image_url` from an asset snapshot
 * before browser exposure. `contains_human_face` and `qc_status` are preserved.
 */
export function redactAssetRecordSnapshot(
  snapshot: VerticalDramaAssetRecordSnapshot,
): RedactedVerticalDramaAssetRecordSnapshot {
  const { local_path: _lp, file_id: _fid, image_url: _iu, ...safe } = snapshot;
  return safe;
}

const SIGNED_QUERY_PARAM_PATTERN =
  /([?&])(x-amz-[^=]+|signature|sig|token|access_token|apikey|api_key|expires|se|sig|st|sp|sv|sr)=[^&#]*/gi;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const API_KEY_LIKE_PATTERN =
  /\b(sk-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{16,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g;

/** Redacts a signed URL to its origin+path, dropping any signature/token query params. */
function redactSignedUrl(value: string): string {
  try {
    const url = new URL(value);
    // Drop the entire query string — it commonly carries signatures/tokens.
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.replace(SIGNED_QUERY_PARAM_PATTERN, "$1$2=[redacted]");
  }
}

/**
 * Deep-clone a provider/debug payload with secrets removed: API keys, bearer
 * tokens, and signed URL query params are replaced with `[redacted]`. Object
 * keys that look sensitive (apiKey, authorization, signedUrl, ...) are dropped.
 */
export function redactProviderPayload<T>(value: T): T {
  const SENSITIVE_KEY = /(api[_-]?key|authorization|bearer|secret|password|signed[_-]?url|x-amz-|sas[_-]?token|access[_-]?token|credential)/i;

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      let out = node;
      if (/https?:\/\//i.test(out) && /[?&]/.test(out)) out = redactSignedUrl(out);
      out = out.replace(BEARER_PATTERN, "Bearer [redacted]");
      out = out.replace(API_KEY_LIKE_PATTERN, "[redacted]");
      return out;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (SENSITIVE_KEY.test(k)) {
          result[k] = "[redacted]";
          continue;
        }
        result[k] = walk(v);
      }
      return result;
    }
    return node;
  };

  return walk(value) as T;
}
