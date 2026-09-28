export type EditorAiMode = "suggest" | "draft" | "apply";

export function transitionEditorAiMode(
  current: EditorAiMode,
  next: EditorAiMode,
  reviewAccepted: boolean
): { mode: EditorAiMode; reviewRequired: boolean; allowed: boolean } {
  void current;
  const reviewRequired = next === "apply";
  return {
    mode: next,
    reviewRequired,
    allowed: !reviewRequired || reviewAccepted,
  };
}

export function buildTranscriptTimelineAnchor(input: {
  segmentId: string;
  startSeconds: number;
  endSeconds: number;
  sourceFingerprint: string;
}): {
  segmentId: string;
  startMs: number;
  endMs: number;
  sourceFingerprint: string;
} {
  if (
    !Number.isFinite(input.startSeconds) ||
    !Number.isFinite(input.endSeconds) ||
    input.startSeconds < 0 ||
    input.endSeconds <= input.startSeconds ||
    !input.sourceFingerprint
  )
    throw new Error("TRANSCRIPT_ANCHOR_INVALID");
  return {
    segmentId: input.segmentId,
    startMs: Math.round(input.startSeconds * 1000),
    endMs: Math.round(input.endSeconds * 1000),
    sourceFingerprint: input.sourceFingerprint,
  };
}
