/**
 * Remove Windows verbatim path prefixes before a path is shown to a user or
 * handed to a path-aware browser API. The prefix is an OS transport detail;
 * keeping the rest of the path unchanged preserves drive and UNC semantics.
 */
export function stripWindowsVerbatimPrefix(value: string | null | undefined): string {
  if (!value) return "";
  const clean = value.trim();
  if (clean.startsWith("\\\\?\\UNC\\")) return `\\\\${clean.slice(8)}`;
  if (clean.startsWith("//?/UNC/")) return `//${clean.slice(8)}`;
  if (clean.startsWith("\\\\?\\") || clean.startsWith("//?/")) return clean.slice(4);
  if (clean.startsWith("\\??\\")) return clean.slice(4);
  return clean;
}

/** User-facing form of a local path. */
export const normalizeDisplayPath = stripWindowsVerbatimPrefix;

/**
 * Convert a local media path into the root-relative path accepted by the
 * Worker queue. Absolute paths outside the active workspace are rejected so
 * callers cannot accidentally submit a basename for the wrong file.
 */
export function resolveWorkspaceRelativePath(
  workspacePath: string | null | undefined,
  sourcePath: string | null | undefined,
): string | null {
  const source = sourcePath?.trim();
  if (!source) return null;

  const normalizedSource = normalizeLocalPath(source);
  const isAbsolute = normalizedSource.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSource);

  if (!isAbsolute) return normalizedSource;

  const root = workspacePath?.trim();
  if (!root) return null;

  const normalizedRoot = normalizeLocalPath(root).replace(/\/+$/, "");
  const sourceLower = normalizedSource.toLowerCase();
  const rootLower = normalizedRoot.toLowerCase();
  const rootPrefix = `${rootLower}/`;

  if (!sourceLower.startsWith(rootPrefix)) return null;
  return normalizedSource.slice(normalizedRoot.length).replace(/^\/+/, "") || null;
}

/**
 * Resolve a project-stored source path to a path that the local editor and
 * Tauri commands can actually open. Older projects may store a workspace-
 * relative name while newer projects commonly store an absolute path.
 */
export function resolveWorkspaceSourcePath(
  workspacePath: string | null | undefined,
  projectWorkspacePath: string | null | undefined,
  sourcePath: string | null | undefined,
): string | null {
  const source = sourcePath?.trim();
  if (!source) return null;

  const normalizedSource = normalizeLocalPath(source);
  const isAbsolute = normalizedSource.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSource);
  if (isAbsolute) return normalizedSource;

  const base = normalizeLocalPath(projectWorkspacePath?.trim() || workspacePath?.trim() || "");
  if (!base) return normalizedSource;
  return `${base.replace(/\/+$/, "")}/${normalizedSource.replace(/^\/+/, "")}`;
}

function normalizeLocalPath(value: string): string {
  let normalized = stripWindowsVerbatimPrefix(value);
  if (/^file:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      const pathname = decodeURIComponent(parsed.pathname);
      normalized = parsed.hostname && parsed.hostname !== "localhost"
        ? `//${parsed.hostname}${pathname}`
        : pathname.replace(/^\/([A-Za-z]:)/, "$1");
    } catch {
      normalized = normalized.replace(/^file:\/\//i, "");
    }
  }
  normalized = normalized.replace(/\\/g, "/").replace(/^\/\/\?\//, "");
  return normalized.replace(/^\.\//, "");
}
