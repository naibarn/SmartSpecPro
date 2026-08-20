import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetDb, mockCreateNotification, mockProcessTicket } = vi.hoisted(() => {
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  return {
    mockDb: db,
    mockGetDb: vi.fn().mockResolvedValue(db),
    mockCreateNotification: vi.fn().mockResolvedValue({ notificationId: 1, deduplicated: false }),
    mockProcessTicket: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../notificationService", () => ({ createNotification: mockCreateNotification }));
vi.mock("../virtualAdmin/feedbackProcessor", () => ({ processTicket: mockProcessTicket }));

import { reportSystemFailure } from "../systemAutoReportService";

describe("systemAutoReportService credit routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.limit.mockReset();
    mockDb.limit.mockResolvedValue([]);
    mockDb.returning.mockResolvedValue([{ id: 99 }]);
  });

  it("notifies the affected user and does not create an admin ticket for ordinary credit failure", async () => {
    mockDb.limit.mockResolvedValueOnce([{ tenantId: "tenant-1", email: "user@example.com" }]);

    await reportSystemFailure({
      source: "trpc",
      userId: 7,
      title: "tRPC chat.complete failed",
      errorMessage: "Insufficient credits. Required: 100",
      path: "chat.complete",
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      actionUrl: "/credits",
      priority: "normal",
      groupKey: "credit-failure:user_purchase:7",
    }));
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockProcessTicket).not.toHaveBeenCalled();
  });

  it("creates a high-priority ticket for a suspicious user-credit request", async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ tenantId: "tenant-1", email: "user@example.com" }])
      .mockResolvedValueOnce([]);

    await reportSystemFailure({
      source: "trpc",
      userId: 7,
      tenantId: "tenant-1",
      title: "tRPC chat.complete failed",
      errorMessage: "Insufficient credits. Required: 3001",
      path: "chat.complete",
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      priority: "high",
    }));
    expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
      priority: "high",
      severity: "high",
      description: expect.stringContaining("user@example.com"),
      contextJson: expect.objectContaining({
        creditFailure: expect.objectContaining({ route: "admin_suspicious", requestedCredits: 3001 }),
        affectedUserIds: [7],
      }),
    }));
    expect(mockProcessTicket).toHaveBeenCalledWith(99);
  });

  it("creates a critical ticket for provider-account credit failure", async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ tenantId: "tenant-1", email: "user@example.com" }])
      .mockResolvedValueOnce([]);

    await reportSystemFailure({
      source: "trpc",
      userId: 7,
      tenantId: "tenant-1",
      title: "tRPC media.generate failed",
      errorMessage: "OpenRouter account balance is insufficient",
      path: "media.generate",
      creditContext: { source: "provider", provider: "openrouter", modelKind: "llm" },
    });

    expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
      priority: "critical",
      severity: "critical",
      contextJson: expect.objectContaining({
        creditFailure: expect.objectContaining({ route: "admin_provider", provider: "openrouter" }),
      }),
    }));
  });
});
