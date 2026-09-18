export interface EditorRenderIdentity {
  stage: "preview" | "scan" | "render";
  revisionId: string;
  snapshotId: string;
  sourceFingerprint: string;
  planHash: string;
}

export function buildEditorRenderIdentity(
  input: Omit<EditorRenderIdentity, "stage"> & {
    stage?: EditorRenderIdentity["stage"];
  }
): EditorRenderIdentity {
  return {
    stage: input.stage ?? "preview",
    revisionId: input.revisionId,
    snapshotId: input.snapshotId,
    sourceFingerprint: input.sourceFingerprint,
    planHash: input.planHash,
  };
}

export function assertEditorRenderParity(values: EditorRenderIdentity[]): true {
  if (values.length === 0) throw new Error("RENDER_PARITY_INVALID");
  const [first] = values;
  if (
    values.some(
      value =>
        value.revisionId !== first.revisionId ||
        value.snapshotId !== first.snapshotId ||
        value.sourceFingerprint !== first.sourceFingerprint ||
        value.planHash !== first.planHash
    )
  )
    throw new Error("RENDER_PARITY_STALE");
  return true;
}
