import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockGetBillingProfileForUser,
  mockGetSellerProfileForTenant,
  mockReserveNextInvoiceNumber,
  mockRenderInvoiceDocument,
  mockSendInvoiceNotification,
  pushLineItems,
  resetHarness,
} = vi.hoisted(() => {
  const invoiceQueue: any[] = [];
  const lineItemsQueue: any[] = [];
  const txInsertCalls: any[] = [];
  const txUpdateCalls: any[] = [];

  const tx = {
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((payload: any) => {
        txUpdateCalls.push(payload);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((payload: any) => {
        txInsertCalls.push(payload);
        return {
          returning: vi.fn().mockResolvedValue([{ id: 777, invoiceNumber: "TH-INV-2026-000777", defaultDocumentLanguage: "th", status: "paid" }]),
        };
      }),
    })),
  };

  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => {
        const query: any = {};
        query.where = vi.fn().mockImplementation(() => {
          if (table?.[Symbol.for("drizzle:Name")] === "invoice_line_items" || String(table).includes("invoice_line_items")) {
            return Promise.resolve(lineItemsQueue.shift() ?? []);
          }
          return query;
        });
        query.limit = vi.fn().mockResolvedValue([invoiceQueue.shift()]);
        return query;
      }),
    })),
    transaction: vi.fn().mockImplementation(async (cb: (trx: any) => Promise<any>) => cb(tx)),
  } as any;

  return {
    mockGetDb: vi.fn(() => db),
    mockGetBillingProfileForUser: vi.fn(),
    mockGetSellerProfileForTenant: vi.fn(),
    mockReserveNextInvoiceNumber: vi.fn(),
    mockRenderInvoiceDocument: vi.fn(),
    mockSendInvoiceNotification: vi.fn(),
    pushLineItems: (rows: any[]) => {
      lineItemsQueue.push(rows);
    },
    resetHarness: () => {
      invoiceQueue.length = 0;
      lineItemsQueue.length = 0;
      txInsertCalls.length = 0;
      txUpdateCalls.length = 0;
      db.select.mockClear();
      db.transaction.mockClear();
      tx.update.mockClear();
      tx.insert.mockClear();
    },
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("./profiles", () => ({
  getBillingProfileForUser: mockGetBillingProfileForUser,
  getSellerProfileForTenant: mockGetSellerProfileForTenant,
}));

vi.mock("./invoiceDomain", () => ({
  reserveNextInvoiceNumber: mockReserveNextInvoiceNumber,
}));

vi.mock("./documentRendering", () => ({
  renderInvoiceDocument: mockRenderInvoiceDocument,
}));

vi.mock("./notifications", () => ({
  sendInvoiceNotification: mockSendInvoiceNotification,
}));

describe("documentOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it("syncs unpaid invoice headers and regenerates the document", async () => {
    mockGetDb().select
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{
            id: 55,
            status: "payment_pending",
            tenantId: "tenant-a",
            userId: 11,
            headerVersion: 2,
            defaultDocumentLanguage: "th",
            sellerSnapshotJson: { entityNameTh: "Old Seller" },
            buyerSnapshotJson: { legalNameTh: "Old Buyer" },
          }]);
          return query;
        }),
      }));

    mockGetSellerProfileForTenant.mockResolvedValue({ entityNameTh: "New Seller" });
    mockGetBillingProfileForUser.mockResolvedValue({ legalNameTh: "New Buyer" });
    mockRenderInvoiceDocument.mockResolvedValue({ documentVersion: 3 });

    const { syncInvoiceHeader } = await import("./documentOperations");
    const result = await syncInvoiceHeader({
      invoiceId: 55,
      actorUserId: 900,
      scope: "both",
      reason: "admin correction",
    });

    expect(mockRenderInvoiceDocument).toHaveBeenCalledWith({
      invoiceId: 55,
      language: "th",
      reason: "sync_header",
      renderedByType: "admin",
      renderedById: 900,
    });
    expect(result).toEqual({ documentVersion: 3 });
  });

  it("replaces a paid invoice with a new reissued document", async () => {
    mockGetDb().select
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{
            id: 66,
            tenantId: "tenant-a",
            invoiceNumber: "TH-INV-2026-000066",
            invoiceStream: "domestic",
            taxPolicyId: 8,
            invoiceType: "subscription_renewal",
            userId: 15,
            subscriptionId: 42,
            orderId: "renew-42",
            status: "paid",
            currency: "THB",
            subtotal: "200.00",
            taxAmount: "14.00",
            totalAmount: "214.00",
            dueAt: new Date("2026-04-08T00:00:00.000Z"),
            paidAt: new Date("2026-04-02T00:00:00.000Z"),
            sellerSnapshotJson: { entityNameTh: "Old Seller" },
            buyerSnapshotJson: { legalNameTh: "Old Buyer" },
            totalsSnapshotJson: { totalAmount: "214.00" },
            defaultDocumentLanguage: "th",
            billingCycleStart: new Date("2026-04-01T00:00:00.000Z"),
            billingCycleEnd: new Date("2026-04-30T23:59:59.000Z"),
            documentAccessScope: "owner_or_admin",
          }]);
          return query;
        }),
      }));

    mockGetSellerProfileForTenant.mockResolvedValue({ entityNameTh: "Corrected Seller" });
    mockGetBillingProfileForUser.mockResolvedValue({ legalNameTh: "Corrected Buyer" });
    mockReserveNextInvoiceNumber.mockResolvedValue({ invoiceNumber: "TH-INV-2026-000777" });
    mockRenderInvoiceDocument.mockResolvedValue({ documentVersion: 1 });
    mockSendInvoiceNotification.mockResolvedValue({ delivered: true });
    pushLineItems([
      {
        itemType: "subscription_plan",
        description: "Monthly Pro",
        quantity: "1.00",
        unitPrice: "200.00",
        amount: "200.00",
        metadataJson: { planCode: "pro" },
      },
    ]);

    const { replacePaidInvoice } = await import("./documentOperations");
    const result = await replacePaidInvoice({
      invoiceId: 66,
      actorUserId: 901,
      reason: "correct legal header",
    });

    expect(mockReserveNextInvoiceNumber).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      stream: "domestic",
      actorUserId: 901,
    });
    expect(mockRenderInvoiceDocument).toHaveBeenCalledWith({
      invoiceId: 777,
      language: "th",
      reason: "reissue_render",
      renderedByType: "admin",
      renderedById: 901,
    });
    expect(mockSendInvoiceNotification).toHaveBeenCalledWith({
      invoiceId: 777,
      notificationType: "invoice_reissued",
      actorUserId: 901,
    });
    expect(result).toEqual(expect.objectContaining({
      id: 777,
      invoiceNumber: "TH-INV-2026-000777",
    }));
  });
});
