import type {
  ContextOwnerScope,
  ContextRetrievalSource,
  ContextStateBlock,
  ContextStateHints,
  ContextTrustLevel,
  ContextFreshness,
} from "../../shared/contextEngine";
import { normalizeToolContextBlock } from "./contextToolProvenanceService";

export interface ContextToolObservation {
  title: string;
  content: string;
  ownerType: ContextOwnerScope["type"];
  ownerId: string | null | undefined;
  sourceRef: string | null | undefined;
  source: ContextRetrievalSource;
  includedReason: string;
  trust?: "trusted" | "derived" | "untrusted" | null;
  freshness?: "fresh" | "recent" | "stale" | null;
  maxChars?: number;
}

export function normalizeContextToolObservation(
  observation: ContextToolObservation,
): ContextStateBlock | null {
  return normalizeToolContextBlock({
    ...observation,
    tenantId: null,
  });
}

export function buildContextToolStateHints(
  observations: ContextToolObservation[],
): ContextStateHints {
  const toolResults = observations
    .map((observation) => normalizeContextToolObservation(observation))
    .filter((item): item is ContextStateBlock => Boolean(item));

  return toolResults.length > 0 ? { toolResults } : {};
}

function normalizeObjectArrayItem(item: unknown): string {
  if (!item || typeof item !== "object") {
    return typeof item === "string" ? item.trim() : "";
  }

  const record = item as Record<string, unknown>;
  const fields = [
    "title",
    "name",
    "label",
    "text",
    "summary",
    "description",
    "content",
    "fileName",
    "path",
    "id",
  ];

  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
}

function summarizeToolResultValue(result: unknown, maxChars = 6_000): string {
  if (result == null) return "";
  if (typeof result === "string") {
    return result.trim();
  }
  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }
  if (Array.isArray(result)) {
    const summary = result
      .slice(0, 20)
      .map((item) => normalizeObjectArrayItem(item))
      .filter(Boolean)
      .join("\n");
    return summary.length > maxChars ? `${summary.slice(0, maxChars - 3).trimEnd()}...` : summary;
  }
  if (typeof result === "object") {
    const record = result as Record<string, unknown>;

    if (Array.isArray(record.content)) {
      const text = record.content
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          const block = part as Record<string, unknown>;
          if (typeof block.text === "string") return block.text;
          if (typeof block.content === "string") return block.content;
          return "";
        })
        .filter(Boolean)
        .join("\n");
      if (text.trim()) {
        return text.trim().slice(0, maxChars);
      }
    }

    const textFields = [
      "text",
      "content",
      "summary",
      "message",
      "description",
      "body",
      "output",
      "result",
      "docs",
    ];
    for (const field of textFields) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) {
        const trimmed = value.trim();
        return trimmed.length > maxChars
          ? `${trimmed.slice(0, maxChars - 3).trimEnd()}...`
          : trimmed;
      }
    }

    const listFields = ["items", "results", "files", "entries", "documents"];
    for (const field of listFields) {
      const value = record[field];
      if (Array.isArray(value) && value.length > 0) {
        const summary = value
          .slice(0, 10)
          .map((item) => normalizeObjectArrayItem(item))
          .filter(Boolean)
          .join("\n");
        if (summary.trim()) {
          return summary.length > maxChars
            ? `${summary.slice(0, maxChars - 3).trimEnd()}...`
            : summary;
        }
      }
    }

    try {
      const json = JSON.stringify(result);
      return json.length > maxChars ? `${json.slice(0, maxChars - 3).trimEnd()}...` : json;
    } catch {
      return String(result);
    }
  }
  return String(result);
}

function extractEmbeddedContextState(result: unknown): ContextStateHints | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const record = result as Record<string, unknown>;
  const candidates = [
    record.contextState,
    record.context_state,
    record["_meta"] && typeof record["_meta"] === "object"
      ? (record["_meta"] as Record<string, unknown>).contextState
      : null,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      if (Object.keys(candidate).length > 0) {
        return candidate as ContextStateHints;
      }
    }
  }
  return null;
}

export function buildContextToolStateHintsFromResult(input: {
  title: string;
  content: unknown;
  ownerType: ContextOwnerScope["type"];
  ownerId: string | null | undefined;
  sourceRef: string | null | undefined;
  source: ContextRetrievalSource;
  includedReason: string;
  trust?: ContextTrustLevel | null;
  freshness?: ContextFreshness | null;
  maxChars?: number;
}): ContextStateHints {
  const embedded = extractEmbeddedContextState(input.content);
  if (embedded) {
    return embedded;
  }

  const summary = summarizeToolResultValue(input.content, input.maxChars);
  if (!summary.trim()) return {};

  return buildContextToolStateHints([
    {
      title: input.title,
      content: summary,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      sourceRef: input.sourceRef,
      source: input.source,
      includedReason: input.includedReason,
      trust: input.trust ?? "derived",
      freshness: input.freshness ?? "recent",
      maxChars: input.maxChars,
    },
  ]);
}
