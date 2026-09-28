import path from "node:path";
import { tmpdir } from "node:os";

export type ExportDownloadTarget =
  | { kind: "file"; path: string }
  | { kind: "storage"; key: string }
  | { kind: "redirect"; url: string };

const MAX_TARGET_LENGTH = 2048;
const SAFE_LOCAL_ROOTS = [
  path.resolve(tmpdir()),
  path.resolve(process.cwd()),
];

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSafeLocalExportPath(candidatePath: string): boolean {
  return SAFE_LOCAL_ROOTS.some((rootPath) => isWithinRoot(candidatePath, rootPath));
}

export function resolveExportDownloadTarget(rawTarget: unknown): ExportDownloadTarget | null {
  if (typeof rawTarget !== "string") {
    return null;
  }

  const trimmed = rawTarget.trim();
  if (!trimmed || trimmed.length > MAX_TARGET_LENGTH) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return { kind: "redirect", url: parsed.toString() };
  } catch {
    // Not a URL; fall through to local-path handling.
  }

  const managedStoragePrefix = "/api/storage/files/";
  if (trimmed.startsWith(managedStoragePrefix)) {
    const encodedKey = trimmed.slice(managedStoragePrefix.length);
    if (!encodedKey) {
      return null;
    }
    try {
      const key = decodeURIComponent(encodedKey);
      if (!key || key.includes("\0") || key.split("/").some((part) => part === "..")) {
        return null;
      }
      return { kind: "storage", key };
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("/") || trimmed.startsWith(".")) {
    const resolvedPath = path.resolve(trimmed);
    if (!isSafeLocalExportPath(resolvedPath)) {
      return null;
    }
    return { kind: "file", path: resolvedPath };
  }

  return null;
}
