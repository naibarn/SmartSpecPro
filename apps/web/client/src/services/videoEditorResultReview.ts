export type ResultReviewDecision =
  | { kind: "apply"; expectedRevision: number }
  | { kind: "review_required"; resultRevision: number; currentRevision: number }
  | { kind: "stale_conflict"; resultRevision: number; currentRevision: number };

export function decideVideoEditorResultReview(input: { resultRevision: number; currentRevision: number; explicitApply: boolean }): ResultReviewDecision {
  if (input.resultRevision === input.currentRevision && input.explicitApply) return { kind: "apply", expectedRevision: input.currentRevision };
  if (input.resultRevision < input.currentRevision) return { kind: "stale_conflict", resultRevision: input.resultRevision, currentRevision: input.currentRevision };
  return { kind: "review_required", resultRevision: input.resultRevision, currentRevision: input.currentRevision };
}
