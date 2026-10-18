import { getTableColumns } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { ragProjectionItems } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import {
  buildRagProjectionKey,
  buildRagProjectionRecord,
  buildAuthorizedLibraryAiSearchScopes,
  ensureRagProjection,
  libraryAllowedScopeToAiSearchScope,
  markRagProjectionIndexed,
  RagProjectionError,
  resolveIndexedRagProjection,
  RAG_PROJECTION_LIMITS,
} from "./ragProjectionRegistry";

const input = {
  tenantId: "tenant-a",
  sourceType: "library_document",
  sourceId: "document-123",
  sourceVersion: "sha256:" + "a".repeat(64),
  aclScope: "tenant_shared:" + "b".repeat(32),
  projectionHash: "c".repeat(64),
  projectionBytes: 2048,
  instanceId: "tenant-pool-01-rag-v2",
  embeddingProfile: "bge-m3-1024-v1",
};

function selectDb(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as unknown as DrizzleDB, limit, where };
}

describe("SPEC-229 canonical RAG projection registry", () => {
  it("stores provider lifecycle state while preserving canonical tenant/source identity", () => {
    const columns = getTableColumns(ragProjectionItems);
    expect(columns).toMatchObject({
      tenantId: expect.any(Object),
      sourceType: expect.any(Object),
      sourceId: expect.any(Object),
      sourceVersion: expect.any(Object),
      aclScope: expect.any(Object),
      projectionKey: expect.any(Object),
      projectionHash: expect.any(Object),
      providerItemId: expect.any(Object),
      status: expect.any(Object),
    });
  });

  it("derives deterministic tenant/source/version/ACL projection keys", () => {
    const key = buildRagProjectionKey(input);
    expect(key).toBe(buildRagProjectionKey({ ...input }));
    expect(key).toMatch(/^rag\/[a-f0-9]{20}\/library_document\//);
    expect(key).not.toContain(input.tenantId);
    expect(key).not.toContain(input.sourceId);
    expect(buildRagProjectionRecord(input)).toMatchObject({
      tenantId: input.tenantId,
      sourceVersion: input.sourceVersion,
      aclScope: input.aclScope,
      projectionHash: input.projectionHash,
      provider: "cloudflare_ai_search",
      status: "queued",
    });
  });

  it("maps legacy Library ACL tokens to tenant-bound opaque provider filters", () => {
    const userScope = libraryAllowedScopeToAiSearchScope("tenant-a", "u:123");
    const groupScope = libraryAllowedScopeToAiSearchScope("tenant-a", "g:47");
    expect(userScope).toMatch(/^user_private:[a-f0-9]{32}$/);
    expect(groupScope).toMatch(/^group:[a-f0-9]{32}$/);
    expect(libraryAllowedScopeToAiSearchScope("tenant-a", "u:123")).toBe(
      userScope
    );
    expect(libraryAllowedScopeToAiSearchScope("tenant-b", "u:123")).not.toBe(
      userScope
    );

    const authorized = buildAuthorizedLibraryAiSearchScopes({
      tenantId: "tenant-a",
      userId: 123,
      role: "editor",
      groupIds: [47, 52],
    });
    expect(authorized).toContain(userScope);
    expect(authorized).toContain(groupScope);
    expect(
      authorized.every(scope => Buffer.byteLength(scope, "utf8") <= 64)
    ).toBe(true);
  });

  it("rejects unbounded ACL metadata, oversized projections, and malformed digests", () => {
    expect(() =>
      buildRagProjectionRecord({
        ...input,
        aclScope: "user_private:" + "x".repeat(60),
      })
    ).toThrowError(new RagProjectionError("RAG_PROJECTION_ACL_SCOPE_INVALID"));
    expect(() =>
      buildRagProjectionRecord({
        ...input,
        projectionBytes: RAG_PROJECTION_LIMITS.softBytes + 1,
      })
    ).toThrow("RAG_PROJECTION_SPLIT_REQUIRED");
    expect(() =>
      buildRagProjectionRecord({
        ...input,
        projectionBytes: RAG_PROJECTION_LIMITS.hardBytes + 1,
      })
    ).toThrow("RAG_PROJECTION_SIZE_HARD_LIMIT");
    expect(() =>
      buildRagProjectionRecord({
        ...input,
        projectionHash: "not-a-digest",
      })
    ).toThrow("RAG_PROJECTION_HASH_INVALID");
  });

  it("skips unchanged indexed projections and queues new or changed evidence", async () => {
    const current = {
      id: "projection-id",
      ...buildRagProjectionRecord(input),
      providerItemId: "provider-item-1",
      status: "indexed",
    };
    const existingDb = selectDb([current]);
    await expect(
      ensureRagProjection(existingDb.db, input)
    ).resolves.toMatchObject({
      action: "unchanged",
      projection: { id: "projection-id", providerItemId: "provider-item-1" },
    });

    const returning = vi
      .fn()
      .mockResolvedValue([{ ...current, status: "queued" }]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const newDb = selectDb([]);
    Object.assign(newDb.db, { insert });
    await expect(
      ensureRagProjection(newDb.db, {
        ...input,
        sourceVersion: "revision-8",
        projectionHash: "d".repeat(64),
      })
    ).resolves.toMatchObject({ action: "queued" });
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();

    const mismatchedRevisionDb = selectDb([current]);
    await expect(
      ensureRagProjection(mismatchedRevisionDb.db, {
        ...input,
        projectionHash: "d".repeat(64),
      })
    ).rejects.toThrow("RAG_PROJECTION_IMMUTABLE_REVISION_DIGEST_CONFLICT");
  });

  it("uses expected digest and state predicates to reject stale worker completion", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const db = { update } as unknown as DrizzleDB;
    await expect(
      markRagProjectionIndexed(db, {
        tenantId: input.tenantId,
        projectionKey: buildRagProjectionKey(input),
        projectionHash: input.projectionHash,
        providerItemId: "provider-item-1",
      })
    ).resolves.toBe(false);
    expect(where).toHaveBeenCalledOnce();
  });

  it("requires authorized ACL scopes before provider item resolution", async () => {
    const { db } = selectDb([]);
    await expect(
      resolveIndexedRagProjection(db, {
        tenantId: input.tenantId,
        provider: "cloudflare_ai_search",
        instanceId: input.instanceId,
        providerItemId: "provider-item-1",
        authorizedAclScopes: [],
      })
    ).rejects.toThrow("RAG_PROJECTION_AUTHORIZED_SCOPES_REQUIRED");
    await expect(
      resolveIndexedRagProjection(db, {
        tenantId: input.tenantId,
        provider: "cloudflare_ai_search",
        instanceId: input.instanceId,
        providerItemId: "provider-item-1",
        authorizedAclScopes: [input.aclScope],
      })
    ).resolves.toBeNull();
  });
});
