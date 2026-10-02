import { describe, expect, it } from "vitest";
import { FEATURE_FLAG_DEFAULTS, type TenantFeatureFlags } from "../../../shared/featureFlags";
import type { DesignArtifactVersion } from "../../../shared/designIntelligence";
import {
  createDesignArtifactService,
  DesignArtifactServiceError,
  type DesignArtifactRepository,
} from "../designArtifactService";

function createMemoryRepository(): DesignArtifactRepository {
  const versions = new Map<string, DesignArtifactVersion>();
  const idempotency = new Map<string, { fingerprint: string; version: DesignArtifactVersion }>();
  const key = (tenantId: string, projectId: string, artifactId: string, version: number) =>
    `${tenantId}:${projectId}:${artifactId}:${version}`;
  return {
    async findIdempotentVersion(value) {
      const found = idempotency.get(value.idempotencyKey);
      if (!found) return null;
      if (found.fingerprint !== value.requestFingerprint) throw new DesignArtifactServiceError("VERSION_CONFLICT");
      return found.version;
    },
    async insertImmutableVersion(value) {
      const replay = idempotency.get(value.idempotencyKey);
      if (replay) {
        if (replay.fingerprint === value.requestFingerprint) return replay.version;
        throw new DesignArtifactServiceError("VERSION_CONFLICT");
      }
      const storageKey = key(value.tenantId, value.projectId, value.artifactId, value.version);
      if (value.expectedLatestVersion !== undefined) {
        const latest = [...versions.values()].filter(
          (version) => version.tenantId === value.tenantId && version.projectId === value.projectId && version.artifactId === value.artifactId,
        ).sort((left, right) => right.version - left.version)[0];
        if (!latest || latest.version !== value.expectedLatestVersion) {
          throw new DesignArtifactServiceError("VERSION_CONFLICT");
        }
      }
      const existing = versions.get(storageKey);
      if (existing) {
        if (existing.digest === value.digest) return existing;
        throw new DesignArtifactServiceError("VERSION_CONFLICT");
      }
      const { idempotencyKey: _idempotencyKey, requestFingerprint: _requestFingerprint, expectedLatestVersion: _expectedLatestVersion, ...version } = value;
      versions.set(storageKey, version);
      idempotency.set(value.idempotencyKey, { fingerprint: value.requestFingerprint, version });
      return version;
    },
    async readVersion(scope) {
      return versions.get(key(scope.tenantId, scope.projectId, scope.artifactId, scope.version)) ?? null;
    },
    async readLatest(scope) {
      const matching = [...versions.values()].filter(
        (version) => version.tenantId === scope.tenantId && version.projectId === scope.projectId && version.artifactId === scope.artifactId,
      );
      return matching.sort((left, right) => right.version - left.version)[0] ?? null;
    },
  };
}

const enabledFlags = {
  ...FEATURE_FLAG_DEFAULTS,
  smartAiHubDesignIntelligence: true,
  smartAiHubDesignNative: true,
} satisfies TenantFeatureFlags;

const request = {
  schemaVersion: 1,
  tenantId: "tenant-1",
  projectId: "project-1",
  requestId: "request-1",
  requestedBy: "user-1",
  intent: "mini-app-screen",
  prompt: { text: "Create a reading list screen", trust: "user-authored" },
  locale: "en",
  componentCatalogSnapshotId: "catalog-1",
} as const;

const actor = { userId: "user-1", tenantId: "tenant-1", projectId: "project-1" };

function createTestService(overrides: Partial<Parameters<typeof createDesignArtifactService>[0]> = {}) {
  return createDesignArtifactService({
    repository: createMemoryRepository(),
    authorization: { authorize: async () => true },
    audit: { record: async () => undefined },
    flags: enabledFlags,
    ...overrides,
  });
}

describe("native design artifact service boundary", () => {
  it("keeps native design disabled with default flags", async () => {
    const service = createTestService({ flags: FEATURE_FLAG_DEFAULTS });
    await expect(service.createDraft(request, actor)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("creates, reads and appends immutable project-scoped versions without a provider", async () => {
    const repository = createMemoryRepository();
    let id = 0;
    const service = createDesignArtifactService({
      repository,
      authorization: { authorize: async () => true },
      audit: { record: async () => undefined },
      flags: enabledFlags,
      createId: () => `id-${++id}`,
      now: () => new Date("2026-10-02T00:00:00.000Z"),
    });
    const first = await service.createDraft(request, actor);
    expect(first.provenance.source).toBe("native");
    expect(first.version).toBe(1);
    expect(first.rights.assetsCleared).toBe(false);
    expect(await service.readVersion({ ...actor, artifactId: first.artifactId, version: 1 })).toEqual(first);

    const second = await service.appendVersion({
      actor,
      artifactId: first.artifactId,
      expectedLatestVersion: 1,
      payload: { kind: "screen", title: "Reading list v2" },
    });
    expect(second.version).toBe(2);
    expect(second.parentVersion).toBe(1);
    expect(second.storageRef).toBe(`internal:design-artifacts/${first.artifactId}/2`);
    expect(first.payload).toEqual({
      kind: "native-design-intent",
      intent: "mini-app-screen",
      prompt: request.prompt,
      locale: "en",
    });
  });

  it("returns the first result for an idempotent native request replay", async () => {
    const service = createTestService();
    const first = await service.createDraft(request, actor);
    const replay = await service.createDraft(request, actor);
    expect(replay).toEqual(first);
  });

  it("rejects stale writes and cross-project reads", async () => {
    const service = createTestService({ createId: () => "artifact-1" });
    const first = await service.createDraft(request, actor);
    await expect(service.appendVersion({
      actor,
      artifactId: first.artifactId,
      expectedLatestVersion: 0,
      payload: { kind: "screen" },
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(service.readVersion({ ...actor, projectId: "other-project", artifactId: first.artifactId, version: 1 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects caller-supplied tenant, project, and owner impersonation", async () => {
    const service = createTestService();
    await expect(service.createDraft({ ...request, tenantId: "other-tenant" }, actor))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.createDraft({ ...request, requestedBy: "other-user" }, actor))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("authorizes and audits all service operations", async () => {
    const actions: string[] = [];
    const auditEvents: Array<{ action: string; outcome: string }> = [];
    const service = createTestService({
      authorization: { authorize: async (_actor, action) => { actions.push(action); return action !== "append"; } },
      audit: { record: async ({ action, outcome }) => { auditEvents.push({ action, outcome }); } },
    });
    const first = await service.createDraft(request, actor);
    await service.readVersion({ ...actor, artifactId: first.artifactId, version: 1 });
    await expect(service.appendVersion({ actor, artifactId: first.artifactId, expectedLatestVersion: 1, payload: {} }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(actions).toEqual(["create", "read", "append"]);
    expect(auditEvents).toEqual([
      { action: "create", outcome: "attempted" },
      { action: "read", outcome: "attempted" },
    ]);
  });

  it("labels audit as attempted when a repository write fails", async () => {
    const events: Array<{ action: string; outcome: string }> = [];
    const repository = createMemoryRepository();
    repository.insertImmutableVersion = async () => { throw new Error("unavailable"); };
    const service = createTestService({
      repository,
      audit: { record: async ({ action, outcome }) => { events.push({ action, outcome }); } },
    });
    await expect(service.createDraft(request, actor)).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(events).toEqual([{ action: "create", outcome: "attempted" }]);
  });

  it("permits only one concurrent append for the same expected version", async () => {
    const service = createTestService();
    const first = await service.createDraft(request, actor);
    const results = await Promise.allSettled([
      service.appendVersion({ actor, artifactId: first.artifactId, expectedLatestVersion: 1, payload: { title: "A" } }),
      service.appendVersion({ actor, artifactId: first.artifactId, expectedLatestVersion: 1, payload: { title: "B" } }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("replays an identical append and conflicts when the same operation changes payload", async () => {
    const service = createTestService();
    const first = await service.createDraft(request, actor);
    const operation = { actor, artifactId: first.artifactId, expectedLatestVersion: 1, payload: { title: "Saved version" } };
    const committed = await service.appendVersion(operation);
    const replay = await service.appendVersion(operation);
    expect(replay).toEqual(committed);
    await expect(service.appendVersion({ ...operation, payload: { title: "Changed payload" } }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("rejects a reused request ID with a changed catalog snapshot", async () => {
    const service = createTestService();
    const first = await service.createDraft(request, actor);
    const changed = { ...request, componentCatalogSnapshotId: "catalog-2" };
    await expect(service.createDraft(changed, actor)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(first.systemSnapshot.catalogSnapshotId).toBe("catalog-1");
  });
});
