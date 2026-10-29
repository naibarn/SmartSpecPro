export type WorkspaceSourceAdmission = {
  status: "SAFE_CLEAN" | "SAFE_DISJOINT_DIRTY" | "SAFE_CANDIDATE_OVERLAY" | "BLOCKED";
  code: "SOURCE_FACTS_UNKNOWN" | "DIRTY_PATHS_UNKNOWN" | "WRITE_SCOPE_UNBOUNDED" | "SCOPE_CONFLICT" | "SOURCE_CHANGED" | "SAFE_CLEAN" | "SAFE_DISJOINT_DIRTY" | "SAFE_CANDIDATE_OVERLAY";
  conflictingPaths: string[];
  dirtyPathCount?: number;
  sourceFingerprint: string | null;
  sourceSha: string | null;
  snapshotRevision: string | null;
};

function validRepoPath(value: string): boolean {
  return value.length > 0 && value.length <= 1_024 && !value.startsWith("/") && !value.includes("\\") &&
    !value.includes("\0") && !value.split("/").some(part => !part || part === "." || part === "..");
}

function finiteScope(paths: unknown): paths is string[] {
  return Array.isArray(paths) && paths.length > 0 && paths.length <= 128 && paths.every(path =>
    typeof path === "string" && (path === "**" || (validRepoPath(path) && path !== "**/*" && path !== "*")) && path.length <= 512
  );
}

function globMatches(pattern: string, path: string): boolean {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      index += 1;
      if (pattern[index + 1] === "/") {
        index += 1;
        source += "(?:.*/)?";
      } else source += ".*";
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`).test(path);
}

/**
 * Evaluates a finite Goal write scope against Runner-authenticated source
 * facts. Unknown or stale facts fail closed; dirty paths outside the scope do
 * not require whole-repository convergence before admission.
 */
export function evaluateSpec224WorkspaceSourceAdmission(input: {
  gitHead: string | null;
  contentFingerprint: string | null;
  snapshotRevision: string | null;
  dirty: boolean | null;
  dirtyPaths?: string[] | null;
  allowedWriteSet: unknown;
  expectedFingerprint?: string | null;
  /** Known dirty files remain safe for broad access only when Runner executes
   * in its isolated per-attempt candidate and applies with per-file CAS. */
  candidateOverlay?: boolean;
}): WorkspaceSourceAdmission {
  const base = {
    conflictingPaths: [] as string[],
    sourceFingerprint: input.contentFingerprint,
    sourceSha: input.gitHead,
    snapshotRevision: input.snapshotRevision,
  };
  const blocked = (code: WorkspaceSourceAdmission["code"], conflictingPaths: string[] = []): WorkspaceSourceAdmission => ({ ...base, status: "BLOCKED", code, conflictingPaths });
  if (!input.gitHead || !/^[a-f0-9]{40,64}$/i.test(input.gitHead) || !input.contentFingerprint || !/^[a-f0-9]{64}$/i.test(input.contentFingerprint) || !input.snapshotRevision)
    return blocked("SOURCE_FACTS_UNKNOWN");
  if (input.expectedFingerprint && input.expectedFingerprint !== input.contentFingerprint)
    return blocked("SOURCE_CHANGED");
  if (input.dirty === null) return blocked("SOURCE_FACTS_UNKNOWN");
  if (!finiteScope(input.allowedWriteSet)) return blocked("WRITE_SCOPE_UNBOUNDED");
  if (!input.dirty) return { ...base, status: "SAFE_CLEAN", code: "SAFE_CLEAN" };
  if (!Array.isArray(input.dirtyPaths) || input.dirtyPaths.length > 4_096 || input.dirtyPaths.some(path => typeof path !== "string" || !validRepoPath(path)))
    return blocked("DIRTY_PATHS_UNKNOWN");
  if (input.candidateOverlay && input.allowedWriteSet.length === 1 && input.allowedWriteSet[0] === "**") {
    return { ...base, status: "SAFE_CANDIDATE_OVERLAY", code: "SAFE_CANDIDATE_OVERLAY", dirtyPathCount: input.dirtyPaths.length };
  }
  const conflicts = input.dirtyPaths.filter(path => input.allowedWriteSet.some(pattern => globMatches(pattern, path))).sort();
  return conflicts.length
    ? blocked("SCOPE_CONFLICT", conflicts)
    : { ...base, status: "SAFE_DISJOINT_DIRTY", code: "SAFE_DISJOINT_DIRTY" };
}
