import type {
  LocalAiDeviceState,
  LocalAiDeviceStateScope,
  LocalAiLocalEnginePreference,
} from "../types/deviceState";
import {
  DEFAULT_LOCAL_AI_DEVICE_STATE,
  DEFAULT_LOCAL_AI_EXTERNAL_TEXT_BACKEND,
} from "../types/deviceState";

const LOCAL_AI_DEVICE_STATE_PREFIX = "smartspec.localAi.device";
export const LOCAL_AI_DEVICE_STATE_UPDATED_EVENT =
  "smartspec:local-ai-device-state-updated";

function normalizeLocalEnginePreference(
  value: unknown,
): LocalAiLocalEnginePreference {
  return value === "on_device" || value === "localhost_backend"
    ? value
    : "auto";
}

export function buildLocalAiDeviceStateStorageKey(
  scope: LocalAiDeviceStateScope,
): string {
  const tenantId = scope.tenantId?.trim() || "anonymous-tenant";
  const userId = scope.userId?.trim() || "anonymous-user";
  return [
    LOCAL_AI_DEVICE_STATE_PREFIX,
    scope.runtimeNamespace,
    tenantId,
    userId,
  ].join(":");
}

function emitLocalAiDeviceStateUpdated(scope: LocalAiDeviceStateScope): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(LOCAL_AI_DEVICE_STATE_UPDATED_EVENT, {
      detail: {
        scope,
        key: buildLocalAiDeviceStateStorageKey(scope),
      },
    }),
  );
}

export function readLocalAiDeviceState(
  scope: LocalAiDeviceStateScope,
): LocalAiDeviceState {
  if (typeof window === "undefined") {
    return { ...DEFAULT_LOCAL_AI_DEVICE_STATE };
  }

  try {
    const raw = window.localStorage.getItem(
      buildLocalAiDeviceStateStorageKey(scope),
    );
    if (!raw) {
      return { ...DEFAULT_LOCAL_AI_DEVICE_STATE };
    }
    const parsed = JSON.parse(raw) as Partial<LocalAiDeviceState>;
    return {
      ...DEFAULT_LOCAL_AI_DEVICE_STATE,
      ...parsed,
      localEnginePreference: normalizeLocalEnginePreference(
        parsed.localEnginePreference,
      ),
      consentedModelIds: Array.isArray(parsed.consentedModelIds)
        ? parsed.consentedModelIds.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      installedModelIds: Array.isArray(parsed.installedModelIds)
        ? parsed.installedModelIds.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      lastCapabilityReasons: Array.isArray(parsed.lastCapabilityReasons)
        ? parsed.lastCapabilityReasons.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      externalTextBackend:
        parsed.externalTextBackend &&
        typeof parsed.externalTextBackend === "object"
          ? {
              ...DEFAULT_LOCAL_AI_EXTERNAL_TEXT_BACKEND,
              ...parsed.externalTextBackend,
              baseUrl:
                typeof parsed.externalTextBackend.baseUrl === "string"
                  ? parsed.externalTextBackend.baseUrl
                  : DEFAULT_LOCAL_AI_EXTERNAL_TEXT_BACKEND.baseUrl,
              apiKey:
                typeof parsed.externalTextBackend.apiKey === "string"
                  ? parsed.externalTextBackend.apiKey
                  : parsed.externalTextBackend.apiKey === null
                    ? null
                    : DEFAULT_LOCAL_AI_EXTERNAL_TEXT_BACKEND.apiKey,
              model:
                typeof parsed.externalTextBackend.model === "string"
                  ? parsed.externalTextBackend.model
                  : parsed.externalTextBackend.model === null
                    ? null
                    : DEFAULT_LOCAL_AI_EXTERNAL_TEXT_BACKEND.model,
              requestTimeoutMs:
                typeof parsed.externalTextBackend.requestTimeoutMs === "number" &&
                Number.isFinite(parsed.externalTextBackend.requestTimeoutMs)
                  ? Math.max(5_000, Math.round(parsed.externalTextBackend.requestTimeoutMs))
                  : DEFAULT_LOCAL_AI_EXTERNAL_TEXT_BACKEND.requestTimeoutMs,
            }
          : {
              ...DEFAULT_LOCAL_AI_EXTERNAL_TEXT_BACKEND,
            },
    };
  } catch {
    return { ...DEFAULT_LOCAL_AI_DEVICE_STATE };
  }
}

export function writeLocalAiDeviceState(
  scope: LocalAiDeviceStateScope,
  patch: Partial<LocalAiDeviceState>,
): LocalAiDeviceState {
  const next = {
    ...readLocalAiDeviceState(scope),
    ...patch,
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      buildLocalAiDeviceStateStorageKey(scope),
      JSON.stringify(next),
    );
    emitLocalAiDeviceStateUpdated(scope);
  }

  return next;
}

export function clearLocalAiDeviceState(
  scope: LocalAiDeviceStateScope,
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(buildLocalAiDeviceStateStorageKey(scope));
  emitLocalAiDeviceStateUpdated(scope);
}
