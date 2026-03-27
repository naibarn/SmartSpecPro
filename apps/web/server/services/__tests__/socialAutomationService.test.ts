import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuditLog,
  mockGetTenantFeatureFlag,
  mockVerifyPageAccess,
  mockSendReplyToConversation,
  mockPublishPublishingPostNow,
} = vi.hoisted(() => {
  return {
    mockAuditLog: vi.fn(),
    mockGetTenantFeatureFlag: vi.fn(),
    mockVerifyPageAccess: vi.fn(),
    mockSendReplyToConversation: vi.fn(),
    mockPublishPublishingPostNow: vi.fn(),
  };
});

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
}));

vi.mock("../featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

vi.mock("../socialAccessService", () => ({
  verifyPageAccess: mockVerifyPageAccess,
}));

vi.mock("../socialInboxService", () => ({
  sendReplyToConversation: mockSendReplyToConversation,
}));

vi.mock("../socialPublishingService", () => ({
  publishPublishingPostNow: mockPublishPublishingPostNow,
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../../db";
import {
  approveAutomationAction,
  createAutomationRule,
  expireOldApprovals,
  matchAutomationRules,
  rejectAutomationAction,
} from "../socialAutomationService";

function createSelectChain(rows: any[]) {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(async (count?: number) => {
    if (typeof count === "number") {
      return rows.slice(0, count);
    }
    return rows;
  });
  chain.then = (resolve: (value: any) => any, reject: (reason?: any) => any) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

function createInsertChain(rows: any[]) {
  const returning = vi.fn(async () => rows);
  const values = vi.fn(() => ({ returning }));
  return { values };
}

function createMutationChain(rows: any[] = []) {
  const chain: any = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn(async () => rows);
  return chain;
}

function createDeleteChain() {
  const chain: any = {};
  chain.where = vi.fn(() => chain);
  return chain;
}

function createDb(options: {
  selectRows?: any[][];
  insertRows?: any[];
  updateRows?: any[];
} = {}) {
  const selectRows = [...(options.selectRows ?? [])];
  const select = vi.fn(() => createSelectChain(selectRows.shift() ?? []));
  const insert = vi.fn(() => createInsertChain(options.insertRows ?? []));
  const update = vi.fn(() => createMutationChain(options.updateRows ?? []));
  const del = vi.fn(() => createDeleteChain());
  const execute = vi.fn().mockResolvedValue([]);
  return { select, insert, update, delete: del, execute };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlag.mockResolvedValue(true);
  mockVerifyPageAccess.mockResolvedValue({
    id: 7,
    tenantId: "tenant-1",
    connectionId: 99,
    providerPageId: "page-7",
    pageName: "Main Page",
    status: "active",
    aiActionMode: "draft_only",
    autoSendConfidenceThreshold: 0.95,
    selectedForInbox: true,
    selectedForPublishing: true,
    selectedForModeration: true,
    providerUserId: "provider-user",
  });
  mockSendReplyToConversation.mockResolvedValue({
    success: true,
    messageId: 77,
    providerMessageId: "m-77",
  });
  mockPublishPublishingPostNow.mockResolvedValue({
    id: 88,
    providerPostId: "p-88",
    status: "published",
  });
  mockAuditLog.mockImplementation(() => undefined);
});

describe("socialAutomationService", () => {
  it("creates tenant-wide rules with safe defaults", async () => {
    const db = createDb({
      insertRows: [
        {
          id: 1,
          tenantId: "tenant-1",
          pageId: null,
          name: "Tenant-wide rule",
          isEnabled: false,
          triggerType: "new_message",
          conditions: {},
          actionMode: "draft_only",
          policyConfig: {
            blockedCategories: ["billing", "legal", "harassment", "refund", "complaint"],
            toneGuide: "Professional, friendly, helpful",
          },
          createdByUserId: 42,
          createdAt: new Date("2026-03-24T00:00:00.000Z"),
          updatedAt: new Date("2026-03-24T00:00:00.000Z"),
        },
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as any);

    const result = await createAutomationRule({
      tenantId: "tenant-1",
      userId: 42,
      input: {
        name: "Tenant-wide rule",
        triggerType: "new_message",
      },
    });

    expect(result.isEnabled).toBe(false);
    expect(result.actionMode).toBe("draft_only");
    expect(db.insert).toHaveBeenCalled();
  });

  it("expires old pending approvals", async () => {
    const db = createDb({
      updateRows: [{ id: 1 }, { id: 2 }],
    });
    vi.mocked(getDb).mockReturnValue(db as any);

    const count = await expireOldApprovals("tenant-1");

    expect(count).toBe(2);
    expect(db.update).toHaveBeenCalled();
  });

  it("approves reply actions using edited content", async () => {
    const db = createDb({
      selectRows: [
        [
          {
            id: 7,
            tenantId: "tenant-1",
            pageId: 7,
            entityType: "reply",
            entityId: 101,
            proposedContent: "Original reply",
            confidence: 0.91,
            status: "pending",
            requestedBySystem: true,
            reviewedByUserId: null,
            decisionNote: null,
            createdAt: new Date("2026-03-24T00:00:00.000Z"),
            updatedAt: new Date("2026-03-24T00:00:00.000Z"),
            pageTenantId: "tenant-1",
            providerPageId: "page-7",
            pageName: "Main Page",
            pageStatus: "active",
          },
        ],
        [
          {
            id: 7,
            tenantId: "tenant-1",
            pageId: 7,
            entityType: "reply",
            entityId: 101,
            proposedContent: "Original reply",
            confidence: 0.91,
            status: "approved",
            requestedBySystem: true,
            reviewedByUserId: 42,
            decisionNote: null,
            createdAt: new Date("2026-03-24T00:00:00.000Z"),
            updatedAt: new Date("2026-03-24T00:05:00.000Z"),
            pageTenantId: "tenant-1",
            providerPageId: "page-7",
            pageName: "Main Page",
            pageStatus: "active",
          },
        ],
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as any);

    const result = await approveAutomationAction({
      tenantId: "tenant-1",
      userId: 42,
      approvalId: 7,
      editedContent: "Edited reply",
    });

    expect(mockSendReplyToConversation).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      conversationId: 101,
      body: "Edited reply",
    });
    expect(result.approval.status).toBe("approved");
    expect(result.result?.kind).toBe("reply");
  });

  it("rejects actions with a note", async () => {
    const db = createDb({
      selectRows: [
        [
          {
            id: 8,
            tenantId: "tenant-1",
            pageId: 7,
            entityType: "post",
            entityId: 202,
            proposedContent: "Draft post",
            confidence: 0.73,
            status: "pending",
            requestedBySystem: true,
            reviewedByUserId: null,
            decisionNote: null,
            createdAt: new Date("2026-03-24T00:00:00.000Z"),
            updatedAt: new Date("2026-03-24T00:00:00.000Z"),
            pageTenantId: "tenant-1",
            providerPageId: "page-7",
            pageName: "Main Page",
            pageStatus: "active",
          },
        ],
        [
          {
            id: 8,
            tenantId: "tenant-1",
            pageId: 7,
            entityType: "post",
            entityId: 202,
            proposedContent: "Draft post",
            confidence: 0.73,
            status: "rejected",
            requestedBySystem: true,
            reviewedByUserId: 42,
            decisionNote: "Needs revisions",
            createdAt: new Date("2026-03-24T00:00:00.000Z"),
            updatedAt: new Date("2026-03-24T00:06:00.000Z"),
            pageTenantId: "tenant-1",
            providerPageId: "page-7",
            pageName: "Main Page",
            pageStatus: "active",
          },
        ],
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as any);

    const result = await rejectAutomationAction({
      tenantId: "tenant-1",
      userId: 42,
      approvalId: 8,
      note: "Needs revisions",
    });

    expect(result.status).toBe("rejected");
    expect(result.decisionNote).toBe("Needs revisions");
  });

  it("matches keyword rules before generic new-message rules", async () => {
    const db = createDb({
      selectRows: [
        [
          {
            id: 7,
            tenantId: "tenant-1",
            pageName: "Main Page",
            providerPageId: "page-7",
            status: "active",
            aiActionMode: "draft_only",
            autoSendConfidenceThreshold: 0.95,
          },
        ],
        [
          {
            unreadCount: 2,
            lastInboundAt: new Date("2026-03-24T00:00:00.000Z"),
          },
        ],
        [
          {
            id: 1,
            tenantId: "tenant-1",
            pageId: 7,
            name: "Keyword rule",
            isEnabled: true,
            triggerType: "keyword_match",
            conditions: { keywords: ["refund"] },
            actionMode: "approval_required",
            policyConfig: { blockedCategories: ["billing"], toneGuide: "Friendly" },
            createdByUserId: 42,
            createdAt: new Date("2026-03-24T00:00:00.000Z"),
            updatedAt: new Date("2026-03-24T00:00:00.000Z"),
            pageName: "Main Page",
            providerPageId: "page-7",
          },
        ],
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as any);

    const result = await matchAutomationRules({
      tenantId: "tenant-1",
      pageId: 7,
      conversationId: 101,
      messageBody: "I need a refund please",
    });

    expect(result?.rule.triggerType).toBe("keyword_match");
  });

  it("returns null when the page automation kill switch is off", async () => {
    const db = createDb({
      selectRows: [
        [
          {
            id: 7,
            tenantId: "tenant-1",
            pageName: "Main Page",
            providerPageId: "page-7",
            status: "active",
            aiActionMode: "off",
            autoSendConfidenceThreshold: 0.95,
          },
        ],
      ],
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await matchAutomationRules({
      tenantId: "tenant-1",
      pageId: 7,
      conversationId: 101,
      messageBody: "Hello",
    });

    expect(result).toBeNull();
  });
});
