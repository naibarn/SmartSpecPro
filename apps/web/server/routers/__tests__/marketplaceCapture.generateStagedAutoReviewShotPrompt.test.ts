/**
 * Marketplace Auto Review staged pipeline — `generateStagedAutoReviewShotPrompt`
 * router-layer contract. Confirms the fire-and-forget → synchronous fix:
 * the mutation now returns the REAL result of the service call (awaited),
 * and a service-side rejection surfaces as a real tRPC-style rejection
 * instead of being swallowed by a background `.catch(console.error)`.
 *
 * Convention cloned from `marketplaceCapture.sequentialShotRegen.test.ts`
 * (hoisted JWT_SECRET + `../../db` mock) plus a full mock of
 * `../services/marketplaceAutoReviewStagedCheckpointRouterService` so this
 * test exercises ONLY the router wiring, not the service's DB/transaction
 * internals (covered separately by
 * `marketplaceAutoReviewStagedCheckpointRouterService.test.ts`).
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = "test-jwt-secret-for-marketplace-capture-router";
  }
});

vi.mock("../../db", () => ({ getDb: vi.fn(async () => null) }));

const { mockGenerateStagedAutoReviewShotPrompt } = vi.hoisted(() => ({
  mockGenerateStagedAutoReviewShotPrompt: vi.fn(),
}));

vi.mock("../../services/marketplaceAutoReviewStagedCheckpointRouterService", () => ({
  generateStagedAutoReviewShotPrompt: mockGenerateStagedAutoReviewShotPrompt,
  // Every other export this router file imports from the same module —
  // stubbed as no-ops. None of these are invoked by the mutation under
  // test, so a plain vi.fn() (returning undefined) is safe here.
  acceptStagedAutoReviewImage: vi.fn(),
  approveStagedAutoReviewCheckpoint: vi.fn(),
  editStagedAutoReviewAudioPlan: vi.fn(),
  editStagedAutoReviewFinalAssembly: vi.fn(),
  editStagedAutoReviewShot: vi.fn(),
  getStagedAutoReviewCheckpointState: vi.fn(),
  rejectStagedAutoReviewCheckpoint: vi.fn(),
  redraftStagedAutoReviewPlan: vi.fn(),
  retryStagedAutoReviewShot: vi.fn(),
  retryStagedAutoReviewAudioPlan: vi.fn(),
  retryStagedAutoReviewFinalAssembly: vi.fn(),
  updateStagedAutoReviewReferenceManifest: vi.fn(),
}));

import { marketplaceCaptureRouter } from "../marketplaceCapture";
import type { TrpcContext } from "../../_core/context";

function createContext(user: Record<string, unknown> | null): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: user as TrpcContext["user"],
    userToken: null,
    privateVaultToken: null,
    tenantId: "tenant_router",
    publicUrl: "https://example.test",
  };
}

const BASE_INPUT = {
  runId: "run-1",
  shotId: 3,
  stage: "image" as const,
  expectedStateDigest: "digest-1",
  idempotencyKey: "idem-key-00000001",
};

describe("generateStagedAutoReviewShotPrompt router mutation — synchronous fix", () => {
  it("awaits the service call and returns its REAL resolved result (not an immediate 'generating' placeholder)", async () => {
    let resolveService: (value: unknown) => void;
    const servicePromise = new Promise(resolve => {
      resolveService = resolve;
    });
    mockGenerateStagedAutoReviewShotPrompt.mockReturnValueOnce(servicePromise);

    const caller = marketplaceCaptureRouter.createCaller(
      createContext({ id: 42, currentTenantId: "tenant_router" })
    );

    const realResult = {
      runId: "run-1",
      operation: { operationId: "staged-op-abc", stateDigest: "digest-2" },
      status: "queued" as const,
    };

    const callPromise = caller.generateStagedAutoReviewShotPrompt(BASE_INPUT);

    // The mutation must still be pending — proving the router is NOT
    // returning a synchronous placeholder before the service resolves.
    let settled = false;
    callPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveService!(realResult);
    const result = await callPromise;

    expect(result).toEqual(realResult);
    // The old shape `{ success: true, status: "generating" }` must be gone.
    expect(result).not.toHaveProperty("success");
    expect((result as { status: string }).status).not.toBe("generating");
  });

  it("propagates a service-side error as a real rejection instead of swallowing it", async () => {
    mockGenerateStagedAutoReviewShotPrompt.mockRejectedValueOnce(
      new Error("staged_prompt_generation_empty")
    );

    const caller = marketplaceCaptureRouter.createCaller(
      createContext({ id: 42, currentTenantId: "tenant_router" })
    );

    await expect(
      caller.generateStagedAutoReviewShotPrompt(BASE_INPUT)
    ).rejects.toThrow("staged_prompt_generation_empty");
  });

  it("threads runId/shotId/stage/instruction and the resolved auth/runtime through to the service call", async () => {
    mockGenerateStagedAutoReviewShotPrompt.mockResolvedValueOnce({
      runId: "run-1",
      operation: { operationId: "op-1" },
      status: "queued",
    });

    const caller = marketplaceCaptureRouter.createCaller(
      createContext({ id: 42, currentTenantId: "tenant_router" })
    );

    await caller.generateStagedAutoReviewShotPrompt({
      ...BASE_INPUT,
      stage: "video",
      instruction: "make the lighting brighter",
    });

    expect(mockGenerateStagedAutoReviewShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        shotId: 3,
        stage: "video",
        instruction: "make the lighting brighter",
        auth: expect.objectContaining({ userId: 42 }),
        runtime: expect.objectContaining({ publicUrl: "https://example.test" }),
      })
    );
  });

  it("rejects with no user (auth enforced by the real protectedProcedure middleware)", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));
    await expect(
      caller.generateStagedAutoReviewShotPrompt(BASE_INPUT)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
