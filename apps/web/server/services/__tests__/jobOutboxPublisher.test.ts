import { describe, expect, it } from "vitest";

import { buildDispatchEventPayload, buildOperatorReviewPatch, requiresCloudflarePublishQuarantine } from "../jobOutboxPublisher";

describe("job outbox dispatch event payload", () => {
  it("omits optional transport references that are undefined", () => {
    expect(buildDispatchEventPayload({
      adapter: "postgres-pull",
      referenceNamespace: "postgres-pull",
      dispatchId: "dispatch-1",
      providerJobId: undefined,
      queueJobId: undefined,
      celeryTaskId: undefined,
      workflowInstanceId: undefined,
      containerInstanceId: undefined,
    })).toEqual({
      adapter: "postgres-pull",
      referenceNamespace: "postgres-pull",
      dispatchId: "dispatch-1",
    });
  });

  it("marks quarantined publication evidence as operator review", () => {
    expect(buildOperatorReviewPatch("adapter_contract_unsupported")).toEqual({
      operatorReviewRequired: true,
      operatorReviewReason: "adapter_contract_unsupported",
    });
    expect(buildOperatorReviewPatch("x".repeat(700)).operatorReviewReason).toHaveLength(500);
  });

  it("quarantines Cloudflare publication ambiguity until target dedupe evidence exists", () => {
    expect(requiresCloudflarePublishQuarantine("cloudflare-queues")).toBe(true);
    expect(requiresCloudflarePublishQuarantine("postgres-pull")).toBe(false);
    expect(requiresCloudflarePublishQuarantine("bullmq")).toBe(false);
  });
});
