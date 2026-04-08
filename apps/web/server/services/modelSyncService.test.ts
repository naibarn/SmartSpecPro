import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDbSelect, mockDbUpdate, mockDecrypt } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDecrypt: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock("./crypto", () => ({
  decrypt: mockDecrypt,
}));

import { syncProviderModels } from "./modelSyncService";

type ProviderRow = {
  id: number;
  providerName: string;
  displayName: string;
  baseUrl: string;
  apiKeyEncrypted: string | null;
  availableModels?: unknown[] | null;
};

function mockProviderLookup(provider: ProviderRow) {
  const limit = vi.fn().mockResolvedValue([provider]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });

  mockDbSelect.mockReturnValueOnce({ from });
}

function mockProviderUpdate() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });

  mockDbUpdate.mockReturnValueOnce({ set });

  return { set, where };
}

describe("syncProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mockDecrypt.mockReturnValue("provider-secret");
  });

  it("syncs NVIDIA through the native /v1/models path, dedupes hosted ids, and preserves rollout metadata", async () => {
    mockProviderLookup({
      id: 41,
      providerName: "nvidia_nim",
      displayName: "NVIDIA NIM (Hosted)",
      baseUrl: "https://integrate.api.nvidia.com",
      apiKeyEncrypted: "encrypted",
      availableModels: [],
    });
    const update = mockProviderUpdate();

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
            name: "Nemotron Super 49B",
            owned_by: "nvidia",
            context_length: 128000,
            created: 1712345678,
          },
          {
            id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
            name: "Nemotron Super 49B",
            owned_by: "nvidia",
            context_length: 128000,
            created: 1712345678,
          },
          {
            id: "meta/llama-guard-4-12b",
            name: "Llama Guard 4 12B",
            owned_by: "meta",
            context_window: 8192,
          },
          {
            id: "meta/llama-3.3-70b-instruct",
            name: "Llama 3.3 70B Instruct",
            owned_by: "meta",
            context_window: 131072,
          },
          {
            id: "partner/unknown-model",
            owned_by: "partner",
          },
        ],
      }),
      status: 200,
      statusText: "OK",
    } as Response);

    const result = await syncProviderModels(41, "openrouter-key");

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://integrate.api.nvidia.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer provider-secret",
        }),
      }),
    );

    const updatePayload = update.set.mock.calls[0]?.[0];
    expect(updatePayload?.availableModels).toHaveLength(4);

    const syncedModels = updatePayload.availableModels as Array<Record<string, unknown>>;
    const chatModel = syncedModels.find((model) => model.id === "nvidia/llama-3.3-nemotron-super-49b-v1.5");
    const guardModel = syncedModels.find((model) => model.id === "meta/llama-guard-4-12b");
    const partnerChatModel = syncedModels.find((model) => model.id === "meta/llama-3.3-70b-instruct");
    const unknownModel = syncedModels.find((model) => model.id === "partner/unknown-model");

    expect(chatModel).toMatchObject({
      name: "Nemotron Super 49B",
      ownedBy: "nvidia",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: true,
      apiStyle: "chat-completions",
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
    });
    expect(guardModel).toMatchObject({
      ownedBy: "meta",
      surface: "guardrail",
      executionMode: "deferred",
      autoSelectionEligible: false,
    });
    expect(partnerChatModel).toMatchObject({
      ownedBy: "meta",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: false,
      apiStyle: "chat-completions",
    });
    expect(unknownModel).toMatchObject({
      ownedBy: "partner",
      surface: "other",
      executionMode: "deferred",
      autoSelectionEligible: false,
    });
  });

  it("keeps existing OpenAI-compatible provider sync behavior unchanged", async () => {
    mockProviderLookup({
      id: 7,
      providerName: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKeyEncrypted: "encrypted",
      availableModels: [],
    });
    const update = mockProviderUpdate();

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "gpt-4o-mini", context_window: 128000 }],
      }),
      status: 200,
      statusText: "OK",
    } as Response);

    const result = await syncProviderModels(7);

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer provider-secret",
        }),
      }),
    );
    expect(update.set.mock.calls[0]?.[0]?.availableModels).toEqual([
      {
        id: "gpt-4o-mini",
        name: "gpt-4o-mini",
        contextLength: 128000,
        provider: "openai",
        pricing: undefined,
        createdAt: undefined,
      },
    ]);
  });
});
