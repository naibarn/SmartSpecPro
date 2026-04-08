import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  resetHarness,
  queues,
} = vi.hoisted(() => {
  const selectRowsQueue: any[][] = [];
  const transactionSelectRowsQueue: any[][] = [];
  const insertedRowsQueue: any[][] = [];
  const updatedRowsQueue: any[][] = [];

  function buildSelectQuery(rows: any[]) {
    const query: any = {};
    query.where = vi.fn().mockReturnValue(query);
    query.orderBy = vi.fn().mockReturnValue(query);
    query.limit = vi.fn().mockResolvedValue(rows);
    query.then = (resolve: (value: any[]) => void, reject?: (reason: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject);
    return query;
  }

  const tx = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => buildSelectQuery(transactionSelectRowsQueue.shift() ?? [])),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockResolvedValue(insertedRowsQueue.shift() ?? []),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue(updatedRowsQueue.shift() ?? []),
        })),
      })),
    })),
  };

  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => buildSelectQuery(selectRowsQueue.shift() ?? [])),
    })),
    transaction: vi.fn().mockImplementation(async (cb: (trx: any) => Promise<any>) => cb(tx)),
  };

  return {
    mockGetDb: vi.fn(() => db),
    resetHarness: () => {
      selectRowsQueue.length = 0;
      transactionSelectRowsQueue.length = 0;
      insertedRowsQueue.length = 0;
      updatedRowsQueue.length = 0;
      db.select.mockClear();
      db.transaction.mockClear();
      tx.select.mockClear();
      tx.insert.mockClear();
      tx.update.mockClear();
    },
    queues: {
      selectRowsQueue,
      transactionSelectRowsQueue,
      insertedRowsQueue,
      updatedRowsQueue,
    },
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

describe("billing invoice domain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it("classifies Thailand billing profiles as domestic", async () => {
    const { classifyInvoiceStream } = await import("./invoiceDomain");
    expect(classifyInvoiceStream({ country: "Thailand" })).toBe("domestic");
    expect(classifyInvoiceStream({ country: "TH" })).toBe("domestic");
  });

  it("classifies non-Thai billing profiles as international", async () => {
    const { classifyInvoiceStream } = await import("./invoiceDomain");
    expect(classifyInvoiceStream({ country: "Singapore" })).toBe("international");
  });

  it("calculates totals from base price and tax rate", async () => {
    const { calculateInvoiceTotalsFromBasePrice } = await import("./invoiceDomain");
    expect(
      calculateInvoiceTotalsFromBasePrice({
        lineItems: [
          { quantity: 1, unitPrice: 100 },
          { quantity: 2, unitPrice: 50 },
        ],
        taxRatePercent: 7,
      }),
    ).toEqual({
      subtotal: "200.00",
      taxAmount: "14.00",
      totalAmount: "214.00",
      taxRatePercent: "7.0000",
      roundingPolicy: "half_up_2dp",
    });
  });

  it("previews invoice number from current sequence", async () => {
    queues.selectRowsQueue.push([
      { id: 1, prefix: "TH-INV", currentRunningNo: 12, stream: "domestic", documentType: "invoice", isActive: true },
    ]);

    const { previewInvoiceNumber } = await import("./invoiceDomain");
    await expect(
      previewInvoiceNumber({ tenantId: "tenant-a", stream: "domestic", year: 2026 }),
    ).resolves.toBe("TH-INV-2026-000013");
  });

  it("reserves the next invoice number by incrementing the sequence", async () => {
    queues.transactionSelectRowsQueue.push([
      { id: 9, prefix: "INT-INV", currentRunningNo: 99, stream: "international", documentType: "invoice", isActive: true },
    ]);
    queues.updatedRowsQueue.push([
      { id: 9, prefix: "INT-INV" },
    ]);

    const { reserveNextInvoiceNumber } = await import("./invoiceDomain");
    await expect(
      reserveNextInvoiceNumber({ tenantId: "tenant-a", stream: "international", year: 2026, actorUserId: 1 }),
    ).resolves.toEqual({
      sequenceId: 9,
      invoiceNumber: "INT-INV-2026-000100",
      runningNo: 100,
    });
  });
});
