import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDeleteMemory,
  mockDeleteMemories,
  mockRequireTenantId,
} = vi.hoisted(() => ({
  mockDeleteMemory: vi.fn(),
  mockDeleteMemories: vi.fn(),
  mockRequireTenantId: vi.fn(() => "tenant-42"),
}));

vi.mock("../../services/scopedMemoryService", () => ({
  deleteMemory: mockDeleteMemory,
  deleteMemories: mockDeleteMemories,
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockRequireTenantId,
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
    mockDeleteMemory.mockResolvedValue(true);
    mockDeleteMemories.mockResolvedValue(2);
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
});
