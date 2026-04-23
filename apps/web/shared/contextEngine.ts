export const CONTEXT_SURFACES = ["chat", "team_room"] as const;
export type ContextSurface = (typeof CONTEXT_SURFACES)[number];

export const CONTEXT_INTENTS = [
  "conversation",
  "follow_up",
  "retrieval",
  "planning",
  "creation",
  "review",
  "media",
  "tool_use",
  "work_execution",
] as const;
export type ContextIntent = (typeof CONTEXT_INTENTS)[number];

export const CONTEXT_BUDGET_PROFILES = [
  "balanced",
  "follow_up",
  "personalized",
  "retrieval",
] as const;
export type ContextBudgetProfile = (typeof CONTEXT_BUDGET_PROFILES)[number];

export const CONTEXT_STATE_TIERS = [
  "session_state",
  "project_state",
  "durable_memory",
  "working_summary",
  "active_note",
  "recent_notes",
  "retrieved_evidence",
  "tool_result",
  "resource",
  "prompt_asset",
] as const;
export type ContextStateTier = (typeof CONTEXT_STATE_TIERS)[number];

export const CONTEXT_RETRIEVAL_SOURCES = [
  "lexical",
  "structured",
  "graph",
  "semantic",
  "hybrid",
] as const;
export type ContextRetrievalSource =
  (typeof CONTEXT_RETRIEVAL_SOURCES)[number];

export const CONTEXT_PACK_SLOT_KINDS = [
  "session_state",
  "system_instruction",
  "active_note",
  "recent_notes",
  "project_state",
  "working_summary",
  "durable_memory",
  "retrieved_evidence",
  "tool_result",
  "resource",
  "prompt_asset",
  "history",
] as const;
export type ContextPackSlotKind = (typeof CONTEXT_PACK_SLOT_KINDS)[number];

export const CONTEXT_TRUST_LEVELS = [
  "trusted",
  "derived",
  "untrusted",
] as const;
export type ContextTrustLevel = (typeof CONTEXT_TRUST_LEVELS)[number];

export const CONTEXT_FRESHNESS_LEVELS = [
  "fresh",
  "recent",
  "stale",
] as const;
export type ContextFreshness = (typeof CONTEXT_FRESHNESS_LEVELS)[number];

export interface ContextOwnerScope {
  type: "user" | "agent" | "team" | "room" | "project" | "run";
  id: string;
  tenantId?: string | null;
}

export interface ContextProvenance {
  ownerScope: ContextOwnerScope;
  sourceRef: string;
  source: ContextRetrievalSource;
  trust: ContextTrustLevel;
  freshness: ContextFreshness;
  includedReason: string;
  promotionReason?: string | null;
  pruneReason?: string | null;
}

export interface ContextStateBlock {
  title?: string | null;
  content: string;
  source?: string | null;
  refs?: string[];
  trust?: ContextTrustLevel | null;
  freshness?: ContextFreshness | null;
  tier?: ContextStateTier | null;
  provenance?: ContextProvenance | null;
}

export interface ContextStateHints {
  sessionState?: ContextStateBlock | string | null;
  activeNote?: ContextStateBlock | string | null;
  recentNotes?: Array<ContextStateBlock | string> | null;
  projectState?: ContextStateBlock | string | null;
  workingSummary?: ContextStateBlock | string | null;
  durableMemory?: Array<ContextStateBlock | string> | null;
  retrievedEvidence?: Array<ContextStateBlock | string> | null;
  toolResults?: Array<ContextStateBlock | string> | null;
  resources?: Array<ContextStateBlock | string> | null;
  prompts?: Array<ContextStateBlock | string> | null;
}

export interface ContextPackBudget {
  total: number;
  system: number;
  sessionState: number;
  activeNote: number;
  recentNotes: number;
  projectState: number;
  durableMemory: number;
  retrieval: number;
  tools: number;
  answerReserve: number;
}

export interface ContextPackSlot {
  id: string;
  kind: ContextPackSlotKind;
  role: "system" | "user" | "assistant";
  title: string | null;
  content: string;
  tokenEstimate: number;
  source: string;
  trust: ContextTrustLevel;
  freshness: ContextFreshness;
  refs: string[];
  tier?: ContextStateTier | null;
  provenance?: ContextProvenance | null;
}

export interface ContextMessageContentPart {
  type: string;
  text?: string;
  image_url?: { url: string };
}

export interface ContextMessage {
  role: "system" | "user" | "assistant";
  content: string | ContextMessageContentPart[];
}

export interface ContextPack {
  surface: ContextSurface;
  query: string;
  intent: ContextIntent;
  budgetProfile: ContextBudgetProfile;
  budget: ContextPackBudget;
  messages: ContextMessage[];
  slots: ContextPackSlot[];
  estimatedTokens: number;
  retrievalModes: Array<ContextRetrievalSource>;
  includedSources: string[];
  excludedSources: string[];
  compaction: {
    dedupedMessages: number;
    injectedMessages: number;
    tokenHeadroom: number;
  };
  notes: string[];
}

export interface ContextEngineEvaluation {
  totalSlots: number;
  sessionStateSlots: number;
  activeNoteSlots: number;
  recentNoteSlots: number;
  projectStateSlots: number;
  workingSummarySlots: number;
  durableMemorySlots: number;
  retrievedEvidenceSlots: number;
  toolResultSlots: number;
  resourceSlots: number;
  promptAssetSlots: number;
  freshSlots: number;
  recentSlots: number;
  staleSlots: number;
  retrievalCoverage: number;
  groundingScore: number;
  staleContextRatio: number;
  freshnessScore: number;
  tokenPressureRatio: number;
  healthScore: number;
  dedupedMessages: number;
  injectedMessages: number;
  tokenHeadroom: number;
}

export interface ContextStateItem {
  tier: ContextStateTier;
  kind: ContextPackSlotKind;
  title: string | null;
  content: string;
  ownerScope: ContextOwnerScope;
  sourceRef: string;
  source: ContextRetrievalSource;
  trust: ContextTrustLevel;
  freshness: ContextFreshness;
  includedReason: string;
  promotionReason?: string | null;
  pruneReason?: string | null;
  refs?: string[];
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = ["content", "summary", "text", "body", "value", "description", "objective", "comment", "note"];
    for (const key of keys) {
      const raw = record[key];
      if (typeof raw === "string" && raw.trim()) {
        return raw.trim();
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function normalizeContextTrust(
  value: unknown,
  fallback: ContextTrustLevel = "derived",
): ContextTrustLevel {
  return value === "trusted" || value === "derived" || value === "untrusted"
    ? value
    : fallback;
}

export function normalizeContextFreshness(
  value: unknown,
  fallback: ContextFreshness = "recent",
): ContextFreshness {
  return value === "fresh" || value === "recent" || value === "stale"
    ? value
    : fallback;
}

export function isTerminalContextStateTier(tier: ContextStateTier): boolean {
  return tier === "project_state" || tier === "durable_memory";
}

export function isPromotableContextStateTier(tier: ContextStateTier): boolean {
  return [
    "session_state",
    "active_note",
    "recent_notes",
    "working_summary",
    "retrieved_evidence",
    "tool_result",
  ].includes(tier);
}

export function isPrunableContextStateTier(tier: ContextStateTier): boolean {
  return [
    "session_state",
    "active_note",
    "recent_notes",
    "retrieved_evidence",
    "tool_result",
    "resource",
    "prompt_asset",
  ].includes(tier);
}

export function buildContextOwnerScope(input: {
  type: ContextOwnerScope["type"];
  id: string | null | undefined;
  tenantId?: string | null;
}): ContextOwnerScope | null {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return null;
  return {
    type: input.type,
    id,
    tenantId: input.tenantId ?? null,
  };
}

export function canPromoteContextItem(
  item: Pick<
    ContextStateItem,
    "tier" | "ownerScope" | "sourceRef" | "trust" | "freshness"
  >,
): boolean {
  if (!item.ownerScope || !item.ownerScope.id.trim()) return false;
  if (!item.sourceRef.trim()) return false;
  if (item.trust === "untrusted") return false;
  if (!isPromotableContextStateTier(item.tier)) return false;
  return item.freshness !== "stale" || item.tier === "working_summary";
}

export function canPruneContextItem(
  item: Pick<ContextStateItem, "tier" | "trust" | "freshness">,
): boolean {
  if (!isPrunableContextStateTier(item.tier)) return false;
  if (item.trust === "trusted" && item.tier === "project_state") return false;
  return item.freshness === "stale" || item.trust === "untrusted";
}

export function buildContextProvenance(input: {
  ownerScope: ContextOwnerScope | null;
  sourceRef: string | null | undefined;
  source: ContextRetrievalSource;
  trust?: ContextTrustLevel | null;
  freshness?: ContextFreshness | null;
  includedReason: string;
  promotionReason?: string | null;
  pruneReason?: string | null;
}): ContextProvenance | null {
  if (!input.ownerScope || !input.sourceRef?.trim()) return null;
  return {
    ownerScope: input.ownerScope,
    sourceRef: input.sourceRef.trim(),
    source: input.source,
    trust: normalizeContextTrust(input.trust),
    freshness: normalizeContextFreshness(input.freshness),
    includedReason: input.includedReason.trim() || "included",
    promotionReason: input.promotionReason ?? null,
    pruneReason: input.pruneReason ?? null,
  };
}

export function buildContextStateItem(input: {
  tier: ContextStateTier;
  kind?: ContextPackSlotKind;
  title?: string | null;
  content: unknown;
  ownerScope: ContextOwnerScope | null;
  sourceRef?: string | null;
  source: ContextRetrievalSource;
  trust?: ContextTrustLevel | null;
  freshness?: ContextFreshness | null;
  includedReason: string;
  promotionReason?: string | null;
  pruneReason?: string | null;
  refs?: string[] | null;
}): ContextStateItem | null {
  const content = normalizeText(input.content).trim();
  if (!content) return null;
  const ownerScope = input.ownerScope;
  const sourceRef = input.sourceRef?.trim() || input.title?.trim() || null;
  if (!ownerScope || !sourceRef) return null;
  const provenance = buildContextProvenance({
    ownerScope,
    sourceRef,
    source: input.source,
    trust: input.trust,
    freshness: input.freshness,
    includedReason: input.includedReason,
    promotionReason: input.promotionReason ?? null,
    pruneReason: input.pruneReason ?? null,
  });
  if (!provenance) return null;
  return {
    tier: input.tier,
    kind: input.kind ?? "system_instruction",
    title: input.title?.trim() || null,
    content,
    ownerScope,
    sourceRef,
    source: input.source,
    trust: provenance.trust,
    freshness: provenance.freshness,
    includedReason: provenance.includedReason,
    promotionReason: provenance.promotionReason ?? null,
    pruneReason: provenance.pruneReason ?? null,
    refs: input.refs?.filter((ref): ref is string => typeof ref === "string") ?? [],
  };
}

