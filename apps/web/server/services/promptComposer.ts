/**
 * Prompt Composer — assembles LLM prompts for agent turns.
 *
 * Combines persona, memory, history, and task context
 * while managing per-section token budgets.
 */

import { eq, and, desc, asc } from "drizzle-orm";
import { getDb } from "../db";
import {
  assistantProfiles,
  personaTemplates,
  teamRoomMessages,
  teamRoomParticipants,
  teamRooms,
  type TeamRoomMessage,
} from "../../drizzle/schema";
import { retrieveForPrompt, type MemorySearchResult } from "./scopedMemoryService";
import { buildPersonaPromptSegments, type PersonaPromptSegments } from "./personaService";
import { getEntityMemories } from "./chatService";
import {
  estimateTokens,
  truncateToTokenBudget,
} from "../utils/tokenEstimator";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ComposePromptInput {
  assistantId: string;
  runId?: string;
  roomId: string;
  teamId: string;
  objective: string;
  tenantId: string;
  tokenBudget?: number;
  initiatedByUserId?: number;
}

export interface ComposePromptResult {
  messages: PromptMessage[];
  estimatedTokens: number;
}

// ─── Budget Constants ───────────────────────────────────────────────────────
//
// Adaptive allocation: budgets shift based on turn context.
// Total default ≈ 16,000 tokens (fits comfortably in 32K–128K context models).
//
// Profile       | Persona | Scoped Mem | Entity Mem | History | Total
// ──────────────|---------|------------|------------|---------|──────
// balanced      |   1,200 |      3,000 |      1,500 |   5,000 | ~16K
// follow_up     |     800 |      2,000 |      1,000 |   6,500 | ~16K
// personalized  |   1,200 |      4,000 |      2,000 |   3,500 | ~16K
// retrieval     |     800 |      5,000 |      1,000 |   3,500 | ~16K

const DEFAULT_TOKEN_BUDGET = 16000;

/** Minimum floor for entity memory — always get at least this much */
const ENTITY_MEMORY_FLOOR = 500;

/** Number of most-recent messages always included as raw (not summarized) */
const RAW_TAIL_TURNS = 6;

type BudgetProfile = "balanced" | "follow_up" | "personalized" | "retrieval";

interface BudgetAllocation {
  persona: number;
  scopedMemory: number;
  entityMemory: number;
  history: number;
}

const BUDGET_PROFILES: Record<BudgetProfile, BudgetAllocation> = {
  balanced:     { persona: 1200, scopedMemory: 3000, entityMemory: 1500, history: 5000 },
  follow_up:    { persona:  800, scopedMemory: 2000, entityMemory: 1000, history: 6500 },
  personalized: { persona: 1200, scopedMemory: 4000, entityMemory: 2000, history: 3500 },
  retrieval:    { persona:  800, scopedMemory: 5000, entityMemory: 1000, history: 3500 },
};

/**
 * Detect the budget profile from objective + conversation state.
 *
 * Heuristics (evaluated in order):
 *  1. follow_up   — short objective or conversational continuation signals
 *  2. retrieval   — explicit retrieval / search / reference keywords
 *  3. personalized — user-preference / style / memory keywords
 *  4. balanced    — default
 */
export function detectBudgetProfile(
  objective: string,
  historyLength: number,
): BudgetProfile {
  const lower = objective.toLowerCase();
  const len = objective.length;

  // Follow-up: short message or continuation phrasing
  // Thai words use bare match (no \b); English uses \b
  const followUpRe = /(ต่อจาก|เพิ่มเติม|อธิบาย|ขยาย|\bcontinue\b|\bfollow[- ]?up\b|\bnext\b|\bexpand\b|\belaborate\b)/i;
  if ((len < 60 && historyLength >= 3) || followUpRe.test(lower)) {
    return "follow_up";
  }

  // Retrieval-heavy: document/data lookup, research, reference
  const retrievalRe = /(ค้นหา|หาข้อมูล|ดึงข้อมูล|วิเคราะห์ข้อมูล|สรุปเอกสาร|\bsearch\b|\blookup\b|\breference\b|\bretrieve\b|\bresearch\b|\banalyze data\b|\bsummarize doc)/i;
  if (retrievalRe.test(lower)) {
    return "retrieval";
  }

  // Personalized: user preferences, style adaptation, project continuity
  // Thai words don't have \b boundaries — use lookahead/lookbehind-free matching
  const personalizedRe = /(ตามสไตล์|ตามแบบ|เหมือนเดิม|ปรับให้เข้ากับ|ตามที่เคย|จำได้ไหม|\bmy style\b|\blike before\b|\bpreference\b|\bcustomize\b|\bremember\b)/i;
  if (personalizedRe.test(lower)) {
    return "personalized";
  }

  return "balanced";
}

/**
 * Scale a profile's allocation to fit the actual total budget.
 * Preserves proportions while ensuring entity memory floor.
 */
export function scaleBudget(
  profile: BudgetProfile,
  totalBudget: number,
): BudgetAllocation {
  const base = BUDGET_PROFILES[profile];
  const baseTotal = base.persona + base.scopedMemory + base.entityMemory + base.history;
  const ratio = totalBudget / baseTotal;

  const scaled: BudgetAllocation = {
    persona: Math.round(base.persona * ratio),
    scopedMemory: Math.round(base.scopedMemory * ratio),
    entityMemory: Math.max(ENTITY_MEMORY_FLOOR, Math.round(base.entityMemory * ratio)),
    history: Math.round(base.history * ratio),
  };

  return scaled;
}
/**
 * Token estimation constants.
 *
 * GPT/Claude tokenizers average ~3.5–4.5 chars per token for English.
 * We use a weighted approach:
 *   - ASCII words: ~1.3 tokens per word (avg 4.7 chars + space)
 *   - CJK/Thai chars: ~1 token per 1–2 chars
 *   - Code/special chars: ~1 token per 2–3 chars
 *   - Whitespace/punctuation is often merged into adjacent tokens
 *
 * This gives ~15% more accurate estimates than flat 4-char division.
 */
// ─── Sanitization ───────────────────────────────────────────────────────────

/** Sanitize message content to prevent stored prompt injection */
function sanitizeHistoryContent(content: string): string {
  const normalized = content
    .normalize("NFKC")
    .replace(/[\x00-\x08\x0B-\x1F\x7F\u200B-\u200F\uFEFF]/g, "");
  return normalized
    .replace(/\[SYSTEM\]/gi, "[SYS]")
    .replace(/\[OBJECTIVE\]/gi, "[OBJ]")
    .replace(/\[\/OBJECTIVE\]/gi, "[/OBJ]")
    .replace(/\[PERSONA START\]/gi, "[PS]")
    .replace(/\[PERSONA END\]/gi, "[PE]")
    .replace(/<\|system\|>/gi, "")
    .replace(/ignore (all )?previous/gi, "[filtered]");
}

// Re-export for backwards compatibility with existing test imports
export { estimateTokens, truncateToTokenBudget };

/** Compress history by removing oldest discussion messages first, preserving important types */
export function compressHistory(
  messages: TeamRoomMessage[],
  tokenBudget: number,
): TeamRoomMessage[] {
  const preservedTypes = new Set(["handoff", "decision", "summary", "execution_update"]);

  // Split into preserved and compressible
  const preserved = messages.filter((m) => preservedTypes.has(m.turnType));
  const compressible = messages.filter((m) => !preservedTypes.has(m.turnType));

  const preservedTokens = preserved.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );

  let remainingBudget = tokenBudget - preservedTokens;
  const included: TeamRoomMessage[] = [];

  // Add compressible messages from most recent first
  for (let i = compressible.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(compressible[i].content);
    if (remainingBudget >= tokens) {
      included.unshift(compressible[i]);
      remainingBudget -= tokens;
    }
  }

  // Merge preserved + included, sort by createdAt
  return [...preserved, ...included].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/**
 * Split history into a condensed summary of older turns + raw recent turns.
 *
 * Strategy: keep the last `rawTailCount` messages as-is (full content),
 * and summarize everything before them into a single compact block.
 * This gives the LLM full context for recent conversation while
 * preserving awareness of older discussion.
 */
export function buildAdaptiveHistory(
  messages: TeamRoomMessage[],
  historyBudget: number,
  assistantNameMap: Map<string, string>,
  rawTailCount: number = RAW_TAIL_TURNS,
): PromptMessage[] {
  if (messages.length === 0) return [];

  const result: PromptMessage[] = [];
  let usedTokens = 0;

  // Split: older messages → summarize, recent messages → raw
  const splitIdx = Math.max(0, messages.length - rawTailCount);
  const olderMessages = messages.slice(0, splitIdx);
  const recentMessages = messages.slice(splitIdx);

  // 1. Summarize older messages into a compact block
  if (olderMessages.length > 0) {
    const summaryBudget = Math.floor(historyBudget * 0.3); // 30% for summary
    const summaryLines: string[] = [];

    for (const msg of olderMessages) {
      const speaker = msg.senderAssistantId
        ? assistantNameMap.get(msg.senderAssistantId) ?? "Agent"
        : "User";
      // Extract first meaningful sentence (up to 120 chars)
      const firstLine = sanitizeHistoryContent(msg.content)
        .split(/[.\n]/)[0]
        ?.substring(0, 120)
        .trim();
      if (firstLine) {
        summaryLines.push(`${speaker}: ${firstLine}`);
      }
    }

    if (summaryLines.length > 0) {
      const summaryContent = truncateToTokenBudget(
        summaryLines.join("\n"),
        summaryBudget,
      );
      const summaryTokens = estimateTokens(summaryContent);
      result.push({
        role: "system",
        content: `[Earlier conversation — ${olderMessages.length} turns]\n${summaryContent}`,
      });
      usedTokens += summaryTokens;
    }
  }

  // 2. Include recent messages as raw (full content)
  const rawBudget = historyBudget - usedTokens;
  const compressed = compressHistory(recentMessages, rawBudget);

  for (const msg of compressed) {
    const role: "user" | "assistant" = msg.senderType === "user" ? "user" : "assistant";
    const speakerName = msg.senderAssistantId
      ? assistantNameMap.get(msg.senderAssistantId) ?? msg.senderAssistantId
      : "";
    const prefix = msg.senderType === "assistant" && speakerName ? `[${speakerName}] ` : "";
    const sanitized = sanitizeHistoryContent(msg.content);
    result.push({ role, content: `${prefix}${sanitized}` });
    usedTokens += estimateTokens(sanitized);
  }

  return result;
}

// ─── Main Composer ──────────────────────────────────────────────────────────

export async function composePrompt(
  input: ComposePromptInput,
): Promise<ComposePromptResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const totalBudget = input.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const messages: PromptMessage[] = [];
  let usedTokens = 0;

  // 0. Tenant validation — verify room belongs to tenant (prevents IDOR)
  const [room] = await db
    .select({ tenantId: teamRooms.tenantId })
    .from(teamRooms)
    .where(and(eq(teamRooms.id, input.roomId), eq(teamRooms.tenantId, input.tenantId)))
    .limit(1);
  if (!room) throw new Error("Room not found or tenant mismatch");

  // Pre-fetch history count for adaptive budget detection
  const historyWhere = input.runId
    ? and(eq(teamRoomMessages.roomId, input.roomId), eq(teamRoomMessages.runId, input.runId))
    : eq(teamRoomMessages.roomId, input.roomId);

  const recentMessages = await db
    .select()
    .from(teamRoomMessages)
    .where(historyWhere)
    .orderBy(desc(teamRoomMessages.createdAt))
    .limit(100);

  const historyMessages = recentMessages.reverse();

  // Adaptive budget: detect profile from objective + conversation state
  const profile_type = detectBudgetProfile(input.objective, historyMessages.length);
  const budget = scaleBudget(profile_type, totalBudget);

  // 1. Load assistant profile + persona (scoped to tenant)
  const [profile] = await db
    .select()
    .from(assistantProfiles)
    .where(and(eq(assistantProfiles.id, input.assistantId), eq(assistantProfiles.tenantId, input.tenantId)))
    .limit(1);

  let personaSection = "";
  if (profile?.personaId) {
    const [persona] = await db
      .select()
      .from(personaTemplates)
      .where(eq(personaTemplates.id, profile.personaId))
      .limit(1);

    if (persona?.systemPromptPrefix) {
      const segments: PersonaPromptSegments = buildPersonaPromptSegments(persona);

      const identityLines = [
        `You are ${profile.displayName ?? persona.name}.`,
        profile.roleTitle ? `Role: ${profile.roleTitle}` : "",
        profile.specialtyTags?.length
          ? `Specialties: ${profile.specialtyTags.join(", ")}`
          : "",
      ].filter(Boolean).join("\n");

      const parts = [
        identityLines,
        segments.prefix,
        segments.styleInstructions ?? "",
        segments.restrictionsBulletPoints ?? "",
      ].filter(Boolean);

      personaSection = parts.join("\n\n");
    }
  }

  personaSection = truncateToTokenBudget(personaSection, budget.persona);
  if (personaSection) {
    messages.push({ role: "system", content: personaSection });
    usedTokens += estimateTokens(personaSection);
  }

  // 2. Load team members for context
  const participants = await db
    .select()
    .from(teamRoomParticipants)
    .where(eq(teamRoomParticipants.roomId, input.roomId));

  const activeAssistants = participants.filter(
    (p) => p.participantType === "assistant" && !p.isMuted,
  );

  if (activeAssistants.length > 0) {
    const teamInfo = `Team members available: ${activeAssistants.map((a) => `${a.participantLabel} (${a.roleInRoom ?? "member"})`).join(", ")}`;
    messages.push({ role: "system", content: teamInfo });
    usedTokens += estimateTokens(teamInfo);
  }

  // 3. Retrieve scoped memories (dedicated budget — not shared with entity)
  let memoryResults: MemorySearchResult[] = [];
  try {
    memoryResults = await retrieveForPrompt(
      input.tenantId,
      input.assistantId,
      input.runId ?? "",
      input.roomId,
      input.teamId,
      input.objective,
      budget.scopedMemory,
    );
  } catch (err) {
    console.warn("Memory retrieval failed:", err);
  }

  if (memoryResults.length > 0) {
    const memoryContent = memoryResults
      .map((r) => `- [${r.memory.memoryKind}] ${r.memory.title}: ${r.memory.content}`)
      .join("\n");

    const truncatedMemory = truncateToTokenBudget(memoryContent, budget.scopedMemory);
    messages.push({ role: "system", content: `Relevant memories:\n${truncatedMemory}` });
    usedTokens += estimateTokens(truncatedMemory);
  }

  // 3b. Entity memory injection (dedicated budget with floor guarantee)
  if (input.initiatedByUserId && profile && budget.entityMemory >= ENTITY_MEMORY_FLOOR) {
    try {
      const entityMems = await getEntityMemories(
        input.initiatedByUserId,
        undefined,
        profile.personaId ?? null,
      );
      if (entityMems.length > 0) {
        const entityContent = entityMems
          .map((em) => `- [${em.entityType}] ${em.entityName}: ${em.facts.join("; ")}`)
          .join("\n");
        const truncatedEntity = truncateToTokenBudget(entityContent, budget.entityMemory);
        messages.push({ role: "system", content: `Known facts about the user:\n${truncatedEntity}` });
        usedTokens += estimateTokens(truncatedEntity);
      }
    } catch (err) {
      console.warn("Entity memory retrieval failed:", err);
    }
  }

  // 4. Objective (user role with delimiters)
  const objectiveSection = `[OBJECTIVE]\n${input.objective}\n[/OBJECTIVE]`;
  messages.push({ role: "user", content: objectiveSection });
  usedTokens += estimateTokens(objectiveSection);

  // 5. Conversation history — adaptive: rolling summary + raw tail
  const assistantNameMap = new Map<string, string>();
  for (const p of activeAssistants) {
    if (p.participantAssistantId && p.participantLabel) {
      assistantNameMap.set(p.participantAssistantId, p.participantLabel);
    }
  }

  // Use remaining budget or profile history allocation — whichever is larger
  const historyBudget = Math.max(budget.history, totalBudget - usedTokens);
  const historyPrompts = buildAdaptiveHistory(
    historyMessages,
    historyBudget,
    assistantNameMap,
  );

  for (const hp of historyPrompts) {
    messages.push(hp);
    usedTokens += estimateTokens(hp.content);
  }

  return { messages, estimatedTokens: usedTokens };
}
