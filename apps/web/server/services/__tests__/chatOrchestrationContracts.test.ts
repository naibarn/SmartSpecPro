import { describe, expect, it } from "vitest";

import {
  assertChatProjectionTenant,
  normalizeChatRequest,
  projectCanonicalJobToChat,
} from "../chatOrchestrationContracts";

describe("Feature 198 Chat orchestration contracts", () => {
  it("normalizes request identity without making UI state a Job truth", () => {
    const context = normalizeChatRequest({
      tenantId: "tenant-1",
      userId: 3,
      conversationId: "conversation-1",
      correlationId: "corr-1",
      text: "  make a plan  ",
      idempotencyKey: " request-1 ",
    });
    expect(context.text).toBe("make a plan");
    const projection = projectCanonicalJobToChat({
      context,
      correlationId: "corr-1",
      jobId: "job-1",
      status: "running",
    });
    expect(projection.state).toMatchObject({ kind: "running", jobId: "job-1" });
  });

  it("hydrates terminal and unknown-safe states from canonical status", () => {
    const context = normalizeChatRequest({
      tenantId: "tenant-1",
      userId: 3,
      conversationId: "conversation-1",
      correlationId: "corr-2",
      text: "run",
      idempotencyKey: "request-2",
    });
    expect(
      projectCanonicalJobToChat({
        context,
        correlationId: "corr-2",
        jobId: "job-2",
        status: "succeeded",
        resultRef: "artifact:2",
      }).state.kind
    ).toBe("succeeded");
    expect(
      projectCanonicalJobToChat({
        context,
        correlationId: "corr-2",
        jobId: "job-2",
        status: "expired",
        statusReason: "lease_expired",
      }).state.kind
    ).toBe("failed");
    expect(() =>
      assertChatProjectionTenant(
        projectCanonicalJobToChat({
          context,
          correlationId: "corr-2",
          jobId: "job-2",
          status: "running",
        }),
        { ...context, tenantId: "other" }
      )
    ).toThrowError(
      expect.objectContaining({ code: "CHAT_ORCHESTRATION_CONTRACT_INVALID" })
    );
    expect(() =>
      normalizeChatRequest({
        ...context,
        text: "run",
        idempotencyKey: "request-3",
        pageRoute: 42 as unknown as string,
      })
    ).toThrowError(
      expect.objectContaining({ code: "CHAT_ORCHESTRATION_CONTRACT_INVALID" })
    );
  });
});
