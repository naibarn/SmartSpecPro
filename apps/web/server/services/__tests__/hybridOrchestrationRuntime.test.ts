import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HybridPlanPayload } from "@shared/orchestration/hybridOrchestration";

const redisStore = new Map<string, string>();
const signedTokens = new Map<string, { sub: string; tenantId: string; type: "hybrid_preview"; jti: string }>();
const expiredTokens = new Set<string>();
let tokenCounter = 0;

vi.mock("../redis", () => ({
  getRedisClient: vi.fn(() => ({
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  })),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn((claims: { sub: string; tenantId: string; type: "hybrid_preview"; jti: string }) => {
    tokenCounter += 1;
    const token = `hybrid-preview.${claims.jti}.${tokenCounter}`;
    signedTokens.set(token, claims);
    return token;
  }),
  verifyBearerToken: vi.fn(async (token: string) => {
    if (expiredTokens.has(token)) {
      throw new Error("jwt expired");
    }
    return signedTokens.get(token) ?? null;
  }),
  verifyBearerTokenIgnoringExpiration: vi.fn(async (token: string) => signedTokens.get(token) ?? null),
}));

import {
  createHybridPreviewToken,
  getHybridExecution,
  getHybridPreviewPayload,
  refreshHybridPreviewToken,
  startHybridExecution,
  advanceHybridExecution,
} from "../hybridOrchestrationRuntime";
import { hybridPlanPayloadSchema, hybridOrchestrationExecutionSchema } from "@shared/orchestration/hybridOrchestration";

const approvalRequiredPayload: HybridPlanPayload = {
  draft: "Design a hybrid orchestration flow",
  plan: {
    mode: "hybrid",
    blendMode: "balanced-mixed",
    summary: "Workflow and swarm cooperate with a human approval gate.",
    workflowAnchor: "workflow-planner",
    swarmRoles: ["explorer", "critic", "synthesizer"],
    requiresApproval: true,
    reason: "cooperative_flow",
    stages: [
      {
        id: "workflow-intake",
        type: "intake",
        owner: "workflow",
        title: "Lock scope",
        description: "Turn the request into a brief.",
        inputs: ["message"],
        outputs: ["brief"],
      },
      {
        id: "swarm-explore",
        type: "explore",
        owner: "swarm",
        title: "Explore options",
        description: "Find alternatives and edge cases.",
        inputs: ["brief"],
        outputs: ["options"],
      },
      {
        id: "workflow-validate",
        type: "validate",
        owner: "workflow",
        title: "Validate",
        description: "Reconcile options.",
        inputs: ["options"],
        outputs: ["validated plan"],
      },
      {
        id: "human-approval",
        type: "approval",
        owner: "human",
        title: "Approve",
        description: "Human decision point.",
        inputs: ["validated plan"],
        outputs: ["approval"],
        gate: "required",
      },
      {
        id: "workflow-commit",
        type: "commit",
        owner: "workflow",
        title: "Commit",
        description: "Execute the plan.",
        inputs: ["approval"],
        outputs: ["result"],
      },
    ],
  },
};

const approvalOptionalPayload: HybridPlanPayload = {
  draft: "Design a hybrid orchestration flow",
  plan: {
    ...approvalRequiredPayload.plan,
    requiresApproval: false,
  },
};

describe("hybridOrchestrationRuntime", () => {
  beforeEach(() => {
    redisStore.clear();
    signedTokens.clear();
    expiredTokens.clear();
    tokenCounter = 0;
    vi.clearAllMocks();
  });

  it("creates a signed preview token and round-trips the payload", async () => {
    const result = await createHybridPreviewToken({
      agencyId: "agency-1",
      userId: 7,
      tenantId: "tenant-1",
      payload: approvalRequiredPayload,
      sourceSurface: "agency-browser",
    });

    expect(result.token).toMatch(/^hybrid-preview\./);

    const preview = await getHybridPreviewPayload({
      token: result.token,
      userId: 7,
      tenantId: "tenant-1",
    });

    expect(preview).toEqual(approvalRequiredPayload);
  });

  it("starts execution, waits for approval, and completes after approval", async () => {
    const tokenResult = await createHybridPreviewToken({
      agencyId: "agency-1",
      userId: 7,
      tenantId: "tenant-1",
      payload: approvalRequiredPayload,
      sourceSurface: "agency-chat",
    });

    const execution = await startHybridExecution({
      previewToken: tokenResult.token,
      userId: 7,
      tenantId: "tenant-1",
      blendMode: "balanced-mixed",
    });

    expect(execution.status).toBe("awaiting_approval");
    expect(execution.currentStageId).toBe("human-approval");

    const awaiting = await getHybridExecution({
      executionId: execution.executionId,
      userId: 7,
      tenantId: "tenant-1",
    });

    expect(awaiting).not.toBeNull();
    expect(awaiting?.status).toBe("awaiting_approval");

    const approved = await advanceHybridExecution({
      executionId: execution.executionId,
      userId: 7,
      tenantId: "tenant-1",
      action: "approve",
      note: "Approved for commit",
    });

    expect(approved.status).toBe("completed");
    expect(approved.approvalDecision).toBe("approved");
    expect(approved.history.at(-1)?.action).toBe("complete");
    expect(hybridOrchestrationExecutionSchema.parse(approved)).toEqual(approved);
  });

  it("refreshes an existing preview token without interrupting the preview payload", async () => {
    const tokenResult = await createHybridPreviewToken({
      agencyId: "agency-1",
      userId: 7,
      tenantId: "tenant-1",
      payload: approvalRequiredPayload,
      sourceSurface: "agency-browser",
    });

    const refreshed = await refreshHybridPreviewToken({
      previewToken: tokenResult.token,
      userId: 7,
      tenantId: "tenant-1",
    });

    expect(refreshed.token).not.toEqual(tokenResult.token);
    expect(refreshed.token).toMatch(/^hybrid-preview\./);

    const preview = await getHybridPreviewPayload({
      token: refreshed.token,
      userId: 7,
      tenantId: "tenant-1",
    });

    expect(preview).toEqual(approvalRequiredPayload);
  });

  it("refreshes an expired preview token using the ignore-expiration verification path", async () => {
    const tokenResult = await createHybridPreviewToken({
      agencyId: "agency-1",
      userId: 7,
      tenantId: "tenant-1",
      payload: approvalRequiredPayload,
      sourceSurface: "agency-browser",
    });

    expiredTokens.add(tokenResult.token);

    const refreshed = await refreshHybridPreviewToken({
      previewToken: tokenResult.token,
      userId: 7,
      tenantId: "tenant-1",
    });

    expect(refreshed.token).not.toEqual(tokenResult.token);

    const preview = await getHybridPreviewPayload({
      token: refreshed.token,
      userId: 7,
      tenantId: "tenant-1",
    });

    expect(preview).toEqual(approvalRequiredPayload);
  });

  it("skips human approval when the plan does not require it", async () => {
    const tokenResult = await createHybridPreviewToken({
      agencyId: "agency-1",
      userId: 7,
      tenantId: "tenant-1",
      payload: approvalOptionalPayload,
      sourceSurface: "agency-browser",
    });

    const execution = await startHybridExecution({
      previewToken: tokenResult.token,
      userId: 7,
      tenantId: "tenant-1",
      blendMode: "workflow-first",
    });

    expect(execution.status).toBe("completed");
    expect(execution.stageStates.find((stage) => stage.id === "human-approval")?.status).toBe("skipped");
    expect(execution.history.at(-1)?.action).toBe("auto_commit");
  });

  it("rejects hybrid plans that claim approval but lack a human stage", () => {
    const parsed = hybridPlanPayloadSchema.safeParse({
      draft: "Invalid hybrid",
      plan: {
        mode: "hybrid",
        blendMode: "balanced-mixed",
        summary: "Invalid plan",
        workflowAnchor: "workflow-planner",
        swarmRoles: ["explorer"],
        requiresApproval: true,
        reason: "invalid",
        stages: [
          {
            id: "workflow-intake",
            type: "intake",
            owner: "workflow",
            title: "Lock scope",
            description: "Brief the request.",
            inputs: ["message"],
            outputs: ["brief"],
          },
          {
            id: "swarm-explore",
            type: "explore",
            owner: "swarm",
            title: "Explore options",
            description: "Explore.",
            inputs: ["brief"],
            outputs: ["options"],
          },
          {
            id: "workflow-commit",
            type: "commit",
            owner: "workflow",
            title: "Commit",
            description: "Commit.",
            inputs: ["brief"],
            outputs: ["result"],
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
  });
});
