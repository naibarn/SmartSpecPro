import { useMemo } from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  executeTauriLocalHttpBackendChatCompletion,
  isTauriDesktopRuntime,
} from "../skills/tauriSkillRuntime";
import { readLocalAiDeviceState } from "../state/localAiDeviceStateStorage";
import type {
  LocalAiDeviceStateScope,
  LocalAiExternalTextBackendConfig,
  LocalAiLocalEnginePreference,
} from "../types/deviceState";

export const EXTERNAL_LOCAL_TEXT_BACKEND_ABORTED_ERROR =
  "external_local_text_backend_aborted";
export const EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER =
  "openai_compatible_local";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isPrivateIpv4Host(hostname: string): boolean {
  const match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map((value) => Number.parseInt(value, 10));
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return false;
}

function isPrivateIpv6Host(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized.startsWith("fc") || normalized.startsWith("fd");
}

function isAllowedLocalBackendHost(hostname: string): boolean {
  return (
    LOOPBACK_HOSTS.has(hostname) ||
    isPrivateIpv4Host(hostname) ||
    isPrivateIpv6Host(hostname)
  );
}

export interface ResolvedExternalLocalTextBackendConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  requestTimeoutMs: number;
}

export interface ExternalLocalTextCompletionResult {
  text: string;
  model: string;
  provider: typeof EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER;
}

interface LocalBackendFetchInit extends RequestInit {
  targetAddressSpace?: "local" | "private";
}

export type ExternalLocalChatMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string;
    }
  | {
      role: "system" | "user" | "assistant";
      content: Array<
        | {
            type: "text";
            text: string;
          }
        | {
            type: "image_url";
            image_url: {
              url: string;
            };
          }
      >;
    };

export interface ExternalLocalTextBackendAvailability {
  scope: LocalAiDeviceStateScope | null;
  backend: ResolvedExternalLocalTextBackendConfig | null;
  configuredBackend: ResolvedExternalLocalTextBackendConfig | null;
  localEnginePreference: LocalAiLocalEnginePreference;
}

interface ResolvedExternalLocalTextBackendMatch {
  config: ResolvedExternalLocalTextBackendConfig | null;
  reason: string | null;
  scope: LocalAiDeviceStateScope | null;
  localEnginePreference: LocalAiLocalEnginePreference;
  usedFallbackScope: boolean;
}

interface ExternalLocalTextBackendResolveOptions {
  treatAsEnabled?: boolean;
}

export function resolveLocalAiLocalEnginePreference(
  candidate?: string | null,
): LocalAiLocalEnginePreference {
  if (candidate === "on_device" || candidate === "localhost_backend") {
    return candidate;
  }
  return "auto";
}

export function shouldAllowExternalLocalBackend(
  preference: LocalAiLocalEnginePreference,
): boolean {
  return preference !== "on_device";
}

export function shouldAllowOnDeviceLocalEngine(
  preference: LocalAiLocalEnginePreference,
): boolean {
  return preference !== "localhost_backend";
}

interface OpenAiChatCompletionPayload {
  choices?: Array<{
    text?: string | null;
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>
        | null;
    } | null;
  }>;
  model?: string | null;
  error?: {
    message?: string | null;
  } | null;
}

function normalizeLocalBackendUrl(rawValue: string): URL | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    if (!isAllowedLocalBackendHost(url.hostname)) {
      return null;
    }
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function shouldPreferPrivateNetworkAddressSpace(url: URL): boolean {
  return !LOOPBACK_HOSTS.has(url.hostname) && isAllowedLocalBackendHost(url.hostname);
}

function isPlainHttpPrivateNetworkBackend(url: URL): boolean {
  return url.protocol === "http:" && shouldPreferPrivateNetworkAddressSpace(url);
}

function shouldReportSecurePagePrivateNetworkBlock(url: URL): boolean {
  return (
    !isTauriDesktopRuntime() &&
    typeof window !== "undefined" &&
    window.isSecureContext &&
    isPlainHttpPrivateNetworkBackend(url)
  );
}

export function getExternalLocalTextBackendBrowserWarning(
  rawValue?: string | null,
): "secure_page_plain_http_private_network" | null {
  if (!rawValue?.trim()) {
    return null;
  }

  const parsedUrl = normalizeLocalBackendUrl(rawValue);
  if (!parsedUrl) {
    return null;
  }

  if (shouldReportSecurePagePrivateNetworkBlock(parsedUrl)) {
    return "secure_page_plain_http_private_network";
  }

  return null;
}

function resolveLocalBackendTargetAddressSpace(
  url: URL,
): LocalBackendFetchInit["targetAddressSpace"] | undefined {
  if (LOOPBACK_HOSTS.has(url.hostname)) {
    return "local";
  }
  if (shouldPreferPrivateNetworkAddressSpace(url)) {
    return "private";
  }
  return undefined;
}

function buildRelatedExternalBackendScopes(
  scope: LocalAiDeviceStateScope,
): LocalAiDeviceStateScope[] {
  const otherRuntimeNamespace =
    scope.runtimeNamespace === "web" ? "tauri" : "web";
  const candidates: LocalAiDeviceStateScope[] = [
    scope,
    {
      ...scope,
      tenantId: null,
    },
    {
      ...scope,
      runtimeNamespace: otherRuntimeNamespace,
    },
    {
      ...scope,
      tenantId: null,
      runtimeNamespace: otherRuntimeNamespace,
    },
  ];

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const candidateKey = [
      candidate.runtimeNamespace,
      candidate.tenantId ?? "",
      candidate.userId ?? "",
    ].join(":");
    if (seen.has(candidateKey)) {
      return false;
    }
    seen.add(candidateKey);
    return true;
  });
}

function readResolvedExternalLocalTextBackendMatch(
  scope?: LocalAiDeviceStateScope | null,
): ResolvedExternalLocalTextBackendMatch {
  if (!scope) {
    return {
      config: null,
      reason: null,
      scope: null,
      localEnginePreference: "auto",
      usedFallbackScope: false,
    };
  }

  let firstReason: string | null = null;

  for (const candidateScope of buildRelatedExternalBackendScopes(scope)) {
    const deviceState = readLocalAiDeviceState(candidateScope);
    const localEnginePreference = resolveLocalAiLocalEnginePreference(
      deviceState.localEnginePreference,
    );
    const treatAsEnabled = localEnginePreference === "localhost_backend";
    const config = resolveExternalLocalTextBackendConfig(
      deviceState.externalTextBackend,
      {
        treatAsEnabled,
      },
    );
    if (config) {
      return {
        config,
        reason: null,
        scope: candidateScope,
        localEnginePreference,
        usedFallbackScope:
          candidateScope.runtimeNamespace !== scope.runtimeNamespace ||
          (candidateScope.tenantId ?? null) !== (scope.tenantId ?? null),
      };
    }

    const reason = resolveExternalLocalTextBackendReason(
      deviceState.externalTextBackend,
      {
        treatAsEnabled,
      },
    );
    if (!firstReason && reason) {
      firstReason = reason;
    }
  }

  return {
    config: null,
    reason: firstReason,
    scope,
    localEnginePreference: resolveLocalAiLocalEnginePreference(
      readLocalAiDeviceState(scope).localEnginePreference,
    ),
    usedFallbackScope: false,
  };
}

export function buildExternalLocalTextBackendScope(input: {
  runtimeNamespace: "web" | "tauri";
  userId?: string | null;
  tenantId?: string | null;
}): LocalAiDeviceStateScope | null {
  if (!input.userId?.trim()) {
    return null;
  }

  return {
    tenantId: input.tenantId?.trim() || null,
    userId: input.userId.trim(),
    runtimeNamespace: input.runtimeNamespace,
  };
}

export function resolveExternalLocalTextBackendConfig(
  candidate?: LocalAiExternalTextBackendConfig | null,
  options?: ExternalLocalTextBackendResolveOptions,
): ResolvedExternalLocalTextBackendConfig | null {
  const isEnabled = options?.treatAsEnabled || candidate?.enabled;
  if (!isEnabled || !candidate) {
    return null;
  }

  const parsedUrl = normalizeLocalBackendUrl(candidate.baseUrl);
  const model = candidate.model?.trim();
  if (!parsedUrl || !model) {
    return null;
  }

  return {
    baseUrl: parsedUrl.toString().replace(/\/+$/, ""),
    apiKey: candidate.apiKey?.trim() || null,
    model,
    requestTimeoutMs: Math.max(
      5_000,
      Math.round(candidate.requestTimeoutMs || 30_000),
    ),
  };
}

export function resolveExternalLocalTextBackendReason(
  candidate?: LocalAiExternalTextBackendConfig | null,
  options?: ExternalLocalTextBackendResolveOptions,
): string | null {
  const isEnabled = options?.treatAsEnabled || candidate?.enabled;
  if (!isEnabled || !candidate) {
    return null;
  }
  if (!candidate.baseUrl.trim()) {
    return "missing_base_url";
  }
  if (!normalizeLocalBackendUrl(candidate.baseUrl)) {
    return "invalid_loopback_url";
  }
  if (!candidate.model?.trim()) {
    return "missing_model";
  }
  return null;
}

export function buildExternalLocalChatCompletionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, "");

  if (normalizedPath.endsWith("/chat/completions")) {
    url.pathname = normalizedPath;
    return url.toString();
  }

  if (normalizedPath.endsWith("/v1")) {
    url.pathname = `${normalizedPath}/chat/completions`;
    return url.toString();
  }

  url.pathname = `${normalizedPath || ""}/v1/chat/completions`;
  return url.toString();
}

function extractCompletionText(payload: OpenAiChatCompletionPayload): string | null {
  const firstChoice = payload.choices?.[0];
  if (!firstChoice) {
    return null;
  }

  if (typeof firstChoice.text === "string" && firstChoice.text.trim()) {
    return firstChoice.text.trim();
  }

  const content = firstChoice.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) =>
        part && part.type === "text" && typeof part.text === "string"
          ? part.text.trim()
          : null,
      )
      .filter((value): value is string => Boolean(value))
      .join("\n")
      .trim();
    return text || null;
  }

  return null;
}

function buildExternalLocalTextBackendError(
  code: string,
  detail?: string | null,
): Error {
  return new Error(detail?.trim() ? `${code}:${detail.trim()}` : code);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isExternalLocalTextBackendAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === EXTERNAL_LOCAL_TEXT_BACKEND_ABORTED_ERROR
  );
}

export function useExternalLocalTextBackendAvailability(
  runtimeNamespace: "web" | "tauri",
): ExternalLocalTextBackendAvailability {
  const { user } = useAuth();

  return useMemo(() => {
    const scope = buildExternalLocalTextBackendScope({
      runtimeNamespace,
      tenantId: user?.currentTenantId ?? null,
      userId: user?.id ?? null,
    });
    if (!scope) {
      return {
        scope: null,
        backend: null,
        configuredBackend: null,
        localEnginePreference: "auto",
      };
    }

    const deviceState = readLocalAiDeviceState(scope);
    const localEnginePreference = resolveLocalAiLocalEnginePreference(
      deviceState.localEnginePreference,
    );
    const resolvedBackendMatch = readResolvedExternalLocalTextBackendMatch(scope);
    const configuredBackend = resolvedBackendMatch.config;
    return {
      scope,
      backend: shouldAllowExternalLocalBackend(localEnginePreference)
        ? configuredBackend
        : null,
      configuredBackend,
      localEnginePreference,
    };
  }, [runtimeNamespace, user?.currentTenantId, user?.id]);
}

export function readLocalAiLocalEnginePreference(
  scope?: LocalAiDeviceStateScope | null,
): LocalAiLocalEnginePreference {
  if (!scope) {
    return "auto";
  }
  return resolveLocalAiLocalEnginePreference(
    readLocalAiDeviceState(scope).localEnginePreference,
  );
}

export function readConfiguredExternalLocalTextBackend(
  scope?: LocalAiDeviceStateScope | null,
): ResolvedExternalLocalTextBackendConfig | null {
  return readResolvedExternalLocalTextBackendMatch(scope).config;
}

export function readConfiguredExternalLocalTextBackendReason(
  scope?: LocalAiDeviceStateScope | null,
): string | null {
  return readResolvedExternalLocalTextBackendMatch(scope).reason;
}

export async function executeExternalLocalChatCompletion(input: {
  config: ResolvedExternalLocalTextBackendConfig;
  messages: ExternalLocalChatMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}): Promise<ExternalLocalTextCompletionResult> {
  const parsedBaseUrl = new URL(input.config.baseUrl);
  if (isTauriDesktopRuntime()) {
    if (input.signal?.aborted) {
      throw new Error(EXTERNAL_LOCAL_TEXT_BACKEND_ABORTED_ERROR);
    }

    try {
      const commandPromise = executeTauriLocalHttpBackendChatCompletion({
        requestUrl: buildExternalLocalChatCompletionsUrl(input.config.baseUrl),
        apiKey: input.config.apiKey,
        model: input.config.model,
        requestTimeoutMs: input.config.requestTimeoutMs,
        messages: input.messages,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
      });

      let response;
      if (input.signal) {
        const signal = input.signal;
        response = await new Promise<Awaited<typeof commandPromise>>(
          (resolve, reject) => {
            const abortListener = () => {
              signal.removeEventListener("abort", abortListener);
              reject(new Error(EXTERNAL_LOCAL_TEXT_BACKEND_ABORTED_ERROR));
            };
            signal.addEventListener("abort", abortListener, {
              once: true,
            });
            commandPromise
              .then((value) => {
                signal.removeEventListener("abort", abortListener);
                resolve(value);
              })
              .catch((error) => {
                signal.removeEventListener("abort", abortListener);
                reject(error);
              });
          },
        );
      } else {
        response = await commandPromise;
      }

      if (!response.success) {
        if (response.httpStatus) {
          throw buildExternalLocalTextBackendError(
            `external_local_backend_http_${response.httpStatus}`,
            response.errorDetail ?? null,
          );
        }
        throw buildExternalLocalTextBackendError(
          response.errorCode || "external_local_backend_unreachable",
          response.errorDetail ?? null,
        );
      }

      const text = response.text?.trim() ?? "";
      if (!text) {
        throw buildExternalLocalTextBackendError(
          "external_local_backend_empty_response",
        );
      }

      return {
        text,
        model: response.model?.trim() || input.config.model,
        provider: EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === EXTERNAL_LOCAL_TEXT_BACKEND_ABORTED_ERROR
      ) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.message.startsWith("external_local_backend_")) {
          throw error;
        }
        throw buildExternalLocalTextBackendError(
          "external_local_backend_unreachable",
          error.message,
        );
      }
      throw buildExternalLocalTextBackendError(
        "external_local_backend_unreachable",
      );
    }
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.config.requestTimeoutMs);
  const abortListener = () => controller.abort();
  input.signal?.addEventListener("abort", abortListener, { once: true });

  try {
    const requestInit: LocalBackendFetchInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.config.apiKey
          ? {
              Authorization: `Bearer ${input.config.apiKey}`,
            }
          : {}),
      },
      body: JSON.stringify({
        model: input.config.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 512,
        stream: false,
      }),
      signal: controller.signal,
    };

    const targetAddressSpace =
      resolveLocalBackendTargetAddressSpace(parsedBaseUrl);
    if (targetAddressSpace) {
      requestInit.targetAddressSpace = targetAddressSpace;
    }

    const response = await fetch(
      buildExternalLocalChatCompletionsUrl(input.config.baseUrl),
      requestInit,
    );

    let payload: OpenAiChatCompletionPayload | null = null;
    try {
      payload = (await response.json()) as OpenAiChatCompletionPayload;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw buildExternalLocalTextBackendError(
        `external_local_backend_http_${response.status}`,
        payload?.error?.message ?? null,
      );
    }

    const text = payload ? extractCompletionText(payload) : null;
    if (!text) {
      throw buildExternalLocalTextBackendError(
        "external_local_backend_empty_response",
      );
    }

    return {
      text,
      model: payload?.model?.trim() || input.config.model,
      provider: EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER,
    };
  } catch (error) {
    if (timedOut) {
      throw buildExternalLocalTextBackendError("external_local_backend_timeout");
    }
    if (input.signal?.aborted || isAbortError(error)) {
      throw new Error(EXTERNAL_LOCAL_TEXT_BACKEND_ABORTED_ERROR);
    }
    if (error instanceof Error) {
      if (
        !error.message.startsWith("external_local_backend_http_") &&
        shouldReportSecurePagePrivateNetworkBlock(parsedBaseUrl)
      ) {
        throw buildExternalLocalTextBackendError(
          "external_local_backend_private_network_blocked",
          error.message,
        );
      }
    }
    if (error instanceof TypeError) {
      throw buildExternalLocalTextBackendError(
        "external_local_backend_unreachable",
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw buildExternalLocalTextBackendError(
      "external_local_backend_unreachable",
    );
  } finally {
    window.clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", abortListener);
  }
}

export async function executeExternalLocalTextCompletion(input: {
  config: ResolvedExternalLocalTextBackendConfig;
  prompt: string;
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string | null;
}): Promise<ExternalLocalTextCompletionResult> {
  return executeExternalLocalChatCompletion({
    config: input.config,
    messages: [
      ...(input.systemPrompt?.trim()
        ? [{ role: "system" as const, content: input.systemPrompt.trim() }]
        : []),
      { role: "user" as const, content: input.prompt },
    ],
    signal: input.signal,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
  });
}

export async function probeExternalLocalTextBackend(input: {
  config: ResolvedExternalLocalTextBackendConfig;
  signal?: AbortSignal;
}): Promise<ExternalLocalTextCompletionResult> {
  return executeExternalLocalTextCompletion({
    config: input.config,
    prompt: "Reply with OK only.",
    maxTokens: 8,
    temperature: 0,
    signal: input.signal,
    systemPrompt: "You are checking a local SmartSpecPro development backend connection. Reply with OK only.",
  });
}
