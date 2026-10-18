import { createHash } from "node:crypto";

import type { DrizzleDB } from "../db";
import type { CloudflareAiSearchProvider } from "./cloudflareAiSearchProvider";
import {
  ensureRagProjection,
  isCurrentIndexedRagProjectionItem,
  markRagProjectionFailed,
  markRagProjectionIndexed,
  type RagProjectionInput,
} from "./ragProjectionRegistry";

export interface IndexRagProjectionInput extends Omit<
  RagProjectionInput,
  "projectionHash" | "projectionBytes"
> {
  namespace: string;
  canonicalContent: string;
}

export interface RagProjectionIndexerDependencies {
  ensure: typeof ensureRagProjection;
  markIndexed: typeof markRagProjectionIndexed;
  markFailed: typeof markRagProjectionFailed;
  isCurrentIndexed: typeof isCurrentIndexedRagProjectionItem;
}

const DEFAULT_DEPENDENCIES: RagProjectionIndexerDependencies = {
  ensure: ensureRagProjection,
  markIndexed: markRagProjectionIndexed,
  markFailed: markRagProjectionFailed,
  isCurrentIndexed: isCurrentIndexedRagProjectionItem,
};

function digest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function safeFailureCode(error: unknown): string {
  const code =
    error instanceof Error ? error.message : "AI_SEARCH_PROVIDER_FAILED";
  return /^[A-Z0-9_.:-]{1,96}$/.test(code) ? code : "AI_SEARCH_PROVIDER_FAILED";
}

/** Indexes one immutable canonical projection through the existing route/provider. */
export async function indexRagProjectionItem(
  db: DrizzleDB,
  provider: CloudflareAiSearchProvider,
  input: IndexRagProjectionInput,
  dependencies: RagProjectionIndexerDependencies = DEFAULT_DEPENDENCIES
): Promise<{
  status: "unchanged" | "indexed" | "superseded";
  projectionKey: string;
  providerItemId?: string;
}> {
  const projectionHash = digest(input.canonicalContent);
  const projectionBytes = Buffer.byteLength(input.canonicalContent, "utf8");
  const identity: RagProjectionInput = {
    tenantId: input.tenantId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceVersion: input.sourceVersion,
    ...(input.projectionPart ? { projectionPart: input.projectionPart } : {}),
    aclScope: input.aclScope,
    projectionHash,
    projectionBytes,
    instanceId: input.instanceId,
    embeddingProfile: input.embeddingProfile,
  };
  const ensured = await dependencies.ensure(db, identity);
  const projectionKey = ensured.projection.projectionKey;
  if (ensured.action === "unchanged") {
    return { status: "unchanged", projectionKey };
  }

  let receipt;
  try {
    receipt = await provider.upsertItem({
      namespace: input.namespace,
      instanceId: input.instanceId,
      key: projectionKey,
      content: input.canonicalContent,
      metadata: {
        tenant_id: input.tenantId,
        acl_scope: input.aclScope,
        source_type: input.sourceType,
        source_id: input.sourceId,
        source_revision: input.sourceVersion,
        projection_hash: projectionHash,
        embedding_profile: input.embeddingProfile,
      },
    });
  } catch (error) {
    await dependencies.markFailed(db, {
      tenantId: input.tenantId,
      projectionKey,
      projectionHash,
      errorCode: safeFailureCode(error),
    });
    throw error;
  }

  const marked = await dependencies.markIndexed(db, {
    tenantId: input.tenantId,
    projectionKey,
    projectionHash,
    providerItemId: receipt.id,
  });
  if (!marked) {
    const current = await dependencies.isCurrentIndexed(db, {
      tenantId: input.tenantId,
      projectionKey,
      projectionHash,
      providerItemId: receipt.id,
    });
    if (!current) {
      try {
        await provider.deleteItem({
          namespace: input.namespace,
          instanceId: input.instanceId,
          providerItemId: receipt.id,
        });
      } catch {
        // Canonical resolution ignores items without a current indexed ledger row.
        // Deletion is best-effort cleanup; it cannot make the stale item evidence.
      }
    }
    return { status: "superseded", projectionKey };
  }
  return { status: "indexed", projectionKey, providerItemId: receipt.id };
}
