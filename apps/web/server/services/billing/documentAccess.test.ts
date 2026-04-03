import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockStoragePresignGet,
  mockStorageResolveUrl,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockStoragePresignGet: vi.fn(),
  mockStorageResolveUrl: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../storage", () => ({
  storagePresignGet: mockStoragePresignGet,
  storageResolveUrl: mockStorageResolveUrl,
}));

describe("documentAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoragePresignGet.mockResolvedValue(null);
    mockStorageResolveUrl.mockResolvedValue("/api/storage/files/billing/invoice-1.pdf");
  });

  it("falls back to storage proxy when presigning is unavailable", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockGetDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([
            { id: 1, invoiceId: 10, pdfFileUrl: "billing/invoice-1.pdf" },
          ]);
          return query;
        }),
      })),
      insert: vi.fn(() => ({
        values: insertValues,
      })),
    });

    const { resolveInvoiceDocumentAccess } = await import("./documentAccess");
    const access = await resolveInvoiceDocumentAccess({
      invoiceId: 10,
      documentId: 1,
      actorUserId: 55,
      actorType: "admin",
    });

    expect(access).toEqual({
      document: { id: 1, invoiceId: 10, pdfFileUrl: "billing/invoice-1.pdf" },
      url: "/api/storage/files/billing/invoice-1.pdf",
    });
    expect(insertValues).toHaveBeenCalled();
  });
});
