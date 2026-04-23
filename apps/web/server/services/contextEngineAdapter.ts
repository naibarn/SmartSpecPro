import { buildChatContext, buildTeamContext } from "./executors/contextBuilder";
import type { UnifiedExecutionRequest } from "./executors/types";

export type ContextSurface = "chat" | "team_room";

export type ContextIntent =
  | "conversation"
  | "follow_up"
  | "retrieval"
  | "planning"
  | "creation"
  | "review"
  | "media"
  | "tool_use"
  | "work_execution";

export type ContextBudgetProfile =
  | "balanced"
  | "follow_up"
  | "personalized"
  | "retrieval";

export type ContextSlotKind =
  | "session_state"
  | "system_instruction"
  | "active_note"
  | "recent_notes"
  | "project_state"
  | "working_summary"
  | "durable_memory"
  | "retrieved_evidence"
  | "tool_result"
  | "resource"
  | "prompt_asset"
  | "history";

export type ContextMessageContentPart = {
  type: string;
  text?: string;
  image_url?: { url: string };
};

export interface ContextMessage {
  role: "system" | "user" | "assistant";
  content: string | ContextMessageContentPart[];
}

export interface ContextStateBlock {
  title?: string | null;
  content: string;
  source?: string | null;
  refs?: string[];
  trust?: "trusted" | "derived" | "untrusted" | null;
  freshness?: "fresh" | "recent" | "stale" | null;
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
  kind: ContextSlotKind;
  role: "system" | "user" | "assistant";
  title: string | null;
  content: string;
  tokenEstimate: number;
  source: string;
  trust: "trusted" | "derived" | "untrusted";
  freshness: "fresh" | "recent" | "stale";
  refs: string[];
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
  retrievalModes: Array<"lexical" | "structured" | "graph" | "semantic" | "hybrid">;
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

export interface BuildContextPackInput {
  surface: ContextSurface;
  query: string;
  coreMessages: ContextMessage[];
  prefixMessages?: ContextMessage[];
  dynamicParams?: Record<string, unknown> | null;
  tokenBudget?: number;
  label?: string | null;
}

export interface BuildExecutionContextPackOptions {
  skillSystemPrompt?: string | null;
  knowledgebase?: string | null;
  dynamicParams?: Record<string, unknown> | null;
  tokenBudget?: number;
  label?: string | null;
}

type AnnotatedMessage = ContextMessage & {
  source: string;
  kind: ContextSlotKind;
  title: string | null;
  trust: "trusted" | "derived" | "untrusted";
  freshness: "fresh" | "recent" | "stale";
  refs: string[];
};

const DEFAULT_CONTEXT_BUDGET = 16_000;
const MAX_CONTEXT_BLOCK_CHARS = 1_600;

type BudgetProfile = ContextBudgetProfile;

interface BudgetAllocation {
  persona: number;
  scopedMemory: number;
  entityMemory: number;
  history: number;
}

const BUDGET_PROFILES: Record<BudgetProfile, BudgetAllocation> = {
  balanced: { persona: 1200, scopedMemory: 3000, entityMemory: 1500, history: 5000 },
  follow_up: { persona: 800, scopedMemory: 2000, entityMemory: 1000, history: 6500 },
  personalized: { persona: 1200, scopedMemory: 4000, entityMemory: 2000, history: 3500 },
  retrieval: { persona: 800, scopedMemory: 5000, entityMemory: 1000, history: 3500 },
};

const ENTITY_MEMORY_FLOOR = 1000;

function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;

  const charCount = normalized.length;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const cjkThaiCount = (normalized.match(/[\p{Script=Thai}\p{Script=Han}]/gu) || []).length;
  const codeLikeCount = (normalized.match(/[`{}[\]()<>=_*/\\]/g) || []).length;

  const estimated =
    charCount / 4 +
    wordCount * 0.45 +
    cjkThaiCount * 0.35 +
    codeLikeCount * 0.12;

  return Math.max(1, Math.ceil(estimated));
}

function detectBudgetProfile(
  objective: string,
  historyLength: number,
): BudgetProfile {
  const lower = objective.toLowerCase();
  const len = objective.length;

  const followUpRe = /(ต่อจาก|เพิ่มเติม|อธิบาย|ขยาย|\bcontinue\b|\bfollow[- ]?up\b|\bnext\b|\bexpand\b|\belaborate\b)/i;
  if ((len < 60 && historyLength >= 3) || followUpRe.test(lower)) {
    return "follow_up";
  }

  const retrievalRe = /(ค้นหา|หาข้อมูล|ดึงข้อมูล|วิเคราะห์ข้อมูล|สรุปเอกสาร|\bsearch\b|\blookup\b|\breference\b|\bretrieve\b|\bresearch\b|\banalyze data\b|\bsummarize doc)/i;
  if (retrievalRe.test(lower)) {
    return "retrieval";
  }

  const personalizedRe = /(ตามสไตล์|ตามแบบ|เหมือนเดิม|ปรับให้เข้ากับ|ตามที่เคย|จำได้ไหม|\bmy style\b|\blike before\b|\bpreference\b|\bcustomize\b|\bremember\b)/i;
  if (personalizedRe.test(lower)) {
    return "personalized";
  }

  return "balanced";
}

function scaleBudget(
  profile: BudgetProfile,
  totalBudget: number,
): BudgetAllocation {
  const base = BUDGET_PROFILES[profile];
  const baseTotal =
    base.persona + base.scopedMemory + base.entityMemory + base.history;
  const ratio = totalBudget / baseTotal;

  return {
    persona: Math.round(base.persona * ratio),
    scopedMemory: Math.round(base.scopedMemory * ratio),
    entityMemory: Math.max(
      ENTITY_MEMORY_FLOOR,
      Math.round(base.entityMemory * ratio),
    ),
    history: Math.round(base.history * ratio),
  };
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = [
      "content",
      "summary",
      "text",
      "body",
      "value",
      "description",
      "objective",
      "comment",
      "note",
    ];
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

function normalizeBlock(
  value: ContextStateBlock | string | null | undefined,
  fallbackTitle: string,
  fallbackSource: string,
): ContextStateBlock | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const content = value.trim();
    return content
      ? {
          title: fallbackTitle,
          content,
          source: fallbackSource,
          refs: [],
          trust: "derived",
          freshness: "fresh",
        }
      : null;
  }
  const content = normalizeText(value.content).trim();
  if (!content) return null;
  const truncatedContent =
    content.length > MAX_CONTEXT_BLOCK_CHARS
      ? `${content.slice(0, MAX_CONTEXT_BLOCK_CHARS - 3).trimEnd()}...`
      : content;
  return {
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title.trim()
        : fallbackTitle,
    content: truncatedContent,
    source:
      typeof value.source === "string" && value.source.trim()
        ? value.source.trim()
        : fallbackSource,
    refs: Array.isArray(value.refs)
      ? value.refs.filter((ref): ref is string => typeof ref === "string")
      : [],
    trust: value.trust ?? "derived",
    freshness: value.freshness ?? "fresh",
  };
}

function normalizeBlockCollection(
  value: unknown,
  fallbackTitle: string,
  fallbackSource: string,
): ContextStateBlock[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((item, index) =>
        normalizeBlock(item, `${fallbackTitle} ${index + 1}`, fallbackSource),
      )
      .filter((item): item is ContextStateBlock => Boolean(item));
  }
  const block = normalizeBlock(
    value as ContextStateBlock | string,
    fallbackTitle,
    fallbackSource,
  );
  return block ? [block] : [];
}

function pickSourceValue(
  source: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
}

function coerceContextBlock(
  value: unknown,
  fallbackTitle: string,
  fallbackSource: string,
): ContextStateBlock | null {
  if (value == null) return null;
  if (typeof value === "string") {
    return normalizeBlock(value, fallbackTitle, fallbackSource);
  }
  if (Array.isArray(value)) {
    return normalizeBlock(normalizeText(value), fallbackTitle, fallbackSource);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const titleValue = pickSourceValue(record, ["title", "name", "label"]);
    const contentValue = pickSourceValue(record, [
      "content",
      "summary",
      "text",
      "body",
      "value",
      "description",
      "objective",
      "comment",
      "note",
    ]);
    const refsValue = pickSourceValue(record, [
      "refs",
      "refIds",
      "sourceRefs",
      "evidenceRefs",
    ]);
    const trustValue = pickSourceValue(record, ["trust", "trustTier"]);
    const freshnessValue = pickSourceValue(record, [
      "freshness",
      "freshnessTier",
    ]);
    const sourceValue = pickSourceValue(record, ["source", "sourceType", "kind"]);

    const content = normalizeText(contentValue).trim();
    if (!content) return null;
    const truncatedContent =
      content.length > MAX_CONTEXT_BLOCK_CHARS
        ? `${content.slice(0, MAX_CONTEXT_BLOCK_CHARS - 3).trimEnd()}...`
        : content;

    return {
      title:
        typeof titleValue === "string" && titleValue.trim()
          ? titleValue.trim()
          : fallbackTitle,
      content: truncatedContent,
      source:
        typeof sourceValue === "string" && sourceValue.trim()
          ? sourceValue.trim()
          : fallbackSource,
      refs: Array.isArray(refsValue)
        ? refsValue.filter((ref): ref is string => typeof ref === "string")
        : [],
      trust:
        trustValue === "trusted" ||
        trustValue === "derived" ||
        trustValue === "untrusted"
          ? trustValue
          : "derived",
      freshness:
        freshnessValue === "fresh" ||
        freshnessValue === "recent" ||
        freshnessValue === "stale"
          ? freshnessValue
          : "fresh",
    };
  }
  return null;
}

function readContextState(source?: Record<string, unknown> | null): ContextStateHints | undefined {
  if (!source) return undefined;

  const hints: ContextStateHints = {};
  const sessionState = coerceContextBlock(
    pickSourceValue(source, ["sessionState", "session_state"]),
    "Session state",
    "dynamic_params.sessionState",
  );
  const activeNote = coerceContextBlock(
    pickSourceValue(source, ["activeNote", "active_note"]),
    "Active note",
    "dynamic_params.activeNote",
  );
  const projectState = coerceContextBlock(
    pickSourceValue(source, ["projectState", "project_state"]),
    "Project state",
    "dynamic_params.projectState",
  );
  const workingSummary = coerceContextBlock(
    pickSourceValue(source, ["workingSummary", "working_summary"]),
    "Working summary",
    "dynamic_params.workingSummary",
  );

  const recentNotes = normalizeBlockCollection(
    pickSourceValue(source, ["recentNotes", "recent_notes"]),
    "Recent note",
    "dynamic_params.recentNotes",
  );
  const durableMemory = normalizeBlockCollection(
    pickSourceValue(source, ["durableMemory", "durable_memory"]),
    "Durable memory",
    "dynamic_params.durableMemory",
  );
  const retrievedEvidence = normalizeBlockCollection(
    pickSourceValue(source, ["retrievedEvidence", "retrieved_evidence"]),
    "Retrieved evidence",
    "dynamic_params.retrievedEvidence",
  );
  const toolResults = normalizeBlockCollection(
    pickSourceValue(source, ["toolResults", "tool_results"]),
    "Tool result",
    "dynamic_params.toolResults",
  );
  const resources = normalizeBlockCollection(
    pickSourceValue(source, ["resources"]),
    "Resource",
    "dynamic_params.resources",
  );
  const prompts = normalizeBlockCollection(
    pickSourceValue(source, ["prompts"]),
    "Prompt",
    "dynamic_params.prompts",
  );

  if (sessionState) hints.sessionState = sessionState;
  if (activeNote) hints.activeNote = activeNote;
  if (projectState) hints.projectState = projectState;
  if (workingSummary) hints.workingSummary = workingSummary;
  if (recentNotes.length > 0) hints.recentNotes = recentNotes;
  if (durableMemory.length > 0) hints.durableMemory = durableMemory;
  if (retrievedEvidence.length > 0) hints.retrievedEvidence = retrievedEvidence;
  if (toolResults.length > 0) hints.toolResults = toolResults;
  if (resources.length > 0) hints.resources = resources;
  if (prompts.length > 0) hints.prompts = prompts;

  return Object.keys(hints).length > 0 ? hints : undefined;
}

function mergeStringArrays(
  base: Array<string | null | undefined> = [],
  overlay: Array<string | null | undefined> = [],
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const value of [...base, ...overlay]) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged;
}

function blockSignature(block: ContextStateBlock): string {
  return [
    block.title ?? "",
    block.content.trim(),
    block.trust ?? "",
    block.freshness ?? "",
    (block.refs ?? []).map((ref) => ref.trim()).filter(Boolean).join("\u001f"),
  ].join("\u001e");
}

function mergeContextBlock(
  base: ContextStateBlock | string | null | undefined,
  overlay: ContextStateBlock | string | null | undefined,
  fallbackTitle: string,
  baseSource: string,
  overlaySource: string,
): ContextStateBlock | null {
  const baseBlock = coerceContextBlock(base, fallbackTitle, baseSource);
  const overlayBlock = coerceContextBlock(overlay, fallbackTitle, overlaySource);

  if (!baseBlock) return overlayBlock;
  if (!overlayBlock) return baseBlock;

  return {
    title: overlayBlock.title ?? baseBlock.title ?? fallbackTitle,
    content: overlayBlock.content.trim() || baseBlock.content,
    source: overlayBlock.source ?? baseBlock.source ?? overlaySource ?? baseSource,
    refs: mergeStringArrays(baseBlock.refs, overlayBlock.refs),
    trust: overlayBlock.trust ?? baseBlock.trust ?? "derived",
    freshness: overlayBlock.freshness ?? baseBlock.freshness ?? "fresh",
  };
}

function mergeBlockCollections(
  base: Array<ContextStateBlock | string> | ContextStateBlock | string | null | undefined,
  overlay: Array<ContextStateBlock | string> | ContextStateBlock | string | null | undefined,
  fallbackTitle: string,
  baseSource: string,
  overlaySource: string,
): ContextStateBlock[] {
  const combined = [
    ...normalizeBlockCollection(base, fallbackTitle, baseSource),
    ...normalizeBlockCollection(overlay, fallbackTitle, overlaySource),
  ];
  const seen = new Set<string>();
  const merged: ContextStateBlock[] = [];
  for (const block of combined) {
    const key = blockSignature(block);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(block);
  }
  return merged;
}

export function mergeContextStateHints(
  base?: ContextStateHints | null,
  overlay?: ContextStateHints | null,
): ContextStateHints | undefined {
  const hints: ContextStateHints = {};

  const sessionState = mergeContextBlock(
    base?.sessionState,
    overlay?.sessionState,
    "Session state",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );
  const activeNote = mergeContextBlock(
    base?.activeNote,
    overlay?.activeNote,
    "Active note",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );
  const projectState = mergeContextBlock(
    base?.projectState,
    overlay?.projectState,
    "Project state",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );
  const workingSummary = mergeContextBlock(
    base?.workingSummary,
    overlay?.workingSummary,
    "Working summary",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );

  const recentNotes = mergeBlockCollections(
    base?.recentNotes,
    overlay?.recentNotes,
    "Recent note",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );
  const durableMemory = mergeBlockCollections(
    base?.durableMemory,
    overlay?.durableMemory,
    "Durable memory",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );
  const retrievedEvidence = mergeBlockCollections(
    base?.retrievedEvidence,
    overlay?.retrievedEvidence,
    "Retrieved evidence",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );
  const toolResults = mergeBlockCollections(
    base?.toolResults,
    overlay?.toolResults,
    "Tool result",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );
  const resources = mergeBlockCollections(
    base?.resources,
    overlay?.resources,
    "Resource",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );
  const prompts = mergeBlockCollections(
    base?.prompts,
    overlay?.prompts,
    "Prompt",
    "merged_context_state.base",
    "merged_context_state.overlay",
  );

  if (sessionState) hints.sessionState = sessionState;
  if (activeNote) hints.activeNote = activeNote;
  if (projectState) hints.projectState = projectState;
  if (workingSummary) hints.workingSummary = workingSummary;
  if (recentNotes.length > 0) hints.recentNotes = recentNotes;
  if (durableMemory.length > 0) hints.durableMemory = durableMemory;
  if (retrievedEvidence.length > 0) hints.retrievedEvidence = retrievedEvidence;
  if (toolResults.length > 0) hints.toolResults = toolResults;
  if (resources.length > 0) hints.resources = resources;
  if (prompts.length > 0) hints.prompts = prompts;

  return Object.keys(hints).length > 0 ? hints : undefined;
}

export function extractContextHintsFromDynamicParams(
  dynamicParams?: Record<string, unknown> | null,
): ContextStateHints | undefined {
  if (!dynamicParams) return undefined;

  const candidate =
    dynamicParams.contextState && typeof dynamicParams.contextState === "object"
      ? (dynamicParams.contextState as Record<string, unknown>)
      : dynamicParams;

  return readContextState(candidate);
}

function classifyIntent(query: string, surface: ContextSurface): ContextIntent {
  const lower = query.toLowerCase();
  const trimmed = query.trim();

  if (trimmed.length < 60 && /(\bcontinue\b|\bfollow[- ]?up\b|\bnext\b|\bmore\b|ต่อ|เพิ่มเติม|ขยาย)/i.test(lower)) {
    return "follow_up";
  }
  if (/(search|lookup|retrieve|research|reference|find|ค้นหา|หาข้อมูล|สืบค้น|ดึงข้อมูล)/i.test(lower)) {
    return "retrieval";
  }
  if (/(plan|brainstorm|compare|choose|เลือก|วางแผน|ระดมความคิด|options|alternatives)/i.test(lower)) {
    return "planning";
  }
  if (/(review|approve|score|critique|check|verify|validate|audit|reviewer|ทบทวน|ตรวจสอบ|อนุมัติ)/i.test(lower)) {
    return "review";
  }
  if (/(image|video|visual|storyboard|prompt|veo|clip|photo|ภาพ|วิดีโอ|คลิป|สตอรี่บอร์ด)/i.test(lower)) {
    return "media";
  }
  if (/(tool|mcp|resource|read|write|invoke|prompt asset|prompt_asset)/i.test(lower)) {
    return "tool_use";
  }
  if (/(create|draft|write|generate|compose|produce|build|สร้าง|เขียน|ร่าง|ทำ)/i.test(lower)) {
    return "creation";
  }

  return surface === "team_room" ? "work_execution" : "conversation";
}

function deriveRetrievalModes(
  surface: ContextSurface,
  intent: ContextIntent,
): ContextPack["retrievalModes"] {
  const modes = new Set<ContextPack["retrievalModes"][number]>(["semantic", "hybrid"]);
  if (intent !== "conversation") modes.add("lexical");
  if (
    intent === "retrieval" ||
    intent === "planning" ||
    intent === "review" ||
    intent === "tool_use" ||
    surface === "team_room"
  ) {
    modes.add("structured");
  }
  if (surface === "team_room" || intent === "planning" || intent === "review") {
    modes.add("graph");
  }
  return Array.from(modes);
}

function deriveBudget(
  surface: ContextSurface,
  budgetProfile: ContextBudgetProfile,
  intent: ContextIntent,
  totalBudget: number,
): ContextPackBudget {
  const base = scaleBudget(budgetProfile, totalBudget);
  const budget: ContextPackBudget = {
    total: totalBudget,
    system: Math.max(500, base.persona),
    sessionState: Math.max(180, Math.round(base.history * 0.08)),
    activeNote: Math.max(250, Math.round(base.history * 0.18)),
    recentNotes: Math.max(250, Math.round(base.history * 0.28)),
    projectState: Math.max(300, Math.round(base.scopedMemory * 0.2)),
    durableMemory: Math.max(500, base.entityMemory),
    retrieval: Math.max(500, Math.round(base.scopedMemory * 0.3)),
    tools: Math.max(200, Math.round(base.history * 0.08)),
    answerReserve: 0,
  };

  if (surface === "chat") {
    budget.sessionState += 150;
    budget.activeNote += 200;
    budget.recentNotes += 200;
  } else {
    budget.sessionState += 220;
    budget.projectState += 300;
    budget.retrieval += 300;
  }

  switch (intent) {
    case "follow_up":
      budget.sessionState += 100;
      budget.activeNote += 150;
      budget.recentNotes += 300;
      break;
    case "retrieval":
      budget.sessionState += 80;
      budget.retrieval += 700;
      budget.recentNotes = Math.max(200, budget.recentNotes - 150);
      break;
    case "planning":
      budget.sessionState += 120;
      budget.projectState += 500;
      budget.retrieval += 200;
      break;
    case "review":
      budget.sessionState += 60;
      budget.durableMemory += 250;
      budget.retrieval += 250;
      break;
    case "media":
      budget.sessionState += 60;
      budget.tools += 200;
      budget.retrieval += 150;
      break;
    case "tool_use":
      budget.sessionState += 100;
      budget.tools += 600;
      break;
    case "creation":
      budget.sessionState += 80;
      budget.activeNote += 120;
      budget.projectState += 120;
      break;
    case "work_execution":
      budget.sessionState += 100;
      budget.projectState += 200;
      budget.retrieval += 150;
      break;
    case "conversation":
    default:
      break;
  }

  const used =
    budget.system +
    budget.sessionState +
    budget.activeNote +
    budget.recentNotes +
    budget.projectState +
    budget.durableMemory +
    budget.retrieval +
    budget.tools;
  budget.answerReserve = Math.max(0, totalBudget - used);
  return budget;
}

function summarizeBlock(block: ContextStateBlock): string {
  const pieces: string[] = [];
  if (block.title) pieces.push(`Title: ${block.title}`);
  pieces.push(`Content:\n${block.content.trim()}`);
  if (block.source) pieces.push(`Source: ${block.source}`);
  if (block.refs && block.refs.length > 0) {
    pieces.push(`Refs: ${block.refs.join(", ")}`);
  }
  return pieces.join("\n\n");
}

function buildStateMessages(
  hints?: ContextStateHints | null,
): AnnotatedMessage[] {
  if (!hints) return [];

  const annotated: AnnotatedMessage[] = [];
  const fallbackTitles: Record<ContextSlotKind, string> = {
    session_state: "Session state",
    system_instruction: "System instruction",
    active_note: "Active note",
    recent_notes: "Recent note",
    project_state: "Project state",
    working_summary: "Working summary",
    durable_memory: "Durable memory",
    retrieved_evidence: "Retrieved evidence",
    tool_result: "Tool result",
    resource: "Resource",
    prompt_asset: "Prompt asset",
    history: "History",
  };

  const pushSingle = (
    kind: ContextSlotKind,
    source: string,
    block: ContextStateBlock | string | null | undefined,
  ) => {
    const normalized = normalizeBlock(block, fallbackTitles[kind], source);
    if (!normalized) return;
    const content = `[${kind.toUpperCase().replace(/_/g, " ")}]\n${summarizeBlock(normalized)}`;
    annotated.push({
      role: "system",
      content,
      source,
      kind,
      title: normalized.title ?? null,
      trust: normalized.trust ?? "derived",
      freshness: normalized.freshness ?? "fresh",
      refs: normalized.refs ?? [],
    });
  };

  const pushMany = (
    kind: ContextSlotKind,
    source: string,
    blocks:
      | Array<ContextStateBlock | string>
      | ContextStateBlock
      | string
      | null
      | undefined,
  ) => {
    const normalizedBlocks = normalizeBlockCollection(
      blocks,
      fallbackTitles[kind],
      source,
    );
    if (normalizedBlocks.length === 0) return;
    normalizedBlocks.forEach((block, index) => {
      const indexedSource = `${source}[${index}]`;
      pushSingle(kind, indexedSource, block);
    });
  };

  pushSingle("active_note", "dynamic_params.activeNote", hints.activeNote ?? null);
  pushSingle(
    "session_state",
    "dynamic_params.sessionState",
    hints.sessionState ?? null,
  );
  pushSingle(
    "project_state",
    "dynamic_params.projectState",
    hints.projectState ?? null,
  );
  pushSingle(
    "working_summary",
    "dynamic_params.workingSummary",
    hints.workingSummary ?? null,
  );
  pushMany("recent_notes", "dynamic_params.recentNotes", hints.recentNotes);
  pushMany("durable_memory", "dynamic_params.durableMemory", hints.durableMemory);
  pushMany(
    "retrieved_evidence",
    "dynamic_params.retrievedEvidence",
    hints.retrievedEvidence,
  );
  pushMany("tool_result", "dynamic_params.toolResults", hints.toolResults);
  pushMany("resource", "dynamic_params.resources", hints.resources);
  pushMany("prompt_asset", "dynamic_params.prompts", hints.prompts);

  return annotated;
}

export function buildContextStateMessages(
  hints?: ContextStateHints | null,
): ContextMessage[] {
  return buildStateMessages(hints).map(({ role, content }) => ({ role, content }));
}

function countSlotsByKind(
  slots: ContextPackSlot[],
): Record<ContextSlotKind, number> {
  return slots.reduce<Record<ContextSlotKind, number>>((acc, slot) => {
    acc[slot.kind] = (acc[slot.kind] ?? 0) + 1;
    return acc;
  }, {
    session_state: 0,
    system_instruction: 0,
    active_note: 0,
    recent_notes: 0,
    project_state: 0,
    working_summary: 0,
    durable_memory: 0,
    retrieved_evidence: 0,
    tool_result: 0,
    resource: 0,
    prompt_asset: 0,
    history: 0,
  });
}

function countSlotsByFreshness(
  slots: ContextPackSlot[],
): Record<ContextPackSlot["freshness"], number> {
  return slots.reduce<Record<ContextPackSlot["freshness"], number>>((acc, slot) => {
    acc[slot.freshness] = (acc[slot.freshness] ?? 0) + 1;
    return acc;
  }, {
    fresh: 0,
    recent: 0,
    stale: 0,
  });
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function evaluateContextPack(pack: ContextPack): ContextEngineEvaluation {
  const kindCounts = countSlotsByKind(pack.slots);
  const freshnessCounts = countSlotsByFreshness(pack.slots);
  const totalSlots = Math.max(0, pack.slots.length);
  const groundingInputs =
    kindCounts.session_state +
    kindCounts.active_note +
    kindCounts.project_state +
    kindCounts.working_summary +
    kindCounts.recent_notes;
  const retrievalInputs =
    kindCounts.durable_memory +
    kindCounts.retrieved_evidence +
    kindCounts.resource +
    kindCounts.tool_result +
    kindCounts.prompt_asset;
  const retrievalCoverage = totalSlots > 0
    ? clampScore(retrievalInputs / Math.max(1, groundingInputs + retrievalInputs))
    : 0;
  const groundingScore = clampScore(
    (kindCounts.session_state > 0 ? 0.16 : 0) +
    (kindCounts.active_note > 0 ? 0.34 : 0) +
    Math.min(0.22, kindCounts.recent_notes * 0.07) +
    (kindCounts.project_state > 0 ? 0.22 : 0) +
    Math.min(0.16, kindCounts.working_summary * 0.08) +
    Math.min(0.06, kindCounts.durable_memory * 0.02),
  );
  const staleContextRatio = totalSlots > 0
    ? freshnessCounts.stale / totalSlots
    : 0;
  const freshnessScore = totalSlots > 0
    ? freshnessCounts.fresh / totalSlots
    : 0;
  const tokenPressureRatio = clampScore(
    pack.estimatedTokens / Math.max(1, pack.budget.total),
  );
  const healthScore = clampScore(
    (groundingScore * 0.38) +
    (retrievalCoverage * 0.32) +
    (freshnessScore * 0.2) +
    ((1 - staleContextRatio) * 0.08) +
    ((1 - tokenPressureRatio) * 0.02),
  );

  return {
    totalSlots,
    sessionStateSlots: kindCounts.session_state,
    activeNoteSlots: kindCounts.active_note,
    recentNoteSlots: kindCounts.recent_notes,
    projectStateSlots: kindCounts.project_state,
    workingSummarySlots: kindCounts.working_summary,
    durableMemorySlots: kindCounts.durable_memory,
    retrievedEvidenceSlots: kindCounts.retrieved_evidence,
    toolResultSlots: kindCounts.tool_result,
    resourceSlots: kindCounts.resource,
    promptAssetSlots: kindCounts.prompt_asset,
    freshSlots: freshnessCounts.fresh,
    recentSlots: freshnessCounts.recent,
    staleSlots: freshnessCounts.stale,
    retrievalCoverage,
    groundingScore,
    staleContextRatio,
    freshnessScore,
    tokenPressureRatio,
    healthScore,
    dedupedMessages: pack.compaction.dedupedMessages,
    injectedMessages: pack.compaction.injectedMessages,
    tokenHeadroom: pack.compaction.tokenHeadroom,
  };
}

export function evaluateContextStateHints(
  hints?: ContextStateHints | null,
): ContextEngineEvaluation {
  const stateMessages = buildStateMessages(hints);
  const totalSlots = stateMessages.length;
  const kindCounts = stateMessages.reduce<Record<ContextSlotKind, number>>((acc, message) => {
    acc[message.kind] = (acc[message.kind] ?? 0) + 1;
    return acc;
  }, {
    session_state: 0,
    system_instruction: 0,
    active_note: 0,
    recent_notes: 0,
    project_state: 0,
    working_summary: 0,
    durable_memory: 0,
    retrieved_evidence: 0,
    tool_result: 0,
    resource: 0,
    prompt_asset: 0,
    history: 0,
  });
  const freshnessCounts = stateMessages.reduce<Record<ContextPackSlot["freshness"], number>>((acc, message) => {
    acc[message.freshness] = (acc[message.freshness] ?? 0) + 1;
    return acc;
  }, {
    fresh: 0,
    recent: 0,
    stale: 0,
  });
  const retrievalInputs =
    kindCounts.durable_memory +
    kindCounts.retrieved_evidence +
    kindCounts.resource +
    kindCounts.tool_result +
    kindCounts.prompt_asset;
  const groundingInputs =
    kindCounts.session_state +
    kindCounts.active_note +
    kindCounts.project_state +
    kindCounts.working_summary +
    kindCounts.recent_notes;
  const freshnessScore = totalSlots > 0
    ? freshnessCounts.fresh / totalSlots
    : 0;
  const tokenHeadroom = Math.max(0, 8_000 - totalSlots * 140);
  const tokenPressureRatio = clampScore(1 - tokenHeadroom / 8_000);
  const healthScore = clampScore(
    (clampScore(
      (kindCounts.session_state > 0 ? 0.16 : 0) +
      (kindCounts.active_note > 0 ? 0.34 : 0) +
      Math.min(0.22, kindCounts.recent_notes * 0.07) +
      (kindCounts.project_state > 0 ? 0.22 : 0) +
      Math.min(0.16, kindCounts.working_summary * 0.08) +
      Math.min(0.06, kindCounts.durable_memory * 0.02),
    ) * 0.38) +
    (totalSlots > 0
      ? clampScore(retrievalInputs / Math.max(1, groundingInputs + retrievalInputs)) * 0.32
      : 0) +
    (freshnessScore * 0.2) +
    ((1 - (totalSlots > 0 ? freshnessCounts.stale / totalSlots : 0)) * 0.08) +
    ((1 - tokenPressureRatio) * 0.02),
  );

  return {
    totalSlots,
    sessionStateSlots: kindCounts.session_state,
    activeNoteSlots: kindCounts.active_note,
    recentNoteSlots: kindCounts.recent_notes,
    projectStateSlots: kindCounts.project_state,
    workingSummarySlots: kindCounts.working_summary,
    durableMemorySlots: kindCounts.durable_memory,
    retrievedEvidenceSlots: kindCounts.retrieved_evidence,
    toolResultSlots: kindCounts.tool_result,
    resourceSlots: kindCounts.resource,
    promptAssetSlots: kindCounts.prompt_asset,
    freshSlots: freshnessCounts.fresh,
    recentSlots: freshnessCounts.recent,
    staleSlots: freshnessCounts.stale,
    retrievalCoverage: totalSlots > 0
      ? clampScore(retrievalInputs / Math.max(1, groundingInputs + retrievalInputs))
      : 0,
    groundingScore: clampScore(
      (kindCounts.active_note > 0 ? 0.34 : 0) +
      Math.min(0.22, kindCounts.recent_notes * 0.07) +
      (kindCounts.project_state > 0 ? 0.22 : 0) +
      Math.min(0.16, kindCounts.working_summary * 0.08) +
      Math.min(0.06, kindCounts.durable_memory * 0.02),
    ),
    staleContextRatio: totalSlots > 0 ? freshnessCounts.stale / totalSlots : 0,
    freshnessScore,
    tokenPressureRatio,
    healthScore,
    dedupedMessages: 0,
    injectedMessages: totalSlots,
    tokenHeadroom,
  };
}

export function classifyContextEngineStatus(
  evaluation: Pick<ContextEngineEvaluation, "groundingScore" | "staleContextRatio" | "tokenHeadroom" | "retrievalCoverage">,
): "ok" | "warning" | "critical" {
  if (
    evaluation.tokenHeadroom <= 0 ||
    evaluation.staleContextRatio >= 0.5 ||
    evaluation.groundingScore < 0.3
  ) {
    return "critical";
  }

  if (
    evaluation.tokenHeadroom < 500 ||
    evaluation.staleContextRatio >= 0.25 ||
    evaluation.groundingScore < 0.6 ||
    evaluation.retrievalCoverage < 0.25
  ) {
    return "warning";
  }

  return "ok";
}

function annotateMessage(
  message: ContextMessage,
  source: string,
): AnnotatedMessage {
  const text = normalizeText(message.content).trim();
  const normalized = text.toLowerCase();
  let kind: ContextSlotKind = "system_instruction";
  let title: string | null = null;
  let trust: "trusted" | "derived" | "untrusted" = "derived";
  let freshness: "fresh" | "recent" | "stale" = "recent";

  if (message.role === "user" && /^\[OBJECTIVE\]/i.test(text)) {
    kind = "active_note";
    freshness = "fresh";
  } else if (message.role === "assistant") {
    kind = "working_summary";
  } else if (/^\[ACTIVE NOTE\]/i.test(text)) {
    kind = "active_note";
  } else if (/^\[PROJECT STATE\]/i.test(text) || /project continuity notes:/i.test(text)) {
    kind = "project_state";
  } else if (/^\[WORKING SUMMARY\]/i.test(text)) {
    kind = "working_summary";
  } else if (
    /^\[DURABLE MEMORY\]/i.test(text) ||
    /relevant workspace memories:/i.test(text) ||
    /known facts about the user:/i.test(text) ||
    /persistent user rules and preferences:/i.test(text)
  ) {
    kind = "durable_memory";
  } else if (/^\[RETRIEVED EVIDENCE\]/i.test(text)) {
    kind = "retrieved_evidence";
  } else if (/^\[TOOL RESULT\]/i.test(text) || /^\[TOOL RESULTS\]/i.test(text)) {
    kind = "tool_result";
  } else if (/^\[RESOURCE\]/i.test(text) || /^\[MCP RESOURCE\]/i.test(text)) {
    kind = "resource";
  } else if (/^\[PROMPT ASSET\]/i.test(text)) {
    kind = "prompt_asset";
  } else if (
    /room language:/i.test(text) ||
    /team members available:/i.test(text) ||
    /you are/i.test(text) ||
    /^\[persona start\]/i.test(text)
  ) {
    kind = "system_instruction";
    trust = "trusted";
    freshness = "fresh";
  } else if (normalized.includes("history")) {
    kind = "working_summary";
    freshness = "recent";
  } else if (message.role === "user") {
    kind = "active_note";
    freshness = "fresh";
  }

  if (kind === "active_note" && /^active note/i.test(text)) {
    title = "Active note";
  } else if (kind === "project_state" && /^project state/i.test(text)) {
    title = "Project state";
  } else if (kind === "working_summary" && /^working summary/i.test(text)) {
    title = "Working summary";
  }

  if (kind === "system_instruction") {
    trust = "trusted";
    freshness = "fresh";
  }

  return {
    ...message,
    source,
    kind,
    title,
    trust,
    freshness,
    refs: [],
  };
}

function injectStateMessages(
  baseMessages: AnnotatedMessage[],
  stateMessages: AnnotatedMessage[],
): AnnotatedMessage[] {
  if (stateMessages.length === 0) return baseMessages;

  const firstUserIndex = baseMessages.findIndex((message) => message.role === "user");
  const insertAt = firstUserIndex === -1 ? baseMessages.length : firstUserIndex;
  return [
    ...baseMessages.slice(0, insertAt),
    ...stateMessages,
    ...baseMessages.slice(insertAt),
  ];
}

function dedupeAnnotatedMessages(
  messages: AnnotatedMessage[],
): { messages: AnnotatedMessage[]; dedupedCount: number } {
  const seen = new Set<string>();
  const deduped: AnnotatedMessage[] = [];
  let dedupedCount = 0;

  for (const message of messages) {
    const key = `${message.role}:${normalizeText(message.content).replace(/\s+/g, " ").trim().toLowerCase()}`;
    if (seen.has(key)) {
      dedupedCount += 1;
      continue;
    }
    seen.add(key);
    deduped.push(message);
  }

  return { messages: deduped, dedupedCount };
}

function buildPackFromMessages(
  input: BuildContextPackInput,
): ContextPack {
  const stateHints = extractContextHintsFromDynamicParams(input.dynamicParams);
  const baseBudget = input.tokenBudget ?? DEFAULT_CONTEXT_BUDGET;
  const historyLength = input.coreMessages.filter((message) => message.role !== "system").length;
  const budgetProfile = detectBudgetProfile(input.query || "", historyLength) as ContextBudgetProfile;
  const intent = classifyIntent(input.query || "", input.surface);
  const budget = deriveBudget(input.surface, budgetProfile, intent, baseBudget);
  const prefixAnnotated = (input.prefixMessages ?? []).map((message) =>
    annotateMessage(message, `${input.label ?? input.surface}.prefix`),
  );
  const coreAnnotated = input.coreMessages.map((message) =>
    annotateMessage(message, `${input.label ?? input.surface}.core`),
  );
  const stateAnnotated = buildStateMessages(stateHints);

  const withState = injectStateMessages([...prefixAnnotated, ...coreAnnotated], stateAnnotated);
  const deduped = dedupeAnnotatedMessages(withState);
  const messages = deduped.messages.map(({ source: _source, kind: _kind, title: _title, trust: _trust, freshness: _freshness, refs: _refs, ...message }) => message);
  const slots = deduped.messages.map((message, index) => ({
    id: `${input.label ?? input.surface}-${index}`,
    kind: message.kind,
    role: message.role,
    title: message.title,
    content: normalizeText(message.content).trim(),
    tokenEstimate: estimateTokens(normalizeText(message.content)),
    source: message.source,
    trust: message.trust,
    freshness: message.freshness,
    refs: message.refs,
  }));
  const estimatedTokens = slots.reduce((sum, slot) => sum + slot.tokenEstimate, 0);
  const retrievalModes = deriveRetrievalModes(input.surface, intent);
  const includedSources = deduped.messages.map((message) => message.source);
  const excludedSources = deduped.dedupedCount > 0 ? ["duplicate_context_removed"] : [];
  const tokenHeadroom = Math.max(0, budget.total - estimatedTokens);

  return {
    surface: input.surface,
    query: input.query,
    intent,
    budgetProfile,
    budget,
    messages,
    slots,
    estimatedTokens,
    retrievalModes,
    includedSources,
    excludedSources,
    compaction: {
      dedupedMessages: deduped.dedupedCount,
      injectedMessages: stateAnnotated.length,
      tokenHeadroom,
    },
    notes:
      stateAnnotated.length > 0
        ? [
            `Injected ${stateAnnotated.length} context-state block(s)`,
            deduped.dedupedCount > 0
              ? `Removed ${deduped.dedupedCount} duplicate message(s)`
              : "No duplicate messages removed",
          ]
        : ["No additional context-state hints supplied"],
  };
}

export function summarizeContextPack(pack: ContextPack): string {
  return [
    `${pack.surface}:${pack.intent}`,
    `${pack.slots.length} slots`,
    `${pack.estimatedTokens} tokens`,
    `budget=${pack.budgetProfile}`,
    `modes=${pack.retrievalModes.join(",")}`,
  ].join(" · ");
}

export async function buildChatExecutionContextPack(
  request: UnifiedExecutionRequest,
  options: BuildExecutionContextPackOptions = {},
): Promise<ContextPack> {
  const mergedDynamicParams = (() => {
    const baseParams = request.dynamicParams ?? null;
    const overlayParams = options.dynamicParams ?? null;
    if (!baseParams && !overlayParams) return null;
    const merged = {
      ...(baseParams ?? {}),
      ...(overlayParams ?? {}),
    } as Record<string, unknown>;
    const mergedContextState = mergeContextStateHints(
      extractContextHintsFromDynamicParams(baseParams),
      extractContextHintsFromDynamicParams(overlayParams),
    );
    if (mergedContextState) {
      merged.contextState = mergedContextState;
    } else {
      delete merged.contextState;
    }
    return merged;
  })();
  const coreMessages = (await buildChatContext(
    request,
    options.skillSystemPrompt ?? "",
    options.knowledgebase ?? null,
  )).map((message): ContextMessage => ({
    role:
      message.role === "system" || message.role === "assistant"
        ? message.role
        : "user",
    content: Array.isArray(message.content)
      ? (message.content as ContextMessageContentPart[])
      : String(message.content ?? ""),
  }));
  return buildPackFromMessages({
    surface: "chat",
    query: request.userMessage,
    coreMessages,
    dynamicParams: mergedDynamicParams,
    tokenBudget: options.tokenBudget,
    label: options.label ?? "chat",
  });
}

export async function buildTeamExecutionContextPack(
  request: UnifiedExecutionRequest,
  tenantId: string,
  options: BuildExecutionContextPackOptions = {},
): Promise<ContextPack> {
  const mergedDynamicParams = (() => {
    const baseParams = request.dynamicParams ?? null;
    const overlayParams = options.dynamicParams ?? null;
    if (!baseParams && !overlayParams) return null;
    const merged = {
      ...(baseParams ?? {}),
      ...(overlayParams ?? {}),
    } as Record<string, unknown>;
    const mergedContextState = mergeContextStateHints(
      extractContextHintsFromDynamicParams(baseParams),
      extractContextHintsFromDynamicParams(overlayParams),
    );
    if (mergedContextState) {
      merged.contextState = mergedContextState;
    } else {
      delete merged.contextState;
    }
    return merged;
  })();
  const coreMessages = await buildTeamContext(request, tenantId);
  const prefixMessages =
    options.skillSystemPrompt && options.skillSystemPrompt.trim()
      ? ([{ role: "system", content: options.skillSystemPrompt.trim() }] satisfies ContextMessage[])
      : [];
  return buildPackFromMessages({
    surface: "team_room",
    query: request.teamContext?.currentMessage?.trim() || request.userMessage,
    coreMessages,
    prefixMessages,
    dynamicParams: mergedDynamicParams,
    tokenBudget: options.tokenBudget,
    label: options.label ?? "team_room",
  });
}
