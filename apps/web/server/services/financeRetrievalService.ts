import { TRPCError } from "@trpc/server";

import { getConversationById, isPersonalProjectId } from "./chatService";
import { listLinkedDocuments } from "./financeService";
import { searchLibraryItems, type LibrarySearchResponseV1 } from "./libraryService";
import { resolveTenantIdVarchar } from "./tenantContext";

export interface FinanceEvidenceSearchInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  query?: string | null;
  transactionId?: number | null;
  limit?: number;
}

export interface FinanceEvidenceSearchResult {
  query: string | null;
  searchResults: LibrarySearchResponseV1 | null;
  linkedDocuments: Awaited<ReturnType<typeof listLinkedDocuments>>;
  projectId: string;
  personal: boolean;
}

function buildScope(
  conversation: { id: number; tenantId: string | null; projectId: string | null },
  userId: number,
  tenantId?: string | null,
) {
  const resolvedTenantId = resolveTenantIdVarchar(tenantId ?? conversation.tenantId, conversation.tenantId);
  if (!resolvedTenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for finance evidence retrieval" });
  }

  if (!conversation.projectId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Finance evidence retrieval requires a project-scoped conversation" });
  }

  return {
    tenantId: resolvedTenantId,
    ownerUserId: userId,
    projectId: conversation.projectId,
    personal: isPersonalProjectId(conversation.projectId),
  };
}

export async function searchFinanceEvidence(
  input: FinanceEvidenceSearchInput,
): Promise<FinanceEvidenceSearchResult> {
  const conversation = await getConversationById(input.conversationId, input.userId);
  if (!conversation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
  }

  const scope = buildScope(conversation, input.userId, input.tenantId);
  const query = typeof input.query === "string" ? input.query.trim() : "";

  const searchResults = query
    ? await searchLibraryItems(
        {
          query,
          limit: input.limit ?? 10,
          scope: "all",
          filters: {
            projectId: scope.projectId,
          },
        },
        {
          userId: scope.ownerUserId,
          tenantId: scope.tenantId,
          role: (conversation as { role?: string | null }).role ?? undefined,
        },
      )
    : null;

  const linkedDocuments = input.transactionId
    ? await listLinkedDocuments({
        conversationId: input.conversationId,
        transactionId: input.transactionId,
        userId: input.userId,
        tenantId: scope.tenantId,
      })
    : [];

  return {
    query: query || null,
    searchResults,
    linkedDocuments,
    projectId: scope.projectId,
    personal: scope.personal,
  };
}
