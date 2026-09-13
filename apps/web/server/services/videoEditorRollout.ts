export type VideoEditorMode = "legacy_worker" | "web_beta" | "web_default";
const VIDEO_EDITOR_MODES = new Set<VideoEditorMode>(["legacy_worker", "web_beta", "web_default"]);

function assertVideoEditorMode(value: unknown): asserts value is VideoEditorMode {
  if (typeof value !== "string" || !VIDEO_EDITOR_MODES.has(value as VideoEditorMode)) throw new Error("VIDEO_EDITOR_MODE_INVALID");
}

export function resolveVideoEditorMode(input: {
  global: VideoEditorMode;
  tenant?: VideoEditorMode | null;
  user?: VideoEditorMode | null;
  emergencyRollback: boolean;
}): VideoEditorMode {
  assertVideoEditorMode(input.global);
  if (input.tenant !== undefined && input.tenant !== null) assertVideoEditorMode(input.tenant);
  if (input.user !== undefined && input.user !== null) assertVideoEditorMode(input.user);
  if (input.emergencyRollback) return "legacy_worker";
  return input.user ?? input.tenant ?? input.global;
}

export type VideoEditorRetentionConfig = {
  sourceRetention: number;
  artifactRetention: number;
  diagnosticRetention: number;
  replayWindow: number;
  orphanUploadTtl: number;
};

export function validateVideoEditorRetentionConfig(config: VideoEditorRetentionConfig): VideoEditorRetentionConfig {
  for (const value of Object.values(config)) if (!Number.isSafeInteger(value) || value < 0) throw new Error("RETENTION_CONFIG_INVALID");
  return config;
}
