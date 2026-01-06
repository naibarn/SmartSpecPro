import type { Env } from "../config";
import { allowedContentTypes } from "../config";

export type ArtifactUploadCheck = {
  ok: boolean;
  error?: "content_type_not_allowed" | "artifact_too_large";
  maxBytes?: number;
};

export function validateArtifactUpload(env: Env, input: { contentType: string; sizeBytes: number }): ArtifactUploadCheck {
  const allowed = allowedContentTypes(env);

  if (!allowed.has(input.contentType)) {
    return { ok: false, error: "content_type_not_allowed" };
  }
  if (input.sizeBytes > env.ARTIFACT_MAX_BYTES) {
    return { ok: false, error: "artifact_too_large", maxBytes: env.ARTIFACT_MAX_BYTES };
  }
  return { ok: true };
}
