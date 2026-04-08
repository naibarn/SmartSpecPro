export function resolveDetectedSkillForSend<T>(input: {
  sessionLocalOnlyEnabled: boolean;
  detectedSkill: T | null;
}): T | null {
  if (input.sessionLocalOnlyEnabled) {
    return null;
  }
  return input.detectedSkill;
}

export function shouldBlockPendingCloudKeepInChat(
  sessionLocalOnlyEnabled: boolean,
): boolean {
  return sessionLocalOnlyEnabled;
}

export type ChatLocalEnginePreference =
  | "auto"
  | "on_device"
  | "localhost_backend";

export interface ChatLocalRuntimeReadinessInput {
  localAiEnabled: boolean;
  forceCloudOnly: boolean;
  runtimePlatform: "web" | "tauri";
  enginePreference: ChatLocalEnginePreference;
  hasPreparedOnDeviceRuntime: boolean;
  hasConfiguredLocalhostBackend: boolean;
  localhostBackendReason?: string | null;
  localhostBackendDisplay?: string | null;
}

export interface ChatLocalRuntimeReadiness {
  canUseLocalForChat: boolean;
  engineLabel: string;
  summary: string;
  reason: string | null;
}

function describeLocalhostBackendReason(reason?: string | null): string {
  if (reason === "missing_base_url") {
    return "This device is pinned to the Local AI URL backend, but the Base URL is still empty.";
  }
  if (reason === "invalid_loopback_url") {
    return "This device is pinned to the Local AI URL backend, but the Base URL must stay on localhost or a private LAN IP such as 127.0.0.1, ::1, 10.x.x.x, 172.16-31.x.x, or 192.168.x.x.";
  }
  if (reason === "missing_model") {
    return "This device is pinned to the Local AI URL backend, but the model name is still empty.";
  }
  if (reason === "external_local_backend_mixed_content") {
    return "This device is pinned to the Local AI URL backend, but the browser blocked the request while trying to reach the backend over the local/private network.";
  }
  return "This device is pinned to the Local AI URL backend, but it is not configured yet.";
}

function getChatLocalEngineLabel(
  preference: ChatLocalEnginePreference,
): string {
  if (preference === "on_device") {
    return "On-device Gemma";
  }
  if (preference === "localhost_backend") {
    return "URL backend";
  }
  return "Auto";
}

export function resolveChatLocalRuntimeReadiness(
  input: ChatLocalRuntimeReadinessInput,
): ChatLocalRuntimeReadiness {
  const engineLabel = getChatLocalEngineLabel(input.enginePreference);

  if (input.forceCloudOnly) {
    return {
      canUseLocalForChat: false,
      engineLabel,
      summary: "This workspace is currently locked to cloud execution.",
      reason: "This workspace is currently locked to cloud execution.",
    };
  }

  if (!input.localAiEnabled) {
    return {
      canUseLocalForChat: false,
      engineLabel,
      summary:
        "Enable Local AI in Settings > Local AI before forcing this chat to local.",
      reason:
        "Enable Local AI in Settings > Local AI before forcing this chat to local.",
    };
  }

  const onDeviceSummary =
    input.runtimePlatform === "tauri"
      ? "the prepared desktop Gemma runtime"
      : "the prepared browser Gemma runtime";

  if (input.enginePreference === "localhost_backend") {
    if (input.hasConfiguredLocalhostBackend) {
      return {
        canUseLocalForChat: true,
        engineLabel,
        summary: input.localhostBackendDisplay
          ? `This chat will use the Local AI URL backend on this device: ${input.localhostBackendDisplay}.`
          : "This chat will use the Local AI URL backend on this device.",
        reason: null,
      };
    }
    return {
      canUseLocalForChat: false,
      engineLabel,
      summary: "This device is pinned to the Local AI URL backend for chat-local replies.",
      reason: describeLocalhostBackendReason(input.localhostBackendReason),
    };
  }

  if (input.enginePreference === "on_device") {
    if (input.hasPreparedOnDeviceRuntime) {
      return {
        canUseLocalForChat: true,
        engineLabel,
        summary: `This chat will use ${onDeviceSummary} on this device.`,
        reason: null,
      };
    }
    return {
      canUseLocalForChat: false,
      engineLabel,
      summary: "This device is pinned to on-device Gemma for chat-local replies.",
      reason:
        input.runtimePlatform === "tauri"
          ? "No prepared desktop Gemma model is ready on this device yet."
          : "No prepared browser Gemma model is ready on this device yet.",
    };
  }

  if (input.hasConfiguredLocalhostBackend && input.hasPreparedOnDeviceRuntime) {
    return {
      canUseLocalForChat: true,
      engineLabel,
      summary:
        "Auto is ready. This chat can use the Local AI URL backend first and still fall back to the prepared on-device Gemma path.",
      reason: null,
    };
  }

  if (input.hasConfiguredLocalhostBackend) {
    return {
      canUseLocalForChat: true,
      engineLabel,
      summary: input.localhostBackendDisplay
        ? `Auto is ready. This chat can use the Local AI URL backend on this device: ${input.localhostBackendDisplay}.`
        : "Auto is ready. This chat can use the Local AI URL backend on this device.",
      reason: null,
    };
  }

  if (input.hasPreparedOnDeviceRuntime) {
    return {
      canUseLocalForChat: true,
      engineLabel,
      summary: `Auto is ready. This chat can use ${onDeviceSummary} on this device.`,
      reason: null,
    };
  }

  return {
    canUseLocalForChat: false,
    engineLabel,
    summary:
      "Auto is selected for this device, but no local runtime is ready yet.",
    reason:
      "Prepare an on-device Gemma model or finish the Local AI URL backend setup in Settings > Local AI before forcing this chat to local.",
  };
}
