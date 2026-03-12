import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetTenantFeatureFlag,
  mockAssertBrowserPolicySurfaceReady,
  mockLoadLegacyAutomationSettings,
  mockBuildAutomationCopilotBrowserPolicyContext,
  mockHasEnoughCredits,
  mockCreateCreditReservation,
  mockRefundReservation,
  mockRedisGet,
  mockSignBearerToken,
} = vi.hoisted(() => ({
  mockGetTenantFeatureFlag: vi.fn(),
  mockAssertBrowserPolicySurfaceReady: vi.fn(),
  mockLoadLegacyAutomationSettings: vi.fn(),
  mockBuildAutomationCopilotBrowserPolicyContext: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockCreateCreditReservation: vi.fn(),
  mockRefundReservation: vi.fn(),
  mockRedisGet: vi.fn(),
  mockSignBearerToken: vi.fn(),
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

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("liveBrowserRouter", () => {
  beforeEach(() => {
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
    mockRefundReservation.mockResolvedValue({ refundedAmount: 100 });
    mockRedisGet.mockResolvedValue(null);
    mockSignBearerToken.mockReturnValue("signed-stream-token");
    mockFetch.mockReset();
  });

  async function createCaller() {
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
        lastSignedIn: new Date(),
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
    expect(mockRefundReservation).toHaveBeenCalledWith("resv-1");
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
          controllerLeaseExpiresAt: "2026-03-12T12:10:00.000Z",
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
      leaseExpiresAt: "2026-03-12T12:10:00.000Z",
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
  });
});
