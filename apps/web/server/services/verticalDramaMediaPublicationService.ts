import { mediaArtifactManifestSchema, mediaQcReportSchema } from "../../shared/verticalDramaMedia/contracts";

export type MediaPublicationContext = {
  tenantId: string;
  seriesId: string;
  bindingRevision: number;
  currentBindingRevision: number;
  uploadTokenWorkerId: string;
  expectedWorkerId: string;
  expectedChecksum: string;
  verifiedArtifact: boolean;
};

export function validateVerticalDramaMediaPublication(input: {
  context: MediaPublicationContext;
  artifact: unknown;
  qc: unknown;
}) {
  const artifact = mediaArtifactManifestSchema.parse(input.artifact);
  const qc = mediaQcReportSchema.parse(input.qc);
  if (input.context.bindingRevision !== input.context.currentBindingRevision) throw new Error("root_revision_stale");
  if (input.context.uploadTokenWorkerId !== input.context.expectedWorkerId) throw new Error("artifact_ownership_failed");
  if (!input.context.verifiedArtifact) throw new Error("artifact_ownership_failed");
  if (artifact.checksum !== input.context.expectedChecksum || qc.checksum !== artifact.checksum) throw new Error("artifact_checksum_mismatch");
  if (!qc.passed) throw new Error("qc_failed");
  if (artifact.sourceAssetId.length === 0) throw new Error("publication_rejected");
  return Object.freeze({ artifact, qc, published: true as const, provenance: { tenantId: input.context.tenantId, seriesId: input.context.seriesId, bindingRevision: input.context.currentBindingRevision } });
}
