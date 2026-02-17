import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  trackEmailVerified,
  trackFirstConversation,
  trackFirstLlmRequest,
  trackFirstMediaGeneration,
  trackPurchaseCompleted,
  trackSignupCompleted,
  trackSubscriptionStarted,
  type MilestoneDeps,
} from "./funnelMilestones";

function createDeps() {
  const seen = new Set<string>();
  const emitCounter = vi.fn<(milestone: string, outcome: string) => void>();

  const trackEvent = vi.fn(async (input: {
    tenantId: string;
    userId?: number | null;
    eventName: string;
  }) => {
    const key = `${input.tenantId}:${input.userId ?? "anon"}:${input.eventName}`;
    if (seen.has(key)) {
      return {
        status: "duplicate_ignored" as const,
        eventKey: key,
        sideChannelErrors: [],
        durationMs: 1,
      };
    }
    seen.add(key);
    return {
      status: "inserted" as const,
      eventKey: key,
      sideChannelErrors: [],
      durationMs: 1,
    };
  });

  const hasExistingMilestone = vi.fn(async (input: {
    tenantId: string;
    userId?: number | null;
    eventName: string;
  }) => seen.has(`${input.tenantId}:${input.userId ?? "anon"}:${input.eventName}`));

  const deps: MilestoneDeps = {
    now: () => new Date("2026-02-16T10:00:00.000Z"),
    trackEvent,
    hasExistingMilestone,
    emitCounter,
    logger: { warn: vi.fn() },
  };

  return {
    deps,
    emitCounter,
    hasExistingMilestone,
    trackEvent,
  };
}

describe("funnel milestones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits signup and email verification milestones exactly once", async () => {
    const { deps, trackEvent } = createDeps();

    const signupFirst = await trackSignupCompleted(
      {
        tenantId: "tenant-01",
        domain: "example.com",
        userId: 7,
        source: "trpc.auth.register",
        plan: "free",
        channel: "email",
      },
      deps,
    );
    const signupSecond = await trackSignupCompleted(
      {
        tenantId: "tenant-01",
        domain: "example.com",
        userId: 7,
        source: "trpc.auth.register",
        plan: "free",
        channel: "email",
      },
      deps,
    );

    const verifiedFirst = await trackEmailVerified(
      {
        tenantId: "tenant-01",
        domain: "example.com",
        userId: 7,
        source: "trpc.auth.verifyEmail",
        plan: "free",
        channel: "email",
      },
      deps,
    );
    const verifiedSecond = await trackEmailVerified(
      {
        tenantId: "tenant-01",
        domain: "example.com",
        userId: 7,
        source: "trpc.auth.verifyEmail",
        plan: "free",
        channel: "email",
      },
      deps,
    );

    expect(signupFirst.status).toBe("inserted");
    expect(signupSecond.status).toBe("skipped_existing");
    expect(verifiedFirst.status).toBe("inserted");
    expect(verifiedSecond.status).toBe("skipped_existing");
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it("keeps first conversation, first llm, and first media single-count under retries", async () => {
    const { deps, trackEvent } = createDeps();
    const input = {
      tenantId: "tenant-01",
      domain: "example.com",
      userId: 11,
      source: "integration-test",
      plan: "pro",
      channel: "api",
    };

    await trackFirstConversation(input, deps);
    await trackFirstConversation(input, deps);

    await trackFirstLlmRequest(input, deps);
    await trackFirstLlmRequest(input, deps);

    await trackFirstMediaGeneration(input, deps);
    await trackFirstMediaGeneration(input, deps);

    expect(trackEvent).toHaveBeenCalledTimes(3);
  });

  it("emits purchase and subscription milestones with canonical names and attribution properties", async () => {
    const { deps, trackEvent } = createDeps();

    await trackPurchaseCompleted(
      {
        tenantId: "tenant-02",
        domain: "example.com",
        userId: 22,
        source: "billing.creditService",
        plan: "pro",
        channel: "webhook",
        attribution: { paymentProvider: "stripe", campaign: "q1" },
        properties: { creditsAdded: 500, amountUsd: 19.99 },
      },
      deps,
    );

    await trackSubscriptionStarted(
      {
        tenantId: "tenant-02",
        domain: "example.com",
        userId: 22,
        source: "billing.creditService",
        plan: "pro",
        channel: "webhook",
        attribution: { paymentProvider: "stripe", interval: "monthly" },
        properties: { creditsAdded: 1000, amountUsd: 29.99 },
      },
      deps,
    );

    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent.mock.calls[0]?.[0]).toMatchObject({
      eventName: "purchase_completed",
      properties: expect.objectContaining({
        source: "billing.creditService",
        plan: "pro",
        channel: "webhook",
        attribution: {
          paymentProvider: "stripe",
          campaign: "q1",
        },
        creditsAdded: 500,
      }),
    });
    expect(trackEvent.mock.calls[1]?.[0]).toMatchObject({
      eventName: "subscription_started",
      properties: expect.objectContaining({
        source: "billing.creditService",
        plan: "pro",
        channel: "webhook",
        attribution: {
          paymentProvider: "stripe",
          interval: "monthly",
        },
        creditsAdded: 1000,
      }),
    });
  });

  it("does not throw when tracking fails and records failure counters", async () => {
    const { deps, emitCounter } = createDeps();
    deps.trackEvent = vi.fn().mockRejectedValue(new Error("tracker down"));

    const result = await trackFirstLlmRequest(
      {
        tenantId: "tenant-03",
        domain: "example.com",
        userId: 33,
        source: "llm.proxy",
      },
      deps,
    );

    expect(result.status).toBe("failed");
    expect(emitCounter).toHaveBeenCalledWith("first_llm_request", "failed");
  });

  it("prevents multiple distinct first-event records from a single source milestone", async () => {
    const { deps, hasExistingMilestone, trackEvent } = createDeps();

    const first = await trackFirstMediaGeneration(
      {
        tenantId: "tenant-05",
        domain: "example.com",
        userId: 55,
        source: "media.generateVideo",
        properties: {
          model: "veo-3-1",
        },
      },
      deps,
    );

    const second = await trackFirstMediaGeneration(
      {
        tenantId: "tenant-05",
        domain: "example.com",
        userId: 55,
        source: "media.generateVideo",
        properties: {
          model: "kling-2.6",
        },
      },
      deps,
    );

    expect(first.status).toBe("inserted");
    expect(second.status).toBe("skipped_existing");
    expect(hasExistingMilestone).toHaveBeenCalledTimes(2);
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});
