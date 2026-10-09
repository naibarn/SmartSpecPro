/**
 * Pure, advisory project-context selection policy for SPEC-302.
 *
 * This resolver does not authenticate evidence, authorize access, or mint a
 * durable receipt. Callers must re-check canonical tenant membership/ACL and
 * persist any binding through the owning authority before using a selection.
 */

export const CANONICAL_PROJECT_CONTEXT_POLICY_VERSION = "spec302-context-resolution.v1" as const;

export type CanonicalProjectContextState =
  | "RESOLVED_EXPLICIT"
  | "RESOLVED_CONTEXTUAL"
  | "RESOLVED_INFERRED"
  | "AMBIGUOUS"
  | "UNRESOLVED"
  | "NO_PROJECT"
  | "SESSION_PENDING_SCOPE";

export type CanonicalProjectBindingSource =
  | "explicit_user_selection"
  | "domain_binding"
  | "task_workflow_artifact_binding"
  | "conversation_segment_binding"
  | "app_active_project_binding"
  | "signed_launch_navigation_context"
  | "explicit_no_project";

export interface CanonicalProjectContextDimensions {
  tenantId: string;
  principalId: string;
  appId?: string;
  installationId?: string;
  workContextId?: string;
  workspaceId?: string;
  spaceId?: string;
  conversationId?: string;
  sessionId?: string;
  taskId?: string;
  workflowRunId?: string;
  artifactId?: string;
  conversationSegmentId?: string;
  domainType?: string;
  domainRecordId?: string;
  launchContextId?: string;
  environment?: string;
  purpose?: string;
}

/** A source assertion is treated as advisory input, never as an authorization proof. */
export interface CanonicalProjectBindingEvidence {
  source: CanonicalProjectBindingSource;
  canonicalProjectId: string | null;
  tenantId: string;
  principalId?: string;
  appId?: string;
  installationId?: string;
  workContextId?: string;
  workspaceId?: string;
  spaceId?: string;
  conversationId?: string;
  sessionId?: string;
  taskId?: string;
  workflowRunId?: string;
  artifactId?: string;
  conversationSegmentId?: string;
  domainType?: string;
  domainRecordId?: string;
  launchContextId?: string;
  environment?: string;
  purpose?: string;
}

export interface CanonicalProjectCandidate {
  canonicalProjectId: string;
  tenantId: string;
  score?: number;
}

export interface ResolveCanonicalProjectContextInput {
  context: CanonicalProjectContextDimensions;
  bindings?: readonly CanonicalProjectBindingEvidence[];
  recentCandidates?: readonly CanonicalProjectCandidate[];
  semanticCandidates?: readonly CanonicalProjectCandidate[];
  sessionPendingScope?: boolean;
}

export interface CanonicalProjectSuggestion {
  canonicalProjectId: string;
  source: "recent" | "semantic";
  score?: number;
}

export interface CanonicalProjectContextResolution {
  policyVersion: typeof CANONICAL_PROJECT_CONTEXT_POLICY_VERSION;
  advisory: true;
  authorizationRequired: true;
  state: CanonicalProjectContextState;
  canonicalProjectId?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  authoritativeSource?: CanonicalProjectBindingSource;
  dimensions: CanonicalProjectContextDimensions;
  /** Suggestion IDs are included only after exact tenant-scope filtering. */
  suggestions: CanonicalProjectSuggestion[];
  /** Count only; rejected evidence IDs and foreign tenant IDs are never returned. */
  ignoredEvidenceCount: number;
}

const SOURCE_PRECEDENCE: Record<CanonicalProjectBindingSource, number> = {
  explicit_user_selection: 0,
  domain_binding: 1,
  task_workflow_artifact_binding: 2,
  conversation_segment_binding: 3,
  app_active_project_binding: 4,
  signed_launch_navigation_context: 5,
  explicit_no_project: 0,
};

const OPTIONAL_BINDING_DIMENSIONS = [
  "principalId",
  "appId",
  "installationId",
  "workContextId",
  "workspaceId",
  "spaceId",
  "conversationId",
  "sessionId",
  "taskId",
  "workflowRunId",
  "artifactId",
  "conversationSegmentId",
  "domainType",
  "domainRecordId",
  "launchContextId",
  "environment",
  "purpose",
] as const;

function requiredDimension(value: string, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
    throw new TypeError(`${name} is required and must not have surrounding whitespace`);
  }
  return value;
}

function normalizeDimensions(context: CanonicalProjectContextDimensions): CanonicalProjectContextDimensions {
  const dimensions: CanonicalProjectContextDimensions = {
    ...context,
    tenantId: requiredDimension(context.tenantId, "tenantId"),
    principalId: requiredDimension(context.principalId, "principalId"),
  };
  for (const name of [
    "appId", "installationId", "workContextId", "workspaceId", "spaceId",
    "conversationId", "sessionId", "taskId", "workflowRunId", "artifactId",
    "conversationSegmentId", "domainType", "domainRecordId", "launchContextId",
    "environment", "purpose",
  ] as const) {
    const value = dimensions[name];
    if (value !== undefined && (
      typeof value !== "string" || value.trim().length === 0 || value.trim() !== value
    )) {
      throw new TypeError(`${name} must be a non-empty string without surrounding whitespace when provided`);
    }
  }
  return dimensions;
}

function bindingMatchesContext(
  binding: CanonicalProjectBindingEvidence,
  context: CanonicalProjectContextDimensions,
): boolean {
  if (binding.tenantId !== context.tenantId) return false;
  for (const name of OPTIONAL_BINDING_DIMENSIONS) {
    const evidenceValue = binding[name];
    const contextValue = context[name];
    // A supplied dimension must agree with the request. A request dimension
    // may be absent when the evidence is broader, but never the reverse.
    if (evidenceValue !== undefined && evidenceValue !== contextValue) return false;
  }
  // A source claim needs its own request binding key. This is structural
  // scoping only; it does not authenticate or authorize the claim.
  switch (binding.source) {
    case "explicit_user_selection":
    case "explicit_no_project":
      if (!binding.principalId) return false;
      break;
    case "domain_binding":
      if (!binding.domainType || !binding.domainRecordId) return false;
      break;
    case "task_workflow_artifact_binding":
      if (!binding.taskId && !binding.workflowRunId && !binding.artifactId) return false;
      break;
    case "conversation_segment_binding":
      if (!binding.conversationSegmentId && !binding.conversationId) return false;
      break;
    case "app_active_project_binding":
      if (!binding.appId) return false;
      break;
    case "signed_launch_navigation_context":
      if (!binding.launchContextId && !binding.installationId) return false;
      break;
  }
  return true;
}

function tenantScopedSuggestions(
  source: CanonicalProjectSuggestion["source"],
  candidates: readonly CanonicalProjectCandidate[] | undefined,
  tenantId: string,
): CanonicalProjectSuggestion[] {
  const byProjectId = new Map<string, CanonicalProjectSuggestion>();
  for (const candidate of candidates ?? []) {
    if (
      candidate.tenantId !== tenantId ||
      typeof candidate.canonicalProjectId !== "string" ||
      candidate.canonicalProjectId.trim().length === 0 ||
      candidate.canonicalProjectId.trim() !== candidate.canonicalProjectId
    ) continue;
    const prior = byProjectId.get(candidate.canonicalProjectId);
    const suggestion = {
      canonicalProjectId: candidate.canonicalProjectId,
      source,
      ...(typeof candidate.score === "number" && Number.isFinite(candidate.score)
        ? { score: candidate.score }
        : {}),
    } satisfies CanonicalProjectSuggestion;
    if (prior === undefined || (suggestion.score ?? Number.NEGATIVE_INFINITY) > (prior.score ?? Number.NEGATIVE_INFINITY)) {
      byProjectId.set(candidate.canonicalProjectId, suggestion);
    }
  }
  return [...byProjectId.values()].sort((left, right) =>
    left.canonicalProjectId.localeCompare(right.canonicalProjectId),
  );
}

/**
 * Resolve an advisory project context. All contradictory tenant-matching
 * authoritative claims yield AMBIGUOUS, regardless of source precedence.
 * Recency and semantic candidates are returned only as suggestions.
 */
export function resolveCanonicalProjectContext(
  input: ResolveCanonicalProjectContextInput,
): CanonicalProjectContextResolution {
  const dimensions = normalizeDimensions(input.context);
  const recent = tenantScopedSuggestions("recent", input.recentCandidates, dimensions.tenantId);
  const semantic = tenantScopedSuggestions("semantic", input.semanticCandidates, dimensions.tenantId);
  const suggestions = [...recent, ...semantic].sort((left, right) =>
    (left.source === right.source ? 0 : left.source === "recent" ? -1 : 1) ||
    (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY) ||
    left.canonicalProjectId.localeCompare(right.canonicalProjectId),
  );

  let ignoredEvidenceCount = 0;
  const acceptedBindings: CanonicalProjectBindingEvidence[] = [];
  for (const binding of input.bindings ?? []) {
    if (!bindingMatchesContext(binding, dimensions)) {
      ignoredEvidenceCount += 1;
      continue;
    }
    if (binding.source === "explicit_no_project" && binding.canonicalProjectId !== null) {
      ignoredEvidenceCount += 1;
      continue;
    }
    if (binding.source !== "explicit_no_project" && (
      typeof binding.canonicalProjectId !== "string" ||
      binding.canonicalProjectId.trim().length === 0 ||
      binding.canonicalProjectId.trim() !== binding.canonicalProjectId
    )) {
      ignoredEvidenceCount += 1;
      continue;
    }
    acceptedBindings.push(binding);
  }

  const projectIds = new Set(
    acceptedBindings
      .map((binding) => binding.canonicalProjectId)
      .filter((projectId): projectId is string => projectId !== null),
  );
  const hasExplicitNoProject = acceptedBindings.some((binding) => binding.source === "explicit_no_project");
  const contradictoryNoProject = hasExplicitNoProject && projectIds.size > 0;

  const base = {
    policyVersion: CANONICAL_PROJECT_CONTEXT_POLICY_VERSION,
    advisory: true as const,
    authorizationRequired: true as const,
    dimensions,
    suggestions,
    ignoredEvidenceCount,
  };

  if (projectIds.size > 1 || contradictoryNoProject) {
    return { ...base, state: "AMBIGUOUS", confidence: "NONE" };
  }

  if (input.sessionPendingScope) {
    return { ...base, state: "SESSION_PENDING_SCOPE", confidence: "NONE" };
  }

  if (hasExplicitNoProject) {
    const explicitNoProject = acceptedBindings.find((binding) => binding.source === "explicit_no_project")!;
    return {
      ...base,
      state: "NO_PROJECT",
      confidence: "HIGH",
      authoritativeSource: explicitNoProject.source,
    };
  }

  const canonicalProjectId = projectIds.values().next().value as string | undefined;
  if (canonicalProjectId === undefined) {
    return { ...base, state: "UNRESOLVED", confidence: "LOW" };
  }

  // Duplicate claims for the same identity collapse deterministically to the
  // strongest source; ties use the source name rather than input order.
  const matchingBindings = acceptedBindings
    .filter((binding) => binding.canonicalProjectId === canonicalProjectId)
    .sort((left, right) => SOURCE_PRECEDENCE[left.source] - SOURCE_PRECEDENCE[right.source] || left.source.localeCompare(right.source));
  const authoritativeSource = matchingBindings[0]?.source;
  const state: CanonicalProjectContextState = authoritativeSource === "explicit_user_selection"
    ? "RESOLVED_EXPLICIT"
    : "RESOLVED_CONTEXTUAL";

  return {
    ...base,
    state,
    canonicalProjectId,
    confidence: state === "RESOLVED_EXPLICIT" ? "HIGH" : "MEDIUM",
    authoritativeSource,
  };
}
