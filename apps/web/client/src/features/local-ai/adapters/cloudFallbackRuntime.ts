export interface CloudFallbackVoiceRuntime {
  mode: "legacy_stt";
  endpoint: "/api/stt/transcribe";
}

export function resolveCloudFallbackVoiceRuntime(): CloudFallbackVoiceRuntime {
  return {
    mode: "legacy_stt",
    endpoint: "/api/stt/transcribe",
  };
}
