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

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TOKEN_BUDGET = 8000;
const PERSONA_BUDGET = 2000;
const MEMORY_BUDGET = 1500;
const HISTORY_BUDGET_FRACTION = 0.6; // 60% of remaining for history
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
const CHARS_PER_TOKEN_ASCII = 4.0;
const CHARS_PER_TOKEN_CJK = 1.5;

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

// ─── Helpers (exported for testing) ─────────────────────────────────────────

/** Regex to detect CJK / Thai / Korean script ranges */
const CJK_RANGE = /[\u2E80-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/g;

export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Count CJK/Thai characters (tokenized at ~1.5 chars per token)
  const cjkMatches = text.match(CJK_RANGE);
  const cjkCharCount = cjkMatches?.length ?? 0;

  // Remaining ASCII-like characters (tokenized at ~4 chars per token)
  const asciiCharCount = text.length - cjkCharCount;

  const cjkTokens = cjkCharCount / CHARS_PER_TOKEN_CJK;
  const asciiTokens = asciiCharCount / CHARS_PER_TOKEN_ASCII;

  // Add overhead for message framing (~4 tokens per message)
  return Math.ceil(cjkTokens + asciiTokens + 4);
}

export function truncateToTokenBudget(text: string, budget: number): string {
  // Use ASCII rate for safe truncation (slightly conservative)
  const maxChars = Math.floor(budget * CHARS_PER_TOKEN_ASCII);
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n...(truncated)";
}

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
      // Use buildPersonaPromptSegments for full persona resolution
      const segments: PersonaPromptSegments = buildPersonaPromptSegments(persona);

      const identityLines = [
        `You are ${profile.displayName ?? persona.name}.`,
        profile.roleTitle ? `Role: ${profile.roleTitle}` : "",
        profile.specialtyTags?.length
          ? `Specialties: ${profile.specialtyTags.join(", ")}`
          : "",
      ].filter(Boolean).join("\n");

      // segments.restrictionsBulletPoints already includes "Restrictions:\n" prefix
      const parts = [
        identityLines,
        segments.prefix,
        segments.styleInstructions ?? "",
        segments.restrictionsBulletPoints ?? "",
      ].filter(Boolean);

      personaSection = parts.join("\n\n");
    }
  }

  personaSection = truncateToTokenBudget(personaSection, PERSONA_BUDGET);
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

  // 3. Retrieve scoped memories
  let memoryResults: MemorySearchResult[] = [];
  let scopedMemoryTokensUsed = 0;
  try {
    memoryResults = await retrieveForPrompt(
      input.tenantId,
      input.assistantId,
      input.runId ?? "",
      input.roomId,
      input.teamId,
      input.objective,
      MEMORY_BUDGET,
    );
  } catch (err) {
    // Memory service may not be fully available yet
    console.warn("Memory retrieval failed:", err);
  }

  if (memoryResults.length > 0) {
    const memoryContent = memoryResults
      .map((r) => `- [${r.memory.memoryKind}] ${r.memory.title}: ${r.memory.content}`)
      .join("\n");

    const truncatedMemory = truncateToTokenBudget(memoryContent, MEMORY_BUDGET);
    messages.push({ role: "system", content: `Relevant memories:\n${truncatedMemory}` });
    scopedMemoryTokensUsed = estimateTokens(truncatedMemory);
    usedTokens += scopedMemoryTokensUsed;
  }

  // 3b. Entity memory injection
  const entityBudget = MEMORY_BUDGET - scopedMemoryTokensUsed;
  if (input.initiatedByUserId && profile && entityBudget > 50) {
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
        const truncatedEntity = truncateToTokenBudget(entityContent, entityBudget);
        messages.push({ role: "system", content: `Known facts about the user:\n${truncatedEntity}` });
        usedTokens += estimateTokens(truncatedEntity);
      }
    } catch (err) {
      console.warn("Entity memory retrieval failed:", err);
    }
  }

  // 4. Objective (user role with delimiters — placed after all system messages)
  const objectiveSection = `[OBJECTIVE]\n${input.objective}\n[/OBJECTIVE]`;
  messages.push({ role: "user", content: objectiveSection });
  usedTokens += estimateTokens(objectiveSection);

  // 5. Conversation history (scoped to current run when available)
  const historyBudget = Math.floor((totalBudget - usedTokens) * HISTORY_BUDGET_FRACTION);

  // Build assistant ID → display name lookup from participants
  const assistantNameMap = new Map<string, string>();
  for (const p of activeAssistants) {
    if (p.participantAssistantId && p.participantLabel) {
      assistantNameMap.set(p.participantAssistantId, p.participantLabel);
    }
  }

  const historyWhere = input.runId
    ? and(eq(teamRoomMessages.roomId, input.roomId), eq(teamRoomMessages.runId, input.runId))
    : eq(teamRoomMessages.roomId, input.roomId);

  const recentMessages = await db
    .select()
    .from(teamRoomMessages)
    .where(historyWhere)
    .orderBy(desc(teamRoomMessages.createdAt))
    .limit(100);

  const compressed = compressHistory(recentMessages.reverse(), historyBudget);

  for (const msg of compressed) {
    const role: "user" | "assistant" = msg.senderType === "user" ? "user" : "assistant";
    const speakerName = msg.senderAssistantId
      ? assistantNameMap.get(msg.senderAssistantId) ?? msg.senderAssistantId
      : "";
    const prefix = msg.senderType === "assistant" && speakerName ? `[${speakerName}] ` : "";
    const sanitized = sanitizeHistoryContent(msg.content);
    messages.push({ role, content: `${prefix}${sanitized}` });
    usedTokens += estimateTokens(sanitized);
  }

  return { messages, estimatedTokens: usedTokens };
}
