import { describe, expect, it, vi } from "vitest";

import {
  deriveProviderOperationKey,
  deriveServerUserKey,
  getProviderSchedulerLimits,
  nextFairnessEligibleAt,
  selectFairProviderCandidates,
} from "../providerSchedulerPolicy";
import { runProviderSchedulerOnce, type ProviderQueueCandidate } from "../providerSchedulerService";
import { runProviderPollerOnce } from "../providerPollerService";

const now = new Date("2026-09-14T00:00:00.000Z");

function candidate(jobId: string, userKey: string, createdOffset = 0): ProviderQueueCandidate {
  return {
    jobId,
    userKey,
    tenantId: "tenant-1",
    businessAttempt: 1,
    provider: "wavespeed_ai",
    providerPoolKey: "media:wavespeed_ai:account-pool",
    logicalOperation: "generate",
    eligibleAt: now,
    priority: 0,
    createdAt: new Date(now.getTime() + createdOffset),
  };
}

describe("provider scheduler policy", () => {
  it("keeps provider defaults separate from durable queue admission", () => {
    expect(getProviderSchedulerLimits("kie.ai")).toMatchObject({
      submissionWindowSeconds: 10,
      submissionWindowMax: 18,
      providerMaxConcurrent: 50,
      userMaxConcurrent: 3,
    });
    expect(getProviderSchedulerLimits("wavespeed-ai")).toMatchObject({
      submissionWindowSeconds: 60,
      submissionWindowMax: 5,
      providerMaxConcurrent: 2,
    });
  });

  it("derives stable non-PII user and provider operation keys", () => {
    expect(deriveServerUserKey("tenant-1", 42)).toBe(deriveServerUserKey("tenant-1", 42));
    expect(deriveServerUserKey("tenant-1", 42)).not.toContain("tenant-1");
    expect(deriveProviderOperationKey({ jobId: "job-1", businessAttempt: 1, provider: "kie.ai", logicalOperation: "generate" }))
      .toBe(deriveProviderOperationKey({ jobId: "job-1", businessAttempt: 1, provider: "kie_ai", logicalOperation: "generate" }));
  });

  it("interleaves a waiting competitor and caps fairness cooldown at 15 seconds", () => {
    const selection = selectFairProviderCandidates({
      candidates: [candidate("a1", "user-a"), candidate("b1", "user-b", 1)],
      now,
      capacity: 2,
      competitorExists: true,
      lastSelectedUserKey: "user-a",
    });
    expect(selection.selected.map(item => item.userKey)).toEqual(["user-b", "user-a"]);
    expect(nextFairnessEligibleAt(now, 60_000).getTime() - now.getTime()).toBe(15_000);
  });

  it("does not resubmit after a lost response when provider inspection finds the task", async () => {
    const repository = {
      findCandidates: vi.fn().mockResolvedValue([candidate("job-1", "user-a")]),
      getCompetitorState: vi.fn().mockResolvedValue({ capacity: 1, competitorExists: false }),
      reserve: vi.fn().mockResolvedValue({
        kind: "reserved",
        reservation: {
          reservationId: "reservation-1",
          jobId: "job-1",
          businessAttempt: 1,
          provider: "wavespeed_ai",
          providerPoolKey: "media:wavespeed_ai:account-pool",
          operationKey: "feature-186:key",
        },
      }),
      markSubmitted: vi.fn(),
      markAmbiguous: vi.fn(),
    };
    const client = {
      submit: vi.fn().mockRejectedValue(new Error("response lost")),
      inspect: vi.fn().mockResolvedValue({ providerJobId: "wave-task-1" }),
    };

    const result = await runProviderSchedulerOnce({
      repository,
      clients: new Map([["wavespeed_ai", client]]),
      now,
    });

    expect(result).toMatchObject({ reserved: 1, submitted: 1, ambiguous: 0 });
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(client.inspect).toHaveBeenCalledTimes(1);
    expect(repository.markSubmitted).toHaveBeenCalledWith(expect.objectContaining({ providerJobId: "wave-task-1" }));
    expect(repository.markAmbiguous).not.toHaveBeenCalled();
  });
});

describe("callback-free provider poller", () => {
  it("releases no worker lease and persists the next poll for a pending task", async () => {
    const repository = {
      claimDue: vi.fn().mockResolvedValue([{
        reservationId: "reservation-1",
        jobId: "job-1",
        businessAttempt: 1,
        provider: "wavespeed_ai",
        providerPoolKey: "media:wavespeed_ai:account-pool",
        userKey: "user-a",
        operationKey: "operation-1",
        providerJobId: "wave-task-1",
        pollerLeaseTokenHash: "a".repeat(64),
        pollAttempt: 2,
        providerDeadlineAt: new Date(now.getTime() + 60 * 60_000),
      }]),
      recordObservation: vi.fn(),
      recordUnknown: vi.fn(),
    };
    const client = {
      inspect: vi.fn().mockResolvedValue({ status: "pending", providerStatus: "processing" }),
    };
    const result = await runProviderPollerOnce({
      repository,
      clients: new Map([["wavespeed_ai", client]]),
      now,
    });

    expect(result).toMatchObject({ claimed: 1, pending: 1, completed: 0, unknown: 0 });
    expect(repository.recordObservation).toHaveBeenCalledWith(expect.objectContaining({
      nextPollAt: new Date(now.getTime() + 20_000),
      record: expect.objectContaining({ pollerLeaseTokenHash: "a".repeat(64) }),
    }));
    expect(repository.recordUnknown).not.toHaveBeenCalled();
  });

  it("fails closed at the provider deadline instead of polling forever", async () => {
    const deadline = new Date(now.getTime());
    const repository = {
      claimDue: vi.fn().mockResolvedValue([{
        reservationId: "reservation-1",
        jobId: "job-1",
        businessAttempt: 1,
        provider: "kie_ai",
        providerPoolKey: "media:kie_ai:account-pool",
        userKey: "user-a",
        operationKey: "operation-1",
        providerJobId: "kie-task-1",
        pollerLeaseTokenHash: "b".repeat(64),
        pollAttempt: 99,
        providerDeadlineAt: deadline,
      }]),
      recordObservation: vi.fn(),
      recordUnknown: vi.fn(),
    };
    const result = await runProviderPollerOnce({
      repository,
      clients: new Map([["kie_ai", { inspect: vi.fn().mockResolvedValue({ status: "pending" }) }]]),
      now,
    });

    expect(result).toMatchObject({ claimed: 1, pending: 0, unknown: 1 });
    expect(repository.recordUnknown).toHaveBeenCalledWith(expect.objectContaining({ reason: "provider_deadline_reached" }));
  });
});
