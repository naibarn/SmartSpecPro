import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import { postWorkUpdate } from "../roomService";

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    roomId: "room-1",
    runId: "run-1",
    senderType: "assistant",
    senderUserId: null,
    senderAssistantId: "assistant-1",
    recipientType: "all",
    recipientAssistantId: null,
    recipientGroupJson: null,
    turnType: "execution_update",
    visibility: "transparent",
    content: "Sanitized content",
    summaryContent: "Sanitized content",
    artifactRefsJson: null,
    memoryRefsJson: null,
    metadataJson: null,
    tokenUsageJson: null,
    createdAt: new Date("2026-03-19T00:00:00Z"),
    ...overrides,
  };
}

function makeDb(selectResults: unknown[][], returningRows: unknown[][]) {
  const queuedSelectResults = [...selectResults];
  const queuedInsertRows = [...returningRows];

  const limit = vi.fn().mockImplementation(() => Promise.resolve(queuedSelectResults.shift() ?? []));
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const returning = vi.fn().mockImplementation(() => Promise.resolve(queuedInsertRows.shift() ?? []));
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  return {
    select,
    from,
    where,
    limit,
    insert,
    values,
    returning,
  };
}

describe("roomService.postWorkUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores assistant work updates with structured metadata and artifact refs", async () => {
    const room = { id: "room-1", tenantId: "tenant-1" };
    const participant = {
      roomId: "room-1",
      participantAssistantId: "assistant-1",
      isMuted: false,
    };
    const inserted = makeMessage({
      artifactRefsJson: [{ artifactId: "artifact-1", label: "Draft article" }],
      metadataJson: {
        messageType: "revision",
        workItemId: "work-1",
      },
    });
    const db = makeDb([[room], [participant], []], [[inserted]]);
    mockGetDb.mockResolvedValue(db);

    const result = await postWorkUpdate({
      roomId: "room-1",
      tenantId: "tenant-1",
      senderAssistantId: "assistant-1",
      runId: "run-1",
      content: "Updated draft article with a stronger opening paragraph.",
      messageType: "revision",
      workItemId: "work-1",
      replyToMessageId: "msg-root",
      artifactRefs: [{ artifactId: "artifact-1", label: "Draft article" }],
      citationRefs: [{ id: "cite-1", title: "Market report" }],
    });

    expect(result).toEqual(inserted);
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({
      senderType: "assistant",
      senderAssistantId: "assistant-1",
      runId: "run-1",
      turnType: "execution_update",
      visibility: "transparent",
      artifactRefsJson: [{ artifactId: "artifact-1", label: "Draft article" }],
      metadataJson: expect.objectContaining({
        messageType: "revision",
        workItemId: "work-1",
        replyToMessageId: "msg-root",
        threadRootMessageId: "msg-root",
        citationRefs: [{ id: "cite-1", title: "Market report" }],
      }),
    }));
  });

  it("suppresses raw content for high sensitivity assistant updates", async () => {
    const room = { id: "room-1", tenantId: "tenant-1" };
    const participant = {
      roomId: "room-1",
      participantAssistantId: "assistant-1",
      isMuted: false,
    };
    const inserted = makeMessage({
      content: "Access token received from connector callback.",
      summaryContent: "Access token received from connector callback.",
    });
    const db = makeDb([[room], [participant], []], [[inserted]]);
    mockGetDb.mockResolvedValue(db);

    await postWorkUpdate({
      roomId: "room-1",
      tenantId: "tenant-1",
      senderAssistantId: "assistant-1",
      content: "Bearer super-secret-token from connector callback.",
      sensitivity: "high",
      metadataJson: {
        authHeader: "Bearer super-secret-token",
      },
    });

    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.not.stringContaining("super-secret-token"),
      summaryContent: expect.not.stringContaining("super-secret-token"),
      metadataJson: expect.objectContaining({
        roomRedaction: expect.objectContaining({
          applied: true,
          reason: "sensitive_payload",
        }),
        details: {
          authHeader: "[REDACTED]",
        },
      }),
    }));
  });
});
