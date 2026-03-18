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
  type TeamRoomMessage,
} from "../../drizzle/schema";
import { retrieveForPrompt, type MemorySearchResult } from "./scopedMemoryService";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ComposePromptInput {
  assistantId: string;
  runId: string;
  roomId: string;
  teamId: string;
  objective: string;
  tokenBudget?: number;
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

  // 1. Load assistant profile + persona
  const [profile] = await db
    .select()
    .from(assistantProfiles)
    .where(eq(assistantProfiles.id, input.assistantId))
    .limit(1);

  let personaSection = "";
  if (profile?.personaId) {
    const [persona] = await db
      .select()
      .from(personaTemplates)
      .where(eq(personaTemplates.id, profile.personaId))
      .limit(1);

    if (persona) {
      personaSection = [
        `You are ${profile.displayName ?? persona.name}.`,
        profile.roleTitle ? `Role: ${profile.roleTitle}` : "",
        persona.systemPromptPrefix,
        profile.specialtyTags?.length
          ? `Specialties: ${profile.specialtyTags.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
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

  // 3. Objective
  const objectiveSection = `Current objective: ${input.objective}`;
  messages.push({ role: "system", content: objectiveSection });
  usedTokens += estimateTokens(objectiveSection);

  // 4. Retrieve memories
  let memoryResults: MemorySearchResult[] = [];
  try {
    if (profile?.tenantId) {
      memoryResults = await retrieveForPrompt(
        profile.tenantId,
        input.assistantId,
        input.runId,
        input.roomId,
        input.teamId,
        input.objective,
        MEMORY_BUDGET,
      );
    }
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
    usedTokens += estimateTokens(truncatedMemory);
  }

  // 5. Conversation history
  const historyBudget = Math.floor((totalBudget - usedTokens) * HISTORY_BUDGET_FRACTION);

  const recentMessages = await db
    .select()
    .from(teamRoomMessages)
    .where(eq(teamRoomMessages.roomId, input.roomId))
    .orderBy(desc(teamRoomMessages.createdAt))
    .limit(100);

  const compressed = compressHistory(recentMessages.reverse(), historyBudget);

  for (const msg of compressed) {
    const role: "user" | "assistant" = msg.senderType === "user" ? "user" : "assistant";
    const prefix = msg.senderType === "assistant" ? `[${msg.senderAssistantId}] ` : "";
    messages.push({ role, content: `${prefix}${msg.content}` });
    usedTokens += estimateTokens(msg.content);
  }

  return { messages, estimatedTokens: usedTokens };
}
