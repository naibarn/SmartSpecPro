import { describe, expect, it } from "vitest";

import {
  buildNvidiaHostedCapabilityOverlay,
  buildProviderCatalogLookupKey,
  classifyNvidiaHostedModel,
  normalizeNvidiaHostedCatalogModel,
  resolveCatalogBackedPricing,
  resolveCatalogEligibility,
} from "./llmProviderCatalog";

const NVIDIA_CHAT_CATALOG_IDS = [
  "nvidia/cosmos-reason2-8b",
  "nvidia/llama-3.1-nemotron-51b-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "nvidia/llama-3.1-nemotron-nano-4b-v1.1",
  "nvidia/llama-3.1-nemotron-nano-8b-v1",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/llama3-chatqa-1.5-70b",
  "nvidia/llama3-chatqa-1.5-8b",
  "nvidia/mistral-nemo-minitron-8b-8k-instruct",
  "nvidia/mistral-nemo-minitron-8b-base",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-4-340b-instruct",
  "nvidia/nemotron-4-mini-hindi-4b-instruct",
  "nvidia/nemotron-mini-4b-instruct",
  "nvidia/nemotron-nano-3-30b-a3b",
  "nvidia/nvidia-nemotron-nano-9b-v2",
];

const NVIDIA_PARTNER_CHAT_ALLOWLIST_IDS = [
  "meta/llama-3.3-70b-instruct",
  "mistralai/mistral-nemotron",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "deepseek-ai/deepseek-v3.1",
  "qwen/qwen3-coder-480b-a35b-instruct",
];

const NVIDIA_EMBEDDING_IDS = [
  "nvidia/embed-qa-4",
  "nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1",
  "nvidia/llama-3.2-nemoretriever-300m-embed-v1",
  "nvidia/llama-3.2-nv-embedqa-1b-v1",
  "nvidia/llama-3.2-nv-embedqa-1b-v2",
  "nvidia/llama-nemotron-embed-1b-v2",
  "nvidia/llama-nemotron-embed-vl-1b-v2",
  "nvidia/nv-embed-v1",
  "nvidia/nv-embedcode-7b-v1",
  "nvidia/nv-embedqa-e5-v5",
  "nvidia/nv-embedqa-mistral-7b-v2",
  "nvidia/nvclip",
];

const NVIDIA_PARSE_IDS = [
  "nvidia/nemoretriever-parse",
  "nvidia/nemotron-parse",
];

const NVIDIA_GUARDRAIL_IDS = [
  "nvidia/gliner-pii",
  "nvidia/llama-3.1-nemoguard-8b-content-safety",
  "nvidia/llama-3.1-nemoguard-8b-topic-control",
  "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
  "nvidia/nemotron-content-safety-reasoning-4b",
];

const NVIDIA_REWARD_IDS = [
  "nvidia/llama-3.1-nemotron-70b-reward",
  "nvidia/nemotron-4-340b-reward",
];

const NVIDIA_TRANSLATION_IDS = [
  "nvidia/riva-translate-4b-instruct",
  "nvidia/riva-translate-4b-instruct-v1.1",
];

const NVIDIA_MULTIMODAL_IDS = [
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
  "nvidia/nemotron-nano-12b-v2-vl",
  "nvidia/neva-22b",
  "nvidia/streampetr",
  "nvidia/vila",
];

describe("classifyNvidiaHostedModel", () => {
  it("classifies reviewed NVIDIA chat ids as public chat", () => {
    expect(
      classifyNvidiaHostedModel("nvidia/llama-3.3-nemotron-super-49b-v1.5", "nvidia"),
    ).toMatchObject({
      ownedBy: "nvidia",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: true,
      apiStyle: "chat-completions",
    });
  });

  it("classifies additional NVIDIA chat-family rows as manual-only public chat", () => {
    expect(
      classifyNvidiaHostedModel("nvidia/cosmos-reason2-8b", "nvidia"),
    ).toMatchObject({
      ownedBy: "nvidia",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: false,
      apiStyle: "chat-completions",
    });

    expect(
      classifyNvidiaHostedModel("nvidia/mistral-nemo-minitron-8b-base", "nvidia"),
    ).toMatchObject({
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: false,
    });

    expect(
      classifyNvidiaHostedModel("nvidia/nemotron-nano-3-30b-a3b", "nvidia"),
    ).toMatchObject({
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: false,
    });
  });

  it("classifies reviewed NVIDIA embedding ids as internal-only embeddings", () => {
    expect(
      classifyNvidiaHostedModel("nvidia/nv-embed-v1", "nvidia"),
    ).toMatchObject({
      surface: "embedding",
      executionMode: "internal-only",
      autoSelectionEligible: false,
    });
  });

  it("classifies reviewed NVIDIA parse ids as deferred parse rows", () => {
    expect(
      classifyNvidiaHostedModel("nvidia/nemotron-parse", "nvidia"),
    ).toMatchObject({
      surface: "parse",
      executionMode: "deferred",
      autoSelectionEligible: false,
    });
  });

  it("keeps all NVIDIA-owned chat inventory ids chat/public with only the reviewed subset auto-eligible", () => {
    for (const id of NVIDIA_CHAT_CATALOG_IDS) {
      expect(classifyNvidiaHostedModel(id, "nvidia")).toMatchObject({
        ownedBy: "nvidia",
        surface: "chat",
        executionMode: "public",
        apiStyle: "chat-completions",
      });
    }

    expect(classifyNvidiaHostedModel("nvidia/llama-3.3-nemotron-super-49b-v1.5", "nvidia")).toMatchObject({
      autoSelectionEligible: true,
    });
    expect(classifyNvidiaHostedModel("nvidia/nemotron-4-340b-instruct", "nvidia")).toMatchObject({
      autoSelectionEligible: false,
    });
  });

  it("keeps curated partner chat rows manual-only in phase 1", () => {
    for (const id of NVIDIA_PARTNER_CHAT_ALLOWLIST_IDS) {
      expect(classifyNvidiaHostedModel(id, id.split("/")[0])).toMatchObject({
        surface: "chat",
        executionMode: "public",
        autoSelectionEligible: false,
        apiStyle: "chat-completions",
      });
    }
  });

  it("classifies the remaining NVIDIA inventory surfaces with stable rollout metadata", () => {
    for (const id of NVIDIA_EMBEDDING_IDS) {
      expect(classifyNvidiaHostedModel(id, "nvidia")).toMatchObject({
        surface: "embedding",
        executionMode: "internal-only",
        autoSelectionEligible: false,
      });
    }

    for (const id of NVIDIA_PARSE_IDS) {
      expect(classifyNvidiaHostedModel(id, "nvidia")).toMatchObject({
        surface: "parse",
        executionMode: "deferred",
        autoSelectionEligible: false,
      });
    }

    for (const id of NVIDIA_GUARDRAIL_IDS) {
      expect(classifyNvidiaHostedModel(id, "nvidia")).toMatchObject({
        surface: "guardrail",
        executionMode: "deferred",
        autoSelectionEligible: false,
      });
    }

    for (const id of NVIDIA_REWARD_IDS) {
      expect(classifyNvidiaHostedModel(id, "nvidia")).toMatchObject({
        surface: "reward",
        executionMode: "deferred",
        autoSelectionEligible: false,
      });
    }

    for (const id of NVIDIA_TRANSLATION_IDS) {
      expect(classifyNvidiaHostedModel(id, "nvidia")).toMatchObject({
        surface: "translation",
        executionMode: "deferred",
        autoSelectionEligible: false,
      });
    }

    for (const id of NVIDIA_MULTIMODAL_IDS) {
      expect(classifyNvidiaHostedModel(id, "nvidia")).toMatchObject({
        surface: "multimodal",
        executionMode: "deferred",
        autoSelectionEligible: false,
      });
    }
  });

  it("does not default ambiguous partner rows to chat", () => {
    expect(
      classifyNvidiaHostedModel("meta/llama-guard-4-12b", "meta"),
    ).toMatchObject({
      surface: "guardrail",
      executionMode: "deferred",
      autoSelectionEligible: false,
    });
  });

  it("falls back to deferred other rows when no reviewed signal exists", () => {
    expect(
      classifyNvidiaHostedModel("partner/unknown-model", "partner"),
    ).toMatchObject({
      ownedBy: "partner",
      surface: "other",
      executionMode: "deferred",
      autoSelectionEligible: false,
    });
  });

  it("classifies known partner non-chat examples from the hosted snapshot conservatively", () => {
    expect(classifyNvidiaHostedModel("meta/llama-guard-4-12b", "meta")).toMatchObject({
      surface: "guardrail",
      executionMode: "deferred",
    });
    expect(classifyNvidiaHostedModel("ibm/granite-guardian-3.0-8b", "ibm")).toMatchObject({
      surface: "guardrail",
      executionMode: "deferred",
    });
    expect(classifyNvidiaHostedModel("snowflake/arctic-embed-l", "snowflake")).toMatchObject({
      surface: "embedding",
      executionMode: "internal-only",
    });
  });
});

describe("buildNvidiaHostedCapabilityOverlay", () => {
  it("returns reviewed capability flags for the auto-eligible bootstrap set", () => {
    expect(
      buildNvidiaHostedCapabilityOverlay("nvidia/llama-3.3-nemotron-super-49b-v1.5"),
    ).toMatchObject({
      apiStyle: "chat-completions",
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsThinking: true,
    });
  });

  it("returns an empty overlay for unreviewed rows", () => {
    expect(buildNvidiaHostedCapabilityOverlay("partner/unknown-model")).toEqual({});
  });
});

describe("resolveCatalogBackedPricing", () => {
  it("uses paid default pricing for zero-priced mappings unless the row is explicitly free", () => {
    expect(resolveCatalogBackedPricing({
      providerName: "krouter",
      availableModels: [{ id: "gpt-5.5" }],
      providerModelId: "gpt-5.5",
      pricingInput: "0",
      pricingOutput: "0",
      isFree: false,
    })).toEqual({
      pricingInput: 1,
      pricingOutput: 4,
      isFree: false,
      source: "default",
    });
  });
});

describe("normalizeNvidiaHostedCatalogModel", () => {
  it("merges hosted metadata with reviewed chat overlays", () => {
    expect(
      normalizeNvidiaHostedCatalogModel({
        id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        name: "NVIDIA Nemotron Super",
        ownedBy: "nvidia",
        contextLength: 128000,
        createdAt: 1712345678,
        pricing: { input: 0.25, output: 0.75 },
        supportsVision: false,
      }),
    ).toMatchObject({
      id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      name: "NVIDIA Nemotron Super",
      ownedBy: "nvidia",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: true,
      apiStyle: "chat-completions",
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsThinking: true,
      pricing: { input: 0.25, output: 0.75 },
    });
  });

  it("keeps ambiguous partner rows fail-closed", () => {
    expect(
      normalizeNvidiaHostedCatalogModel({
        id: "partner/unknown-model",
        ownedBy: "partner",
        embeddingDimension: 1024,
      }),
    ).toMatchObject({
      id: "partner/unknown-model",
      name: "partner/unknown-model",
      ownedBy: "partner",
      surface: "other",
      executionMode: "deferred",
      autoSelectionEligible: false,
      embeddingDimension: 1024,
    });
  });

  it("normalizes curated partner chat rows as manual-only public chat", () => {
    expect(
      normalizeNvidiaHostedCatalogModel({
        id: "meta/llama-3.3-70b-instruct",
        ownedBy: "meta",
      }),
    ).toMatchObject({
      id: "meta/llama-3.3-70b-instruct",
      ownedBy: "meta",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: false,
      apiStyle: "chat-completions",
    });
  });
});

describe("resolveCatalogEligibility", () => {
  it("marks reviewed NVIDIA auto rows as public-chat", () => {
    expect(
      resolveCatalogEligibility({
        providerName: "nvidia_nim",
        providerEnabled: true,
        catalogModel: {
          ownedBy: "nvidia",
          surface: "chat",
          executionMode: "public",
          autoSelectionEligible: true,
        },
      }),
    ).toMatchObject({
      catalogEligibility: "public-chat",
      ownedBy: "nvidia",
    });
  });

  it("keeps valid but manual-only NVIDIA chat rows out of public-chat", () => {
    expect(
      resolveCatalogEligibility({
        providerName: "nvidia_nim",
        providerEnabled: true,
        catalogModel: {
          ownedBy: "nvidia",
          surface: "chat",
          executionMode: "public",
          autoSelectionEligible: false,
        },
      }),
    ).toMatchObject({
      catalogEligibility: "manual-only",
      autoSelectionEligible: false,
    });
  });

  it("marks mapped non-chat NVIDIA rows invalid while leaving catalog-only rows deferred/internal", () => {
    expect(
      resolveCatalogEligibility({
        providerName: "nvidia_nim",
        providerEnabled: true,
        mappingExists: true,
        catalogModel: {
          ownedBy: "meta",
          surface: "guardrail",
          executionMode: "deferred",
          autoSelectionEligible: false,
        },
      }),
    ).toMatchObject({
      catalogEligibility: "invalid",
      catalogInvalidReason: "surface-not-chat",
    });

    expect(
      resolveCatalogEligibility({
        providerName: "nvidia_nim",
        providerEnabled: true,
        mappingExists: false,
        catalogModel: {
          ownedBy: "meta",
          surface: "guardrail",
          executionMode: "deferred",
          autoSelectionEligible: false,
        },
      }),
    ).toMatchObject({
      catalogEligibility: "deferred",
    });
  });

  it("keeps legacy providers additive when rollout metadata is absent", () => {
    expect(
      resolveCatalogEligibility({
        providerName: "openai",
        providerEnabled: true,
        catalogModel: null,
      }),
    ).toMatchObject({
      catalogEligibility: "public-chat",
    });
  });
});

describe("buildProviderCatalogLookupKey", () => {
  it("keys lookups by provider id and provider model id", () => {
    expect(buildProviderCatalogLookupKey(12, "openai/gpt-5")).toBe("12:openai/gpt-5");
  });
});
