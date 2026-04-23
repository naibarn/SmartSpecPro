import type {
  ContextMessage,
  ContextStateHints,
  ContextStateItem,
} from "../../shared/contextEngine";
import {
  canPruneContextItem,
  isPrunableContextStateTier,
} from "../../shared/contextEngine";
import { compressHistory } from "./promptComposer";
import { refreshRollingSummaryMemories } from "./teamRoomMemoryService";

export interface ContextCompactionPlan {
  pruneCandidates: string[];
  promotableTiers: string[];
  pruneableTiers: string[];
  hasWorkingSummary: boolean;
}

export function buildContextCompactionPlan(
  hints?: ContextStateHints | null,
): ContextCompactionPlan {
  const items: ContextStateItem[] = [];
  if (hints?.sessionState && typeof hints.sessionState === "object" && "tier" in hints.sessionState) {
    const item = hints.sessionState as ContextStateItem;
    items.push(item);
  }
  for (const block of [
    hints?.activeNote,
    hints?.projectState,
    hints?.workingSummary,
    ...(hints?.recentNotes ?? []),
    ...(hints?.durableMemory ?? []),
    ...(hints?.retrievedEvidence ?? []),
    ...(hints?.toolResults ?? []),
    ...(hints?.resources ?? []),
    ...(hints?.prompts ?? []),
  ]) {
    if (block && typeof block === "object" && "tier" in block) {
      items.push(block as ContextStateItem);
    }
  }

  const pruneCandidates = items
    .filter((item) => canPruneContextItem(item))
    .map((item) => item.sourceRef);

  return {
    pruneCandidates,
    promotableTiers: Array.from(
      new Set(items.filter((item) => item.promotionReason || item.tier === "working_summary").map((item) => item.tier)),
    ),
    pruneableTiers: Array.from(
      new Set(items.filter((item) => isPrunableContextStateTier(item.tier)).map((item) => item.tier)),
    ),
    hasWorkingSummary: Boolean(hints?.workingSummary),
  };
}

export function compactContextHistory(
  messages: ContextMessage[],
  tokenBudget: number,
): ContextMessage[] {
  return compressHistory(messages as unknown as Parameters<typeof compressHistory>[0], tokenBudget) as unknown as ContextMessage[];
}

export async function refreshContextRollingSummaries(input: {
  tenantId: string;
  teamId: string;
  roomId: string;
  runId?: string | null;
  assistantId: string;
  assistantLabel?: string | null;
  objective: string;
  initiatedByUserId?: number;
  projectId?: string | null;
  windowSize?: number;
}): Promise<string[]> {
  return refreshRollingSummaryMemories(input);
}
