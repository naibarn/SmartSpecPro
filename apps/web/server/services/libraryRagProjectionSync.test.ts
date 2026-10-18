import { describe, expect, it, vi } from "vitest";

import type { DrizzleDB } from "../db";
import {
  buildRagProjectionRecord,
  libraryAllowedScopeToAiSearchScope,
} from "./ragProjectionRegistry";
import {
  queueLibraryDocumentRagProjectionSync,
  syncLibraryDocumentRagProjection,
  type LibraryRagProjectionQueueDependencies,
  type LibraryRagProjectionSyncDependencies,
} from "./libraryRagProjectionSync";

const tenantId = "tenant-a";
const libraryItemId = 42;
const markdown = "# Authorized guide\n\nTenant-owned canonical text.";
const runtimeConfig = {
  accountId: "a".repeat(32),
  apiToken: "development-only-test-token",
  environment: "dev" as const,
  evaluationTenantId: tenantId,
  evaluationLibraryItemIds: [libraryItemId, 43],
};
const route = {
  routeId: "route-1",
  tenantId,
  environment: "dev" as const,
  namespace: "smartaihub-dev" as const,
  topologyMode: "sharded" as const,
  instanceIds: ["shard-a", "shard-b"],
  profileVersion: "test-profile-v1",
  capacityState: "healthy" as const,
};

function dependencies(
  overrides: Partial<LibraryRagProjectionSyncDependencies> = {}
) {
  return {
    getRuntimeConfig: vi.fn(() => runtimeConfig),
    getDatabase: vi.fn().mockResolvedValue({}),
    resolveRoute: vi.fn().mockResolvedValue(route),
    createProvider: vi.fn(() => ({
      deleteItem: vi.fn().mockResolvedValue(undefined),
    })),
    readCanonicalSource: vi.fn().mockResolvedValue({
      content: markdown,
      allowedScopes: [`t:${tenantId}`],
      deleted: false,
    }),
    listProjections: vi.fn().mockResolvedValue([]),
    markDeletePending: vi.fn().mockResolvedValue(true),
    markDeleted: vi.fn().mockResolvedValue(true),
    index: vi
      .fn()
      .mockResolvedValue({ status: "indexed", projectionKey: "key" }),
    ...overrides,
  } as unknown as LibraryRagProjectionSyncDependencies & {
    createProvider: ReturnType<typeof vi.fn>;
    index: ReturnType<typeof vi.fn>;
  };
}

describe("Library RAG projection lifecycle", () => {
  it("queues tenant-bound projection work through the existing worker control plane", async () => {
    const enqueue = vi
      .fn()
      .mockResolvedValue({ jobId: "job-projection-1", created: true });
    const deps = {
      getRuntimeConfig: vi.fn(() => runtimeConfig),
      getDatabase: vi.fn().mockResolvedValue({}),
      resolveRoute: vi.fn().mockResolvedValue(route),
      readCanonicalSource: vi.fn().mockResolvedValue({
        content: markdown,
        allowedScopes: [`t:${tenantId}`],
        deleted: false,
      }),
      enqueue,
    } as unknown as LibraryRagProjectionQueueDependencies;
    await expect(
      queueLibraryDocumentRagProjectionSync(
        {
          tenantId,
          libraryItemId,
          sourceJobId: 731,
        },
        deps
      )
    ).resolves.toEqual({
      queued: true,
      reason: "queued",
      jobId: "job-projection-1",
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          tenantId,
          actorType: "system",
          authorizationScope: "system:library-rag-projection",
          idempotencyKey: expect.stringMatching(
            /^library-rag-projection:731:[a-f0-9]{24}$/
          ),
        }),
        definition: expect.objectContaining({
          jobType: "library.rag_projection_sync",
          executionClass: "long",
          input: { libraryItemId },
        }),
      })
    );
  });

  it("queues a throttled Library event using the current canonical state", async () => {
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job-projection-2", created: true });
    const deps = {
      getRuntimeConfig: vi.fn(() => runtimeConfig),
      getDatabase: vi.fn().mockResolvedValue({}),
      resolveRoute: vi.fn().mockResolvedValue(route),
      readCanonicalSource: vi.fn().mockResolvedValue({ content: markdown, allowedScopes: [], deleted: true }),
      enqueue,
    } as unknown as LibraryRagProjectionQueueDependencies;

    await queueLibraryDocumentRagProjectionSync(
      { tenantId, libraryItemId, sourceJobId: 0 },
      deps,
    );

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          idempotencyKey: expect.stringMatching(/^library-rag-projection:0:[a-f0-9]{24}$/),
        }),
      }),
    );
  });

  it("does not access database or provider outside explicitly configured non-production runtime", async () => {
    const deps = dependencies({ getRuntimeConfig: vi.fn(() => null) });
    await expect(
      syncLibraryDocumentRagProjection(
        tenantId,
        libraryItemId,
        {} as DrizzleDB,
        deps
      )
    ).resolves.toEqual({ status: "disabled", indexed: 0, deleted: 0 });
    expect(deps.resolveRoute).not.toHaveBeenCalled();
    expect(deps.readCanonicalSource).not.toHaveBeenCalled();
    expect(deps.createProvider).not.toHaveBeenCalled();
  });

  it("does not read or project tenant items outside the owner-pinned synthetic evaluation corpus", async () => {
    const deps = dependencies();
    await expect(
      syncLibraryDocumentRagProjection(
        "another-tenant",
        libraryItemId,
        {} as DrizzleDB,
        deps
      )
    ).resolves.toEqual({ status: "disabled", indexed: 0, deleted: 0 });
    await expect(
      queueLibraryDocumentRagProjectionSync(
        {
          tenantId,
          libraryItemId: 999,
          sourceJobId: 732,
        },
        {
          ...deps,
          enqueue: vi.fn(),
        } as unknown as LibraryRagProjectionQueueDependencies
      )
    ).resolves.toEqual({ queued: false, reason: "runtime_disabled" });
    expect(deps.getDatabase).not.toHaveBeenCalled();
    expect(deps.resolveRoute).not.toHaveBeenCalled();
  });

  it("indexes canonical content into every routed shard and revokes obsolete ACL copies", async () => {
    const staleAcl = libraryAllowedScopeToAiSearchScope(tenantId, "u:777");
    const stale = {
      ...buildRagProjectionRecord({
        tenantId,
        sourceType: "library_document",
        sourceId: String(libraryItemId),
        sourceVersion: "sha256:" + "b".repeat(64),
        aclScope: staleAcl,
        projectionHash: "b".repeat(64),
        projectionBytes: 12,
        instanceId: "shard-a",
        embeddingProfile: "bge-m3-1024-v1",
      }),
      projectionKey: "previous-version-key",
      providerItemId: "provider-old-item",
      status: "indexed" as const,
      id: "projection-old",
    };
    const deleteItem = vi.fn().mockResolvedValue(undefined);
    const deps = dependencies({
      createProvider: vi.fn(() => ({ deleteItem }) as never),
      listProjections: vi.fn().mockResolvedValue([stale]),
      index: vi
        .fn()
        .mockResolvedValue({ status: "indexed", projectionKey: "new-key" }),
    });

    await expect(
      syncLibraryDocumentRagProjection(
        tenantId,
        libraryItemId,
        {} as DrizzleDB,
        deps
      )
    ).resolves.toEqual({ status: "synced", indexed: 2, deleted: 1 });

    expect(deps.markDeletePending).toHaveBeenCalledWith(expect.anything(), {
      tenantId,
      projectionKey: "previous-version-key",
      instanceId: "shard-a",
      providerItemId: "provider-old-item",
    });
    expect(deleteItem).toHaveBeenCalledWith({
      namespace: "smartaihub-dev",
      instanceId: "shard-a",
      providerItemId: "provider-old-item",
    });
    expect(deps.index).toHaveBeenCalledTimes(2);
    for (const call of deps.index.mock.calls) {
      expect(call[2]).toMatchObject({
        tenantId,
        sourceType: "library_document",
        sourceId: String(libraryItemId),
        canonicalContent: markdown,
        namespace: "smartaihub-dev",
      });
    }
  });

  it("fails closed by removing existing projections when the canonical item is deleted", async () => {
    const stale = {
      ...buildRagProjectionRecord({
        tenantId,
        sourceType: "library_document",
        sourceId: String(libraryItemId),
        sourceVersion: "sha256:" + "b".repeat(64),
        aclScope: libraryAllowedScopeToAiSearchScope(tenantId, `t:${tenantId}`),
        projectionHash: "b".repeat(64),
        projectionBytes: 12,
        instanceId: "shard-a",
        embeddingProfile: "bge-m3-1024-v1",
      }),
      providerItemId: "provider-old-item",
      status: "indexed" as const,
      id: "projection-old",
    };
    const deps = dependencies({
      readCanonicalSource: vi.fn().mockResolvedValue({
        content: null,
        allowedScopes: [],
        deleted: true,
      }),
      listProjections: vi.fn().mockResolvedValue([stale]),
    });

    await expect(
      syncLibraryDocumentRagProjection(
        tenantId,
        libraryItemId,
        {} as DrizzleDB,
        deps
      )
    ).resolves.toMatchObject({ status: "synced", indexed: 0, deleted: 1 });
    expect(deps.index).not.toHaveBeenCalled();
  });
});
