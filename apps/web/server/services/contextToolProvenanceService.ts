import type {
  ContextOwnerScope,
  ContextProvenance,
  ContextRetrievalSource,
  ContextStateBlock,
  ContextTrustLevel,
  ContextFreshness,
} from "../../shared/contextEngine";
import {
  buildContextOwnerScope,
  buildContextProvenance,
  normalizeContextFreshness,
  normalizeContextTrust,
} from "../../shared/contextEngine";

const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]"],
  [/(api[_-]?key|token|secret)\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]"],
  [/https?:\/\/[^\s"')]+/g, "[url-redacted]"],
];

export function redactContextToolText(input: string): string {
  let output = input;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function buildContextToolProvenance(input: {
  tenantId?: string | null;
  ownerType: ContextOwnerScope["type"];
  ownerId: string | null | undefined;
  sourceRef: string | null | undefined;
  source: ContextRetrievalSource;
  includedReason: string;
  trust?: ContextTrustLevel | null;
  freshness?: ContextFreshness | null;
}): ContextProvenance | null {
  const ownerScope = buildContextOwnerScope({
    type: input.ownerType,
    id: input.ownerId,
    tenantId: input.tenantId ?? null,
  });
  return buildContextProvenance({
    ownerScope,
    sourceRef: input.sourceRef,
    source: input.source,
    trust: normalizeContextTrust(input.trust, "untrusted"),
    freshness: normalizeContextFreshness(input.freshness, "recent"),
    includedReason: input.includedReason,
  });
}

export function normalizeToolContextBlock(input: {
  title: string;
  content: string;
  tenantId?: string | null;
  ownerType: ContextOwnerScope["type"];
  ownerId: string | null | undefined;
  sourceRef: string | null | undefined;
  source: ContextRetrievalSource;
  includedReason: string;
  trust?: ContextTrustLevel | null;
  freshness?: ContextFreshness | null;
  maxChars?: number;
}): ContextStateBlock | null {
  const provenance = buildContextToolProvenance(input);
  if (!provenance) return null;
  const maxChars = Math.max(200, Math.min(input.maxChars ?? 4000, 12000));
  const content = redactContextToolText(input.content).trim();
  if (!content) return null;
  return {
    title: input.title,
    content:
      content.length > maxChars
        ? `${content.slice(0, maxChars - 3).trimEnd()}...`
        : content,
    source: `${input.source}:${input.sourceRef ?? provenance.sourceRef}`,
    refs: [provenance.sourceRef],
    trust: provenance.trust,
    freshness: provenance.freshness,
    tier: "tool_result",
    provenance,
  };
}

