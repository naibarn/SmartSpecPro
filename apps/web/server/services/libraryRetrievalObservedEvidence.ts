import type { LibraryDocumentAccessSource } from "./libraryService";

export interface ObservedLibrarySearchResult {
  status: string;
  accessSource: LibraryDocumentAccessSource;
  metadata: Record<string, unknown>;
}

/**
 * Maps a real Library search result into benchmark evidence without filling
 * lifecycle fields that the search API did not observe. The caller's tenant
 * comes from the scoped search actor; authorization requires the result to be
 * an active document returned through a recognized Library ACL path.
 */
export function mapObservedLibraryEvidence(input: {
  result: ObservedLibrarySearchResult;
  evidenceId: string;
  callerTenantId: string;
  expectedTenantId: string;
}) {
  const { result } = input;
  const revision = typeof result.metadata.revision === "string"
    ? result.metadata.revision
    : "unknown";
  const digest = typeof result.metadata.digest === "string" && /^[a-f0-9]{64}$/.test(result.metadata.digest)
    ? result.metadata.digest
    : undefined;
  const aclPathObserved = result.accessSource === "owner" ||
    result.accessSource === "shared_direct" ||
    result.accessSource === "shared_group";

  return {
    evidenceId: input.evidenceId,
    tenantId: input.callerTenantId,
    revision,
    ...(digest ? { digest } : {}),
    authorityRank: 1,
    authorized: result.status === "ready" &&
      aclPathObserved &&
      input.callerTenantId === input.expectedTenantId,
  };
}
