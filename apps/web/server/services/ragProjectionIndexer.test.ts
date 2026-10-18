import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { DrizzleDB } from "../db";
import type { CloudflareAiSearchProvider } from "./cloudflareAiSearchProvider";
import {
  indexRagProjectionItem,
  type RagProjectionIndexerDependencies,
} from "./ragProjectionIndexer";

const content = "# Authorized canonical document\nEvidence body.";
const input = {
  tenantId: "tenant-a",
  sourceType: "library_document",
  sourceId: "document-1",
  sourceVersion: "revision-7",
  aclScope: "tenant_shared:" + "a".repeat(32),
  projectionPart: "whole",
  instanceId: "tenant-pool-01-rag-v2",
  namespace: "smartaihub-dev",
  embeddingProfile: "bge-m3-1024-v1",
  canonicalContent: content,
};
const projectionHash = createHash("sha256").update(content).digest("hex");

function dependencies(
  overrides: Partial<RagProjectionIndexerDependencies> = {}
) {
  const defaults: RagProjectionIndexerDependencies = {
    ensure: vi.fn(
      async () =>
        ({
          action: "queued" as const,
          projection: { projectionKey: "rag/deterministic/key" },
        }) as never
    ),
    markIndexed: vi.fn(async () => true),
    markFailed: vi.fn(async () => true),
    isCurrentIndexed: vi.fn(async () => false),
  };
  return { ...defaults, ...overrides };
}

function provider(
  overrides: {
    upsertItem?: ReturnType<typeof vi.fn>;
    deleteItem?: ReturnType<typeof vi.fn>;
  } = {}
) {
  return {
    upsertItem:
      overrides.upsertItem ??
      vi.fn(async () => ({
        id: "provider-item-1",
        key: "rag/deterministic/key",
      })),
    deleteItem: overrides.deleteItem ?? vi.fn(async () => undefined),
  } as unknown as CloudflareAiSearchProvider;
}

describe("SPEC-229 RAG projection index lifecycle", () => {
  it("persists deterministic provenance and records the provider receipt after upload", async () => {
    const deps = dependencies();
    const adapter = provider();
    await expect(
      indexRagProjectionItem({} as DrizzleDB, adapter, input, deps)
    ).resolves.toMatchObject({
      status: "indexed",
      projectionKey: "rag/deterministic/key",
      providerItemId: "provider-item-1",
    });
    expect(deps.ensure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "tenant-a",
        sourceVersion: "revision-7",
        projectionHash,
        projectionBytes: Buffer.byteLength(content),
        aclScope: input.aclScope,
      })
    );
    expect(adapter.upsertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "smartaihub-dev",
        instanceId: input.instanceId,
        key: "rag/deterministic/key",
        content,
        metadata: expect.objectContaining({
          acl_scope: input.aclScope,
          source_type: "library_document",
        }),
      })
    );
    expect(deps.markIndexed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectionHash,
        providerItemId: "provider-item-1",
      })
    );
  });

  it("does not repeat provider writes for an unchanged indexed projection", async () => {
    const deps = dependencies({
      ensure: vi.fn(
        async () =>
          ({
            action: "unchanged" as const,
            projection: { projectionKey: "rag/deterministic/key" },
          }) as never
      ),
    });
    const adapter = provider();
    await expect(
      indexRagProjectionItem({} as DrizzleDB, adapter, input, deps)
    ).resolves.toMatchObject({ status: "unchanged" });
    expect(adapter.upsertItem).not.toHaveBeenCalled();
  });

  it("records sanitized provider failure against the expected digest and rethrows", async () => {
    const deps = dependencies();
    const adapter = provider({
      upsertItem: vi.fn(async () => {
        throw new Error("AI_SEARCH_PROVIDER_REQUEST_FAILED:503");
      }),
    });
    await expect(
      indexRagProjectionItem({} as DrizzleDB, adapter, input, deps)
    ).rejects.toThrow("AI_SEARCH_PROVIDER_REQUEST_FAILED:503");
    expect(deps.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectionHash,
        errorCode: "AI_SEARCH_PROVIDER_REQUEST_FAILED:503",
      })
    );
    expect(deps.markIndexed).not.toHaveBeenCalled();
  });

  it("does not delete an upsert receipt shared by a concurrent successful worker", async () => {
    const deps = dependencies({
      markIndexed: vi.fn(async () => false),
      isCurrentIndexed: vi.fn(async () => true),
    });
    const adapter = provider();
    await expect(
      indexRagProjectionItem({} as DrizzleDB, adapter, input, deps)
    ).resolves.toMatchObject({ status: "superseded" });
    expect(adapter.deleteItem).not.toHaveBeenCalled();
  });

  it("best-effort deletes a provider item when its expected projection was superseded", async () => {
    const deps = dependencies({
      markIndexed: vi.fn(async () => false),
      isCurrentIndexed: vi.fn(async () => false),
    });
    const adapter = provider();
    await expect(
      indexRagProjectionItem({} as DrizzleDB, adapter, input, deps)
    ).resolves.toMatchObject({ status: "superseded" });
    expect(adapter.deleteItem).toHaveBeenCalledWith({
      namespace: "smartaihub-dev",
      instanceId: input.instanceId,
      providerItemId: "provider-item-1",
    });
  });
});
