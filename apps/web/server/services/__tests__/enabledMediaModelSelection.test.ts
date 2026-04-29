import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.fn();

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

function makeDb(input: { models: any[]; providers: any[] }) {
  return {
    select: (fields: Record<string, unknown>) => {
      const isProviderQuery = Object.prototype.hasOwnProperty.call(fields, "providerName");
      return {
        from: () => ({
          where: () => ({
            limit: async () => isProviderQuery ? input.providers : input.models,
          }),
          limit: async () => isProviderQuery ? input.providers : input.models,
        }),
      };
    },
  };
}

function provider(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    providerName: "kie_ai",
    isEnabled: true,
    hasApiKey: true,
    apiKeyEncrypted: "encrypted",
    priority: 0,
    sortOrder: 0,
    ...overrides,
  };
}

function model(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    modelId: "veo3/generate-veo-3-video-fast",
    name: "Veo 3.1",
    modelType: "video",
    provider: "kie_ai",
    aliases: ["veo3-fast", "veo-fast"],
    creditCost: 50,
    aspectRatios: ["16:9"],
    sizes: null,
    durations: [5, 10],
    voices: null,
    configJson: {},
    isEnabled: true,
    priority: 10,
    sortOrder: 10,
    ...overrides,
  };
}

describe("enabledMediaModelSelection", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetDb.mockReset();
  });

  it("routes a legacy Veo 3.1 hint to an enabled provider/model instead of disabled KNPLabs", async () => {
    mockGetDb.mockResolvedValue(makeDb({
      providers: [
        provider({ providerName: "knplabai", isEnabled: false, hasApiKey: false, apiKeyEncrypted: null }),
        provider({ providerName: "kie_ai", isEnabled: true, hasApiKey: true }),
      ],
      models: [
        model({
          id: 1,
          modelId: "veo-3-1",
          name: "Veo 3.1 Fast",
          provider: "knplabai",
          isEnabled: true,
          priority: 1,
          sortOrder: 1,
        }),
        model({
          id: 2,
          modelId: "veo3/generate-veo-3-video-fast",
          name: "Veo 3.1",
          provider: "kie_ai",
          isEnabled: true,
          priority: 10,
          sortOrder: 10,
        }),
      ],
    }));

    const { resolveEnabledMediaModelSelection } = await import("../enabledMediaModelSelection");
    const selection = await resolveEnabledMediaModelSelection({
      mediaType: "video",
      requestedModel: "veo-3-1",
    });

    expect(selection).toMatchObject({
      ok: true,
      modelId: "veo3/generate-veo-3-video-fast",
      provider: "kie_ai",
      reason: "enabled_model_alias_match",
    });
  });

  it("blocks an explicitly disabled model instead of silently routing to its provider", async () => {
    mockGetDb.mockResolvedValue(makeDb({
      providers: [provider({ providerName: "knplabai", isEnabled: false })],
      models: [
        model({
          modelId: "veo_3_1-fast",
          name: "Veo 3.1 Fast",
          provider: "knplabai",
          isEnabled: false,
        }),
      ],
    }));

    const { resolveEnabledMediaModelSelection } = await import("../enabledMediaModelSelection");
    const selection = await resolveEnabledMediaModelSelection({
      mediaType: "video",
      requestedModel: "veo_3_1-fast",
    });

    expect(selection).toMatchObject({
      ok: false,
      reasonCode: "media_model_disabled",
    });
  });

  it("does not select models whose provider is enabled but missing configuration", async () => {
    mockGetDb.mockResolvedValue(makeDb({
      providers: [provider({ providerName: "kie_ai", hasApiKey: false, apiKeyEncrypted: null })],
      models: [model()],
    }));

    const { resolveEnabledMediaModelSelection } = await import("../enabledMediaModelSelection");
    const selection = await resolveEnabledMediaModelSelection({
      mediaType: "video",
    });

    expect(selection).toMatchObject({
      ok: false,
      reasonCode: "media_model_not_enabled",
    });
  });
});
