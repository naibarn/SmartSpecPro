import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockStoragePut,
  mockRenderPdfFromHtml,
  resetHarness,
} = vi.hoisted(() => {
  const selectRowsQueue: any[][] = [];
  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        const query: any = {};
        query.where = vi.fn().mockReturnValue(query);
        query.orderBy = vi.fn().mockImplementation(() => {
          const rows = selectRowsQueue.shift() ?? [];
          const orderedQuery: any = {};
          orderedQuery.limit = vi.fn().mockResolvedValue(rows);
          orderedQuery.then = (resolve: (value: any[]) => void, reject?: (reason: unknown) => void) =>
            Promise.resolve(rows).then(resolve, reject);
          return orderedQuery;
        });
        query.limit = vi.fn().mockResolvedValue(selectRowsQueue.shift() ?? []);
        return query;
      }),
    })),
    transaction: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => cb({
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  } as any;

  return {
    mockGetDb: vi.fn(() => db),
    mockStoragePut: vi.fn().mockResolvedValue({
      key: "billing/invoices/10/th-v1.pdf",
      url: "/api/storage/files/billing/invoices/10/th-v1.pdf",
    }),
    mockRenderPdfFromHtml: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake", "utf8")),
    resetHarness: () => {
      selectRowsQueue.length = 0;
      db.select.mockClear();
      db.transaction.mockClear();
    },
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../storage", () => ({
  storagePut: mockStoragePut,
}));

vi.mock("../markdownExport", () => ({
  renderPdfFromHtml: mockRenderPdfFromHtml,
}));

describe("documentRendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it("renders and stores a new invoice PDF version", async () => {
    mockGetDb().select
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{
            id: 10,
            invoiceNumber: "TH-INV-2026-000001",
            status: "issued",
            currency: "THB",
            subtotal: "200.00",
            taxAmount: "14.00",
            totalAmount: "214.00",
            issuedAt: new Date("2026-04-01T00:00:00.000Z"),
            dueAt: new Date("2026-04-08T00:00:00.000Z"),
            headerVersion: 1,
            sellerSnapshotJson: { entityNameTh: "SmartSpecPro Co., Ltd." },
            buyerSnapshotJson: { legalNameTh: "Test Buyer" },
          }]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.orderBy = vi.fn().mockImplementation(() => {
            const rows = [{ description: "Monthly plan", quantity: "1.00", unitPrice: "200.00", amount: "200.00" }];
            const orderedQuery: any = {};
            orderedQuery.then = (resolve: (value: any[]) => void, reject?: (reason: unknown) => void) =>
              Promise.resolve(rows).then(resolve, reject);
            return orderedQuery;
          });
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{
            id: 77,
            invoiceId: 10,
            providerPaymentId: "beam_charge_77",
            providerReferenceId: "beam_ref_77",
            rawResponseJson: {
              paymentUrl: "https://beam.test/pay/77",
              qrCodeUrl: "https://beam.test/qr/77",
            },
          }]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.orderBy = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([]);
          return query;
        }),
      }));

    const { renderInvoiceDocument } = await import("./documentRendering");
    const result = await renderInvoiceDocument({
      invoiceId: 10,
      language: "th",
      reason: "initial_issue",
    });

    expect(mockRenderPdfFromHtml).toHaveBeenCalled();
    expect(mockRenderPdfFromHtml.mock.calls[0]?.[0]).toContain("Payment page: https://beam.test/pay/77");
    expect(mockRenderPdfFromHtml.mock.calls[0]?.[0]).toContain("Document version 1");
    expect(mockRenderPdfFromHtml.mock.calls[0]?.[0]).toContain("Beam ref: beam_charge_77");
    expect(mockStoragePut).toHaveBeenCalledWith(
      "billing/invoices/10/th-v1.pdf",
      expect.any(Buffer),
      "application/pdf",
    );
    expect(result).toEqual({
      storageKey: "billing/invoices/10/th-v1.pdf",
      url: "/api/storage/files/billing/invoices/10/th-v1.pdf",
      documentVersion: 1,
      language: "th",
    });
  });
});
