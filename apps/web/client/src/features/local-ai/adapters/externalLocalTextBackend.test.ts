/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecuteTauriLocalHttpBackendChatCompletion = vi.fn();
const mockIsTauriDesktopRuntime = vi.fn(() => false);

vi.mock("../skills/tauriSkillRuntime", () => ({
  executeTauriLocalHttpBackendChatCompletion: (...args: unknown[]) =>
    mockExecuteTauriLocalHttpBackendChatCompletion(...args),
  isTauriDesktopRuntime: () => mockIsTauriDesktopRuntime(),
}));

import {
  buildExternalLocalChatCompletionsUrl,
  EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER,
  executeExternalLocalChatCompletion,
  executeExternalLocalTextCompletion,
  getExternalLocalTextBackendBrowserWarning,
  readConfiguredExternalLocalTextBackend,
  readConfiguredExternalLocalTextBackendReason,
  resolveExternalLocalTextBackendConfig,
  resolveExternalLocalTextBackendReason,
} from "./externalLocalTextBackend";
import { writeLocalAiDeviceState } from "../state/localAiDeviceStateStorage";

describe("externalLocalTextBackend", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    mockExecuteTauriLocalHttpBackendChatCompletion.mockReset();
    mockIsTauriDesktopRuntime.mockReset();
    mockIsTauriDesktopRuntime.mockReturnValue(false);
  });

  it("resolves enabled localhost or private-lan configs with a model", () => {
    expect(
      resolveExternalLocalTextBackendConfig({
        enabled: true,
        baseUrl: "http://localhost:8000",
        apiKey: "token",
        model: "local-model",
        requestTimeoutMs: 30000,
      }),
    ).toMatchObject({
      baseUrl: "http://localhost:8000",
      apiKey: "token",
      model: "local-model",
      requestTimeoutMs: 30000,
    });

    expect(
      resolveExternalLocalTextBackendConfig({
        enabled: true,
        baseUrl: "http://172.24.128.1:1234",
        apiKey: "token",
        model: "local-model",
        requestTimeoutMs: 30000,
      }),
    ).toMatchObject({
      baseUrl: "http://172.24.128.1:1234",
      apiKey: "token",
      model: "local-model",
      requestTimeoutMs: 30000,
    });

    expect(
      resolveExternalLocalTextBackendConfig({
        enabled: true,
        baseUrl: "https://example.com",
        apiKey: "token",
        model: "local-model",
        requestTimeoutMs: 30000,
      }),
    ).toBeNull();
  });

  it("treats localhost-backend mode as effectively enabled when the config itself is valid", () => {
    expect(
      resolveExternalLocalTextBackendConfig(
        {
          enabled: false,
          baseUrl: "http://localhost:8000",
          apiKey: "token",
          model: "local-model",
          requestTimeoutMs: 30000,
        },
        { treatAsEnabled: true },
      ),
    ).toMatchObject({
      baseUrl: "http://localhost:8000",
      apiKey: "token",
      model: "local-model",
      requestTimeoutMs: 30000,
    });

    expect(
      resolveExternalLocalTextBackendReason(
        {
          enabled: false,
          baseUrl: "http://localhost:8000",
          apiKey: "token",
          model: "",
          requestTimeoutMs: 30000,
        },
        { treatAsEnabled: true },
      ),
    ).toBe("missing_model");
  });

  it("treats a pinned private-lan backend as configured when URL and model are present", () => {
    expect(
      resolveExternalLocalTextBackendConfig(
        {
          enabled: false,
          baseUrl: "http://172.24.128.1:1234",
          apiKey: "local-dev-token",
          model: "gemma-4-e4b-it",
          requestTimeoutMs: 30_000,
        },
        { treatAsEnabled: true },
      ),
    ).toMatchObject({
      baseUrl: "http://172.24.128.1:1234",
      model: "gemma-4-e4b-it",
    });

    expect(
      resolveExternalLocalTextBackendReason(
        {
          enabled: false,
          baseUrl: "http://172.24.128.1:1234",
          apiKey: "local-dev-token",
          model: "gemma-4-e4b-it",
          requestTimeoutMs: 30_000,
        },
        { treatAsEnabled: true },
      ),
    ).toBeNull();
  });

  it("builds the chat completions url from a localhost base url", () => {
    expect(buildExternalLocalChatCompletionsUrl("http://localhost:8000")).toBe(
      "http://localhost:8000/v1/chat/completions",
    );
    expect(
      buildExternalLocalChatCompletionsUrl("http://localhost:8000/v1"),
    ).toBe("http://localhost:8000/v1/chat/completions");
  });

  it("falls back to a related scoped localhost backend config for the same user", () => {
    writeLocalAiDeviceState(
      {
        tenantId: null,
        userId: "user-1",
        runtimeNamespace: "web",
      },
      {
        localEnginePreference: "localhost_backend",
        externalTextBackend: {
          enabled: false,
          baseUrl: "http://localhost:8000",
          apiKey: "local-dev-token",
          model: "fallback-local-model",
          requestTimeoutMs: 30000,
        },
      },
    );

    expect(
      readConfiguredExternalLocalTextBackend({
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      }),
    ).toMatchObject({
      baseUrl: "http://localhost:8000",
      model: "fallback-local-model",
    });
  });

  it("reports the precise localhost backend reason for the current scope when config is still invalid", () => {
    writeLocalAiDeviceState(
      {
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      },
      {
        localEnginePreference: "localhost_backend",
        externalTextBackend: {
          enabled: false,
          baseUrl: "http://localhost:8000",
          apiKey: "local-dev-token",
          model: null,
          requestTimeoutMs: 30000,
        },
      },
    );

    expect(
      readConfiguredExternalLocalTextBackendReason({
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      }),
    ).toBe("missing_model");
  });

  it("calls an OpenAI-compatible local endpoint and extracts the first reply", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive:Q4_K_M",
          choices: [
            {
              message: {
                content: "สวัสดี ผมคือผู้ช่วยในเครื่องของคุณ",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const result = await executeExternalLocalTextCompletion({
      config: {
        baseUrl: "http://localhost:8000",
        apiKey: "local-dev-token",
        model: "HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive:Q4_K_M",
        requestTimeoutMs: 15000,
      },
      prompt: "สวัสดี ช่วยแนะนำตัวหน่อย",
      maxTokens: 256,
      temperature: 0.7,
    });

    expect(result).toEqual({
      text: "สวัสดี ผมคือผู้ช่วยในเครื่องของคุณ",
      model: "HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive:Q4_K_M",
      provider: EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER,
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer local-dev-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("marks private-lan backend requests as local-network fetches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "gemma-4-e4b-it",
          choices: [{ message: { content: "OK" } }],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await executeExternalLocalTextCompletion({
      config: {
        baseUrl: "http://172.24.128.1:1234",
        apiKey: "local-dev-token",
        model: "gemma-4-e4b-it",
        requestTimeoutMs: 15000,
      },
      prompt: "ping",
      maxTokens: 32,
      temperature: 0,
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://172.24.128.1:1234/v1/chat/completions",
      expect.objectContaining({
        targetAddressSpace: "private",
      }),
    );
  });

  it("treats private-lan TypeError failures as unreachable instead of mixed-content", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      executeExternalLocalTextCompletion({
        config: {
          baseUrl: "http://172.24.128.1:1234",
          apiKey: "local-dev-token",
          model: "gemma-4-e4b-it",
          requestTimeoutMs: 15000,
        },
        prompt: "ping",
        maxTokens: 32,
        temperature: 0,
      }),
    ).rejects.toThrow("external_local_backend_unreachable");
  });

  it("surfaces a private-network blocked reason for secure pages using an http private-lan backend", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "isSecureContext",
    );
    Object.defineProperty(globalThis, "isSecureContext", {
      configurable: true,
      value: true,
    });

    try {
      await expect(
        executeExternalLocalTextCompletion({
          config: {
            baseUrl: "http://172.24.128.1:1234",
            apiKey: "local-dev-token",
            model: "gemma-4-e4b-it",
            requestTimeoutMs: 15000,
          },
          prompt: "ping",
          maxTokens: 32,
          temperature: 0,
        }),
      ).rejects.toThrow("external_local_backend_private_network_blocked");
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "isSecureContext", originalDescriptor);
      } else {
        delete (globalThis as Record<string, unknown>).isSecureContext;
      }
    }
  });

  it("supports multimodal localhost chat completions with image content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "local-multimodal-model",
          choices: [
            {
              message: {
                content: "ภาพนี้เป็นแดชบอร์ดสรุปยอดขายพร้อมกราฟเส้นและตัวเลข KPI",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const result = await executeExternalLocalChatCompletion({
      config: {
        baseUrl: "http://localhost:8000",
        apiKey: "local-dev-token",
        model: "local-multimodal-model",
        requestTimeoutMs: 15000,
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "ช่วยอธิบายภาพนี้สั้น ๆ" },
            {
              type: "image_url",
              image_url: {
                url: "data:image/png;base64,AAAA",
              },
            },
          ],
        },
      ],
      maxTokens: 256,
      temperature: 0.2,
    });

    expect(result).toEqual({
      text: "ภาพนี้เป็นแดชบอร์ดสรุปยอดขายพร้อมกราฟเส้นและตัวเลข KPI",
      model: "local-multimodal-model",
      provider: EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER,
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("uses the native Tauri bridge instead of browser fetch on desktop", async () => {
    mockIsTauriDesktopRuntime.mockReturnValue(true);
    mockExecuteTauriLocalHttpBackendChatCompletion.mockResolvedValue({
      success: true,
      model: "gemma-4-e4b-it",
      text: "ตอบจาก native bridge",
      errorCode: null,
      errorDetail: null,
      httpStatus: 200,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await executeExternalLocalTextCompletion({
      config: {
        baseUrl: "http://172.24.128.1:1234",
        apiKey: "local-dev-token",
        model: "gemma-4-e4b-it",
        requestTimeoutMs: 15_000,
      },
      prompt: "ping",
      maxTokens: 32,
      temperature: 0,
    });

    expect(result).toEqual({
      text: "ตอบจาก native bridge",
      model: "gemma-4-e4b-it",
      provider: EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER,
    });
    expect(
      mockExecuteTauriLocalHttpBackendChatCompletion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        requestUrl: "http://172.24.128.1:1234/v1/chat/completions",
        model: "gemma-4-e4b-it",
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("suppresses secure-page private network browser warnings inside Tauri", () => {
    mockIsTauriDesktopRuntime.mockReturnValue(true);
    expect(
      getExternalLocalTextBackendBrowserWarning("http://172.24.128.1:1234"),
    ).toBeNull();
  });
});
