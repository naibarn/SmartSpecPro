import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.fn();

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

import { feedbackRouter } from "../feedback";

function createCaller() {
  return feedbackRouter.createCaller({
    user: {
      id: 1,
      openId: "admin-open-id",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      currentTenantId: "tenant-ZCSKEM9s",
    },
    tenantId: "tenant-ZCSKEM9s",
    userToken: null,
    privateVaultToken: null,
    protectedSurfaceToken: null,
    publicUrl: "https://smartaihub.app",
    req: { ip: "127.0.0.1", headers: {}, protocol: "https" } as any,
    res: {} as any,
  });
}

describe("feedback admin tenant scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows an admin to open a legacy unscoped system ticket from a notification", async () => {
    const ticket = {
      id: 262,
      tenantId: null,
      submittedByType: "system",
      ticketType: "bug",
      title: "[Auto][646013ea] Media generation failed (image)",
      comments: [],
      attachments: [],
    };
    const ticketQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([ticket]),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    const commentsQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    const attachmentsQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    const queries = [ticketQuery, commentsQuery, attachmentsQuery];
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => queries.shift()),
    });

    const result = await createCaller().getTicket({ id: 262 });

    expect(result.id).toBe(262);
    expect(result.submittedByType).toBe("system");
  });
});
