import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  resolveOwned: vi.fn(),
  resolveFactory: vi.fn(),
  provisionSnapshot: vi.fn(),
  getRun: vi.fn(),
  recordEvent: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("./appIdentityRepository", () => ({ resolveOwnedPrivateMiniAppIdentity: (...args: unknown[]) => mocks.resolveOwned(...args) }));
vi.mock("./personalMiniAppPreview", () => ({
  provisionMiniAppRepositoryFromSnapshot: (...args: unknown[]) => mocks.provisionSnapshot(...args),
  resolvePersonalMiniAppFactoryHome: (...args: unknown[]) => mocks.resolveFactory(...args),
}));
vi.mock("./spec224DevelopmentRunPersistence", () => ({
  createDevelopmentRunService: () => ({
    get: (...args: unknown[]) => mocks.getRun(...args),
    recordVerificationEvent: (...args: unknown[]) => mocks.recordEvent(...args),
  }),
  defaultDevelopmentRunPersistenceAdapter: {},
}));

import { createMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY } from "./miniAppFactoryDurableState";
import { provisionOwnedMiniAppRepository, reconcilePendingMiniAppRepositoriesForOwner } from "./miniAppRepositoryReconciliation";

const ownerScope = { tenantId: "tenant-owner", ownerUserId: 23 };
const sourceDigest = "a".repeat(64);
const appId = "app_existing";
const sourceRef = `r2://mini-app-sources/${ownerScope.tenantId}/${appId}/sha256/${sourceDigest}`;
const repository = {
  mode: "USER_OWNED" as const,
  owner: "pruksacharttk",
  name: `smartaihub-${appId}`,
  url: `https://github.com/pruksacharttk/smartaihub-${appId}`,
  revision: "b".repeat(40),
};

function factoryHome(repositoryState = "AUTH_REQUIRED") {
  return {
    runId: "run-existing",
    isInProgress: false,
    repositoryState,
    repository: null,
    sourceSnapshotRef: sourceRef,
    appSourceDigest: sourceDigest,
    error: { code: "MINI_APP_GITHUB_AUTHORITY_NOT_CONFIGURED" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockReturnValue({
    select: () => ({ from: () => ({ where: async () => [{ appId }] }) }),
  });
  mocks.resolveOwned.mockResolvedValue({
    appId,
    tenantId: ownerScope.tenantId,
    ownerUserId: ownerScope.ownerUserId,
    visibility: "private",
    lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-owner/app_existing/sha256/" + "c".repeat(64),
  });
  mocks.resolveFactory.mockResolvedValue(factoryHome());
  mocks.provisionSnapshot.mockResolvedValue(repository);
  const state = createMiniAppFactoryDurableState({
    programId: "personal-miniapp-existing",
    miniAppId: appId,
    initialArtifacts: [`app-source:${sourceRef}`, `app-source-digest:${sourceDigest}`, "app-repository-state:AUTH_REQUIRED"],
  });
  mocks.getRun.mockResolvedValue({ run: { metadata: { [MINI_APP_FACTORY_STATE_KEY]: state } } });
  mocks.recordEvent.mockResolvedValue({ accepted: true });
});

describe("Mini-App repository reconciliation", () => {
  it("binds the verified repository to the same owner DevelopmentRun", async () => {
    await expect(provisionOwnedMiniAppRepository({ ...ownerScope, appId })).resolves.toEqual({
      appId,
      repository,
      alreadyProvisioned: false,
    });
    expect(mocks.resolveOwned).toHaveBeenCalledWith({ appId, tenantId: ownerScope.tenantId, ownerUserId: ownerScope.ownerUserId });
    expect(mocks.provisionSnapshot).toHaveBeenCalledWith({ userId: 23, tenantId: "tenant-owner", appId, sourceRef, sourceDigest });
    expect(mocks.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-existing",
      tenantId: "tenant-owner",
      actorId: 23,
      idempotencyKey: `miniapp-repository:${appId}:${repository.revision}`,
      runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: expect.objectContaining({
        repository,
        artifacts: expect.arrayContaining([`app-repository:user:pruksacharttk/${repository.name}@${repository.revision}`, "app-repository-state:BOUND"]),
      }) },
    }));
  });

  it("reconciles only the owner's saved AUTH_REQUIRED source and reports retryable failures", async () => {
    mocks.provisionSnapshot.mockRejectedValueOnce(new Error("GITHUB_HTTP_503"));

    await expect(reconcilePendingMiniAppRepositoriesForOwner(ownerScope)).resolves.toEqual({
      scanned: 1,
      provisioned: 0,
      skipped: 0,
      failed: 1,
    });
    expect(mocks.resolveFactory).toHaveBeenCalledWith({ tenantId: "tenant-owner", userId: 23 }, appId, true);
    expect(mocks.provisionSnapshot).toHaveBeenCalledOnce();
  });

  it("skips already-bound and active runs", async () => {
    mocks.resolveFactory.mockResolvedValueOnce(factoryHome("BOUND"));

    await expect(reconcilePendingMiniAppRepositoriesForOwner(ownerScope)).resolves.toEqual({
      scanned: 1,
      provisioned: 0,
      skipped: 1,
      failed: 0,
    });
    expect(mocks.provisionSnapshot).not.toHaveBeenCalled();
  });
});
