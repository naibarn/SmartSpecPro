/**
 * Customer presentation boundary for workspace/repository identity.
 * Internal IDs stay in the execution/control-plane contracts; this projection
 * only emits details whose provenance and actor authorization are explicit.
 */
export type IdentityPresentationMode = "simple" | "developer";
export type WorkspaceIdentityProvenance = "user_owned" | "platform_internal" | "unknown";

export type RunnerWorkspaceIdentityInput = {
  actorId: number;
  ownerUserId: number | null;
  runnerProfile: string;
  nodeKind: string;
  mode: IdentityPresentationMode;
  workspaceId: string;
  rootId?: string | null;
  kind?: "workspace" | "project" | null;
  displayName: string | null;
  projectId: string | null;
  repositoryId: string | null;
  gitHead: string | null;
  gitBranch: string | null;
  dirty: boolean | null;
};

export type RunnerWorkspacePresentation = {
  provenance: WorkspaceIdentityProvenance;
  displayName: string;
  workspaceId?: string;
  rootId?: string;
  kind?: "workspace" | "project";
  projectId?: string;
  repositoryId?: string;
  gitHead?: string;
  gitBranch?: string;
  dirty?: boolean | null;
};

export function classifyWorkspaceIdentityProvenance(input: Pick<
  RunnerWorkspaceIdentityInput,
  "actorId" | "ownerUserId" | "runnerProfile" | "nodeKind"
>): WorkspaceIdentityProvenance {
  if (input.runnerProfile === "local_device" && input.ownerUserId === input.actorId) {
    return "user_owned";
  }
  if (input.runnerProfile === "shared_container" || input.nodeKind === "managed_container") {
    return "platform_internal";
  }
  return "unknown";
}

export function projectRunnerDisplayName(input: Pick<
  RunnerWorkspaceIdentityInput,
  "actorId" | "ownerUserId" | "runnerProfile" | "nodeKind"
> & { displayName: string | null }): string {
  const provenance = classifyWorkspaceIdentityProvenance(input);
  if (provenance === "user_owned") return input.displayName?.trim() || "Runner";
  return provenance === "platform_internal" ? "SmartAIHub Runner" : "Runner";
}

export function projectRunnerWorkspacePresentation(
  input: RunnerWorkspaceIdentityInput,
): RunnerWorkspacePresentation {
  const provenance = classifyWorkspaceIdentityProvenance(input);
  if (provenance !== "user_owned") {
    return { provenance, displayName: provenance === "platform_internal" ? "Runner workspace" : "Workspace" };
  }

  const displayName = input.displayName?.trim() || "Workspace";
  if (input.mode !== "developer") return { provenance, displayName };
  return {
    provenance,
    displayName,
    workspaceId: input.workspaceId,
    ...(input.rootId ? { rootId: input.rootId } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
    ...(input.gitHead ? { gitHead: input.gitHead } : {}),
    ...(input.gitBranch ? { gitBranch: input.gitBranch } : {}),
    dirty: input.dirty,
  };
}

const ABSOLUTE_PATH = /(?:[A-Za-z]:\\(?:[^\s"'<>|]+\\?)+|\/(?:[^\s"'<>|]+\/?){2,})/g;
const LEGACY_BRAND = /smart[\s._-]*spec(?:[\s._-]*pro)?/gi;

/** Apply only to system-authored diagnostics, never user prompts or repo labels. */
export function sanitizePlatformDiagnostic(value: string): string {
  return value
    .replace(ABSOLUTE_PATH, "[filesystem path]")
    .replace(LEGACY_BRAND, "SmartAIHub")
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|authorization)\b\s*[:=]\s*["']?[^\s,;"']+/gi, "$1=[redacted]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]");
}

export function presentCustomerDiagnostic(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const safe = sanitizePlatformDiagnostic(value).trim();
  return safe.length > 0 ? safe.slice(0, 240) : fallback;
}

export function presentCustomerError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return presentCustomerDiagnostic(error.message, fallback);
}

const DIAGNOSTIC_FIELDS = new Set(["error", "errormessage", "diagnostic", "stderr", "stack"]);

/** Redact only system diagnostic fields; user-authored names and repository labels pass unchanged. */
export function sanitizeCustomerDiagnosticPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeCustomerDiagnosticPayload(item)) as T;
  }
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === "string" && DIAGNOSTIC_FIELDS.has(key.toLowerCase())) {
      output[key] = sanitizePlatformDiagnostic(child);
    } else {
      output[key] = sanitizeCustomerDiagnosticPayload(child);
    }
  }
  return output as T;
}
