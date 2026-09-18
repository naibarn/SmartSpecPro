export interface EditorArtifactQcInput {
  artifactId: string;
  role: string;
  mediaHash: string;
  expectedMediaHash: string;
  durationMs: number;
  expectedDurationMs: number;
  width: number;
  height: number;
  expectedWidth: number;
  expectedHeight: number;
  hasAudio: boolean;
  audioRequired: boolean;
}

export interface EditorArtifactQcResult {
  status: "passed" | "warning" | "failed";
  warnings: string[];
  failures: string[];
}

export function evaluateEditorArtifactQc(
  input: EditorArtifactQcInput
): EditorArtifactQcResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  if (
    input.width !== input.expectedWidth ||
    input.height !== input.expectedHeight
  )
    failures.push("geometry_mismatch");
  if (input.audioRequired && !input.hasAudio)
    failures.push("required_audio_missing");
  if (input.mediaHash !== input.expectedMediaHash)
    failures.push("hash_mismatch");
  if (Math.abs(input.durationMs - input.expectedDurationMs) > 100)
    warnings.push("duration_tolerance");
  return {
    status:
      failures.length > 0
        ? "failed"
        : warnings.length > 0
          ? "warning"
          : "passed",
    warnings,
    failures,
  };
}
