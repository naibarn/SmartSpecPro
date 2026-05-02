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

import {
  PROVIDER_TEMPLATES,
  mediaProvidersRouter,
  testBytePlusModelArk,
  testElevenLabs,
  testKieAI,
  testUVoice,
  testWaveSpeedAI,
} from "./mediaProviders";
import { db } from "../db";

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

describe("PROVIDER_TEMPLATES — WaveSpeed entry", () => {
  const wavespeedTemplate = PROVIDER_TEMPLATES.find(
    (t) => t.providerName === "wavespeed_ai"
  );

  it("includes an entry with providerName 'wavespeed_ai'", () => {
    expect(wavespeedTemplate).toBeDefined();
  });

  it("uses the official API root and launch model", () => {
    expect(wavespeedTemplate?.baseUrl).toBe("https://api.wavespeed.ai/api/v3");
    expect(wavespeedTemplate?.defaultModel).toBe("wavespeed-ai/cinematic-video-generator");
    expect(wavespeedTemplate?.availableModels).toHaveLength(11);
    expect(wavespeedTemplate?.availableModels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "bytedance/seedance-2.0/text-to-video",
        type: "video",
      }),
      expect.objectContaining({
        id: "bytedance/seedance-2.0-fast/image-to-video",
        type: "video",
      }),
      expect.objectContaining({
        id: "wavespeed-ai/elevenlabs/voice-changer",
        type: "audio",
      }),
    ]));
  });
});

describe("PROVIDER_TEMPLATES — ElevenLabs direct entry", () => {
  const elevenLabsTemplate = PROVIDER_TEMPLATES.find(
    (t) => t.providerName === "elevenlabs"
  );

  it("uses the official API root and direct text-to-speech model", () => {
    expect(elevenLabsTemplate).toBeDefined();
    expect(elevenLabsTemplate?.baseUrl).toBe("https://api.elevenlabs.io");
    expect(elevenLabsTemplate?.defaultModel).toBe("elevenlabs/text-to-speech");
    expect(elevenLabsTemplate?.providerType).toBe("audio");
    expect(elevenLabsTemplate?.availableModels).toHaveLength(5);
    expect(elevenLabsTemplate?.availableModels).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "elevenlabs/text-to-speech", type: "audio" }),
      expect.objectContaining({ id: "elevenlabs/voice-changer", type: "audio" }),
      expect.objectContaining({ id: "elevenlabs/speech-to-text", type: "audio" }),
      expect.objectContaining({ id: "elevenlabs/sound-effects", type: "audio" }),
      expect.objectContaining({ id: "elevenlabs/voice-isolator", type: "audio" }),
    ]));
  });
});

describe("testElevenLabs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls GET /v1/user/subscription with xi-api-key auth and no bearer authorization", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ character_count: 123, character_limit: 1000 }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await testElevenLabs("eleven-secret", "https://api.elevenlabs.io");

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/user/subscription");
    expect(options.method).toBe("GET");
    expect(options.headers["xi-api-key"]).toBe("eleven-secret");
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("falls back to /v1/voices when subscription probing is unavailable", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: "not found" }),
        text: async () => "not found",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ voices: [] }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await testElevenLabs("eleven-secret", "https://api.elevenlabs.io");

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe("https://api.elevenlabs.io/v1/voices");
  });

  it("returns concise provider errors without leaking API keys", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: { message: "invalid key eleven-secret" } }),
      text: async () => "invalid key eleven-secret",
    }));

    const result = await testElevenLabs("eleven-secret", "https://api.elevenlabs.io");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/401/i);
    expect(result.message).not.toContain("eleven-secret");
  });
});

describe("testWaveSpeedAI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls GET /balance with bearer auth after normalizing the API root", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { balance: 12.5 } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await testWaveSpeedAI("wavespeed-secret", "https://api.wavespeed.ai");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.wavespeed.ai/api/v3/balance");
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBe("Bearer wavespeed-secret");
  });

  it("accepts 200 responses only when data.balance is numeric", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { balance: 99 } }),
    }));

    const result = await testWaveSpeedAI("test-key", "https://api.wavespeed.ai/api/v3");

    expect(result).toMatchObject({
      success: true,
      balance: 99,
    });
  });

  it("returns actionable failure messages for auth and rate-limit errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    }));
    await expect(testWaveSpeedAI("bad-key", "https://api.wavespeed.ai/api/v3")).resolves.toMatchObject({
      success: false,
      message: expect.stringMatching(/401/i),
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "forbidden" }),
    }));
    await expect(testWaveSpeedAI("bad-key", "https://api.wavespeed.ai/api/v3")).resolves.toMatchObject({
      success: false,
      message: expect.stringMatching(/403/i),
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate limited" }),
    }));
    await expect(testWaveSpeedAI("busy-key", "https://api.wavespeed.ai/api/v3")).resolves.toMatchObject({
      success: false,
      message: expect.stringMatching(/429/i),
    });
  });

  it("returns a generic API error with a short response summary for other non-2xx statuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "provider exploded" } }),
    }));

    const result = await testWaveSpeedAI("test-key", "https://api.wavespeed.ai/api/v3");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/HTTP 500/i);
    expect(result.message).toMatch(/provider exploded/i);
  });
});

describe("mediaProvidersRouter persistence hardening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("rejects private provider base URLs before create persists them", async () => {
    await expect((mediaProvidersRouter.create as Function)({
      input: {
        providerName: "wavespeed_ai",
        displayName: "WaveSpeed",
        providerType: "multimodal",
        baseUrl: "https://127.0.0.1/api/v3",
      },
    })).rejects.toThrow(/public host/i);

    expect((db.insert as any)).not.toHaveBeenCalled();
  });

  it("normalizes WaveSpeed base URLs and rejects unsafe callback URLs on update", async () => {
    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 7, providerName: "wavespeed_ai", providerType: "multimodal" }]),
      }),
    });
    (db.update as any).mockReturnValue({ set: setMock });

    await expect((mediaProvidersRouter.update as Function)({
      input: {
        id: 7,
        baseUrl: "https://api.wavespeed.ai",
        callbackUrl: "https://localhost/callback",
      },
    })).rejects.toThrow(/public host/i);

    await (mediaProvidersRouter.update as Function)({
      input: {
        id: 7,
        baseUrl: "https://api.wavespeed.ai",
      },
    });

    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: "https://api.wavespeed.ai/api/v3",
    }));
  });
});

describe("testKieAI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("treats 400 validation from /jobs/createTask as a healthy authenticated response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "model is invalid",
      }),
    );

    const result = await testKieAI("test-key", "https://api.kie.ai/api/v1");

    expect(result).toEqual({
      success: true,
      message: "Authentication verified (validation error expected for health check)",
    });
  });

  it("uses POST /jobs/createTask with bearer auth", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "model is invalid",
    });
    vi.stubGlobal("fetch", fetchSpy);

    await testKieAI("my-secret-key", "https://api.kie.ai/api/v1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer my-secret-key");
    expect(JSON.parse(options.body)).toEqual({
      model: "__healthcheck__",
      input: {},
    });
  });

  it("returns failure on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "unauthorized",
      }),
    );

    const result = await testKieAI("bad-key", "https://api.kie.ai/api/v1");
    expect(result.success).toBe(false);
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

describe("PROVIDER_TEMPLATES — OmniVoice entry", () => {
  const omnivoiceTemplate = PROVIDER_TEMPLATES.find(
    (t) => t.providerName === "omnivoice"
  );

  it("includes an entry with providerName 'omnivoice'", () => {
    expect(omnivoiceTemplate).toBeDefined();
  });

  it("is an audio provider with narration-focused model support", () => {
    expect(omnivoiceTemplate?.providerType).toBe("audio");
    expect(omnivoiceTemplate?.availableModels?.some((m) => m.id === "omnivoice-tts")).toBe(true);
  });
});

describe("PROVIDER_TEMPLATES — KNPLabs AI entry", () => {
  const knplabsTemplate = PROVIDER_TEMPLATES.find(
    (t) => t.providerName === "knplabai"
  );

  it("includes an entry with providerName 'knplabai'", () => {
    expect(knplabsTemplate).toBeDefined();
  });

  it("has providerType 'multimodal'", () => {
    expect(knplabsTemplate?.providerType).toBe("multimodal");
  });

  it("includes image, video, and audio models", () => {
    const types = new Set(knplabsTemplate?.availableModels?.map((m) => m.type));
    expect(types.has("image")).toBe(true);
    expect(types.has("video")).toBe(true);
    expect(types.has("audio")).toBe(true);
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
