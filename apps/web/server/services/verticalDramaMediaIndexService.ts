import { mediaArtifactManifestSchema } from "../../shared/verticalDramaMedia/contracts";

export type VerticalDramaMediaIndexRecord = {
  tenantId: string;
  seriesId: string;
  artifactRevision: string;
  searchableText: string;
  tags: string[];
  sourceAssetId: string;
};

export function buildVerticalDramaMediaIndexRecord(input: { tenantId: string; seriesId: string; artifact: unknown; searchableText: string; tags: string[] }): VerticalDramaMediaIndexRecord {
  const artifact = mediaArtifactManifestSchema.parse(input.artifact);
  if (input.tags.length > 64 || input.searchableText.length > 4000) throw new Error("invalid_contract");
  return { tenantId: input.tenantId, seriesId: input.seriesId, artifactRevision: artifact.artifactRevision, searchableText: input.searchableText.trim(), tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 64), sourceAssetId: artifact.sourceAssetId };
}

export function filterVerticalDramaMediaIndex(records: readonly VerticalDramaMediaIndexRecord[], tenantId: string, seriesId: string): VerticalDramaMediaIndexRecord[] {
  return records.filter((record) => record.tenantId === tenantId && record.seriesId === seriesId);
}
