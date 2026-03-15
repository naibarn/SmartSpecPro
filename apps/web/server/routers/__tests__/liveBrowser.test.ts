import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetTenantFeatureFlag,
  mockAssertBrowserPolicySurfaceReady,
  mockLoadLegacyAutomationSettings,
  mockBuildAutomationCopilotBrowserPolicyContext,
  mockHasEnoughCredits,
  mockCreateCreditReservation,
  mockCommitCreditReservation,
  mockRefundReservation,
  mockRedisGet,
  mockDiscoverBrowserTargets,
  mockLaunchSkillStudioTask,
  mockSignBearerToken,
  mockVerifyLiveBrowserTakeoverMfa,
} = vi.hoisted(() => ({
  mockGetTenantFeatureFlag: vi.fn(),
  mockAssertBrowserPolicySurfaceReady: vi.fn(),
  mockLoadLegacyAutomationSettings: vi.fn(),
  mockBuildAutomationCopilotBrowserPolicyContext: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockCreateCreditReservation: vi.fn(),
  mockCommitCreditReservation: vi.fn(),
  mockRefundReservation: vi.fn(),
  mockRedisGet: vi.fn(),
  mockDiscoverBrowserTargets: vi.fn(),
  mockLaunchSkillStudioTask: vi.fn(),
  mockSignBearerToken: vi.fn(),
  mockVerifyLiveBrowserTakeoverMfa: vi.fn(),
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

vi.mock("../../services/browserPolicyReleaseControl", () => ({
  assertBrowserPolicySurfaceReady: mockAssertBrowserPolicySurfaceReady,
}));

vi.mock("../../services/browserPolicySettingsBridge", () => ({
  loadLegacyAutomationSettings: mockLoadLegacyAutomationSettings,
}));

vi.mock("../../services/browserPolicyRuntime", async () => {
  const actual = await vi.importActual<typeof import("../../services/browserPolicyRuntime")>(
    "../../services/browserPolicyRuntime"
  );
  return {
    ...actual,
    buildAutomationCopilotBrowserPolicyContext: mockBuildAutomationCopilotBrowserPolicyContext,
  };
});

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  createCreditReservation: mockCreateCreditReservation,
  commitCreditReservation: mockCommitCreditReservation,
  refundReservation: mockRefundReservation,
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: () => ({
    get: mockRedisGet,
  }),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: mockSignBearerToken,
}));

vi.mock("../../services/liveBrowserStepUpAuth", () => ({
  verifyLiveBrowserTakeoverMfa: mockVerifyLiveBrowserTakeoverMfa,
}));

vi.mock("../../services/browserSiteDiscovery", () => ({
  discoverBrowserTargets: mockDiscoverBrowserTargets,
}));

vi.mock("../../services/skillStudioService", () => ({
  launchSkillStudioTask: mockLaunchSkillStudioTask,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("liveBrowserRouter", () => {
  beforeEach(() => {
    const nowIso = new Date().toISOString();

    vi.clearAllMocks();
    vi.resetModules();

    mockGetTenantFeatureFlag.mockResolvedValue(true);
    mockAssertBrowserPolicySurfaceReady.mockResolvedValue(undefined);
    mockLoadLegacyAutomationSettings.mockResolvedValue({
      allowedDomains: ["example.com"],
      visionModel: "gpt-4o-mini",
    });
    mockBuildAutomationCopilotBrowserPolicyContext.mockResolvedValue({
      config: {
        allowedDomains: ["example.com"],
        visionModel: "gpt-4o-mini",
      },
    });
    mockHasEnoughCredits.mockResolvedValue(true);
    mockCreateCreditReservation.mockResolvedValue({
      reservationId: "resv-1",
    });
    mockCommitCreditReservation.mockResolvedValue({ committedAmount: 100 });
    mockRefundReservation.mockResolvedValue({ refundedAmount: 100 });
    mockRedisGet.mockResolvedValue(JSON.stringify({
      providerReady: true,
      providerFailures: [],
      runtimeReady: true,
      runtimeFailures: [],
      checkedAt: nowIso,
      publisher: "live-browser-publisher",
      owner: "browser-platform",
      runbookUrl: "https://runbooks.example.com/live-browser-readiness",
      publishIntervalSeconds: 30,
      maxAgeSeconds: 120,
    }));
    mockDiscoverBrowserTargets.mockResolvedValue({
      strategy: "heuristic_fallback",
      summary: "Default candidate sites prepared for this browser task.",
      recommendedUrl: "https://example.com",
      candidates: [
        {
          label: "Example",
          url: "https://example.com",
          reason: "Default test site",
        },
      ],
      discoveredDomains: ["example.com"],
    });
    mockLaunchSkillStudioTask.mockResolvedValue({
      taskId: "isc-task-1",
      mode: "create",
      summary: "skill draft",
    });
    mockSignBearerToken.mockReturnValue("signed-stream-token");
    mockVerifyLiveBrowserTakeoverMfa.mockResolvedValue("2026-03-12T12:03:00.000Z");
    mockFetch.mockReset();
  });

  async function createCaller(options?: {
    lastSignedIn?: Date;
  }) {
    const { liveBrowserRouter } = await import("../liveBrowser");
    return liveBrowserRouter.createCaller({
      user: {
        id: 7,
        openId: "user-7",
        email: "user@example.com",
        name: "User Seven",
        role: "user",
        registeredDomain: "example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: options?.lastSignedIn ?? new Date(),
        twoFactorEnabled: true,
        twoFactorSecret: "encrypted-secret",
        recoveryCodes: [],
      },
      tenantId: "tenant-1",
      userToken: "user-jwt-token",
      publicUrl: "https://example.com",
      req: {
        ip: "127.0.0.1",
        headers: {},
      } as any,
      res: {} as any,
    });
  }

  const actor = {
    actorType: "user" as const,
    actorId: "7",
  };

  it("blocks createSession when the liveBrowser feature flag is disabled", async () => {
    mockGetTenantFeatureFlag.mockResolvedValue(false);
    const caller = await createCaller();

    await expect(
      caller.createSession({
        actor,
        sourceType: "automation",
        mode: "observe",
        executionIntent: {
          prompt: "Review the onboarding page",
        },
      }),
    ).rejects.toThrow("Live Browser is disabled for this tenant");
  });

  it("forwards sessionVersion, idempotencyKey, and actor identity unchanged for sendCommand", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          accepted: true,
          sessionVersion: 5,
          queuedCommandId: "cmd-1",
        }),
        { status: 200 },
      ),
    );
    const caller = await createCaller();

    await caller.sendCommand({
      sessionId: "lbs_123",
      sessionVersion: 4,
      idempotencyKey: "idem-123",
      actor,
      command: {
        type: "natural_language",
        text: "Click the Continue button",
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [path, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toContain("/api/v1/live-browser/sessions/lbs_123/commands");
    expect(JSON.parse(String(options.body))).toMatchObject({
      request: {
        sessionId: "lbs_123",
        sessionVersion: 4,
        idempotencyKey: "idem-123",
        actor,
      },
      tenantId: "tenant-1",
      userId: 7,
      userJwt: "user-jwt-token",
    });
  });

  it("refunds the reservation and returns an explicit blocked error when createSession provisioning fails", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          accepted: false,
          error: {
            code: "stream_unavailable",
            message: "Managed stream is unavailable",
            retryable: true,
            reasonCodes: ["provider_down"],
          },
        }),
        { status: 503 },
      ),
    );
    const caller = await createCaller();

    await expect(
      caller.createSession({
        actor,
        sourceType: "automation",
        sourceId: "exec-1",
        mode: "observe",
        executionIntent: {
          prompt: "Investigate the cart flow",
        },
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Managed stream is unavailable"),
    });

    expect(mockCreateCreditReservation).toHaveBeenCalledWith(
      7,
      expect.any(Number),
      "browser_automation",
      expect.objectContaining({
        sourceId: "exec-1",
        sourceType: "automation",
      }),
    );
    expect(mockCommitCreditReservation).not.toHaveBeenCalled();
    expect(mockRefundReservation).toHaveBeenCalledWith("resv-1");
  });

  it("commits the reserved launch credits after createSession succeeds", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "lbs_123",
          status: "agent_running",
          controlMode: "agent_control",
          sessionVersion: 2,
          stream: {
            viewerToken: "viewer-1",
            expiresAt: "2026-03-12T12:05:00.000Z",
          },
        }),
        { status: 200 },
      ),
    );
    const caller = await createCaller();

    const result = await caller.createSession({
      actor,
      sourceType: "automation",
      sourceId: "exec-commit",
      mode: "observe",
      executionIntent: {
        prompt: "Investigate the pricing flow",
      },
    });

    expect(result).toMatchObject({
      sessionId: "lbs_123",
      status: "agent_running",
      controlMode: "agent_control",
    });
    expect(mockCommitCreditReservation).toHaveBeenCalledWith("resv-1");
    expect(mockRefundReservation).not.toHaveBeenCalled();
  });

  it("stages complex goals into a skill draft before live execution starts", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "lbs_456",
          status: "ready",
          controlMode: "observe",
          sessionVersion: 1,
          stream: {
            viewerToken: "viewer-2",
            expiresAt: "2026-03-12T12:05:00.000Z",
          },
        }),
        { status: 200 },
      ),
    );
    const caller = await createCaller();

    await caller.createSession({
      actor,
      sourceType: "automation",
      sourceId: "exec-complex",
      mode: "observe",
      executionIntent: {
        prompt: "Find the right booking website, compare refundable options, summarize the tradeoffs, and continue toward checkout.",
      },
    });

    expect(mockLaunchSkillStudioTask).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toMatchObject({
      request: {
        sourceId: "exec-complex",
        mode: "observe",
        initialUrl: "https://example.com",
      },
      browserPolicyContext: {
        skillDraft: expect.objectContaining({
          status: "building",
          skillId: "checkout_assistant",
        }),
        siteDiscovery: expect.objectContaining({
          recommendedUrl: "https://example.com",
        }),
      },
    });
    expect(JSON.parse(String(options.body)).request).not.toHaveProperty("executionIntent");
  });

  it("marks the staged browser skill draft as ready after the ISC task completes", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "lbs_789",
            status: "ready",
            controlMode: "observe",
            sessionVersion: 1,
            stream: {
              viewerToken: "viewer-3",
              expiresAt: "2026-03-12T12:05:00.000Z",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "lbs_789",
            tenantId: "tenant-1",
            userId: 7,
            sourceType: "automation",
            sourceId: "exec-complex-ready",
            status: "ready",
            controlMode: "observe",
            sessionVersion: 1,
            policyContext: {
              skillDraft: {
                status: "building",
                skillId: "checkout_assistant",
                note: "Complex goal is being converted into a reusable browser skill draft before live execution.",
              },
            },
            browserContextRef: {},
            activeTabCount: 1,
            startedAt: "2026-03-12T12:00:00.000Z",
            lastActivityAt: "2026-03-12T12:00:00.000Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accepted: true,
            sessionVersion: 2,
            policyContext: {
              skillDraft: {
                status: "ready",
                skillId: "checkout_assistant",
                note: "Reusable browser skill draft is ready. Live execution is continuing with the drafted plan.",
                syncedSkillId: 88,
                syncedSkillSlug: "browser-booking-skill",
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "lbs_789",
            tenantId: "tenant-1",
            userId: 7,
            sourceType: "automation",
            sourceId: "exec-complex-ready",
            status: "ready",
            controlMode: "observe",
            sessionVersion: 2,
            policyContext: {
              skillDraft: {
                status: "ready",
                skillId: "checkout_assistant",
                note: "Reusable browser skill draft is ready. Live execution is continuing with the drafted plan.",
              },
            },
            browserContextRef: {},
            activeTabCount: 1,
            startedAt: "2026-03-12T12:00:00.000Z",
            lastActivityAt: "2026-03-12T12:01:00.000Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accepted: true,
            sessionVersion: 3,
            queuedCommandId: "cmd-skill-draft",
          }),
          { status: 200 },
        ),
      );
    const caller = await createCaller();

    await caller.createSession({
      actor,
      sourceType: "automation",
      sourceId: "exec-complex-ready",
      mode: "observe",
      executionIntent: {
        prompt: "Find the right booking website, compare refundable options, summarize the tradeoffs, and continue toward checkout.",
      },
    });

    const hooks = mockLaunchSkillStudioTask.mock.calls[0]?.[2];
    expect(hooks?.onCompleted).toBeTypeOf("function");

    await hooks.onCompleted({
      success: true,
      message: "Draft complete",
      metadata: {
        syncedSkillId: 88,
        syncedSkillSlug: "browser-booking-skill",
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(5);
    const [updatePath, updateOptions] = mockFetch.mock.calls[2] as [string, RequestInit];
    expect(updatePath).toContain("/api/v1/live-browser/sessions/lbs_789/policy-context");
    expect(JSON.parse(String(updateOptions.body))).toMatchObject({
      request: {
        sessionId: "lbs_789",
        sessionVersion: 1,
        actor: {
          actorType: "agent",
          actorId: "browser_goal_skill_draft",
        },
        policyContextPatch: {
          skillDraft: expect.objectContaining({
            status: "ready",
            syncedSkillId: 88,
            syncedSkillSlug: "browser-booking-skill",
          }),
        },
      },
    });
  });

  it("blocks createSession before credit reservation when the live readiness snapshot reports provider failures", async () => {
    mockRedisGet.mockImplementation(async (key: string) => {
      if (key === "live-browser:readiness") {
        return JSON.stringify({
          providerReady: false,
          providerFailures: ["provider_attach_failed"],
          runtimeReady: true,
          runtimeFailures: [],
          checkedAt: "2026-03-12T12:00:00.000Z",
        });
      }
      return null;
    });

    const caller = await createCaller();

    await expect(
      caller.createSession({
        actor,
        sourceType: "automation",
        sourceId: "exec-2",
        mode: "observe",
        executionIntent: {
          prompt: "Inspect the billing page",
        },
      }),
    ).rejects.toThrow(/provider_attach_failed/);

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockCreateCreditReservation).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns a signed short-lived stream token scoped to the requested mode", async () => {
    const leaseExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "lbs_123",
          tenantId: "tenant-1",
          userId: 7,
          sourceType: "automation",
          status: "human_controlling",
          controlMode: "takeover",
          sessionVersion: 8,
          controllerActorType: "user",
          controllerActorId: "7",
          controllerLeaseExpiresAt: leaseExpiresAt,
          policyContext: {},
          browserContextRef: {},
          activeTabCount: 1,
          startedAt: "2026-03-12T12:00:00.000Z",
          lastActivityAt: "2026-03-12T12:05:00.000Z",
        }),
        { status: 200 },
      ),
    );
    const caller = await createCaller();

    const result = await caller.issueStreamToken({
      sessionId: "lbs_123",
      actor,
      scope: "controller",
    });

    expect(result).toMatchObject({
      sessionId: "lbs_123",
      scope: "controller",
      token: "signed-stream-token",
      leaseExpiresAt,
    });
    expect(mockSignBearerToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "7",
        type: "live_browser_stream",
        scopes: expect.arrayContaining([
          "live-browser:controller",
          "live-browser:session:lbs_123",
        ]),
      }),
      "2m",
    );
  });

  it("rejects controller stream tokens when the caller does not currently hold the control lease", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "lbs_123",
          tenantId: "tenant-1",
          userId: 7,
          sourceType: "automation",
          status: "ready",
          controlMode: "observe",
          sessionVersion: 8,
          policyContext: {},
          browserContextRef: {},
          activeTabCount: 1,
          startedAt: "2026-03-12T12:00:00.000Z",
          lastActivityAt: "2026-03-12T12:05:00.000Z",
        }),
        { status: 200 },
      ),
    );
    const caller = await createCaller();

    await expect(
      caller.issueStreamToken({
        sessionId: "lbs_123",
        actor,
        scope: "controller",
      }),
    ).rejects.toThrow(/active control lease/);
    expect(mockSignBearerToken).not.toHaveBeenCalled();
  });

  it("blocks takeover when the user has not signed in recently enough for controller elevation", async () => {
    const caller = await createCaller({
      lastSignedIn: new Date(Date.now() - 30 * 60_000),
    });

    await expect(
      caller.takeControl({
        sessionId: "lbs_123",
        sessionVersion: 4,
        idempotencyKey: "take-1",
        actor,
        reason: "manual_takeover_requested",
      }),
    ).rejects.toThrow(/recent sign-in/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows takeover when the user session was re-authenticated recently", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          accepted: true,
          status: "human_controlling",
          controlMode: "takeover",
          sessionVersion: 5,
          stream: {
            viewerToken: "viewer-1",
            controllerToken: "controller-1",
            expiresAt: "2026-03-12T12:05:00.000Z",
            leaseExpiresAt: "2026-03-12T12:10:00.000Z",
          },
        }),
        { status: 200 },
      ),
    );
    const caller = await createCaller({
      lastSignedIn: new Date(Date.now() - 5 * 60_000),
    });

    const result = await caller.takeControl({
      sessionId: "lbs_123",
      sessionVersion: 4,
      idempotencyKey: "take-2",
      actor,
      reason: "manual_takeover_requested",
    });

    expect(result).toMatchObject({
      accepted: true,
      status: "human_controlling",
      controlMode: "takeover",
      sessionVersion: 5,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [path, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toContain("/api/v1/live-browser/sessions/lbs_123/take-control");
    expect(JSON.parse(String(options.body))).toMatchObject({
      request: {
        sessionId: "lbs_123",
        sessionVersion: 4,
        idempotencyKey: "take-2",
        actor,
        reason: "manual_takeover_requested",
      },
      takeoverProof: "signed-stream-token",
    });
  });

  it("issues an MFA-backed takeover proof without forwarding the raw step-up code to Python", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          accepted: true,
          status: "human_controlling",
          controlMode: "takeover",
          sessionVersion: 5,
          stream: {
            viewerToken: "viewer-1",
            controllerToken: "controller-1",
            expiresAt: "2026-03-12T12:05:00.000Z",
            leaseExpiresAt: "2026-03-12T12:10:00.000Z",
          },
        }),
        { status: 200 },
      ),
    );
    const caller = await createCaller({
      lastSignedIn: new Date(Date.now() - 30 * 60_000),
    });

    await caller.takeControl({
      sessionId: "lbs_123",
      sessionVersion: 4,
      idempotencyKey: "take-mfa-1",
      actor,
      reason: "manual_takeover_requested",
      stepUpCode: "654321",
    });

    expect(mockVerifyLiveBrowserTakeoverMfa).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: 7 }),
      }),
      "654321",
    );
    expect(mockSignBearerToken).toHaveBeenCalledWith(
      expect.objectContaining({
        liveBrowserAssurance: "mfa",
        liveBrowserReauthenticatedAt: "2026-03-12T12:03:00.000Z",
      }),
      "5m",
    );
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toMatchObject({
      request: {
        sessionId: "lbs_123",
        sessionVersion: 4,
        idempotencyKey: "take-mfa-1",
        actor,
        reason: "manual_takeover_requested",
      },
      takeoverProof: "signed-stream-token",
    });
    expect(JSON.parse(String(options.body)).request).not.toHaveProperty("stepUpCode");
  });

  it("rate limits createSession attempts before provisioning starts", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            sessionId: "lbs_123",
            status: "provisioning",
            controlMode: "observe",
            sessionVersion: 1,
            stream: {
              viewerToken: "viewer-1",
              expiresAt: "2026-03-12T12:05:00.000Z",
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const caller = await createCaller();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await caller.createSession({
        actor,
        sourceType: "automation",
        sourceId: `exec-${attempt}`,
        mode: "observe",
      });
    }

    await expect(
      caller.createSession({
        actor,
        sourceType: "automation",
        sourceId: "exec-rate-limited",
        mode: "observe",
      }),
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: "TOO_MANY_REQUESTS",
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockCreateCreditReservation).toHaveBeenCalledTimes(3);
    expect(mockCommitCreditReservation).toHaveBeenCalledTimes(3);
  });
});
