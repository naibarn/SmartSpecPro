import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { libraryChunks, libraryItems } from "../../drizzle/schema.ts";
import type { DrizzleDB } from "../db";
import type { CreateControlPlaneJobInput } from "./jobControlPlaneGateway";
import {
  normalizeCanonicalMarkdown,
  canonicalMarkdownRevision,
} from "./libraryCitationAnchor";
import { CloudflareAiSearchProvider } from "./cloudflareAiSearchProvider";
import { indexRagProjectionItem } from "./ragProjectionIndexer";
import {
  libraryAllowedScopeToAiSearchScope,
  listRagProjectionItemsForSource,
  markRagProjectionDeleted,
  markRagProjectionItemDeletePending,
  type RagProjectionInput,
} from "./ragProjectionRegistry";
import {
  resolveRetrievalInstanceRoute,
  RetrievalInstanceRouteError,
} from "./retrievalInstanceRoutes";

const SOURCE_TYPE = "library_document";
const EMBEDDING_PROFILE = "bge-m3-1024-v1";

type RuntimeConfig = {
  accountId: string;
  apiToken: string;
  environment: "dev" | "staging";
  evaluationTenantId: string;
  evaluationLibraryItemIds: number[];
};

type ProjectionRow = Awaited<
  ReturnType<typeof listRagProjectionItemsForSource>
>[number];

export interface LibraryRagProjectionSyncDependencies {
  getRuntimeConfig(): RuntimeConfig | null;
  getDatabase(): Promise<DrizzleDB>;
  resolveRoute(
    db: DrizzleDB,
    input: {
      tenantId: string;
      environment: "dev" | "staging";
      sourceClasses: string[];
    }
  ): ReturnType<typeof resolveRetrievalInstanceRoute>;
  createProvider(config: RuntimeConfig): CloudflareAiSearchProvider;
  readCanonicalSource(
    db: DrizzleDB,
    input: {
      tenantId: string;
      libraryItemId: number;
    }
  ): Promise<{
    content: string | null;
    allowedScopes: string[];
    deleted: boolean;
  }>;
  listProjections(
    db: DrizzleDB,
    input: {
      tenantId: string;
      sourceType: string;
      sourceId: string;
    }
  ): Promise<ProjectionRow[]>;
  markDeletePending(
    db: DrizzleDB,
    input: {
      tenantId: string;
      projectionKey: string;
      instanceId: string;
      providerItemId: string | null;
    }
  ): Promise<boolean>;
  markDeleted: typeof markRagProjectionDeleted;
  index: typeof indexRagProjectionItem;
}

export interface LibraryRagProjectionQueueDependencies {
  getRuntimeConfig(): RuntimeConfig | null;
  getDatabase(): Promise<DrizzleDB>;
  resolveRoute: LibraryRagProjectionSyncDependencies["resolveRoute"];
  readCanonicalSource: LibraryRagProjectionSyncDependencies["readCanonicalSource"];
  enqueue(
    input: CreateControlPlaneJobInput
  ): Promise<{ jobId: string; created: boolean }>;
}

export interface LibraryRagProjectionSyncProgress {
  completed: number;
  total: number;
  stage: "delete" | "index";
}

async function enqueueControlPlaneJob(input: CreateControlPlaneJobInput) {
  const { createControlPlaneJob } = await import("./jobControlPlaneGateway");
  return createControlPlaneJob(input);
}

function runtimeConfigFromEnvironment(): RuntimeConfig | null {
  const nodeEnvironment = (process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnvironment !== "development" && nodeEnvironment !== "staging") {
    return null;
  }
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.CF_ACCOUNT_ID ??
    ""
  ).trim();
  const apiToken = (process.env.CLOUDFLARE_AI_API_KEY ?? "").trim();
  const evaluationTenantId = (
    process.env.SPEC229_NONPRODUCTION_EVALUATION_TENANT_ID ?? ""
  ).trim();
  const rawItemIds = (
    process.env.SPEC229_NONPRODUCTION_EVALUATION_LIBRARY_ITEM_IDS ?? ""
  ).trim();
  const evaluationLibraryItemIds = rawItemIds
    .split(",")
    .map(value => Number(value.trim()))
    .filter(value => Number.isSafeInteger(value) && value > 0);
  // Evaluation targets are operator-selected synthetic/non-production items;
  // never infer permission to index arbitrary tenant Library content.
  if (
    !/^[a-f0-9]{32}$/i.test(accountId) ||
    !apiToken ||
    !evaluationTenantId ||
    evaluationTenantId.length > 36 ||
    !evaluationLibraryItemIds.length ||
    evaluationLibraryItemIds.length !== rawItemIds.split(",").length
  )
    return null;
  return {
    accountId,
    apiToken,
    environment: nodeEnvironment === "staging" ? "staging" : "dev",
    evaluationTenantId,
    evaluationLibraryItemIds: [...new Set(evaluationLibraryItemIds)],
  };
}

function isAuthorizedEvaluationItem(
  config: RuntimeConfig,
  tenantId: string,
  libraryItemId: number
): boolean {
  return (
    config.evaluationTenantId === tenantId &&
    config.evaluationLibraryItemIds.includes(libraryItemId)
  );
}

const DEFAULT_DEPENDENCIES: LibraryRagProjectionSyncDependencies = {
  getRuntimeConfig: runtimeConfigFromEnvironment,
  getDatabase: async () => (await import("../db")).getDb(),
  resolveRoute: resolveRetrievalInstanceRoute,
  createProvider: config => new CloudflareAiSearchProvider(config),
  readCanonicalSource: async (db, input) => {
    const [item] = await db
      .select({
        id: libraryItems.id,
        tenantId: libraryItems.tenantId,
        deletedAt: libraryItems.deletedAt,
        allowedScopes: libraryItems.allowedScopes,
      })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.id, input.libraryItemId),
          eq(libraryItems.tenantId, input.tenantId)
        )
      )
      .limit(1);
    if (!item) return { content: null, allowedScopes: [], deleted: true };
    if (item.deletedAt)
      return { content: null, allowedScopes: [], deleted: true };
    const [source] = await db
      .select({ content: libraryChunks.content })
      .from(libraryChunks)
      .where(
        and(
          eq(libraryChunks.tenantId, input.tenantId),
          eq(libraryChunks.libraryItemId, input.libraryItemId),
          eq(libraryChunks.chunkIndex, 0),
          eq(libraryChunks.contentType, "markdown_source")
        )
      )
      .limit(1);
    return {
      content: source?.content ?? null,
      allowedScopes: item.allowedScopes ?? [],
      deleted: false,
    };
  },
  listProjections: listRagProjectionItemsForSource,
  markDeletePending: markRagProjectionItemDeletePending,
  markDeleted: markRagProjectionDeleted,
  index: indexRagProjectionItem,
};

const DEFAULT_QUEUE_DEPENDENCIES: LibraryRagProjectionQueueDependencies = {
  getRuntimeConfig: runtimeConfigFromEnvironment,
  getDatabase: async () => (await import("../db")).getDb(),
  resolveRoute: resolveRetrievalInstanceRoute,
  readCanonicalSource: DEFAULT_DEPENDENCIES.readCanonicalSource,
  enqueue: enqueueControlPlaneJob,
};

function digest(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

function isMissingRoute(error: unknown): boolean {
  return (
    error instanceof RetrievalInstanceRouteError &&
    error.code === "RETRIEVAL_ROUTE_NOT_CONFIGURED"
  );
}

/** Admit projection reconciliation through the existing worker_jobs/outbox. */
export async function queueLibraryDocumentRagProjectionSync(
  input: {
    tenantId: string;
    libraryItemId: number;
    sourceJobId: number;
  },
  dependencies: LibraryRagProjectionQueueDependencies = DEFAULT_QUEUE_DEPENDENCIES
): Promise<{
  queued: boolean;
  reason: "runtime_disabled" | "route_missing" | "queued";
  jobId?: string;
}> {
  const config = dependencies.getRuntimeConfig();
  if (!config) return { queued: false, reason: "runtime_disabled" };
  if (
    !isAuthorizedEvaluationItem(config, input.tenantId, input.libraryItemId)
  ) {
    return { queued: false, reason: "runtime_disabled" };
  }
  const db = await dependencies.getDatabase();
  const source = await dependencies.readCanonicalSource(db, {
    tenantId: input.tenantId,
    libraryItemId: input.libraryItemId,
  });
  try {
    await dependencies.resolveRoute(db, {
      tenantId: input.tenantId,
      environment: config.environment,
      sourceClasses: [SOURCE_TYPE],
    });
  } catch (error) {
    if (isMissingRoute(error))
      return { queued: false, reason: "route_missing" };
    if (
      !(error instanceof RetrievalInstanceRouteError) ||
      error.code !== "RETRIEVAL_ROUTE_CAPACITY_BLOCKED"
    )
      throw error;
    // Keep a durable retryable intent while a known route is temporarily full.
  }
  const sourceStateHash = digest(
    JSON.stringify({
      deleted: source.deleted,
      contentDigest: source.content
        ? digest(normalizeCanonicalMarkdown(source.content))
        : null,
      allowedScopes: [...new Set(source.allowedScopes)].sort(),
    })
  ).slice(0, 24);
  const idempotencyKey = `library-rag-projection:${input.sourceJobId}:${sourceStateHash}`;
  const job = await dependencies.enqueue({
    context: {
      tenantId: input.tenantId,
      actorType: "system",
      authorizationScope: "system:library-rag-projection",
      correlationId: idempotencyKey,
      idempotencyKey,
    },
    definition: {
      contractVersion: "feature-186-v1",
      jobType: "library.rag_projection_sync",
      executionClass: "long",
      input: { libraryItemId: input.libraryItemId },
      idempotencyKey,
      retryPolicy: {
        maxAttempts: 5,
        baseDelayMs: 5_000,
        maxDelayMs: 5 * 60_000,
        jitter: "bounded",
        deadlineMs: 30 * 60_000,
        allowedErrorClasses: ["retryable", "timeout", "unavailable"],
      },
      timeoutPolicy: { softTimeoutMs: 60_000, hardTimeoutMs: 5 * 60_000 },
    },
  });
  return { queued: true, reason: "queued", jobId: job.jobId };
}

/**
 * Reconcile one Library source through the existing tenant route and projection
 * ledger. Production is a hard no-op; canonical source and ACL state are read
 * from PostgreSQL and provider-returned text is never used as evidence.
 */
export async function syncLibraryDocumentRagProjection(
  tenantId: string,
  libraryItemId: number,
  dbClient?: DrizzleDB,
  dependencies: LibraryRagProjectionSyncDependencies = DEFAULT_DEPENDENCIES,
  onProgress?: (progress: LibraryRagProjectionSyncProgress) => Promise<void>
): Promise<{
  status: "disabled" | "route_missing" | "synced";
  indexed: number;
  deleted: number;
}> {
  const config = dependencies.getRuntimeConfig();
  if (!config) return { status: "disabled", indexed: 0, deleted: 0 };
  if (!isAuthorizedEvaluationItem(config, tenantId, libraryItemId)) {
    return { status: "disabled", indexed: 0, deleted: 0 };
  }
  const db = dbClient ?? (await dependencies.getDatabase());
  let route;
  try {
    route = await dependencies.resolveRoute(db, {
      tenantId,
      environment: config.environment,
      sourceClasses: [SOURCE_TYPE],
    });
  } catch (error) {
    if (isMissingRoute(error)) {
      return { status: "route_missing", indexed: 0, deleted: 0 };
    }
    throw error;
  }

  const source = await dependencies.readCanonicalSource(db, {
    tenantId,
    libraryItemId,
  });
  const markdown = normalizeCanonicalMarkdown(source.content ?? "");
  const sourceDigest = digest(markdown);
  const sourceVersion = canonicalMarkdownRevision(sourceDigest);
  const allowedScopes =
    !source.deleted && markdown.trim()
      ? [
          ...new Set(
            source.allowedScopes.map(scope =>
              libraryAllowedScopeToAiSearchScope(tenantId, scope)
            )
          ),
        ].sort()
      : [];
  const desired: RagProjectionInput[] = allowedScopes.flatMap(aclScope =>
    route.instanceIds.map(instanceId => ({
      tenantId,
      sourceType: SOURCE_TYPE,
      sourceId: String(libraryItemId),
      sourceVersion,
      aclScope,
      projectionHash: sourceDigest,
      projectionBytes: Buffer.byteLength(markdown, "utf8"),
      instanceId,
      embeddingProfile: EMBEDDING_PROFILE,
    }))
  );

  const provider = dependencies.createProvider(config);
  const existing = await dependencies.listProjections(db, {
    tenantId,
    sourceType: SOURCE_TYPE,
    sourceId: String(libraryItemId),
  });
  const desiredKeys = new Set(
    desired.map(
      projection =>
        // Importing the key builder here would duplicate provider identity logic.
        `${projection.sourceVersion}:${projection.projectionHash}:${projection.aclScope}:${projection.instanceId}:${projection.embeddingProfile}`
    )
  );
  const stale = existing.filter(projection => {
    if (projection.status === "deleted") return false;
    const identity = `${projection.sourceVersion}:${projection.projectionHash}:${projection.aclScope}:${projection.instanceId}:${projection.embeddingProfile}`;
    return !desiredKeys.has(identity);
  });
  const totalOperations = stale.length + desired.length;
  let completedOperations = 0;
  let deleted = 0;
  for (const projection of stale) {
    const marked = await dependencies.markDeletePending(db, {
      tenantId,
      projectionKey: projection.projectionKey,
      instanceId: projection.instanceId,
      providerItemId: projection.providerItemId,
    });
    if (!marked) continue;
    if (projection.providerItemId) {
      await provider.deleteItem({
        namespace: route.namespace,
        instanceId: projection.instanceId,
        providerItemId: projection.providerItemId,
      });
    }
    if (
      await dependencies.markDeleted(db, {
        tenantId,
        projectionKey: projection.projectionKey,
        instanceId: projection.instanceId,
        providerItemId: projection.providerItemId,
      })
    )
      deleted += 1;
    completedOperations += 1;
    await onProgress?.({
      completed: completedOperations,
      total: totalOperations,
      stage: "delete",
    });
  }

  let indexed = 0;
  for (const projection of desired) {
    const result = await dependencies.index(db, provider, {
      ...projection,
      namespace: route.namespace,
      canonicalContent: markdown,
    });
    if (result.status === "indexed") indexed += 1;
    completedOperations += 1;
    await onProgress?.({
      completed: completedOperations,
      total: totalOperations,
      stage: "index",
    });
  }
  return { status: "synced", indexed, deleted };
}
