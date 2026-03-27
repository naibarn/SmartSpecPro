import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetTenantFeatureFlag,
  mockResolveTenantIdVarchar,
  mockListAutomationPages,
  mockListAutomationPageRules,
  mockCreateAutomationRule,
  mockUpdateAutomationRule,
  mockToggleAutomationRule,
  mockDeleteAutomationRule,
  mockListAutomationApprovals,
  mockApproveAutomationAction,
  mockRejectAutomationAction,
} = vi.hoisted(() => {
  process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
  return {
    mockGetTenantFeatureFlag: vi.fn(),
    mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
    mockListAutomationPages: vi.fn(),
    mockListAutomationPageRules: vi.fn(),
    mockCreateAutomationRule: vi.fn(),
    mockUpdateAutomationRule: vi.fn(),
    mockToggleAutomationRule: vi.fn(),
    mockDeleteAutomationRule: vi.fn(),
    mockListAutomationApprovals: vi.fn(),
    mockApproveAutomationAction: vi.fn(),
    mockRejectAutomationAction: vi.fn(),
  };
});

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

vi.mock("../../services/socialAutomationService", () => ({
  listAutomationPages: mockListAutomationPages,
  listAutomationPageRules: mockListAutomationPageRules,
  createAutomationRule: mockCreateAutomationRule,
  updateAutomationRule: mockUpdateAutomationRule,
  toggleAutomationRule: mockToggleAutomationRule,
  deleteAutomationRule: mockDeleteAutomationRule,
  listAutomationApprovals: mockListAutomationApprovals,
  approveAutomationAction: mockApproveAutomationAction,
  rejectAutomationAction: mockRejectAutomationAction,
}));

import { socialAutomationRouter } from "../socialAutomation";

function createCaller(user: any = {
  id: 42,
  openId: "user-open-id",
  email: "user@example.com",
  name: "Meta User",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  currentTenantId: "tenant-1",
}) {
  return socialAutomationRouter.createCaller({
    user,
    tenantId: "tenant-1",
    userToken: null,
    privateVaultToken: null,
    publicUrl: "https://example.com",
    req: {
      ip: "127.0.0.1",
      headers: {},
      protocol: "https",
    } as any,
    res: {} as any,
  });
}

describe("socialAutomationRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlag.mockResolvedValue(true);
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
    mockListAutomationPages.mockResolvedValue([]);
    mockListAutomationPageRules.mockResolvedValue([]);
    mockCreateAutomationRule.mockResolvedValue({ id: 1, tenantId: "tenant-1" });
    mockUpdateAutomationRule.mockResolvedValue({ id: 1, tenantId: "tenant-1" });
    mockToggleAutomationRule.mockResolvedValue({ id: 1, tenantId: "tenant-1", isEnabled: true });
    mockDeleteAutomationRule.mockResolvedValue({ success: true, ruleId: 1 });
    mockListAutomationApprovals.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mockApproveAutomationAction.mockResolvedValue({
      approval: { id: 7, tenantId: "tenant-1" },
      result: { kind: "reply", success: true, messageId: 77, providerMessageId: "m-77" },
    });
    mockRejectAutomationAction.mockResolvedValue({ id: 7, tenantId: "tenant-1" });
  });

  it("lists pages for the tenant", async () => {
    const caller = createCaller();
    await caller.listPages();

    expect(mockListAutomationPages).toHaveBeenCalledWith("tenant-1", 42);
  });

  it("lists rules scoped to the selected page", async () => {
    const caller = createCaller();
    await caller.listRules({ pageId: 7 });

    expect(mockListAutomationPageRules).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      pageId: 7,
    });
  });

  it("creates a rule with the tenant identity", async () => {
    const caller = createCaller();
    await caller.createRule({
      name: "Escalate refunds",
      pageId: 7,
      triggerType: "keyword_match",
      conditions: { keywords: ["refund"] },
      actionMode: "approval_required",
      policyConfig: { blockedCategories: ["billing"], toneGuide: "Friendly" },
    });

    expect(mockCreateAutomationRule).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      input: {
        name: "Escalate refunds",
        pageId: 7,
        triggerType: "keyword_match",
        conditions: { keywords: ["refund"] },
        actionMode: "approval_required",
        policyConfig: { blockedCategories: ["billing"], toneGuide: "Friendly" },
      },
    });
  });

  it("rejects invalid trigger types", async () => {
    const caller = createCaller();
    await expect(
      caller.createRule({
        name: "Bad",
        pageId: 7,
        triggerType: "invalid" as any,
      }),
    ).rejects.toThrow();
  });

  it("updates rules", async () => {
    const caller = createCaller();
    await caller.updateRule({
      ruleId: 1,
      name: "Updated name",
      conditions: { keywords: ["refund"] },
      actionMode: "auto_send",
      policyConfig: { blockedCategories: ["refund"] },
    });

    expect(mockUpdateAutomationRule).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      input: {
        ruleId: 1,
        name: "Updated name",
        conditions: { keywords: ["refund"] },
        actionMode: "auto_send",
        policyConfig: { blockedCategories: ["refund"] },
      },
    });
  });

  it("toggles rule enabled state", async () => {
    const caller = createCaller();
    await caller.toggleRule({ ruleId: 1, isEnabled: true });

    expect(mockToggleAutomationRule).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      ruleId: 1,
      isEnabled: true,
    });
  });

  it("deletes rules", async () => {
    const caller = createCaller();
    await caller.deleteRule({ ruleId: 1 });

    expect(mockDeleteAutomationRule).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      ruleId: 1,
    });
  });

  it("lists approvals with filters", async () => {
    const caller = createCaller();
    await caller.listApprovals({ pageId: 7, status: "pending", limit: 12 });

    expect(mockListAutomationApprovals).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      pageId: 7,
      status: "pending",
      cursor: undefined,
      limit: 12,
    });
  });

  it("approves pending actions with edited content", async () => {
    const caller = createCaller();
    await caller.approveAction({ approvalId: 7, editedContent: "Edited reply" });

    expect(mockApproveAutomationAction).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      approvalId: 7,
      editedContent: "Edited reply",
    });
  });

  it("rejects pending actions with a note", async () => {
    const caller = createCaller();
    await caller.rejectAction({ approvalId: 7, note: "Not appropriate" });

    expect(mockRejectAutomationAction).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      approvalId: 7,
      note: "Not appropriate",
    });
  });

  it("rejects callers when the feature flag is disabled", async () => {
    mockGetTenantFeatureFlag.mockResolvedValue(false);
    const caller = createCaller();

    await expect(caller.listPages()).rejects.toThrow("Meta Channels are disabled for this tenant");
    await expect(caller.listRules({})).rejects.toThrow("Meta Channels are disabled for this tenant");
    await expect(caller.listApprovals({ limit: 20 })).rejects.toThrow("Meta Channels are disabled for this tenant");
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller(null);
    await expect(caller.listPages()).rejects.toThrow();
  });
});
