export type LibraryKnowledgePropertyValue =
  | string
  | number
  | boolean
  | null
  | LibraryKnowledgePropertyValue[]
  | { [key: string]: LibraryKnowledgePropertyValue };

export function normalizeLibraryKnowledgeProperties(
  input: Record<string, unknown>,
): Record<string, LibraryKnowledgePropertyValue> {
  const normalizedEntries = Object.entries(input).flatMap(([key, value]) => {
    const normalized = normalizeLibraryKnowledgePropertyValue(value);
    if (normalized === undefined) {
      return [];
    }

    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return [];
    }

    return [[trimmedKey, normalized] as const];
  });

  return Object.fromEntries(normalizedEntries);
}

export function extractLibraryKnowledgeAliases(
  properties: Record<string, LibraryKnowledgePropertyValue>,
): string[] {
  const rawValue = properties.aliases ?? properties.alias ?? [];
  return normalizeStringCollection(rawValue, { stripLeadingHash: false });
}

export function extractLibraryKnowledgeTags(
  properties: Record<string, LibraryKnowledgePropertyValue>,
): string[] {
  const rawValue = properties.tags ?? properties.tag ?? [];
  return normalizeStringCollection(rawValue, { stripLeadingHash: true });
}

function normalizeLibraryKnowledgePropertyValue(
  value: unknown,
): LibraryKnowledgePropertyValue | undefined {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return typeof value === "string" ? value.trim() : value;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeLibraryKnowledgePropertyValue(entry))
      .filter(
        (entry): entry is LibraryKnowledgePropertyValue => entry !== undefined,
      );

    return normalized;
  }

  if (typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .flatMap(([key, nestedValue]) => {
        const normalized = normalizeLibraryKnowledgePropertyValue(nestedValue);
        if (normalized === undefined) {
          return [];
        }
        return [[key.trim(), normalized] as const];
      });

    return Object.fromEntries(normalizedEntries);
  }

  return undefined;
}

function normalizeStringCollection(
  value: LibraryKnowledgePropertyValue,
  options: { stripLeadingHash: boolean },
): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const normalized = rawValues
    .flatMap((entry) => {
      if (typeof entry !== "string") {
        return [];
      }

      return entry
        .split(",")
        .map((part) => normalizeCollectionToken(part, options))
        .filter((part): part is string => part.length > 0);
    });

  return Array.from(new Set(normalized));
}

function normalizeCollectionToken(
  value: string,
  options: { stripLeadingHash: boolean },
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return options.stripLeadingHash
    ? trimmed.replace(/^#+/, "").trim()
    : trimmed;
}
