import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockSignBearerToken,
  mockFetch,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockSignBearerToken: vi.fn().mockReturnValue("test-admin-token"),
  mockFetch: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../services/crypto", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));

vi.mock("../services/googleOAuthValidation", () => ({
  validateGoogleOAuthFormat: vi.fn().mockReturnValue({ valid: true, message: "ok" }),
}));

vi.mock("../_core/tokens", () => ({
  signBearerToken: mockSignBearerToken,
}));

vi.mock("../../drizzle/schema", () => ({
  systemSettings: {
    id: "id",
    category: "category",
    key: "key",
    value: "value",
    isSensitive: "isSensitive",
    updatedBy: "updatedBy",
    updatedAt: "updatedAt",
    description: "description",
  },
  invoiceConfig: {
    tenantId: "tenantId",
  },
  tenants: {
    id: "id",
    name: "name",
    primaryDomain: "primaryDomain",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({ kind: "eq" })),
  and: vi.fn(() => ({ kind: "and" })),
  isNull: vi.fn(() => ({ kind: "isNull" })),
}));

vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    adminProcedure: createProcedure(),
    domainAdminProcedure: createProcedure(),
    protectedProcedure: createProcedure(),
  };
});

import { systemSettingsRouter } from "./systemSettings";

function createDbMock() {
  const selectChain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  const updateChain: any = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  const insertChain: any = {
    values: vi.fn().mockResolvedValue(undefined),
  };

  return {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
    insert: vi.fn(() => insertChain),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "",
  } as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("systemSettingsRouter vectordb cutover guard", () => {
  it("enforces cutover guard before vectordb settings update", async () => {
    const db = createDbMock();
    mockGetDb.mockResolvedValue(db);

    const mutation = systemSettingsRouter.updateVectorDbSettings as any;
    const result = await mutation({
      input: { provider: "pgvector" },
      ctx: { user: { id: 42 } },
    });

    expect(result).toEqual({ success: true });
    expect(mockSignBearerToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "42",
        type: "access",
        scopes: ["admin:*"],
      }),
      "5m",
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain(
      "/api/admin/vectordb/provider-switch/assert-config-edit",
    );
  });

  it("does not call vectordb cutover guard for oauth settings update", async () => {
    const db = createDbMock();
    mockGetDb.mockResolvedValue(db);

    const mutation = systemSettingsRouter.updateOAuthSettings as any;
    const result = await mutation({
      input: { googleClientId: "client-id" },
      ctx: { user: { id: 7 } },
    });

    expect(result).toEqual({ success: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("bubbles cutover freeze conflicts for vectordb updates", async () => {
    const db = createDbMock();
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ detail: "cutover_non_emergency_edit_blocked" }),
    } as any);

    const mutation = systemSettingsRouter.updateVectorDbSettings as any;
    await expect(
      mutation({
        input: { provider: "chromadb" },
        ctx: { user: { id: 8 } },
      }),
    ).rejects.toThrow("cutover_non_emergency_edit_blocked");
  });
});
