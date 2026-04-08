import { describe, expect, it } from "vitest";

import {
  resolveDetectedSkillForSend,
  resolveChatLocalRuntimeReadiness,
  shouldBlockPendingCloudKeepInChat,
} from "./chatLocalRouting";

describe("chatLocalRouting", () => {
  it("drops implicit detected skills when the chat is pinned to Local AI", () => {
    expect(
      resolveDetectedSkillForSend({
        sessionLocalOnlyEnabled: true,
        detectedSkill: { id: "image-creator" },
      }),
    ).toBeNull();
  });

  it("keeps implicit detected skills when the chat is not pinned to Local AI", () => {
    expect(
      resolveDetectedSkillForSend({
        sessionLocalOnlyEnabled: false,
        detectedSkill: { id: "image-creator" },
      }),
    ).toEqual({ id: "image-creator" });
  });

  it("blocks pending hybrid keep-in-chat actions in Local AI chats", () => {
    expect(shouldBlockPendingCloudKeepInChat(true)).toBe(true);
    expect(shouldBlockPendingCloudKeepInChat(false)).toBe(false);
  });

  it("reports Local AI URL backend configuration problems clearly", () => {
    expect(
      resolveChatLocalRuntimeReadiness({
        localAiEnabled: true,
        forceCloudOnly: false,
        runtimePlatform: "web",
        enginePreference: "localhost_backend",
        hasPreparedOnDeviceRuntime: true,
        hasConfiguredLocalhostBackend: false,
        localhostBackendReason: "missing_model",
      }),
    ).toEqual({
      canUseLocalForChat: false,
      engineLabel: "URL backend",
      summary: "This device is pinned to the Local AI URL backend for chat-local replies.",
      reason:
        "This device is pinned to the Local AI URL backend, but the model name is still empty.",
    });
  });

  it("allows auto mode when a Local AI URL backend is configured", () => {
    expect(
      resolveChatLocalRuntimeReadiness({
        localAiEnabled: true,
        forceCloudOnly: false,
        runtimePlatform: "web",
        enginePreference: "auto",
        hasPreparedOnDeviceRuntime: false,
        hasConfiguredLocalhostBackend: true,
        localhostBackendDisplay: "http://localhost:8000 · HauhauCS/Gemma-4-E2B",
      }),
    ).toEqual({
      canUseLocalForChat: true,
      engineLabel: "Auto",
      summary:
        "Auto is ready. This chat can use the Local AI URL backend on this device: http://localhost:8000 · HauhauCS/Gemma-4-E2B.",
      reason: null,
    });
  });

  it("allows on-device mode only when a prepared local runtime is ready", () => {
    expect(
      resolveChatLocalRuntimeReadiness({
        localAiEnabled: true,
        forceCloudOnly: false,
        runtimePlatform: "tauri",
        enginePreference: "on_device",
        hasPreparedOnDeviceRuntime: true,
        hasConfiguredLocalhostBackend: false,
      }),
    ).toEqual({
      canUseLocalForChat: true,
      engineLabel: "On-device Gemma",
      summary: "This chat will use the prepared desktop Gemma runtime on this device.",
      reason: null,
    });
  });
});
