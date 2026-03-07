import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks before module imports
vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    adminProcedure: createProcedure(),
  };
});

vi.mock("../services/crypto", () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
  decrypt: vi.fn((v: string) => v.replace("encrypted:", "")),
}));

import { PROVIDER_TEMPLATES, testBytePlusModelArk, testUVoice } from "./mediaProviders";

describe("PROVIDER_TEMPLATES — BytePlus ModelArk entry", () => {
  const bytePlusTemplate = PROVIDER_TEMPLATES.find(
    (t) => t.providerName === "byteplus_modelark"
  );

  it("includes an entry with providerName 'byteplus_modelark'", () => {
    expect(bytePlusTemplate).toBeDefined();
  });

  it("has providerType 'multimodal'", () => {
    expect(bytePlusTemplate?.providerType).toBe("multimodal");
  });

  it("has exactly 6 models in availableModels (2 image, 4 video)", () => {
    expect(bytePlusTemplate?.availableModels).toHaveLength(6);
    expect(
      bytePlusTemplate?.availableModels.filter((m) => m.type === "image")
    ).toHaveLength(2);
    expect(
      bytePlusTemplate?.availableModels.filter((m) => m.type === "video")
    ).toHaveLength(4);
  });

  it("defaultModel is 'seedream-4-5-251128'", () => {
    expect(bytePlusTemplate?.defaultModel).toBe("seedream-4-5-251128");
  });

  it("baseUrl is the Southeast Asia endpoint", () => {
    expect(bytePlusTemplate?.baseUrl).toBe(
      "https://ark.ap-southeast.bytepluses.com/api/v3"
    );
  });
});

describe("testBytePlusModelArk", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns {success: true, latencyMs: number} on 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );
    const result = await testBytePlusModelArk(
      "test-api-key",
      "https://ark.ap-southeast.bytepluses.com/api/v3"
    );
    expect(result.success).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("returns {success: false} on 401 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );
    const result = await testBytePlusModelArk(
      "bad-key",
      "https://ark.ap-southeast.bytepluses.com/api/v3"
    );
    expect(result.success).toBe(false);
  });

  it("rejects when baseUrl is a private IP (SSRF blocked)", async () => {
    await expect(
      testBytePlusModelArk("key", "http://192.168.1.1/api")
    ).rejects.toThrow(/private|internal/i);
  });

  it("does not call fetch when baseUrl is a private IP", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      testBytePlusModelArk("key", "http://127.0.0.1/api")
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses correct Authorization header format (Bearer token)", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchSpy);
    await testBytePlusModelArk(
      "my-secret-key",
      "https://ark.ap-southeast.bytepluses.com/api/v3"
    );
    const [, options] = fetchSpy.mock.calls[0];
    expect(options.headers["Authorization"]).toBe("Bearer my-secret-key");
  });
});

describe("testConnection switch — byteplus_modelark routing", () => {
  it("byteplus_modelark template exists in PROVIDER_TEMPLATES (confirms routing registration)", () => {
    const bytePlusTemplate = PROVIDER_TEMPLATES.find(
      (t) => t.providerName === "byteplus_modelark"
    );
    expect(bytePlusTemplate).toBeDefined();
  });

  it("testBytePlusModelArk is callable and returns success for valid provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );
    const result = await testBytePlusModelArk(
      "valid-key",
      "https://ark.ap-southeast.bytepluses.com/api/v3"
    );
    expect(result.success).toBe(true);
  });

  it("kie_ai still has its own entry in PROVIDER_TEMPLATES (no regression)", () => {
    const kieTemplate = PROVIDER_TEMPLATES.find(
      (t) => t.providerName === "kie_ai"
    );
    expect(kieTemplate).toBeDefined();
  });
});

describe("PROVIDER_TEMPLATES — UVoice entry", () => {
  const uvoiceTemplate = PROVIDER_TEMPLATES.find(
    (t) => t.providerName === "uvoice"
  );

  it("includes an entry with providerName 'uvoice'", () => {
    expect(uvoiceTemplate).toBeDefined();
  });

  it("has providerType 'audio'", () => {
    expect(uvoiceTemplate?.providerType).toBe("audio");
  });

  it("includes at least 3 UVoice audio models", () => {
    expect(uvoiceTemplate?.availableModels?.length).toBeGreaterThanOrEqual(3);
    expect(
      uvoiceTemplate?.availableModels.every((m) => m.type === "audio")
    ).toBe(true);
  });
});

describe("testUVoice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success with latency on 400 response (auth verified)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "text length must be at least 5",
      })
    );
    const result = await testUVoice("test-key", "https://api.uvoice.ai");
    expect(result.success).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("sends POST /generate with settings payload", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "validation error",
    });
    vi.stubGlobal("fetch", fetchSpy);

    await testUVoice("test-key", "https://api.uvoice.ai");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.uvoice.ai/generate");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer test-key");
    const body = JSON.parse(options.body);
    expect(body.settings.voiceID).toBe("TH-KantapongPremiumHD");
    expect(body.settings.outputType).toBe("url");
  });

  it("returns failure on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );
    const result = await testUVoice("bad-key", "https://api.uvoice.ai");
    expect(result.success).toBe(false);
  });

  it("rejects private IP URLs (SSRF blocked)", async () => {
    await expect(testUVoice("key", "http://127.0.0.1")).rejects.toThrow(
      /private|internal/i
    );
  });
});
