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
  storagePut: vi.fn(),
  storagePresignGet: mockStoragePresignGet,
  storageResolveUrl: mockStorageResolveUrl,
}));

describe("billing recovery evidence access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoragePresignGet.mockResolvedValue({ url: "https://signed.example/evidence.pdf" });
    mockStorageResolveUrl.mockResolvedValue("/api/storage/files/billing/evidence.pdf");
  });

  it("returns signed access and records an audit log for recovery evidence", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    let selectCount = 0;
    mockGetDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => {
          selectCount += 1;
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockImplementation(async () => {
            if (selectCount === 1) {
              return [{
                id: 9,
                invoiceId: 123,
                evidenceJson: {
                  attachments: [{ objectKey: "billing/evidence.pdf", name: "evidence.pdf" }],
                },
              }];
            }
            if (selectCount === 2) {
              return [{ id: 123 }];
            }
            return [];
          });
          return query;
        }),
      })),
      insert: vi.fn(() => ({
        values: insertValues,
      })),
    });

    const { resolveSupportRecoveryEvidenceAccess } = await import("./recovery");
    const result = await resolveSupportRecoveryEvidenceAccess({
      recoveryCaseId: 9,
      attachmentIndex: 0,
      actorUserId: 55,
    });

    expect(result.url).toBe("https://signed.example/evidence.pdf");
    expect(insertValues).toHaveBeenCalled();
  });
});
