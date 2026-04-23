import type { MemorySearchResult } from "./scopedMemoryService";
import { retrieveForPrompt } from "./scopedMemoryService";
import { rankContextRetrievalResults } from "./contextRetrievalRanker";

export interface RetrieveContextInput {
  tenantId: string;
  assistantId: string;
  query: string;
  tokenBudget: number;
  runId?: string | null;
  roomId?: string | null;
  teamId?: string | null;
  embedding?: number[];
  initiatedByUserId?: number;
  projectId?: string | null;
}

export async function retrieveContextCandidates(
  input: RetrieveContextInput,
): Promise<MemorySearchResult[]> {
  const results = await retrieveForPrompt(
    input.tenantId,
    input.assistantId,
    input.runId ?? null,
    input.roomId ?? null,
    input.teamId ?? null,
    input.query,
    input.tokenBudget,
    input.embedding,
    {
      initiatedByUserId: input.initiatedByUserId,
      projectId: input.projectId ?? null,
    },
  );

  return rankContextRetrievalResults(results);
}

export { rankContextRetrievalResults } from "./contextRetrievalRanker";

