import { describe, expect, it } from "vitest";
import { reconcileVerticalDramaAssuranceAttempts } from "../verticalDramaAssuranceReconciliation";

const expiredAttempt = {
  tenantId: "tenant-a",
  executionId: "execution-1",
  attemptId: "attempt-1",
  fenceToken: 4,
  domainOwnerType: "draft",
  domainOwnerId: "draft-1",
  sourceFingerprint: "a".repeat(64),
  contextFingerprint: "b".repeat(64),
  state: "retryable_failed" as const,
};

describe("vertical drama assurance reconciliation", () => {
  it("recovers only an exact current baseline and is repeat-safe", async () => {
    const appended: string[] = [];
    const dependencies = {
      listExpiredAttempts: async () => [expiredAttempt],
      claimReconciliation: async () => ({ ok: true as const, fenceToken: 5 }),
      resolveDomain: async () => ({
        kind: "exact_baseline" as const,
        domainRef: "draft-version-4",
      }),
      resolveSideEffect: async () => ({ kind: "none" as const }),
      appendDecision: async (input: {
        eventIdempotencyKey: string;
        nextState: string;
      }) => {
        appended.push(input.eventIdempotencyKey);
        return {
          duplicate:
            appended.filter(key => key === input.eventIdempotencyKey).length >
            1,
          state: input.nextState,
        };
      },
    };
    const first = await reconcileVerticalDramaAssuranceAttempts(dependencies);
    const second = await reconcileVerticalDramaAssuranceAttempts(dependencies);
    expect(first.decisions[0]).toMatchObject({
      state: "recovered",
      disposition: "recovered_needs_repair",
    });
    expect(second.decisions[0]?.eventIdempotencyKey).toBe(
      first.decisions[0]?.eventIdempotencyKey
    );
  });

  it("blocks retries when provider or credit acceptance remains uncertain", async () => {
    const result = await reconcileVerticalDramaAssuranceAttempts({
      listExpiredAttempts: async () => [expiredAttempt],
      claimReconciliation: async () => ({ ok: true as const, fenceToken: 5 }),
      resolveDomain: async () => ({ kind: "missing" as const }),
      resolveSideEffect: async () => ({ kind: "uncertain" as const }),
      appendDecision: async (input: {
        eventIdempotencyKey: string;
        nextState: string;
      }) => ({ duplicate: false, state: input.nextState }),
    });
    expect(result.decisions[0]).toMatchObject({
      state: "reconciliation_required",
      nextAction: "await_provider_credit_reconciliation",
    });
  });
});
