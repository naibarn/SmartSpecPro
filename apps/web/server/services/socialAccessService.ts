import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { socialPages, socialProviderConnections } from "../../drizzle/schema";
import { getDb } from "../db";
import { resolveTenantIdVarchar } from "./tenantContext";

export type VerifiedSocialPageAccess = {
  id: number;
  tenantId: string;
  connectionId: number;
  provider: string;
  providerPageId: string;
  pageName: string | null;
  status: string;
  aiActionMode: string;
  autoSendConfidenceThreshold: number;
  selectedForInbox: boolean;
  selectedForPublishing: boolean;
  selectedForModeration: boolean;
  providerUserId: string | null;
};

export async function verifyPageAccess(
  pageId: number,
  userId: number,
  tenantId: unknown,
  userCurrentTenantId: unknown,
): Promise<VerifiedSocialPageAccess> {
  const resolvedTenantId = resolveTenantIdVarchar(tenantId, userCurrentTenantId);
  if (!resolvedTenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required",
    });
  }

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const rows = await db
    .select({
      id: socialPages.id,
      tenantId: socialPages.tenantId,
      connectionId: socialPages.connectionId,
      provider: socialProviderConnections.provider,
      providerPageId: socialPages.providerPageId,
      pageName: socialPages.pageName,
      status: socialPages.status,
      aiActionMode: socialPages.aiActionMode,
      autoSendConfidenceThreshold: socialPages.autoSendConfidenceThreshold,
      selectedForInbox: socialPages.selectedForInbox,
      selectedForPublishing: socialPages.selectedForPublishing,
      selectedForModeration: socialPages.selectedForModeration,
      providerUserId: socialProviderConnections.providerUserId,
    })
    .from(socialPages)
    .innerJoin(
      socialProviderConnections,
      eq(socialPages.connectionId, socialProviderConnections.id),
    )
    .where(
      and(
        eq(socialPages.id, pageId),
        eq(socialPages.tenantId, resolvedTenantId),
        eq(socialProviderConnections.tenantId, resolvedTenantId),
        eq(socialProviderConnections.userId, userId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Social page not found",
    });
  }

  return row;
}
