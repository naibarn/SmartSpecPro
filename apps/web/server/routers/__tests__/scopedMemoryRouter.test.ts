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

function makeCtx() {
  return {
    tenantId: "tenant-42",
    user: { id: 7, currentTenantId: 42 },
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
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
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
});
