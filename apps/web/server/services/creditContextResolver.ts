import { CREDIT_CONTEXT_RESOLVER_VERSION, CREDIT_CONTEXT_MAX_ANCESTRY_DEPTH, mapResolutionToPresentation, normalizeContextSourceId, type CreditContextRef, type CreditContextScope, type ResolvedCreditContext } from "../../shared/creditContextContracts";
import { CreditContextError } from "../../shared/creditContextContracts";
import { getCreditContextResolver } from "./creditContextRegistry";

export async function resolveCreditContext(
  ref: CreditContextRef,
  scope: CreditContextScope,
  ancestry: Set<string> = new Set(),
): Promise<ResolvedCreditContext> {
  const sourceId = normalizeContextSourceId(ref.sourceId);
  const definition = getCreditContextResolver(ref.sourceType);
  if (!definition || !definition.contextTypes.includes(ref.contextType)) {
    throw new CreditContextError("CONTEXT_NOT_FOUND", "Unsupported credit context");
  }
  const contextKey = `${ref.sourceType}:${sourceId}`;
  if (ancestry.has(contextKey) || ancestry.size >= CREDIT_CONTEXT_MAX_ANCESTRY_DEPTH) {
    throw new CreditContextError("CONTEXT_NOT_FOUND", "Invalid credit context ancestry");
  }

  let source;
  try {
    source = await definition.resolve({ ...ref, sourceId }, scope);
  } catch (error) {
    if (definition.temporaryUnavailableMeansRetry) {
      throw new CreditContextError("REPORT_UNAVAILABLE", "Credit context is temporarily unavailable");
    }
    throw error;
  }
  if (!source) {
    throw new CreditContextError("CONTEXT_UNAUTHORIZED", "Credit context is not available");
  }
  if (source.tenantId !== scope.tenantId || (source.ownerUserId !== null && source.ownerUserId !== scope.userId)) {
    throw new CreditContextError("CONTEXT_UNAUTHORIZED", "Credit context is not available");
  }

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(contextKey);
  const parent = source.parent
    ? await resolveCreditContext(source.parent, scope, nextAncestry)
    : undefined;
  const state = source.ambiguous ? "ambiguous" : parent && parent.attributionStatus !== "linked" ? "partial" : "resolved";
  return {
    ref: { ...ref, sourceId },
    tenantId: source.tenantId,
    ownerUserId: source.ownerUserId,
    contextKey,
    displayName: source.displayName?.trim().slice(0, 255) || null,
    displayType: source.displayType?.trim().slice(0, 64) || null,
    snapshot: source.snapshot ?? (source.displayName ? { label: source.displayName.slice(0, 255), typeLabel: source.displayType ?? undefined, sourceId } : null),
    resolutionState: state,
    attributionStatus: mapResolutionToPresentation(state),
    parent,
    root: parent?.root ?? parent,
    resolverVersion: CREDIT_CONTEXT_RESOLVER_VERSION,
  };
}
