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
  let normalized = value.trim();
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
