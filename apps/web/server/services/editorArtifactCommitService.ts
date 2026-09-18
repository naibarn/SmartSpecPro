import { createHash } from "node:crypto";
import {
  type EditorArtifactQcInput,
  type EditorArtifactQcResult,
} from "./editorQcService";

export interface EditorArtifactCommitRecord {
  status: "committed";
  commitKey: string;
  artifactId: string;
  role: string;
  tenantId: string;
  snapshotId: string;
  revisionId: string;
  warnings: string[];
}

export function prepareEditorArtifactCommit(
  input: EditorArtifactQcInput & {
    snapshotId: string;
    revisionId: string;
    tenantId: string;
    expectedRole?: string;
  },
  qc: EditorArtifactQcResult
): EditorArtifactCommitRecord {
  if (input.expectedRole && input.role !== input.expectedRole)
    throw new Error("ARTIFACT_ROLE_MISMATCH");
  if (input.mediaHash !== input.expectedMediaHash)
    throw new Error("ARTIFACT_HASH_MISMATCH");
  if (qc.status === "failed") throw new Error("ARTIFACT_QC_FAILED");
  const commitKey = createHash("sha256")
    .update(
      [
        input.tenantId,
        input.snapshotId,
        input.revisionId,
        input.artifactId,
        input.role,
        input.mediaHash,
      ].join("|"),
      "utf8"
    )
    .digest("hex");
  return {
    status: "committed",
    commitKey,
    artifactId: input.artifactId,
    role: input.role,
    tenantId: input.tenantId,
    snapshotId: input.snapshotId,
    revisionId: input.revisionId,
    warnings: qc.warnings,
  };
}
