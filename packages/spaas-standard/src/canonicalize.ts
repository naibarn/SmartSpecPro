import type { SpaasManifest } from "./model";

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => [key, canonicalValue(record[key])]));
  }
  return value;
}

function freezeRecursively(value: unknown): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeRecursively(child);
  Object.freeze(value);
}

/** Produce stable object-key order while preserving all semantically ordered arrays. */
export function canonicalizeManifest(manifest: SpaasManifest): SpaasManifest {
  const normalized = canonicalValue(manifest) as SpaasManifest;
  freezeRecursively(normalized);
  return normalized;
}

/** Serialize JSON-compatible values with bytewise key ordering and semantic array order. */
export function canonicalJsonStringify(value: unknown): string {
  const write = (item: unknown): string => {
    if (item === null || typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError("non-finite canonical JSON number");
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) return `[${item.map(write).join(",")}]`;
    if (item !== null && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${write(record[key])}`).join(",")}}`;
    }
    throw new TypeError("value is not JSON-compatible");
  };
  return write(value);
}
