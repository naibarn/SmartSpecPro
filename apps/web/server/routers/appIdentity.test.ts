import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  scheduleRetry: vi.fn(async () => ({ jobId: "recovery-job", created: true, attempt: 1, stageId: "ui_implementation" })),
  migrateRuntimeValues: vi.fn(async () => ({ imported: 1, preserved: 0, verified: 1 })),
  getRun: vi.fn(async () => ({ run: { metadata: {} } })),
  recordRunEvent: vi.fn(async () => ({ accepted: true })),
}));
vi.mock("../services/miniAppRuntime", () => ({
  createMiniAppRuntimeReadyMarker: () => "signed-ready-marker",
  createMiniAppRuntimeStorageToken: () => "scoped-storage-token",
  migrateMiniAppRuntimeValues: (...args: unknown[]) => mocks.migrateRuntimeValues(...args),
  parseMiniAppRuntimeEntries: (value: unknown) => value,
}));
vi.mock("../services/personalMiniAppPreview", () => ({
  resolvePersonalMiniAppPreview: vi.fn(),
  resolvePersonalMiniAppFactoryHome: vi.fn(),
  provisionMiniAppRepositoryFromSnapshot: vi.fn(),
}));
vi.mock("../services/miniAppFactoryStageWorker", () => ({
  isAutoRecoverableMiniAppFactoryError: (code: unknown) => code === "LLMStructuredOutputError",
  scheduleMiniAppFactoryStageRetry: (...args: unknown[]) => mocks.scheduleRetry(...args),
}));
vi.mock("../services/miniAppFactoryPipeline", () => ({ loadMiniAppFactoryPipeline: () => ({ pipelineId: "test" }) }));
vi.mock("../services/spec224DevelopmentRunPersistence", () => ({
  createDevelopmentRunService: () => ({ get: (...args: unknown[]) => mocks.getRun(...args), recordVerificationEvent: (...args: unknown[]) => mocks.recordRunEvent(...args) }),
  defaultDevelopmentRunPersistenceAdapter: {},
}));
import { createAppIdentityRouter } from "./appIdentity";
import * as appIdentityRepository from "../services/appIdentityRepository";
import { createMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY } from "../services/miniAppFactoryDurableState";

function setup(user: any = { id: 1, currentTenantId: "tenant-account" }) {
  const response = { cookie: vi.fn() };
  const service = {
    resolveAppRouteForTenant: vi.fn(async () => ({
      appId: "app_research",
      publicAppId: "public_research",
      tenantId: "tenant-account",
    })),
    resolveActiveAppByPublicId: vi.fn(async () => ({
      appId: "app_research",
      publicAppId: "public_research",
      tenantId: "tenant-account",
    })),
    createPrivateMiniAppIdentity: vi.fn(async (input: any) => ({
      appId: "app_created",
      publicAppId: "mini_created",
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      visibility: "private",
      deploymentVersion: 0,
      lastKnownGoodArtifactRef: null,
      lifecycle: "draft",
    })),
    resolveMiniAppForViewer: vi.fn(async () => ({
      appId: "app_created",
      publicAppId: "mini_created",
      tenantId: "tenant-account",
      ownerUserId: 1,
      visibility: "private",
      deploymentVersion: 0,
      lastKnownGoodArtifactRef: null,
      lifecycle: "draft",
    })),
    setMiniAppVisibility: vi.fn(async (input: any) => ({ appId: input.appId, visibility: input.visibility, lifecycle: "active" })),
    recordMiniAppRuntimeMigrationVerification: vi.fn(async () => ({ appId: "app_created", runtimeDataMigrationStatus: "VERIFIED" })),
    confirmMiniAppRuntimeMigration: vi.fn(async () => ({ appId: "app_created" })),
    resolveOwnedPrivateMiniAppIdentity: vi.fn(async () => null),
    resolvePersonalMiniAppFactoryHome: vi.fn(async () => null),
    provisionMiniAppRepositoryFromSnapshot: vi.fn(async () => null),
  };
  const caller = createAppIdentityRouter(service).createCaller({
    user,
    tenantId: "tenant-from-host",
    res: response,
  } as any);
  return { caller, service, response };
}

describe("appIdentity runtime router", () => {
  it("uses authenticated account tenant rather than host or caller input", async () => {
    const { caller, service } = setup();
    await expect(caller.resolveRoute({ kind: "slug", value: "research-notes" })).resolves.toMatchObject({
      appId: "app_research",
      tenantId: "tenant-account",
    });
    expect(service.resolveAppRouteForTenant).toHaveBeenCalledWith({
      tenantId: "tenant-account",
      kind: "slug",
      value: "research-notes",
    });
  });

  it("requires authentication and an account tenant", async () => {
    const anonymous = createAppIdentityRouter().createCaller({ user: null, tenantId: "tenant-host" } as any);
    await expect(anonymous.resolveRoute({ kind: "slug", value: "research-notes" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const noTenant = setup({ id: 2, currentTenantId: null }).caller;
    await expect(noTenant.resolveRoute({ kind: "slug", value: "research-notes" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects extra tenant authority in input", async () => {
    const { caller, service } = setup();
    await expect(caller.resolveRoute({ kind: "slug", value: "research-notes", tenantId: "tenant-victim" } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.resolveAppRouteForTenant).not.toHaveBeenCalled();
  });

  it("resolves the canonical public App identifier within authenticated tenant scope", async () => {
    const { caller, service } = setup();
    await expect(caller.resolvePublicApp({ publicAppId: "public_research" })).resolves.toMatchObject({
      appId: "app_research",
      tenantId: "tenant-account",
    });
    expect(service.resolveActiveAppByPublicId).toHaveBeenCalledWith({
      tenantId: "tenant-account",
      publicAppId: "public_research",
    });
  });

  it("binds the public App resolver in the default runtime router", async () => {
    const resolver = vi.spyOn(appIdentityRepository, "resolveActiveAppByPublicId")
      .mockResolvedValue({
        appId: "app_research",
        publicAppId: "public_research",
        tenantId: "tenant-account",
      });
    const caller = createAppIdentityRouter().createCaller({
      user: { id: 1, currentTenantId: "tenant-account" },
      tenantId: "tenant-from-host",
    } as any);

    await expect(caller.resolvePublicApp({ publicAppId: "public_research" }))
      .resolves.toMatchObject({ appId: "app_research", tenantId: "tenant-account" });
    expect(resolver).toHaveBeenCalledWith({
      tenantId: "tenant-account",
      publicAppId: "public_research",
    });
    resolver.mockRestore();
  });

  it("creates a private Mini App identity for the authenticated owner and tenant", async () => {
    const { caller, service } = setup({ id: 91, currentTenantId: "tenant-owner" });
    await expect(caller.createMiniApp({ idempotencyKey: "run-create:abcdefghijkl" })).resolves.toMatchObject({
      appId: "app_created",
      visibility: "private",
      lifecycle: "draft",
    });
    expect(service.createPrivateMiniAppIdentity).toHaveBeenCalledWith({
      tenantId: "tenant-owner",
      ownerUserId: 91,
      idempotencyKey: "run-create:abcdefghijkl",
    });
  });

  it("resolves a development preview only through the authenticated owner scope", async () => {
    const { caller, service } = setup({ id: 91, currentTenantId: "tenant-owner" });
    await caller.resolveMiniApp({ appId: "app_created" });
    expect(service.resolveMiniAppForViewer).toHaveBeenCalledWith({
      appId: "app_created",
      tenantId: "tenant-owner",
      userId: 91,
    });
  });

  it("migrates legacy values without changing App ownership and marks the canonical runtime ready", async () => {
    mocks.migrateRuntimeValues.mockClear();
    const { caller, service, response } = setup({ id: 23, currentTenantId: "tenant-owner" });
    service.resolveMiniAppForViewer.mockResolvedValueOnce({
      appId: "app_created",
      publicAppId: "mini_created",
      tenantId: "tenant-owner",
      ownerUserId: 23,
      visibility: "private",
      deploymentVersion: 1,
      lastKnownGoodArtifactRef: "r2://preview",
      lifecycle: "draft",
    } as any);

    await expect(caller.prepareMiniAppRuntime({
      appId: "app_created",
      legacyEntries: [{ key: "expenses", value: [{ amount: 20 }] }],
    })).resolves.toMatchObject({ appId: "app_created", deploymentVersion: 1, migrationStatus: "VERIFIED", imported: 1, verified: 1 });
    expect(mocks.migrateRuntimeValues).toHaveBeenCalledWith(
      { appId: "app_created", tenantId: "tenant-owner", userId: 23 },
      [{ key: "expenses", value: [{ amount: 20 }] }],
    );
    expect(response.cookie).toHaveBeenCalledWith("miniapp_runtime_ready", "signed-ready-marker", expect.objectContaining({
      httpOnly: true,
      path: "/miniapp/app_created",
    }));
    expect(service.recordMiniAppRuntimeMigrationVerification).toHaveBeenCalledWith({
      appId: "app_created", tenantId: "tenant-owner", ownerUserId: 23, imported: 1, preserved: 0,
    });
  });

  it("confirms runtime data migration for the authenticated owner", async () => {
    const { caller, service } = setup({ id: 23, currentTenantId: "tenant-owner" });
    await expect(caller.confirmRuntimeDataMigration({ appId: "app_created" })).resolves.toEqual({
      appId: "app_created", migrationStatus: "OWNER_CONFIRMED",
    });
    expect(service.confirmMiniAppRuntimeMigration).toHaveBeenCalledWith({
      appId: "app_created", tenantId: "tenant-owner", ownerUserId: 23,
    });
  });

  it("provisions the dedicated private repo from retained source and records it on the same run", async () => {
    const { caller, service } = setup({ id: 23, currentTenantId: "tenant-owner" });
    const sourceDigest = "a".repeat(64);
    const revision = "b".repeat(40);
    const repository = { mode: "USER_OWNED" as const, owner: "owner", name: "smartaihub-app-created", url: "https://github.com/owner/smartaihub-app-created", revision };
    service.resolveOwnedPrivateMiniAppIdentity.mockResolvedValueOnce({
      appId: "app_created", tenantId: "tenant-owner", ownerUserId: 23, visibility: "private",
      lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-owner/app_created/sha256/" + "c".repeat(64),
    } as any);
    service.resolvePersonalMiniAppFactoryHome.mockResolvedValueOnce({
      runId: "run-" + "d".repeat(40),
      sourceSnapshotRef: `r2://mini-app-sources/tenant-owner/app_created/sha256/${sourceDigest}`,
      appSourceDigest: sourceDigest,
      repository: null,
    } as any);
    service.provisionMiniAppRepositoryFromSnapshot.mockResolvedValueOnce(repository);
    const state = createMiniAppFactoryDurableState({ programId: "test-miniapp", miniAppId: "app_created" });
    mocks.getRun.mockResolvedValueOnce({ run: { metadata: { [MINI_APP_FACTORY_STATE_KEY]: state } } });

    await expect(caller.provisionMiniAppRepository({ appId: "app_created" })).resolves.toEqual({
      appId: "app_created", repository, alreadyProvisioned: false,
    });
    expect(service.provisionMiniAppRepositoryFromSnapshot).toHaveBeenCalledWith({
      userId: 23,
      appId: "app_created",
      sourceRef: `r2://mini-app-sources/tenant-owner/app_created/sha256/${sourceDigest}`,
      sourceDigest,
    });
    expect(mocks.recordRunEvent).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-" + "d".repeat(40),
      idempotencyKey: `miniapp-repository:app_created:${revision}`,
      runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: expect.objectContaining({
        repository,
        artifacts: expect.arrayContaining([`app-repository:user:owner/${repository.name}@${revision}`]),
      }) },
    }));
  });

  it("returns the precise one-time GitHub connection requirement without starting a run", async () => {
    mocks.getRun.mockClear();
    const { caller, service } = setup({ id: 23, currentTenantId: "tenant-owner" });
    service.resolveOwnedPrivateMiniAppIdentity.mockResolvedValueOnce({
      appId: "app_created", tenantId: "tenant-owner", ownerUserId: 23, visibility: "private",
      lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-owner/app_created/sha256/" + "c".repeat(64),
    } as any);
    service.resolvePersonalMiniAppFactoryHome.mockResolvedValueOnce({
      runId: "run-" + "d".repeat(40),
      sourceSnapshotRef: "r2://mini-app-sources/tenant-owner/app_created/sha256/" + "a".repeat(64),
      appSourceDigest: "a".repeat(64),
      repository: null,
    } as any);
    await expect(caller.provisionMiniAppRepository({ appId: "app_created" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("Connect GitHub in Settings → Integrations"),
    });
    expect(mocks.getRun).not.toHaveBeenCalled();
  });

  it("automatically resumes a recoverable failed stage for the authenticated private owner", async () => {
    mocks.scheduleRetry.mockClear();
    const resolved = vi.fn()
      .mockResolvedValueOnce({
        app: { appId: "app_existing", tenantId: "tenant-owner", ownerUserId: 91, visibility: "private" },
        html: null,
        factory: {
          recoveryNeeded: true,
          retryable: true,
          runId: "run-existing",
          currentStage: "ui_implementation",
          error: { code: "LLMStructuredOutputError" },
        },
      })
      .mockResolvedValueOnce({
        app: { appId: "app_existing", tenantId: "tenant-owner", ownerUserId: 91, visibility: "private" },
        html: null,
        factory: { jobState: "queued", isInProgress: true },
      });
    const service = {
      resolveAppRouteForTenant: vi.fn(), resolveActiveAppByPublicId: vi.fn(), createPrivateMiniAppIdentity: vi.fn(),
      resolveMiniAppForViewer: vi.fn(), setMiniAppVisibility: vi.fn(),
      recordMiniAppRuntimeMigrationVerification: vi.fn(), confirmMiniAppRuntimeMigration: vi.fn(),
      resolveOwnedPrivateMiniAppIdentity: vi.fn(), resolvePersonalMiniAppFactoryHome: vi.fn(), provisionMiniAppRepositoryFromSnapshot: vi.fn(),
      resolvePersonalMiniAppPreview: resolved,
    };
    const owner = createAppIdentityRouter(service).createCaller({ user: { id: 91, currentTenantId: "tenant-owner" }, tenantId: "tenant-owner" } as any);

    await expect(owner.resolveMiniApp({ appId: "app_existing" })).resolves.toMatchObject({ factory: { jobState: "queued" } });
    expect(mocks.scheduleRetry).toHaveBeenCalledWith(expect.objectContaining({
      appId: "app_existing",
      run: { runId: "run-existing", tenantId: "tenant-owner", actorId: 91 },
      stageId: "ui_implementation",
    }));
    expect(resolved).toHaveBeenCalledTimes(2);
  });

  it("returns private artifact bytes to the owner and no app data to another user", async () => {
    const resolvePersonalMiniAppPreview = vi.fn(async (viewer: any) => viewer.userId === 91 && viewer.tenantId === "tenant-owner"
      ? { app: { appId: "app_private", visibility: "private" }, html: "<main>private bytes</main>", artifactDigest: "a".repeat(64) }
      : null);
    const service = {
      resolveAppRouteForTenant: vi.fn(), resolveActiveAppByPublicId: vi.fn(), createPrivateMiniAppIdentity: vi.fn(),
      resolveMiniAppForViewer: vi.fn(), setMiniAppVisibility: vi.fn(),
      recordMiniAppRuntimeMigrationVerification: vi.fn(), confirmMiniAppRuntimeMigration: vi.fn(),
      resolveOwnedPrivateMiniAppIdentity: vi.fn(), resolvePersonalMiniAppFactoryHome: vi.fn(), provisionMiniAppRepositoryFromSnapshot: vi.fn(),
      resolvePersonalMiniAppPreview,
    };
    const owner = createAppIdentityRouter(service).createCaller({ user: { id: 91, currentTenantId: "tenant-owner" }, tenantId: "tenant-owner" } as any);
    const other = createAppIdentityRouter(service).createCaller({ user: { id: 92, currentTenantId: "tenant-owner" }, tenantId: "tenant-owner" } as any);
    await expect(owner.resolveMiniApp({ appId: "app_private" })).resolves.toMatchObject({ html: "<main>private bytes</main>" });
    await expect(other.resolveMiniApp({ appId: "app_private" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(resolvePersonalMiniAppPreview).toHaveBeenNthCalledWith(1, { appId: "app_private", tenantId: "tenant-owner", userId: 91 });
    expect(resolvePersonalMiniAppPreview).toHaveBeenNthCalledWith(2, { appId: "app_private", tenantId: "tenant-owner", userId: 92 });
  });

  it("permits the public resolver to serve published apps without a session", async () => {
    const service = {
      resolveAppRouteForTenant: vi.fn(),
      resolveActiveAppByPublicId: vi.fn(),
      createPrivateMiniAppIdentity: vi.fn(),
      resolveMiniAppForViewer: vi.fn(async (input: any) => input.userId === null ? {
        appId: "app_public",
        publicAppId: "mini_public",
        tenantId: "tenant-owner",
        ownerUserId: 1,
        visibility: "public",
        deploymentVersion: 1,
        lastKnownGoodArtifactRef: "r2://preview/app_public/v1/index.html",
        lifecycle: "active",
      } : null),
      setMiniAppVisibility: vi.fn(),
      recordMiniAppRuntimeMigrationVerification: vi.fn(),
      confirmMiniAppRuntimeMigration: vi.fn(),
      resolveOwnedPrivateMiniAppIdentity: vi.fn(),
      resolvePersonalMiniAppFactoryHome: vi.fn(),
      provisionMiniAppRepositoryFromSnapshot: vi.fn(),
    };
    const caller = createAppIdentityRouter(service).createCaller({ user: null, tenantId: null } as any);
    await expect(caller.resolveMiniApp({ appId: "app_public" })).resolves.toMatchObject({ visibility: "public" });
    expect(service.resolveMiniAppForViewer).toHaveBeenCalledWith({ appId: "app_public", tenantId: null, userId: null });
  });

  it("denies missing or foreign private Mini App identities", async () => {
    const { caller, service } = setup({ id: 92, currentTenantId: "tenant-other" });
    vi.mocked(service.resolveMiniAppForViewer).mockResolvedValueOnce(null as any);
    await expect(caller.resolveMiniApp({ appId: "app_created" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("publishes and unpublishes only through the authenticated owner scope", async () => {
    const { caller, service } = setup({ id: 91, currentTenantId: "tenant-owner" });
    await expect(caller.publishMiniApp({ appId: "app_created" })).resolves.toMatchObject({ visibility: "public" });
    await expect(caller.unpublishMiniApp({ appId: "app_created" })).resolves.toMatchObject({ visibility: "private" });
    expect(service.setMiniAppVisibility).toHaveBeenNthCalledWith(1, {
      appId: "app_created", tenantId: "tenant-owner", ownerUserId: 91, visibility: "public",
    });
    expect(service.setMiniAppVisibility).toHaveBeenNthCalledWith(2, {
      appId: "app_created", tenantId: "tenant-owner", ownerUserId: 91, visibility: "private",
    });
  });
});
