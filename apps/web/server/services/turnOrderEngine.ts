/**
 * Turn Order Engine — determines which agent speaks next.
 *
 * Supports four strategies: lead-directed, round-robin, handoff, priority.
 * Includes loop detection and consecutive-turn limits.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import {
  assistantProfiles,
  teamRoomParticipants,
  teamRoomMessages,
  type AssistantProfile,
} from "../../drizzle/schema";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TurnStrategy = "lead_directed" | "round_robin" | "handoff" | "priority";

export interface TurnOrderInput {
  roomId: string;
  teamId: string;
  runId: string;
  currentAssistantId: string | null;
  strategy: TurnStrategy;
  nextSpeakerHint?: string;
  maxConsecutiveTurns?: number;
}

export interface TurnOrderResult {
  nextAssistantId: string;
  reason: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_MAX_CONSECUTIVE_TURNS = 3;
export const LOOP_DETECTION_WINDOW = 10;

// ─── Helpers (exported for testing) ─────────────────────────────────────────

/** Count consecutive turns by the same agent from recent messages */
export function countConsecutiveTurns(
  recentSenderIds: string[],
  currentId: string,
): number {
  let count = 0;
  for (let i = recentSenderIds.length - 1; i >= 0; i--) {
    if (recentSenderIds[i] === currentId) count++;
    else break;
  }
  return count;
}

/** Detect if we're in a loop: same 2-3 agents alternating for N turns */
export function detectLoop(
  recentSenderIds: string[],
  window: number = LOOP_DETECTION_WINDOW,
): boolean {
  if (recentSenderIds.length < window) return false;
  const recent = recentSenderIds.slice(-window);
  const unique = new Set(recent);
  // If only 2 agents are talking in the last N turns, it's likely a loop
  return unique.size <= 2 && recent.length >= window;
}

/** Round-robin: pick next by sortOrder */
export function getNextRoundRobin(
  profiles: Array<{ id: string; sortOrder: number; isActive: boolean }>,
  currentId: string | null,
): string {
  const active = profiles
    .filter((p) => p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (active.length === 0) throw new Error("No active agents");

  if (!currentId) return active[0].id;

  const currentIdx = active.findIndex((p) => p.id === currentId);
  const nextIdx = (currentIdx + 1) % active.length;
  return active[nextIdx].id;
}

export function getCoordinatorProfile<
  T extends { id: string; isLead?: boolean | null; memberRole?: string | null }
>(profiles: T[]): T | undefined {
  return (
    profiles.find((profile) => profile.memberRole === "orchestrator") ??
    profiles.find((profile) => profile.isLead) ??
    profiles[0]
  );
}

// ─── Main Engine ────────────────────────────────────────────────────────────

export async function getNextSpeaker(
  input: TurnOrderInput,
): Promise<TurnOrderResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const maxConsecutive = input.maxConsecutiveTurns ?? DEFAULT_MAX_CONSECUTIVE_TURNS;

  // Load active profiles
  const profiles = await db
    .select()
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.teamId, input.teamId),
        eq(assistantProfiles.memberKind, "assistant"),
        eq(assistantProfiles.isActive, true),
      ),
    )
    .orderBy(assistantProfiles.sortOrder);

  if (profiles.length === 0) {
    throw new Error("No active agents in team");
  }

  // Load recent message sender IDs
  const recentMessages = await db
    .select({ senderAssistantId: teamRoomMessages.senderAssistantId })
    .from(teamRoomMessages)
    .where(eq(teamRoomMessages.runId, input.runId))
    .orderBy(teamRoomMessages.createdAt)
    .limit(LOOP_DETECTION_WINDOW);

  const recentSenders = recentMessages
    .map((m) => m.senderAssistantId)
    .filter((id): id is string => id != null);

  // Check consecutive turn limit
  if (input.currentAssistantId) {
    const consecutive = countConsecutiveTurns(recentSenders, input.currentAssistantId);
    if (consecutive >= maxConsecutive) {
      // Force switch to next agent
      const nextId = getNextRoundRobin(profiles, input.currentAssistantId);
      return { nextAssistantId: nextId, reason: "consecutive_turn_limit" };
    }
  }

  // Check loop detection
  if (detectLoop(recentSenders)) {
    // Break loop by picking someone who hasn't spoken recently
    const recentSet = new Set(recentSenders.slice(-LOOP_DETECTION_WINDOW));
    const outsider = profiles.find((p) => !recentSet.has(p.id));
    if (outsider) {
      return { nextAssistantId: outsider.id, reason: "loop_break" };
    }
  }

  // Apply strategy
  switch (input.strategy) {
    case "handoff": {
      // Use hint from previous agent if available
      if (input.nextSpeakerHint) {
        const hinted = profiles.find((p) => p.id === input.nextSpeakerHint);
        if (hinted) {
          return { nextAssistantId: hinted.id, reason: "handoff_hint" };
        }
      }
      // Fall through to round-robin if no valid hint
      const nextId = getNextRoundRobin(profiles, input.currentAssistantId);
      return { nextAssistantId: nextId, reason: "handoff_fallback_round_robin" };
    }

    case "lead_directed": {
      const coordinator = getCoordinatorProfile(profiles);
      if (coordinator && coordinator.id !== input.currentAssistantId) {
        return { nextAssistantId: coordinator.id, reason: "lead_directed" };
      }
      // If the coordinator just spoke, use round-robin
      const nextId = getNextRoundRobin(profiles, input.currentAssistantId);
      return { nextAssistantId: nextId, reason: "lead_directed_alternate" };
    }

    case "priority": {
      // Higher sortOrder = higher priority (lower number first)
      const nextId = profiles[0].id;
      if (nextId === input.currentAssistantId && profiles.length > 1) {
        return { nextAssistantId: profiles[1].id, reason: "priority" };
      }
      return { nextAssistantId: nextId, reason: "priority" };
    }

    case "round_robin":
    default: {
      const nextId = getNextRoundRobin(profiles, input.currentAssistantId);
      return { nextAssistantId: nextId, reason: "round_robin" };
    }
  }
}
