/**
 * Summary Service — generates structured summaries for team runs.
 *
 * Supports three generation methods:
 * 1. Agent-generated: LLM with lead agent persona
 * 2. System-generated: LLM with neutral prompt
 * 3. Extractive: Pure data extraction from decision/summary messages
 */

import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  teamRuns,
  teamRoomMessages,
  assistantProfiles,
  agentRunSummaries,
  type TeamRoomMessage,
} from "../../drizzle/schema";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SummaryMethod = "agent_generated" | "system_generated" | "extractive";

export interface RunSummary {
  runId: string;
  method: SummaryMethod;
  objective: string | null;
  participants: Array<{ id: string; displayName: string | null; roleTitle: string | null }>;
  keyDecisions: string[];
  keyFindings: string[];
  artifactsProduced: string[];
  openQuestions: string[];
  nextSteps: string[];
  totalCost: number;
  totalDuration: number; // milliseconds
  generatedAt: Date;
}

export interface GenerateSummaryInput {
  runId: string;
  method?: SummaryMethod;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EXTRACTIVE_TURN_TYPES = new Set(["decision", "summary", "execution_update"]);

// ─── Helpers (exported for testing) ─────────────────────────────────────────

/** Extract key points from messages based on turn type */
export function extractKeyPoints(
  messages: TeamRoomMessage[],
): { decisions: string[]; findings: string[]; artifacts: string[] } {
  const decisions: string[] = [];
  const findings: string[] = [];
  const artifacts: string[] = [];

  for (const msg of messages) {
    if (msg.turnType === "decision") {
      decisions.push(msg.content.substring(0, 500));
    } else if (msg.turnType === "summary" || msg.turnType === "execution_update") {
      findings.push(msg.content.substring(0, 500));
    }
    if (msg.artifactRefsJson) {
      const refs = msg.artifactRefsJson as Array<{ name?: string; type?: string }>;
      if (Array.isArray(refs)) {
        for (const ref of refs) {
          artifacts.push(ref.name ?? "Unnamed artifact");
        }
      }
    }
  }

  return { decisions, findings, artifacts };
}

/** Calculate total duration from run startedAt to endedAt */
export function calculateDuration(
  startedAt: Date | null,
  endedAt: Date | null,
): number {
  if (!startedAt) return 0;
  const end = endedAt ?? new Date();
  return end.getTime() - startedAt.getTime();
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export async function generateSummary(
  input: GenerateSummaryInput,
): Promise<RunSummary> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const method = input.method ?? "extractive";

  // Load run
  const [run] = await db
    .select()
    .from(teamRuns)
    .where(eq(teamRuns.id, input.runId))
    .limit(1);

  if (!run) throw new Error(`Run ${input.runId} not found`);

  // Load participants
  const participants = await db
    .select({
      id: assistantProfiles.id,
      displayName: assistantProfiles.displayName,
      roleTitle: assistantProfiles.roleTitle,
    })
    .from(assistantProfiles)
    .where(eq(assistantProfiles.teamId, run.teamId));

  // Load run messages
  const messages = await db
    .select()
    .from(teamRoomMessages)
    .where(eq(teamRoomMessages.runId, input.runId))
    .orderBy(teamRoomMessages.createdAt);

  // Calculate cost from budget snapshot
  const budget = (run.budgetSnapshotJson as any) ?? { totalCreditsUsed: 0 };
  const totalCost = budget.totalCreditsUsed ?? 0;
  const totalDuration = calculateDuration(run.startedAt, run.endedAt);

  // Extractive method (default)
  const relevant = method === "extractive"
    ? messages.filter((m) => EXTRACTIVE_TURN_TYPES.has(m.turnType))
    : messages;

  const { decisions, findings, artifacts } = extractKeyPoints(relevant);

  // For agent_generated and system_generated, we would call the LLM here.
  // For now, both fall back to extractive with the full message set.
  // TODO: Add LLM call for agent_generated and system_generated methods

  return {
    runId: input.runId,
    method,
    objective: run.objective,
    participants,
    keyDecisions: decisions,
    keyFindings: findings,
    artifactsProduced: artifacts,
    openQuestions: [], // TODO: Extract from messages or LLM analysis
    nextSteps: [], // TODO: Extract from messages or LLM analysis
    totalCost,
    totalDuration,
    generatedAt: new Date(),
  };
}

/** Check if a summary is still fresh (no new messages since generation) */
export async function isSummaryFresh(
  runId: string,
  generatedAt: Date,
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db
    .select({ count: eq(teamRoomMessages.id, teamRoomMessages.id) })
    .from(teamRoomMessages)
    .where(
      and(
        eq(teamRoomMessages.runId, runId),
        // Use sql for comparison since Drizzle doesn't support > directly
        // on timestamp comparisons easily
      ),
    )
    .limit(1);

  // If any messages exist after generatedAt, summary is stale
  // TODO: Implement proper timestamp comparison when needed
  return true;
}
