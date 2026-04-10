import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../workerArtifactService", () => ({
  publishWorkerArtifacts: vi.fn(),
}));

vi.mock("../roomService", () => ({
  sendMessage: vi.fn(),
}));

vi.mock("../monitoringService", () => ({
  recordEvent: vi.fn(),
}));

vi.mock("../notificationService", () => ({
  createNotification: vi.fn(),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: vi.fn(),
  },
}));

import { publishWorkerArtifacts } from "../workerArtifactService";
import { sendMessage } from "../roomService";
import { createNotification } from "../notificationService";
import { recordEvent } from "../monitoringService";
import { publishWorkerCallback, WorkerCallbackError } from "../workerCallbackService";

const mockPublishWorkerArtifacts = vi.mocked(publishWorkerArtifacts);
const mockSendMessage = vi.mocked(sendMessage);
const mockCreateNotification = vi.mocked(createNotification);
const mockRecordEvent = vi.mocked(recordEvent);

describe("workerCallbackService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WORKER_CALLBACK_ALLOWED_DOMAINS;
    mockPublishWorkerArtifacts.mockResolvedValue([]);
    mockSendMessage.mockResolvedValue({ id: "message-1" } as any);
    mockCreateNotification.mockResolvedValue({ notificationId: 77, deduplicated: false } as any);
    mockRecordEvent.mockResolvedValue({ id: "event-1" } as any);
  });

  it("rejects non-allowlisted external callback URLs", async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: "job-1",
        tenantId: "tenant-1",
        requestedByUserId: 7,
        inputJson: { roomId: "room-1", runId: "run-1", teamId: "team-1" },
      }),
      getRunContext: vi.fn(),
      findCallbackEvent: vi.fn().mockResolvedValue(null),
      insertCallbackEvent: vi.fn(),
    };

    await expect(
      publishWorkerCallback({
        tenantId: "tenant-1",
        jobId: "job-1",
        channel: "room_update",
        idempotencyKey: "cb-1",
        payload: {
          summary: "Done",
          links: [{ label: "Dashboard", url: "https://evil.example.test/result" }],
        },
      }, { repo }),
    ).rejects.toBeInstanceOf(WorkerCallbackError);
  });

  it("returns replayed=true when the callback idempotency key already exists", async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: "job-1",
        tenantId: "tenant-1",
        requestedByUserId: 7,
      }),
      getRunContext: vi.fn(),
      findCallbackEvent: vi.fn().mockResolvedValue({
        payloadJson: {
          publishedArtifactCount: 1,
          roomMessageId: "message-9",
        },
      }),
      insertCallbackEvent: vi.fn(),
    };

    const result = await publishWorkerCallback({
      tenantId: "tenant-1",
      jobId: "job-1",
      channel: "room_update",
      idempotencyKey: "cb-1",
      payload: {
        summary: "Already sent",
      },
    }, { repo });

    expect(result).toEqual(expect.objectContaining({
      accepted: false,
      replayed: true,
      roomMessageId: "message-9",
    }));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("publishes room updates with published artifact links", async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: "job-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        requestedByUserId: 7,
        inputJson: { roomId: "room-1", runId: "run-1", teamId: "team-1" },
      }),
      getRunContext: vi.fn(),
      findCallbackEvent: vi.fn().mockResolvedValue(null),
      insertCallbackEvent: vi.fn().mockResolvedValue({ id: "evt-1" }),
    };
    mockPublishWorkerArtifacts.mockResolvedValue([
      {
        artifactId: "artifact-1",
        publishedItemId: 88,
        created: true,
        indexStatus: "queued",
        safeServing: "inline",
      },
    ]);

    const result = await publishWorkerCallback({
      tenantId: "tenant-1",
      jobId: "job-1",
      channel: "room_update",
      idempotencyKey: "cb-2",
      payload: {
        summary: "Presentation finished",
        publishArtifacts: true,
      },
    }, { repo });

    expect(mockPublishWorkerArtifacts).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      jobId: "job-1",
      actorUserId: 7,
    });
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-1",
      tenantId: "tenant-1",
      senderType: "system",
      content: expect.stringContaining("/library?itemId=88"),
    }));
    expect(result).toEqual(expect.objectContaining({
      accepted: true,
      replayed: false,
      publishedArtifactCount: 1,
      roomMessageId: "message-1",
    }));
  });

  it("normalizes typed callback metadata into room updates and callback events", async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: "job-browser-1",
        tenantId: "tenant-1",
        workerId: "worker-1",
        requestedByUserId: 7,
        inputJson: { roomId: "room-1", runId: "run-1", teamId: "team-1" },
      }),
      getRunContext: vi.fn(),
      findCallbackEvent: vi.fn().mockResolvedValue(null),
      insertCallbackEvent: vi.fn().mockResolvedValue({ id: "evt-browser-1" }),
    };

    await publishWorkerCallback({
      tenantId: "tenant-1",
      jobId: "job-browser-1",
      channel: "room_update",
      idempotencyKey: "cb-browser-typed",
      payload: {
        summary: "Browser queue requires review",
        metadataJson: {
          lane: "browser",
          sessionId: "lbs_demo_123",
          currentUrl: "https://example.com/checkout",
          pageTitle: "Checkout",
          browserSession: {
            sessionId: "lbs_demo_123",
            state: "review_required",
            pageTitle: "Checkout",
            url: "https://example.com/checkout",
          },
          browserPayload: {
            stage: "review_gate",
            sessionId: "lbs_demo_123",
            currentUrl: "https://example.com/checkout",
          },
        },
      },
    }, { repo });

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      metadataJson: expect.objectContaining({
        callbackMetadata: expect.objectContaining({
          lane: "browser",
          sessionId: "lbs_demo_123",
          browserSession: expect.objectContaining({
            state: "review_required",
          }),
        }),
      }),
    }));
    expect(repo.insertCallbackEvent).toHaveBeenCalledWith("job-browser-1", "room_update", expect.objectContaining({
      metadataJson: expect.objectContaining({
        lane: "browser",
        sessionId: "lbs_demo_123",
      }),
    }));
  });
});
