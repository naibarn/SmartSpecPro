import { describe, expect, it } from "vitest";

import {
  canAccessWorkerLlmModel,
  evaluateWorkerLlmInventoryUpdate,
  hashWorkerLlmInventory,
  makeWorkerLlmModelRef,
  normalizeWorkerMessageContent,
  validateWorkerLlmSharePolicy,
} from "../workerLocalLlmService";

const groups = [
  { id: 10, tenantId: "tenant-a", ownerId: 7, deletedAt: null },
  { id: 11, tenantId: "tenant-a", ownerId: 8, deletedAt: null },
  { id: 12, tenantId: "tenant-b", ownerId: 7, deletedAt: null },
  { id: 13, tenantId: "tenant-a", ownerId: 7, deletedAt: new Date() },
];

describe("workerLocalLlmService", () => {
  it("permits only owner-created same-tenant Groups", () => {
    expect(validateWorkerLlmSharePolicy({
      tenantId: "tenant-a", actorId: 7, ownerId: 7, mode: "groups", groupIds: [10], groups,
    })).toEqual({ mode: "groups", groupIds: [10] });
    for (const groupId of [11, 12, 13]) {
      expect(() => validateWorkerLlmSharePolicy({
        tenantId: "tenant-a", actorId: 7, ownerId: 7, mode: "groups", groupIds: [groupId], groups,
      })).toThrow();
    }
  });

  it("keeps private models owner-only and requires active membership for shared models", () => {
    expect(canAccessWorkerLlmModel({ actorId: 7, ownerId: 7, policy: { mode: "private", groupIds: [] }, activeGroupIds: [] })).toBe(true);
    expect(canAccessWorkerLlmModel({ actorId: 8, ownerId: 7, policy: { mode: "private", groupIds: [] }, activeGroupIds: [10] })).toBe(false);
    expect(canAccessWorkerLlmModel({ actorId: 8, ownerId: 7, policy: { mode: "groups", groupIds: [10] }, activeGroupIds: [10] })).toBe(true);
    expect(canAccessWorkerLlmModel({ actorId: 8, ownerId: 7, policy: { mode: "groups", groupIds: [10] }, activeGroupIds: [11] })).toBe(false);
  });

  it("creates stable opaque refs and order-independent inventory hashes", () => {
    const ref = makeWorkerLlmModelRef({ tenantId: "t", workerId: "w", localProviderId: "p", providerModelId: "m" });
    expect(ref).toMatch(/^wllm_[A-Za-z0-9_-]{32}$/);
    const a = { schemaVersion: "worker-llm-inventory/1" as const, inventoryRevision: 1, providers: [] };
    const b = { ...a, providers: [] };
    expect(hashWorkerLlmInventory(a)).toBe(hashWorkerLlmInventory(b));
    expect(hashWorkerLlmInventory({ ...a, inventoryRevision: 2 })).not.toBe(hashWorkerLlmInventory(a));
  });

  it("makes inventory replay and revision races explicit", () => {
    const current = { revision: 4, hash: "h4", idempotencyKey: "k4" };
    expect(evaluateWorkerLlmInventoryUpdate({ current, revision: 4, hash: "h4", idempotencyKey: "k4" }).kind).toBe("replay");
    expect(evaluateWorkerLlmInventoryUpdate({ current, revision: 3, hash: "h3", idempotencyKey: "k3" }).reason).toBe("stale_revision");
    expect(evaluateWorkerLlmInventoryUpdate({ current, revision: 4, hash: "h5", idempotencyKey: "k5" }).reason).toBe("revision_conflict");
    expect(evaluateWorkerLlmInventoryUpdate({ current, revision: 5, hash: "h5", idempotencyKey: "k5" }).kind).toBe("accept");
    expect(evaluateWorkerLlmInventoryUpdate({ current, revision: 5, hash: "different", idempotencyKey: "k4" }).reason).toBe("idempotency_conflict");
  });

  it("preserves managed image refs and rejects external image payloads", () => {
    expect(normalizeWorkerMessageContent(["look", { type: "image_ref", storageRef: "media/abc" }])).toEqual([
      "look", { type: "image_ref", storageRef: "media/abc" },
    ]);
    expect(() => normalizeWorkerMessageContent([{ type: "image_url", url: "https://example.test/x.png" }])).toThrow();
  });
});
