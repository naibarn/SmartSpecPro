import { describe, expect, it } from "vitest";

import { filterVisibleWorkerLlmRows, mapWorkerLlmCatalogRow } from "../workerLlmCatalog";
import { isWorkerLlmRowSelectable } from "../workerLocalLlmService";

describe("workerLlmCatalog", () => {
  it("keeps private/foreign workers hidden and shared owner Groups visible", () => {
    expect(filterVisibleWorkerLlmRows({ actorId: 8, rows: [
      { ownerUserId: 7, sharingPolicy: { mode: "private", groupIds: [] }, activeGroupIds: [], enabled: true, tombstoned: false, readiness: "ready", workerStatus: "online", lastInventoryAt: new Date() },
      { ownerUserId: 7, sharingPolicy: { mode: "groups", groupIds: [10] }, activeGroupIds: [10], enabled: true, tombstoned: false, readiness: "ready", workerStatus: "online", lastInventoryAt: new Date() },
    ] })).toEqual([false, true]);
  });

  it("does not make stale or non-ready rows selectable", () => {
    expect(isWorkerLlmRowSelectable({ enabled: true, tombstoned: false, readiness: "ready", workerStatus: "online", lastInventoryAt: new Date("2020-01-01") })).toBe(false);
    expect(isWorkerLlmRowSelectable({ enabled: true, tombstoned: false, readiness: "blocked", workerStatus: "online", lastInventoryAt: new Date() })).toBe(false);
  });

  it("maps Worker provenance and filters required task capability", () => {
    const row = mapWorkerLlmCatalogRow({ modelRef: "wllm_abcdefgh", displayName: "Vision", providerKind: "ollama", localProviderId: "p1", capabilitiesJson: ["llm.vision"], readiness: "ready", enabled: true, tombstoned: false, workerId: "w1", workerName: "Alice Worker", workerStatus: "online", lastInventoryAt: new Date(), contextWindow: 8192 }, "vision");
    expect(row).toMatchObject({ sourceType: "worker_app", id: "wllm_abcdefgh", selectable: true, privacyMode: "local_only" });
    expect(mapWorkerLlmCatalogRow({ ...row, modelRef: row.modelRef, displayName: row.name, capabilitiesJson: row.capabilities, lastInventoryAt: new Date(row.lastInventoryAt!) } as any, "chat").selectable).toBe(false);
  });
});
