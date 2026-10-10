import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateMemory,
  mockSearchMemories,
  mockGetMemory,
  mockUpdateMemory,
  mockDeleteMemory,
  mockDeleteMemories,
  mockPromoteMemory,
  mockRequireTenantId,
  mockGetDb,
  mockIssueReceipt,
  mockValidateReceipt,
} = vi.hoisted(() => ({
  mockCreateMemory: vi.fn(),
  mockSearchMemories: vi.fn(),
  mockGetMemory: vi.fn(),
  mockUpdateMemory: vi.fn(),
  mockDeleteMemory: vi.fn(),
  mockDeleteMemories: vi.fn(),
  mockPromoteMemory: vi.fn(),
  mockRequireTenantId: vi.fn(() => "tenant-42"),
  mockGetDb: vi.fn(),
  mockIssueReceipt: vi.fn(),
  mockValidateReceipt: vi.fn(),
}));

vi.mock("../../services/scopedMemoryService", () => ({
  createMemory: mockCreateMemory,
  searchMemories: mockSearchMemories,
  getMemory: mockGetMemory,
  updateMemory: mockUpdateMemory,
  deleteMemory: mockDeleteMemory,
  deleteMemories: mockDeleteMemories,
  promoteMemory: mockPromoteMemory,
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockRequireTenantId,
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../services/smartAiHubRuntimeContext", () => ({
  issueProjectResolutionReceipt: mockIssueReceipt,
  validateProjectResolutionReceipt: mockValidateReceipt,
}));

vi.mock("../../_core/trpc", () => {
  const createProcedure = (schema?: any): any => ({
    input(nextSchema: any) {
      return createProcedure(nextSchema);
    },
    query(fn: Function) {
      return async (opts: any) => {
        const input = schema ? schema.parse(opts.input) : opts.input;
        return fn({ ...opts, input });
      };
    },
    mutation(fn: Function) {
      return async (opts: any) => {
        const input = schema ? schema.parse(opts.input) : opts.input;
        return fn({ ...opts, input });
      };
    },
  });

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

import { scopedMemoryRouter } from "../scopedMemory";
import {
  canonicalProjectMemberships,
  canonicalProjects,
  conversations,
  scopedMemories,
} from "../../../drizzle/schema";

function configureProjectScopeDatabase(rows: {
  canonicalProjects?: unknown[];
  memberships?: unknown[];
  conversations?: unknown[];
  memories?: unknown[];
}) {
  const rowsByTable = new Map<unknown, unknown[]>([
    [canonicalProjects, rows.canonicalProjects ?? []],
    [canonicalProjectMemberships, rows.memberships ?? []],
    [conversations, rows.conversations ?? []],
    [scopedMemories, rows.memories ?? [{ ownerType: "project", ownerId: "canonical-project-1" }]],
  ]);
  const selectedTables: unknown[] = [];
  mockGetDb.mockResolvedValue({
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        selectedTables.push(table);
        return {
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(rowsByTable.get(table) ?? []),
          })),
        };
      }),
    })),
  });
  return selectedTables;
}

function createProjectMemory(projectId: string) {
  return scopedMemoryRouter.create({
    ctx: makeCtx(),
    input: {
      ownerType: "project",
      ownerId: projectId,
      memoryKind: "note",
      title: "project note",
      content: "authorized project memory",
    },
  });
}

function searchProjectMemory(projectId: string) {
  return scopedMemoryRouter.search({
    ctx: makeTrustedCtx(),
    input: {
      scopes: [{ type: "project", id: projectId }],
      query: "project note",
      conversationId: 9,
    },
  });
}

function makeCtx() {
  return {
    tenantId: "tenant-42",
    user: { id: 7, currentTenantId: 42 },
    req: { hostname: "notes.example.com", headers: { host: "notes.example.com" } },
    trustedAppContext: null,
  } as any;
}

function makeTrustedCtx() {
  return {
    ...makeCtx(),
    trustedAppContext: {
      version: "spec304-trusted-host-app-context.v1",
      tenantId: "tenant-42",
      hostAppId: "app-42",
      publicAppId: "public-app-42",
      routeProvenance: "verified_custom_domain_alias",
      permissionCeiling: { projectMemoryRead: "authorized_bound_project_only", durableProjectMemoryWrite: false },
      policyVersion: "spec269-app-project-memory.phase1.v1",
    },
  } as any;
}

describe("scopedMemoryRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMemory.mockResolvedValue({ id: "m-new" });
    mockSearchMemories.mockResolvedValue([]);
    mockGetMemory.mockResolvedValue({
      id: "m1",
      ownerType: "user",
      ownerId: "7",
    });
    mockUpdateMemory.mockResolvedValue({ id: "m1" });
    mockDeleteMemory.mockResolvedValue(true);
    mockDeleteMemories.mockResolvedValue(2);
    mockPromoteMemory.mockResolvedValue(undefined);
    mockIssueReceipt.mockResolvedValue({ receiptId: "receipt-1" });
    mockValidateReceipt.mockResolvedValue({ authorized: false, reason: "REVOKED_OR_UNBOUND" });
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn((table: unknown) => ({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(table === scopedMemories
              ? [{ ownerType: "user", ownerId: "7" }]
              : []),
          }),
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          }),
        })),
      }),
    });
  });

  it("bulkDeletes multiple scoped memories for the current tenant", async () => {
    const result = await scopedMemoryRouter.bulkDelete({
      ctx: makeCtx(),
      input: {
        memoryIds: ["m1", "m2"],
      },
    });

    expect(result).toEqual({ success: true, deletedCount: 2 });
    expect(mockDeleteMemories).toHaveBeenCalledWith(["m1", "m2"], "tenant-42");
    expect(mockRequireTenantId).toHaveBeenCalled();
  });

  it("rejects empty bulk delete input", async () => {
    await expect(
      scopedMemoryRouter.bulkDelete({
        ctx: makeCtx(),
        input: {
          memoryIds: [],
        },
      }),
    ).rejects.toThrow();
  });

  it("allows creating user-scoped memory for the current user", async () => {
    const result = await scopedMemoryRouter.create({
      ctx: makeCtx(),
      input: {
        ownerType: "user",
        ownerId: "7",
        memoryKind: "note",
        title: "remember",
        content: "hello",
      },
    });

    expect(mockCreateMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-42",
        ownerType: "user",
        ownerId: "7",
        sourceUserId: 7,
      }),
    );
    expect(result).toEqual({ id: "m-new" });
  });

  it("blocks creating user-scoped memory for another user", async () => {
    await expect(
      scopedMemoryRouter.create({
        ctx: makeCtx(),
        input: {
          ownerType: "user",
          ownerId: "8",
          memoryKind: "note",
          title: "remember",
          content: "hello",
        },
      }),
    ).rejects.toThrow("Cannot access another user's scoped memory");
  });

  it("fails closed on project-shared creation until a durable receipt exists", async () => {
    const selectedTables = configureProjectScopeDatabase({
      canonicalProjects: [{ projectId: "canonical-project-1", tenantId: "tenant-42", lifecycle: "ACTIVE" }],
      memberships: [{ tenantId: "tenant-42", projectId: "canonical-project-1", principalId: "user:7", role: "editor", lifecycle: "ACTIVE" }],
    });

    await expect(createProjectMemory("canonical-project-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockCreateMemory).not.toHaveBeenCalled();
    expect(selectedTables).not.toContain(conversations);
  });

  it("denies a revoked canonical project membership", async () => {
    // The explicit result guard also fails closed if a stale or nonconforming
    // query adapter returns a revoked row despite the ACTIVE predicate.
    configureProjectScopeDatabase({
      canonicalProjects: [{ projectId: "canonical-project-1", tenantId: "tenant-42", lifecycle: "ACTIVE" }],
      memberships: [{ tenantId: "tenant-42", projectId: "canonical-project-1", principalId: "user:7", role: "editor", lifecycle: "REVOKED" }],
    });

    await expect(createProjectMemory("canonical-project-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Durable ProjectResolutionReceipt required for project-shared memory writes",
    });
    expect(mockCreateMemory).not.toHaveBeenCalled();
  });

  it("denies a canonical project nonmember even when a legacy conversation exists", async () => {
    const selectedTables = configureProjectScopeDatabase({
      canonicalProjects: [{ projectId: "canonical-project-1", tenantId: "tenant-42", lifecycle: "ACTIVE" }],
      memberships: [{ tenantId: "tenant-42", projectId: "canonical-project-1", principalId: "user:8", role: "editor", lifecycle: "ACTIVE" }],
      conversations: [{ id: 9, tenantId: "tenant-42", userId: 7, projectId: "canonical-project-1" }],
    });

    await expect(createProjectMemory("canonical-project-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(selectedTables).not.toContain(conversations);
    expect(mockCreateMemory).not.toHaveBeenCalled();
  });

  it("denies legacy project writes without selecting a canonical destination", async () => {
    configureProjectScopeDatabase({
      canonicalProjects: [],
      conversations: [{ id: 9, tenantId: "tenant-42", userId: 7, projectId: "legacy-project-1" }],
    });

    await expect(createProjectMemory("legacy-project-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockCreateMemory).not.toHaveBeenCalled();
  });

  it("denies a foreign-tenant canonical project without falling back to a local conversation", async () => {
    const selectedTables = configureProjectScopeDatabase({
      canonicalProjects: [{ projectId: "foreign-canonical-project", tenantId: "tenant-other", lifecycle: "ACTIVE" }],
      conversations: [{ id: 9, tenantId: "tenant-42", userId: 7, projectId: "foreign-canonical-project" }],
    });

    await expect(createProjectMemory("foreign-canonical-project")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(selectedTables).not.toContain(canonicalProjectMemberships);
    expect(selectedTables).not.toContain(conversations);
    expect(mockCreateMemory).not.toHaveBeenCalled();
  });

  it("permits project reads only after a fresh invocation receipt validates", async () => {
    const selectedTables = configureProjectScopeDatabase({
      canonicalProjects: [{ projectId: "canonical-project-1", tenantId: "tenant-42", lifecycle: "ACTIVE" }],
      memberships: [{ tenantId: "tenant-42", projectId: "canonical-project-1", principalId: "user:7", role: "viewer", lifecycle: "ACTIVE" }],
    });

    mockValidateReceipt.mockResolvedValueOnce({ authorized: true, canonicalProjectId: "canonical-project-1" });
    await searchProjectMemory("canonical-project-1");

    expect(mockSearchMemories).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: [{ type: "project", id: "canonical-project-1" }] }),
    );
    expect(selectedTables).not.toContain(conversations);
  });

  it("rechecks an invocation receipt before reading a project memory body", async () => {
    configureProjectScopeDatabase({
      canonicalProjects: [{ projectId: "canonical-project-1", tenantId: "tenant-42", lifecycle: "ACTIVE" }],
      memberships: [{ tenantId: "tenant-42", projectId: "canonical-project-1", principalId: "user:7", role: "viewer", lifecycle: "ACTIVE" }],
    });
    mockGetMemory.mockResolvedValue({ id: "m1", ownerType: "project", ownerId: "canonical-project-1" });
    mockValidateReceipt.mockResolvedValueOnce({ authorized: true, canonicalProjectId: "canonical-project-1" });

    await expect(scopedMemoryRouter.get({
      ctx: makeTrustedCtx(),
      input: { memoryId: "m1", conversationId: 9 },
    })).resolves.toMatchObject({ id: "m1" });
    expect(mockValidateReceipt).toHaveBeenCalledWith(expect.objectContaining({ operation: "read", appId: "app-42" }));
    expect(mockGetMemory).toHaveBeenCalled();
  });

  it("denies project memory search without a server-owned conversation binding", async () => {
    await expect(scopedMemoryRouter.search({
      ctx: makeCtx(),
      input: { scopes: [{ type: "project", id: "canonical-project-1" }], query: "project note" },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockSearchMemories).not.toHaveBeenCalled();
  });

  it.each([
    ["spoofed Host", { host: "notes.example.com" }],
    ["spoofed X-Forwarded-Host", { host: "smartaihub.app", "x-forwarded-host": "notes.example.com" }],
    ["conflicting forwarded hosts", { host: "smartaihub.app", "x-forwarded-host": "notes.example.com, tasks.example.com" }],
    ["same-tenant wrong App alias", { host: "tasks.example.com" }],
    ["cross-tenant App alias", { host: "foreign.example.net" }],
  ] as Array<[string, Record<string, string>]>)("fails closed at the router boundary for %s", async (_caseName, headers) => {
    configureProjectScopeDatabase({
      memories: [{ ownerType: "project", ownerId: "canonical-project-1" }],
      conversations: [{ id: 9, tenantId: "tenant-42", userId: 7, projectId: "canonical-project-1" }],
    });
    await expect(scopedMemoryRouter.search({
      ctx: { ...makeCtx(), req: { headers, hostname: headers.host } },
      input: {
        scopes: [{ type: "project", id: "canonical-project-1" }],
        query: "private project marker",
        conversationId: 9,
      },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockIssueReceipt).not.toHaveBeenCalled();
    expect(mockSearchMemories).not.toHaveBeenCalled();
  });

  it("denies a viewer from creating canonical project memory", async () => {
    configureProjectScopeDatabase({
      canonicalProjects: [{ projectId: "canonical-project-1", tenantId: "tenant-42", lifecycle: "ACTIVE" }],
      memberships: [{ tenantId: "tenant-42", projectId: "canonical-project-1", principalId: "user:7", role: "viewer", lifecycle: "ACTIVE" }],
    });

    await expect(createProjectMemory("canonical-project-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockCreateMemory).not.toHaveBeenCalled();
  });

  it.each(["update", "delete", "bulkDelete", "promote"] as const)(
    "denies viewer project-scope %s mutations",
    async operation => {
      configureProjectScopeDatabase({
        canonicalProjects: [{ projectId: "canonical-project-1", tenantId: "tenant-42", lifecycle: "ACTIVE" }],
        memberships: [{ tenantId: "tenant-42", projectId: "canonical-project-1", principalId: "user:7", role: "viewer", lifecycle: "ACTIVE" }],
      });
      mockGetMemory.mockResolvedValue({ id: "m1", ownerType: "project", ownerId: "canonical-project-1" });

      const request = operation === "update"
        ? scopedMemoryRouter.update({ ctx: makeCtx(), input: { memoryId: "m1", content: "updated" } })
        : operation === "delete"
          ? scopedMemoryRouter.delete({ ctx: makeCtx(), input: { memoryId: "m1" } })
          : operation === "bulkDelete"
            ? scopedMemoryRouter.bulkDelete({ ctx: makeCtx(), input: { memoryIds: ["m1"] } })
            : scopedMemoryRouter.promote({ ctx: makeCtx(), input: { memoryId: "m1", toOwnerType: "user", toOwnerId: "7" } });

      await expect(request).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockUpdateMemory).not.toHaveBeenCalled();
      expect(mockDeleteMemory).not.toHaveBeenCalled();
      expect(mockDeleteMemories).not.toHaveBeenCalled();
      expect(mockPromoteMemory).not.toHaveBeenCalled();
    },
  );

  it("denies promotion into a viewer project scope", async () => {
    configureProjectScopeDatabase({
      canonicalProjects: [{ projectId: "canonical-project-1", tenantId: "tenant-42", lifecycle: "ACTIVE" }],
      memberships: [{ tenantId: "tenant-42", projectId: "canonical-project-1", principalId: "user:7", role: "viewer", lifecycle: "ACTIVE" }],
    });

    await expect(scopedMemoryRouter.promote({
      ctx: makeCtx(),
      input: { memoryId: "m1", toOwnerType: "project", toOwnerId: "canonical-project-1" },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockPromoteMemory).not.toHaveBeenCalled();
  });

  it.each(["owner", "editor"] as const)(
    "fails closed for an active %s membership until durable project-write receipts exist",
    async role => {
      configureProjectScopeDatabase({
        canonicalProjects: [{ projectId: "canonical-project-1", tenantId: "tenant-42", lifecycle: "ACTIVE" }],
        memberships: [{ tenantId: "tenant-42", projectId: "canonical-project-1", principalId: "user:7", role, lifecycle: "ACTIVE" }],
      });

      await expect(createProjectMemory("canonical-project-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockCreateMemory).not.toHaveBeenCalled();
    },
  );
});
