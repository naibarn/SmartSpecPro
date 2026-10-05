import type {
  DevelopmentDependencyContract,
  DevelopmentDependencyEvidence,
  DevelopmentWorkUnit,
} from "./developmentLifecycleContracts";

export type DevelopmentLifecyclePredicateContext = {
  tenantId: string;
  workUnit: DevelopmentWorkUnit;
  dependency: DevelopmentDependencyContract;
};

export type DevelopmentLifecyclePredicateAdapter = {
  predicateId: string;
  verifyEvidence(input: DevelopmentLifecyclePredicateContext & {
    evidence: DevelopmentDependencyEvidence;
  }): Promise<DevelopmentDependencyEvidence | null>;
  recheck(input: DevelopmentLifecyclePredicateContext): Promise<DevelopmentDependencyEvidence | null>;
};

const predicates = new Map<string, DevelopmentLifecyclePredicateAdapter>();

export function registerDevelopmentLifecyclePredicate(
  adapter: DevelopmentLifecyclePredicateAdapter
): () => void {
  const predicateId = adapter.predicateId.trim();
  if (!predicateId || predicateId.length > 256) throw new Error("DEVELOPMENT_PREDICATE_ID_INVALID");
  if (predicates.has(predicateId)) throw new Error("DEVELOPMENT_PREDICATE_DUPLICATE");
  const registered = { ...adapter, predicateId };
  predicates.set(predicateId, registered);
  return () => {
    if (predicates.get(predicateId) === registered) predicates.delete(predicateId);
  };
}

export function getDevelopmentLifecyclePredicate(
  predicateId: string
): DevelopmentLifecyclePredicateAdapter | null {
  return predicates.get(predicateId) ?? null;
}

export function requireDevelopmentLifecyclePredicate(
  predicateId: string
): DevelopmentLifecyclePredicateAdapter {
  const adapter = getDevelopmentLifecyclePredicate(predicateId);
  if (!adapter) throw new Error("DEVELOPMENT_PREDICATE_UNAVAILABLE");
  return adapter;
}
