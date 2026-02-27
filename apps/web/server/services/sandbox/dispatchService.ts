/**
 * Central decision point for sandbox vs legacy workload routing.
 * Sends dispatch requests to the Python backend.
 */

import { ENV } from "../../_core/env";

const INTERNAL_TIMEOUT_MS = 30_000; // 30 seconds

export type ExecutionMode =
  | "core-text"
  | "llm-only"
  | "sandbox-code"
  | "sandbox-command"
  | "sandbox-browser"
  | "sandbox-file"
  | "sandbox-media"
  | "sandbox-python"
  | "media-generate";

export interface SandboxDispatchRequest {
  featureType: "chat" | "skill" | "workflow" | "library" | "media" | "presentation" | "connector" | "agency";
  executionMode: ExecutionMode;
  tenantId: string;
  userId: number;
  inputFiles: Array<{ key: string; mimeType: string; sizeBytes: number }>;
  profileOverride?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface SandboxDispatchResult {
  jobId: string;
}

const LEGACY_MODES = new Set<string>(["core-text", "llm-only"]);

/**
 * Build headers for internal service-to-service calls.
 */
function internalHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = ENV.webGatewayToken;
  if (token) {
    headers["X-Internal-Token"] = token;
  }
  return headers;
}

/**
 * Fetch wrapper for internal Python backend calls with timeout and auth.
 */
export async function internalFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNAL_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      headers: { ...internalHeaders(), ...init?.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Determine whether a workload should use the sandbox execution path.
 * Returns false for core-text/llm-only modes or when sandbox is disabled.
 */
export function shouldUseSandbox(executionMode: string): boolean {
  if (process.env.OPENSANDBOX_ENABLED !== "true") return false;
  if (LEGACY_MODES.has(executionMode)) return false;
  return true;
}

/**
 * Dispatch a workload to the sandbox system via the Python backend.
 */
export async function dispatchToSandbox(
  request: SandboxDispatchRequest,
): Promise<SandboxDispatchResult> {
  const baseUrl = ENV.pythonBackendUrl || "http://localhost:8000";
  const url = `${baseUrl}/api/internal/sandbox/dispatch`;

  const response = await internalFetch(url, {
    method: "POST",
    body: JSON.stringify({
      feature_type: request.featureType,
      execution_mode: request.executionMode,
      tenant_id: request.tenantId,
      user_id: request.userId,
      input_files: request.inputFiles,
      profile_override: request.profileOverride,
      idempotency_key: request.idempotencyKey,
      metadata: request.metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Sandbox dispatch failed (${response.status}): ${text}`,
    );
  }

  const data = await response.json();
  return { jobId: data.job_id };
}
