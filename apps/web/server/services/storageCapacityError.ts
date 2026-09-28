import { readFileSync, statfsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatStorageCapacityErrorMessage,
  isStorageCapacityError,
  type StorageCapacityErrorDetails,
} from "../../shared/storageCapacityError";

type StatFsLike = {
  bavail: number | bigint;
  bsize: number | bigint;
  ffree: number | bigint;
};

function asSafeNumber(value: number | bigint): number | undefined {
  const number = typeof value === "bigint" ? Number(value) : value;
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function decodeMountInfoField(value: string): string {
  return value
    .replaceAll("\\040", " ")
    .replaceAll("\\011", "\t")
    .replaceAll("\\134", "\\");
}

function resolveLinuxMountPoint(targetPath: string): string | undefined {
  try {
    const rows = readFileSync("/proc/self/mountinfo", "utf8").split("\n");
    const matches = rows
      .map(row => row.split(" "))
      .filter(fields => fields.length > 5)
      .map(fields => decodeMountInfoField(fields[4]!))
      .filter(mount =>
        targetPath === mount || targetPath.startsWith(`${mount}${path.sep}`),
      )
      .sort((a, b) => b.length - a.length);
    return matches[0];
  } catch {
    return undefined;
  }
}

function safeTargetLabel(targetPath: string | undefined): string | undefined {
  if (!targetPath) return undefined;
  const resolved = path.resolve(targetPath);
  const tempRoot = path.resolve(os.tmpdir());
  if (resolved === tempRoot || resolved.startsWith(`${tempRoot}${path.sep}`)) {
    return tempRoot;
  }
  if (process.platform === "win32") return path.parse(resolved).root || undefined;
  return path.parse(resolved).root || undefined;
}

function findStatFsTarget(
  targetPath: string | undefined,
  statFs: (target: string) => StatFsLike,
): string | undefined {
  if (!targetPath) return undefined;
  const resolved = path.resolve(targetPath);
  try {
    statFs(resolved);
    return resolved;
  } catch {
    const parent = path.dirname(resolved);
    try {
      statFs(parent);
      return parent;
    } catch {
      return undefined;
    }
  }
}

export function inspectStorageCapacity(
  targetPath?: string,
  deps: {
    statFs?: (target: string) => StatFsLike;
    mountPoint?: (target: string) => string | undefined;
  } = {},
): StorageCapacityErrorDetails {
  const statFs = deps.statFs ?? statfsSync;
  const target = findStatFsTarget(targetPath, statFs);
  const details: StorageCapacityErrorDetails = {};
  if (target) {
    try {
      const stats = statFs(target);
      const availableBytes =
        asSafeNumber(stats.bavail) != null && asSafeNumber(stats.bsize) != null
          ? asSafeNumber(stats.bavail)! * asSafeNumber(stats.bsize)!
          : undefined;
      const availableInodes = asSafeNumber(stats.ffree);
      if (availableBytes != null) details.availableBytes = availableBytes;
      if (availableInodes != null) details.availableInodes = availableInodes;
      details.capacityKind =
        availableBytes === 0
          ? "bytes"
          : availableInodes === 0
            ? "inodes"
            : "unknown";
    } catch {
      // Capacity metadata is best-effort; the normalized error remains useful.
    }
    details.mountPoint =
      deps.mountPoint?.(target) ??
      resolveLinuxMountPoint(target) ??
      safeTargetLabel(targetPath);
  } else {
    details.mountPoint = safeTargetLabel(targetPath);
  }
  return details;
}

/** Normalize an errno/message and enrich it with the filesystem that failed. */
export function normalizeStorageCapacityError(
  error: unknown,
  targetPath?: string,
): string | null {
  if (!isStorageCapacityError(error)) return null;
  return formatStorageCapacityErrorMessage(
    inspectStorageCapacity(targetPath),
  );
}
