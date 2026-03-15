import {
  parseBrowserSessionArtifact,
  type BrowserSessionArtifact,
} from "@shared/browserSession";

import {
  normalizeWorkflowComparisonPreview,
  type WorkflowComparisonPreviewState,
} from "@/lib/workflow/outputPresentation";

interface ArtifactLike {
  metadata?: unknown;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function extractBrowserSessionArtifacts(
  artifacts: readonly ArtifactLike[] | null | undefined,
): BrowserSessionArtifact[] {
  return (artifacts ?? [])
    .map((artifact) => parseBrowserSessionArtifact(toRecord(artifact.metadata).browserSession))
    .filter((artifact): artifact is BrowserSessionArtifact => artifact !== null);
}

export function extractComparisonPreviews(
  artifacts: readonly ArtifactLike[] | null | undefined,
): WorkflowComparisonPreviewState[] {
  return (artifacts ?? [])
    .map((artifact) => {
      const metadata = toRecord(artifact.metadata);
      if (
        !("comparisonPreview" in metadata)
        && !("comparisonPayload" in metadata)
        && !("comparison" in metadata)
      ) {
        return null;
      }
      return normalizeWorkflowComparisonPreview(metadata);
    })
    .filter((preview): preview is WorkflowComparisonPreviewState => preview !== null);
}
