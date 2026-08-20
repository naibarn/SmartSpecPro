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

  it("adds the reporter email to newly submitted feedback title and description", async () => {
    const values = vi.fn().mockReturnThis();
    const returning = vi.fn().mockResolvedValue([{ id: 359 }]);
    mockGetDb.mockResolvedValue({
      insert: vi.fn(() => ({ values, returning })),
    });

    await createCaller().submit({
      ticketType: "bug",
      title: "สร้าง prompt vdo ไม่ผ่าน",
      description: "สร้างไม่สำเร็จ",
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      title: "[admin@example.com] สร้าง prompt vdo ไม่ผ่าน",
      description: "Reporter: admin@example.com (user #1)\nสร้างไม่สำเร็จ",
    }));
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

  it("resolves affected user emails for an admin ticket detail", async () => {
    const ticket = {
      id: 354,
      tenantId: "tenant-ZCSKEM9s",
      submittedByType: "system",
      submittedBy: 42,
      ticketType: "bug",
      title: "[Auto][e4937deb] tRPC failure",
      description: "User ID: 42\nInsufficient credits",
      contextJson: { kind: "system_auto_report", affectedUserIds: [119] },
    };
    const ticketQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([ticket]),
    };
    const affectedUsersQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { id: 119, email: "user119@example.com" },
        { id: 42, email: "reporter@example.com" },
      ]),
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
    const queries = [ticketQuery, affectedUsersQuery, commentsQuery, attachmentsQuery];
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => queries.shift()),
    });

    const result = await createCaller().getTicket({ id: 354 });

    expect(result.affectedUsers).toEqual([
      { id: 119, email: "user119@example.com" },
    ]);
    expect(result.reporter).toEqual({ id: 42, email: "reporter@example.com" });
    expect(result.description).toBe(
      "Reporter: reporter@example.com (user #42)\nUser ID: 42\nInsufficient credits",
    );
  });

  it("resolves the reporter email for a legacy system ticket without affected IDs", async () => {
    const ticket = {
      id: 383,
      tenantId: "tenant-ZCSKEM9s",
      submittedByType: "system",
      submittedBy: 119,
      ticketType: "bug",
      title: "[System] สร้างร่างละเอียดเนื้อเรื่อง ล้มเหลวบางส่วน",
      description: "User ID: 119\nError: Insufficient credits",
      contextJson: null,
    };
    const ticketQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([ticket]),
    };
    const reporterQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { id: 119, email: "user119@example.com" },
      ]),
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
    const queries = [ticketQuery, reporterQuery, commentsQuery, attachmentsQuery];
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => queries.shift()),
    });

    const result = await createCaller().getTicket({ id: 383 });

    expect(result.reporter).toEqual({ id: 119, email: "user119@example.com" });
    expect(result.description).toBe(
      "Reporter: user119@example.com (user #119)\nUser ID: 119\nError: Insufficient credits",
    );
  });
});
