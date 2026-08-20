import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockDb,
  resetHarness,
  mockCreateNotification,
} = vi.hoisted(() => {
  const insertResults: any[][] = [];
  const selectResults: any[][] = [];
  const mockDb = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        const query: any = {};
        query.where = vi.fn().mockReturnValue(query);
        query.limit = vi.fn().mockResolvedValue(selectResults.shift() ?? []);
        return query;
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue(insertResults.shift() ?? []),
        })),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  } as any;

  return {
    mockGetDb: vi.fn(() => mockDb),
    mockDb,
    resetHarness: () => {
      insertResults.length = 0;
      selectResults.length = 0;
      mockDb.select.mockClear();
      mockDb.insert.mockClear();
      mockDb.update.mockClear();
    },
    mockCreateNotification: vi.fn().mockResolvedValue({ notificationId: 99, deduplicated: false }),
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../notificationService", () => ({
  createNotification: mockCreateNotification,
}));

vi.mock("./runtimeConfig", () => ({
  getBillingRuntimeConfig: vi.fn(async () => ({
    BILLING_EMAIL_NOTIFICATIONS_ENABLED: false,
  })),
}));

describe("billing notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    delete process.env.BILLING_EMAIL_NOTIFICATIONS_ENABLED;
  });

  it("deduplicates notification dispatches when records already exist", async () => {
    const { shouldSendNotification } = await import("./notifications");
    mockDb.select.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const query: any = {};
        query.where = vi.fn().mockReturnValue(query);
        query.limit = vi.fn().mockResolvedValue([{ id: 1 }]);
        return query;
      }),
    }));

    await expect(shouldSendNotification("invoice_issued:invoice:1:in_app")).resolves.toBe(false);
  });

  it("creates an in-app invoice notification and suppresses email by default", async () => {
    mockDb.select.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const query: any = {};
        query.where = vi.fn().mockReturnValue(query);
        query.limit = vi.fn().mockResolvedValue([{ id: 5, userId: 1, invoiceNumber: "TH-INV-2026-000001", status: "payment_pending" }]);
        return query;
      }),
    }));
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn()
          .mockImplementationOnce(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 10, channel: "in_app" }]),
          }))
          .mockImplementationOnce(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 11, channel: "email" }]),
          })),
      })),
    }));

    const { sendInvoiceNotification } = await import("./notifications");
    const result = await sendInvoiceNotification({
      invoiceId: 5,
      notificationType: "invoice_issued",
    });

    expect(result).toEqual({ sent: true, reason: "sent" });
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("suppresses reminders when rate limit is already exhausted", async () => {
    const now = new Date();
    mockDb.select
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{ id: 7, userId: 4, invoiceNumber: "TH-INV-2026-000007", status: "payment_pending" }]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([
            { id: 1, userId: 4, invoiceId: 7, channel: "in_app", sentAt: now },
            { id: 2, userId: 4, invoiceId: 8, channel: "in_app", sentAt: now },
            { id: 3, userId: 4, invoiceId: 9, channel: "in_app", sentAt: now },
          ]);
          return query;
        }),
      }));
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn()
          .mockImplementationOnce(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 21, channel: "in_app" }]),
          }))
          .mockImplementationOnce(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 22, channel: "email" }]),
          })),
      })),
    }));

    const { sendInvoiceNotification } = await import("./notifications");
    const result = await sendInvoiceNotification({
      invoiceId: 7,
      notificationType: "invoice_due_reminder",
      variant: "day3",
    });

    expect(result).toEqual({ sent: false, reason: "suppressed" });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("suppresses due reminders after a PromptPay Direct slip is submitted", async () => {
    mockDb.select
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{ id: 12, userId: 4, invoiceNumber: "TH-INV-2026-000012", status: "payment_pending" }]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{ paymentChannel: "promptpay_direct_manual", status: "manual_review_required" }]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([]);
          return query;
        }),
      }));
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn()
          .mockImplementationOnce(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 31, channel: "in_app" }]),
          }))
          .mockImplementationOnce(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 32, channel: "email" }]),
          })),
      })),
    }));

    const { sendInvoiceNotification } = await import("./notifications");
    const result = await sendInvoiceNotification({
      invoiceId: 12,
      notificationType: "invoice_due_reminder",
      variant: "day6",
    });

    expect(result).toEqual({ sent: false, reason: "suppressed" });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
