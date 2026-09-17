import {
  parseBrowserSessionArtifact,
  type BrowserSessionArtifact,
} from "@shared/browserSession";

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
