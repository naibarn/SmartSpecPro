import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockCreateTransporter,
  mockGetSmtpConfig,
  mockResolveInvoiceDocumentAccess,
  resetHarness,
} = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
  } as any;

  return {
    mockGetDb: vi.fn(() => db),
    mockCreateTransporter: vi.fn(),
    mockGetSmtpConfig: vi.fn(),
    mockResolveInvoiceDocumentAccess: vi.fn(),
    resetHarness: () => {
      db.select.mockClear();
    },
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../emailService", () => ({
  createTransporter: mockCreateTransporter,
  getSmtpConfig: mockGetSmtpConfig,
}));

vi.mock("./documentAccess", () => ({
  resolveInvoiceDocumentAccess: mockResolveInvoiceDocumentAccess,
}));

describe("billing email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it("sends invoice email with document link when SMTP is available", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    mockCreateTransporter.mockResolvedValue({ sendMail });
    mockGetSmtpConfig.mockResolvedValue({
      fromName: "SmartAIHub",
      fromEmail: "billing@example.com",
    });
    mockResolveInvoiceDocumentAccess.mockResolvedValue({
      url: "https://files.example.com/invoice.pdf",
    });

    mockGetDb().select
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{ id: 10, userId: 1, invoiceNumber: "TH-INV-2026-000001" }]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{ email: "user@example.com", name: "Test User" }]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{ id: 99, invoiceId: 10 }]);
          return query;
        }),
      }));

    const { sendBillingNotificationEmail } = await import("./emailDelivery");
    await expect(
      sendBillingNotificationEmail({
        invoiceId: 10,
        notificationType: "invoice_issued",
      }),
    ).resolves.toBe(true);

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "user@example.com",
      subject: "Invoice available: TH-INV-2026-000001",
      html: expect.stringContaining("Download latest invoice PDF"),
    }));
  });
});
