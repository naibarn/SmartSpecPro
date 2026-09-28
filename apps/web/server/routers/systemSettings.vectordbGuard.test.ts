import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockSignBearerToken,
  mockFetch,
  mockPoolQuery,
  mockPoolEnd,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockSignBearerToken: vi.fn().mockReturnValue("test-admin-token"),
  mockFetch: vi.fn(),
  mockPoolQuery: vi.fn(),
  mockPoolEnd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../services/crypto", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));

vi.mock("../services/googleOAuthValidation", () => ({
  validateGoogleOAuthFormat: vi
    .fn()
    .mockReturnValue({ valid: true, message: "ok" }),
}));

vi.mock("../_core/tokens", () => ({
  signBearerToken: mockSignBearerToken,
}));

vi.mock("pg", () => ({
  Pool: vi.fn(function () {
    return {
      query: mockPoolQuery,
      end: mockPoolEnd,
    };
  }),
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
  workerJobs: {
    id: "id",
    jobType: "jobType",
    status: "status",
    inputJson: "inputJson",
    capabilityRequirementsJson: "capabilityRequirementsJson",
    requestedByUserId: "requestedByUserId",
    tenantId: "tenantId",
  },
  hermesProviderConnections: {
    id: "id",
    scope: "scope",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({ kind: "eq" })),
  and: vi.fn(() => ({ kind: "and" })),
  inArray: vi.fn(() => ({ kind: "inArray" })),
  isNull: vi.fn(() => ({ kind: "isNull" })),
  sql: vi.fn(() => ({ kind: "sql" })),
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
      "5m"
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain(
      "/api/admin/vectordb/provider-switch/assert-config-edit"
    );
  });

  it("persists a prepared provider without making it the active provider", async () => {
    const db = createDbMock();
    mockGetDb.mockResolvedValue(db);

    const mutation = systemSettingsRouter.updateVectorDbSettings as any;
    await mutation({
      input: {
        provider: "pgvector",
        preparedProvider: "cloudflare_vectorize",
        vectorizeAccountId: "account-1",
        vectorizeIndexName: "library-index",
      },
      ctx: { user: { id: 42 } },
    });

    const inserted = db.insert.mock.results[0]?.value;
    expect(inserted.values).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "vectordb",
        key: "provider",
        value: "pgvector",
      })
    );
    expect(inserted.values).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "vectordb",
        key: "preparedProvider",
        value: "cloudflare_vectorize",
      })
    );
  });

  it("never activates a provider through the settings mutation", async () => {
    const db = createDbMock();
    mockGetDb.mockResolvedValue(db);

    const mutation = systemSettingsRouter.updateVectorDbSettings as any;
    await mutation({
      input: { provider: "cloudflare_vectorize" },
      ctx: { user: { id: 42 } },
    });

    const inserted = db.insert.mock.results[0]?.value;
    expect(inserted.values).toHaveBeenCalledWith(
      expect.objectContaining({ key: "provider", value: "pgvector" })
    );
    expect(inserted.values).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "preparedProvider",
        value: "cloudflare_vectorize",
      })
    );
  });

  it("tests draft Vectorize values without persisting or activating them", async () => {
    const db = createDbMock();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockResolvedValue([
            { key: "provider", value: "enc:pgvector", isSensitive: false },
          ]),
      }),
    });
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: { config: { dimensions: 768, metric: "cosine" } },
      }),
    } as any);

    const mutation = systemSettingsRouter.testVectorDbConnection as any;
    const result = await mutation({
      input: {
        provider: "cloudflare_vectorize",
        vectorizeAccountId: "account-1",
        vectorizeApiToken: "draft-token",
        vectorizeIndexName: "library-index",
      },
    });

    expect(result).toMatchObject({
      success: true,
      provider: "cloudflare_vectorize",
      dimensions: 768,
      metric: "cosine",
    });
    expect(String(mockFetch.mock.calls[0][0])).toContain(
      "/accounts/account-1/vectorize/v2/indexes/library-index"
    );
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("tests the prepared Vectorize provider from persisted settings while pgvector stays active", async () => {
    const db = createDbMock();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { key: "provider", value: "pgvector", isSensitive: false },
          {
            key: "preparedProvider",
            value: "cloudflare_vectorize",
            isSensitive: false,
          },
          {
            key: "vectorizeAccountId",
            value: "saved-account",
            isSensitive: false,
          },
          {
            key: "vectorizeApiToken",
            value: "enc:saved-token",
            isSensitive: true,
          },
          {
            key: "vectorizeIndexName",
            value: "smartaihub-library",
            isSensitive: false,
          },
        ]),
      }),
    });
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: { config: { dimensions: 768, metric: "cosine" } },
      }),
    } as any);

    const mutation = systemSettingsRouter.testVectorDbConnection as any;
    const result = await mutation({
      input: { provider: "cloudflare_vectorize" },
    });

    expect(result).toMatchObject({
      success: true,
      provider: "cloudflare_vectorize",
      dimensions: 768,
      metric: "cosine",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/saved-account/vectorize/v2/indexes/smartaihub-library",
      { headers: { Authorization: "Bearer saved-token" } }
    );
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a prepared Vectorize index with an incompatible schema", async () => {
    const db = createDbMock();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { key: "provider", value: "pgvector", isSensitive: false },
          {
            key: "vectorizeAccountId",
            value: "saved-account",
            isSensitive: false,
          },
          {
            key: "vectorizeApiToken",
            value: "enc:saved-token",
            isSensitive: true,
          },
          {
            key: "vectorizeIndexName",
            value: "smartaihub-library",
            isSensitive: false,
          },
        ]),
      }),
    });
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: { config: { dimensions: 1536, metric: "cosine" } },
      }),
    } as any);

    const mutation = systemSettingsRouter.testVectorDbConnection as any;
    const result = await mutation({
      input: { provider: "cloudflare_vectorize" },
    });

    expect(result).toMatchObject({
      success: false,
      provider: "cloudflare_vectorize",
      dimensions: 1536,
      metric: "cosine",
    });
    expect(result.message).toContain("expected 768D/cosine");
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

  it("stores Google AI settings without calling the vectordb cutover guard", async () => {
    const db = createDbMock();
    mockGetDb.mockResolvedValue(db);

    const mutation = systemSettingsRouter.updateGoogleAiSettings as any;
    const result = await mutation({
      input: { apiKey: "AIza-test-key" },
      ctx: { user: { id: 9 } },
    });

    expect(result).toEqual({ success: true, preservedExisting: false });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it("tests Google AI settings through Google endpoints", async () => {
    const db = createDbMock();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            key: "google_api_key",
            value: "enc:AIza-test-key",
            isSensitive: true,
          },
        ]),
      }),
    });
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ models: [] }),
      text: async () => "",
    } as any);

    const mutation = systemSettingsRouter.testGoogleAiConnection as any;
    const result = await mutation({});

    expect(result).toEqual({
      success: true,
      message:
        "Google AI API key is configured and Gemini endpoints are reachable",
    });
    expect(String(mockFetch.mock.calls[0][0])).toContain(
      "generativelanguage.googleapis.com"
    );
  });

  it("bubbles cutover freeze conflicts for vectordb updates", async () => {
    const db = createDbMock();
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({ detail: "cutover_non_emergency_edit_blocked" }),
    } as any);

    const mutation = systemSettingsRouter.updateVectorDbSettings as any;
    await expect(
      mutation({
        input: { provider: "chromadb" },
        ctx: { user: { id: 8 } },
      })
    ).rejects.toThrow("cutover_non_emergency_edit_blocked");
  });

  it("forwards admin auth when triggering reindex", async () => {
    const mutation = systemSettingsRouter.triggerReindex as any;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        task_id: "task-1",
        status: "started",
        message: "queued",
      }),
    } as any);

    const result = await mutation({
      ctx: { user: { id: 55 } },
    });

    expect(result).toEqual({
      task_id: "task-1",
      status: "started",
      message: "queued",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/vectordb/reindex"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-admin-token",
        }),
      })
    );
  });

  it("forwards admin auth when reading reindex status", async () => {
    const query = systemSettingsRouter.getReindexStatus as any;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        task_id: "task-2",
        status: "running",
        result: { active_jobs: 4 },
      }),
    } as any);

    const result = await query({
      ctx: { user: { id: 56 } },
    });

    expect(result).toEqual({
      task_id: "task-2",
      status: "running",
      result: { active_jobs: 4 },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/vectordb/reindex/status"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-admin-token",
        }),
      })
    );
  });

  it("returns vector health through the authenticated admin bridge", async () => {
    const query = systemSettingsRouter.getVectorDbHealth as any;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        provider_status: {
          current_read_provider: "pgvector",
          target_provider: null,
          switch_status: "idle",
          mirror_writes: false,
        },
        queue_status: {
          lag_minutes: 0,
          lag_threshold_minutes: 10,
          lag_window_minutes: 15,
        },
        campaign_progress: {
          campaign_id: null,
          status: "idle",
          domain: "library",
          queued: 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
        },
        latency_status: {
          current_p95_ms: 12,
          baseline_p95_ms: 10,
          current_sample_count: 3,
          baseline_sample_count: 5,
          insufficient_baseline: false,
        },
        connection_health: {
          healthy: true,
          status: "configured",
          message: "ok",
          checked_at: "2026-03-20T00:00:00Z",
        },
        provider_capabilities: {},
        recent_failures: [],
        timestamp: "2026-03-20T00:00:00Z",
      }),
    } as any);

    const result = await query({
      ctx: { user: { id: 57 } },
    });

    expect((result as any).provider_status.current_read_provider).toBe(
      "pgvector"
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/vectordb/health"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-admin-token",
        }),
      })
    );
  });

  it("uses canonical library_chunk_vectors stats for pgvector", async () => {
    const settingsDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            { key: "provider", value: "pgvector", isSensitive: false },
            { key: "pgvectorHost", value: "db.internal", isSensitive: false },
            { key: "pgvectorPort", value: "5432", isSensitive: false },
            { key: "pgvectorDatabase", value: "vectors", isSensitive: false },
            { key: "pgvectorUser", value: "postgres", isSensitive: false },
            { key: "pgvectorPassword", value: "enc:secret", isSensitive: true },
          ]),
        })),
      })),
    };
    mockGetDb.mockResolvedValue(settingsDb);
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ total_vectors: "311", indexed_items: "168" }],
      })
      .mockResolvedValueOnce({ rows: [{ active_items: "168" }] })
      .mockResolvedValueOnce({ rows: [{ embedding_dimensions: "384" }] })
      .mockResolvedValueOnce({
        rows: [{ relrowsecurity: true, relforcerowsecurity: true }],
      });

    const query = systemSettingsRouter.getVectorDbStats as any;
    const result = await query({});

    expect(result).toEqual(
      expect.objectContaining({
        provider: "pgvector",
        totalDocuments: 168,
        totalVectors: 311,
        indexedItems: 168,
        activeItems: 168,
        dimensions: 384,
        rlsEnabled: true,
        forceRls: true,
      })
    );
    expect(mockPoolQuery.mock.calls[0][0]).toContain("library_chunk_vectors");
  });
});
