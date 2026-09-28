import { describe, expect, it } from "vitest";

import {
  WORKER_LLM_INVENTORY_SCHEMA_VERSION,
  WORKER_LLM_INVOKE_SCHEMA_VERSION,
  workerLlmCapabilitySchema,
  workerLlmInventorySchema,
  workerLlmInvokeSchema,
  workerLlmModelRowSchema,
} from "../workerLocalLlm";

const validInventory = {
  schemaVersion: WORKER_LLM_INVENTORY_SCHEMA_VERSION,
  inventoryRevision: 4,
  providers: [
    {
      localProviderId: "ollama-office",
      providerKind: "ollama",
      displayName: "Office Ollama",
      enabled: true,
      models: [
        {
          localModelId: "llama-3-8b",
          providerModelId: "llama3:8b",
          displayName: "Llama 3 8B",
          capabilities: ["llm.chat", "llm.completion"],
          contextWindow: 8192,
          readiness: "ready",
        },
      ],
    },
  ],
};

describe("Worker Local LLM contracts", () => {
  it("accepts bounded multi-provider inventory and model capabilities", () => {
    const parsed = workerLlmInventorySchema.parse(validInventory);
    expect(parsed.providers[0]?.models[0]?.providerModelId).toBe("llama3:8b");
    expect(workerLlmCapabilitySchema.parse("llm.vision")).toBe("llm.vision");
  });

  it("rejects secrets, endpoints, paths, and prompt-like inventory metadata", () => {
    for (const forbidden of [
      { apiKey: "secret" },
      { endpoint: "http://127.0.0.1:11434" },
      { localPath: "/Users/alice/models" },
      { prompt: "do something" },
    ]) {
      expect(() =>
        workerLlmInventorySchema.parse({
          ...validInventory,
          providers: [{ ...validInventory.providers[0], metadata: forbidden }],
        })
      ).toThrow();
    }
  });

  it("rejects unsupported capabilities and overlong model identity", () => {
    expect(() =>
      workerLlmModelRowSchema.parse({
        localModelId: "m1",
        providerModelId: "m1",
        displayName: "M1",
        capabilities: ["llm.audio"],
        readiness: "ready",
      })
    ).toThrow();
    expect(() =>
      workerLlmModelRowSchema.parse({
        localModelId: "m1",
        providerModelId: "x".repeat(241),
        displayName: "M1",
        capabilities: ["llm.chat"],
        readiness: "ready",
      })
    ).toThrow();
  });

  it("accepts an invoke request with bounded multimodal references", () => {
    const parsed = workerLlmInvokeSchema.parse({
      schemaVersion: WORKER_LLM_INVOKE_SCHEMA_VERSION,
      requestId: "request-1",
      modelRef: "wllm_model_abc123",
      inventoryRevision: 4,
      task: "chat",
      messages: [
        { role: "user", content: "Describe this" },
        { role: "user", content: [{ type: "image_ref", storageRef: "file-1" }] },
      ],
      parameters: { temperature: 0.2, maxTokens: 128 },
      responseFormat: "text",
      stream: false,
      privacyMode: "local_only",
    });
    expect(parsed.modelRef).toBe("wllm_model_abc123");
  });

  it("rejects task/capability mismatches and unknown protocol versions", () => {
    expect(() =>
      workerLlmInvokeSchema.parse({
        schemaVersion: WORKER_LLM_INVOKE_SCHEMA_VERSION,
        requestId: "request-1",
        modelRef: "wllm_model_abc123",
        inventoryRevision: 4,
        task: "vision",
        requiredCapabilities: ["llm.chat"],
        messages: [{ role: "user", content: "Describe this" }],
        responseFormat: "text",
        stream: false,
        privacyMode: "local_only",
      })
    ).toThrow(/capabilit/i);
    expect(() =>
      workerLlmInvokeSchema.parse({
        schemaVersion: "worker-llm-invoke/9",
        requestId: "request-1",
        modelRef: "wllm_model_abc123",
        inventoryRevision: 4,
        task: "chat",
        messages: [{ role: "user", content: "hello" }],
        responseFormat: "text",
        stream: false,
        privacyMode: "local_only",
      })
    ).toThrow();
  });
});
