import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetDb, mockCreateNotification, resetHarness } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const mockDb = {
    select: vi.fn(() => {
      const query: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(selectResults.shift() ?? []),
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(selectResults.shift() ?? []).then(resolve),
      };
      return query;
    }),
  } as any;

  return {
    mockDb,
    mockGetDb: vi.fn(() => mockDb),
    mockCreateNotification: vi.fn().mockResolvedValue({ notificationId: 1, deduplicated: false }),
    resetHarness: () => {
      selectResults.length = 0;
      mockDb.select.mockClear();
    },
  };
});

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../notificationService", () => ({ createNotification: mockCreateNotification }));
vi.mock("../../storage", () => ({
  storageDelete: vi.fn(),
  storagePresignGet: vi.fn(),
  storagePut: vi.fn(),
  storageResolveUrl: vi.fn(),
}));

describe("notifyAdminsOfPromptPaySlipSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it("notifies every admin with high-priority slip review details", async () => {
    mockDb.select
      .mockImplementationOnce(() => {
        const query: any = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ email: "customer@example.com" }]),
        };
        return query;
      })
      .mockImplementationOnce(() => {
        const query: any = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ id: 7 }, { id: 8 }]),
        };
        return query;
      });

    const { notifyAdminsOfPromptPaySlipSubmission } = await import("./promptpayDirectService");
    const result = await notifyAdminsOfPromptPaySlipSubmission({
      invoiceId: 10,
      invoiceNumber: "TH-INV-2026-000010",
      paymentId: 20,
      slipId: 30,
      userId: 40,
      fileName: "transfer-slip.png",
      uploadedAt: new Date("2026-08-21T01:00:00.000Z"),
    });

    expect(result).toEqual({ attempted: 2, sent: 2 });
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: 7,
      priority: "high",
      actionUrl: "/admin/billing",
      groupKey: "promptpay_slip_review:invoice:10",
      content: expect.stringContaining("customer@example.com"),
      metadata: expect.objectContaining({
        source: "billing",
        relatedItems: expect.objectContaining({ notificationType: "promptpay_slip_submitted" }),
      }),
    }));
    expect(mockCreateNotification).toHaveBeenNthCalledWith(2, expect.objectContaining({ userId: 8 }));
  });

  it("does not fail the upload flow when one admin notification fails", async () => {
    mockDb.select
      .mockImplementationOnce(() => {
        const query: any = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ email: "customer@example.com" }]),
        };
        return query;
      })
      .mockImplementationOnce(() => {
        const query: any = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ id: 7 }, { id: 8 }]),
        };
        return query;
      });
    mockCreateNotification
      .mockRejectedValueOnce(new Error("notification database unavailable"))
      .mockResolvedValueOnce({ notificationId: 2, deduplicated: false });

    const { notifyAdminsOfPromptPaySlipSubmission } = await import("./promptpayDirectService");
    await expect(notifyAdminsOfPromptPaySlipSubmission({
      invoiceId: 10,
      invoiceNumber: "TH-INV-2026-000010",
      paymentId: 20,
      slipId: 30,
      userId: 40,
      fileName: "transfer-slip.png",
      uploadedAt: new Date("2026-08-21T01:00:00.000Z"),
    })).resolves.toEqual({ attempted: 2, sent: 1 });
  });
});
