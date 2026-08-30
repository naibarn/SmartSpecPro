import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.fn();
const mockCheckPublicContactAbuse = vi.fn();

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

vi.mock("../../services/virtualAdmin/feedbackProcessor", () => ({
  processTicket: vi.fn().mockResolvedValue({
    autoCategory: "question",
    autoPriority: "normal",
    autoSummary: null,
    duplicateOf: null,
    relatedIncidentId: null,
  }),
}));

vi.mock("../../services/publicContactAbuseGuard", () => ({
  checkPublicContactAbuse: (...args: unknown[]) =>
    mockCheckPublicContactAbuse(...args),
}));

vi.mock("../../services/publicContactProtectionSettings", () => ({
  getPublicContactProtectionConfig: vi.fn().mockResolvedValue({
    siteKey: null,
    secretKey: null,
    allowedHostnames: [],
    required: false,
    configured: false,
  }),
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

function createPublicCaller() {
  return feedbackRouter.createCaller({
    user: null,
    tenantId: "tenant-ZCSKEM9s",
    userToken: null,
    privateVaultToken: null,
    protectedSurfaceToken: null,
    publicUrl: "https://smartaihub.app",
    req: { ip: "198.51.100.10", headers: {}, protocol: "https" } as any,
    res: {} as any,
  });
}

describe("feedback admin tenant scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPublicContactAbuse.mockResolvedValue({ allowed: true });
  });

  it("returns the System / Auto count in admin stats", async () => {
    mockGetDb.mockResolvedValue({
      execute: vi.fn().mockResolvedValue([
        {
          total: "4",
          new_count: "2",
          triaged_count: "0",
          in_progress_count: "1",
          resolved_count: "0",
          human_count: "3",
          system_count: "1",
          unread_count: "2",
          overdue_unread_count: "1",
        },
      ]),
    });

    await expect(createCaller().stats()).resolves.toMatchObject({
      total: 4,
      human: 3,
      system: 1,
      unread: 2,
      overdueUnread: 1,
    });
  });

  it("routes anonymous public sales contact to the feedback inbox as critical", async () => {
    const values = vi.fn().mockReturnThis();
    const returning = vi.fn().mockResolvedValue([{ id: 362 }]);
    mockGetDb.mockResolvedValue({
      insert: vi.fn(() => ({ values, returning })),
    });

    await createPublicCaller().submitPublicContact({
      contactType: "sales",
      name: "Public Visitor",
      email: "visitor@example.com",
      company: "Example Co",
      subject: "Enterprise demo",
      message: "Please contact our team.",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-ZCSKEM9s",
        submittedBy: null,
        submittedByType: "human",
        ticketType: "question",
        priority: "critical",
        category: "public_sales_enterprise",
        title: "[Public Contact][Sales & Enterprise] Enterprise demo",
        description: expect.stringContaining("Email: visitor@example.com"),
        contextJson: expect.objectContaining({
          source: "public_contact",
          contactType: "sales",
          reporterEmail: "visitor@example.com",
        }),
      })
    );
    expect(mockCheckPublicContactAbuse).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: "198.51.100.10",
        email: "visitor@example.com",
      })
    );
  });

  it("does not apply anonymous bot verification to an authenticated public caller", async () => {
    const values = vi.fn().mockReturnThis();
    const returning = vi.fn().mockResolvedValue([{ id: 363 }]);
    mockGetDb.mockResolvedValue({
      insert: vi.fn(() => ({ values, returning })),
    });

    await createCaller().submitPublicContact({
      contactType: "support",
      name: "Signed-in User",
      email: "user@example.com",
      subject: "Account help",
      message: "Please help.",
    });

    expect(mockCheckPublicContactAbuse).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ submittedBy: 1, priority: "normal" })
    );
  });

  it("returns only public Turnstile configuration to anonymous callers", async () => {
    const result = await createPublicCaller().publicContactConfig();

    expect(result).toEqual({
      turnstileRequired: false,
      turnstileConfigured: false,
      turnstileSiteKey: null,
    });
    expect(result).not.toHaveProperty("secretKey");
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

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[admin@example.com] สร้าง prompt vdo ไม่ผ่าน",
        description: "Reporter: admin@example.com (user #1)\nสร้างไม่สำเร็จ",
        priority: "normal",
      })
    );
  });

  it("persists critical priority for explicitly urgent feedback", async () => {
    const values = vi.fn().mockReturnThis();
    const returning = vi.fn().mockResolvedValue([{ id: 360 }]);
    mockGetDb.mockResolvedValue({
      insert: vi.fn(() => ({ values, returning })),
    });

    await createCaller().submit({
      ticketType: "bug",
      title: "ระบบใช้งานไม่ได้",
      priority: "critical",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: "critical",
      })
    );
  });

  it("rejects unsupported feedback priorities", async () => {
    const values = vi.fn().mockReturnThis();
    const returning = vi.fn().mockResolvedValue([{ id: 361 }]);
    mockGetDb.mockResolvedValue({
      insert: vi.fn(() => ({ values, returning })),
    });

    await expect(
      createCaller().submit({
        ticketType: "bug",
        title: "ระบบใช้งานไม่ได้",
        priority: "high" as never,
      })
    ).rejects.toThrow();
    expect(values).not.toHaveBeenCalled();
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
    const queries = [
      ticketQuery,
      affectedUsersQuery,
      commentsQuery,
      attachmentsQuery,
    ];
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => queries.shift()),
    });

    const result = await createCaller().getTicket({ id: 354 });

    expect(result.affectedUsers).toEqual([
      { id: 119, email: "user119@example.com" },
    ]);
    expect(result.reporter).toEqual({ id: 42, email: "reporter@example.com" });
    expect(result.description).toBe(
      "Reporter: reporter@example.com (user #42)\nUser ID: 42\nInsufficient credits"
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
      where: vi
        .fn()
        .mockResolvedValue([{ id: 119, email: "user119@example.com" }]),
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
    const queries = [
      ticketQuery,
      reporterQuery,
      commentsQuery,
      attachmentsQuery,
    ];
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => queries.shift()),
    });

    const result = await createCaller().getTicket({ id: 383 });

    expect(result.reporter).toEqual({ id: 119, email: "user119@example.com" });
    expect(result.description).toBe(
      "Reporter: user119@example.com (user #119)\nUser ID: 119\nError: Insufficient credits"
    );
  });

  it("keeps legacy tickets visible while the read-receipt migration is pending", async () => {
    const schemaError = Object.assign(
      new Error("Failed query: feedback_ticket_reads"),
      {
        cause: {
          code: "42P01",
          message: 'relation "feedback_ticket_reads" does not exist',
        },
      }
    );
    const ticket = {
      id: 481,
      submittedBy: null,
      status: "new",
      updatedAt: new Date("2026-08-27T00:00:00.000Z"),
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
    };
    const brokenListQuery = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      where: vi.fn().mockRejectedValue(schemaError),
    };
    const fallbackListQuery = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([ticket]),
    };
    const queries = [brokenListQuery, fallbackListQuery];
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => queries.shift()),
    });

    const result = await createCaller().list({});

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ id: 481, isRead: false })
    );
  });

  it("does not report an automatic client error when markRead is unavailable", async () => {
    const schemaError = Object.assign(
      new Error("Failed query: feedback_ticket_reads"),
      {
        cause: {
          code: "42P01",
          message: 'relation "feedback_ticket_reads" does not exist',
        },
      }
    );
    const ticketQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 481 }]),
    };
    const insertQuery = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockRejectedValue(schemaError),
    };
    const queries = [ticketQuery];
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => queries.shift()),
      insert: vi.fn(() => insertQuery),
    });

    await expect(createCaller().markRead({ ticketId: 481 })).resolves.toEqual({
      success: true,
      persisted: false,
    });
  });

  it("marks all visible open tickets as read in one scoped operation", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue([{ ticketId: 481 }, { ticketId: 482 }]);
    mockGetDb.mockResolvedValue({ execute });

    await expect(createCaller().markAllRead()).resolves.toEqual({
      success: true,
      marked: 2,
    });

    const query = execute.mock.calls[0]?.[0];
    const chunks = query.queryChunks as Array<unknown>;
    const textChunks = chunks
      .flatMap(chunk => (chunk as { value?: string[] }).value ?? [])
      .join("");
    expect(textChunks).toContain("feedback_ticket_reads");
    expect(textChunks).toContain("ft.status <> 'closed'");
  });
});
