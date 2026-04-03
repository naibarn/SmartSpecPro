/**
 * AgencyBridge -- HTTP client for Python agency service.
 *
 * All methods construct requests to the Python backend's
 * /api/v1/agencies/* endpoints and return parsed responses.
 * Streaming is NOT handled here -- see section-07 (SSE streaming).
 */

import { getAppRuntimeConfig, getPreferredInternalToken } from "./appRuntimeConfig";
import type { AgencyTaskMetadata } from "./agencyEscalation";
import type { ResolvedAgencyRetrievalScope } from "./agencyExperienceTemplateService";
const RUN_TIMEOUT_MS = 120_000; // 2 minutes for multi-agent runs

interface RunParams {
  agencyId: string;
  conversationId: string;
  message: string;
  userToken: string;
  tenantId: string;
  userId: number;
  /** Task metadata from the planner — propagated to Python agency service */
  taskMetadata?: AgencyTaskMetadata;
  retrievalScope?: ResolvedAgencyRetrievalScope | null;
  /** v1.8: Target a specific agent by name (default: entry point) */
  recipientAgent?: string;
  /** v1.8: File IDs to include with the message */
  fileIds?: string[];
  /** v1.8: Per-run instruction override appended to agent instructions */
  additionalInstructions?: string;
}

export interface StepAttemptSnapshot {
  model_id: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  credits_used: number;
}

export interface StructuredRunResult {
  version: string;
  intent: string;
  summary: string;
  payload: Record<string, unknown>;
  artifacts: Array<Record<string, unknown>>;
  references: Array<Record<string, unknown>>;
  metrics: Record<string, unknown>;
}

export interface PreviewArtifactMetadata {
  id: string;
  intent: string;
  artifact_type: string;
  state: string;
  summary: string | null;
  commit_status: string;
  commit_token: string;
  payload_json?: Record<string, unknown> | null;
  payload_storage_key?: string | null;
  provenance_json?: Array<Record<string, unknown>> | null;
  target_type?: string | null;
  target_id?: string | null;
  committed_at?: string | null;
  expired_at?: string | null;
}

export interface RunResult {
  runId: string;
  conversationId?: string;
  status: string;
  response: string;
  creditsUsed: number;
  durationMs: number;
  startedAt?: string;
  completedAt?: string | null;
  /** Step-attempt snapshots from agency execution (for billing reconciliation) */
  stepAttemptSnapshots: StepAttemptSnapshot[];
  structuredResult: StructuredRunResult | null;
  previewArtifacts: PreviewArtifactMetadata[];
}

interface RunFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

interface RunListResult {
  runs: Array<{
    id: string;
    status: string;
    totalCreditsUsed: number;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
  }>;
  total: number;
}

async function makeHeaders(userToken: string): Promise<Record<string, string>> {
  const gatewayToken = await getPreferredInternalToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${gatewayToken}`,
    "X-User-Token": userToken,
  };
}

async function makeHeadersWithMeta(
  userToken: string,
  tenantId: string,
  userId: number,
): Promise<Record<string, string>> {
  return {
    ...(await makeHeaders(userToken)),
    "X-Tenant-Id": tenantId,
    "X-User-Id": String(userId),
  };
}

// Safe error messages — never expose internal Python error details to client
const ERROR_MAP: Record<number, string> = {
  400: "Invalid request to agency service",
  401: "Authentication failed with agency service",
  402: "Insufficient credits for this operation",
  403: "Access denied to agency resource",
  404: "Agency resource not found",
  409: "Conflict — resource is already in the requested state",
  429: "Rate limit exceeded — please try again later",
  500: "Agency service internal error",
  502: "Agency service temporarily unavailable",
  503: "Agency service temporarily unavailable",
};

async function handleResponse<T>(response: Response, context: string): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  // Log full error details server-side for debugging
  let rawDetail = "";
  try {
    const body = await response.json();
    rawDetail = body.detail || body.error || JSON.stringify(body);
  } catch {
    rawDetail = `HTTP ${response.status}`;
  }
  console.error(`[AgencyBridge] ${context} error (${response.status}):`, rawDetail);

  // Return safe user-facing message (never expose raw Python error details)
  const safeMessage = ERROR_MAP[response.status] ?? `Agency service error (${response.status})`;
  throw new Error(safeMessage);
}

export class AgencyBridge {
  async executeRun(params: RunParams): Promise<RunResult> {
    const runtime = await getAppRuntimeConfig();
    const url = `${runtime.pythonBackendUrl}/api/v1/agencies/${params.agencyId}/run`;

    const body: Record<string, unknown> = {
      conversation_id: params.conversationId,
      message: params.message,
    };
    if (params.taskMetadata) {
      body.task_metadata = params.taskMetadata;
    }
    if (params.retrievalScope) {
      body.retrieval_scope = params.retrievalScope;
    }
    if (params.recipientAgent) {
      body.recipient_agent = params.recipientAgent;
    }
    if (params.fileIds?.length) {
      body.file_ids = params.fileIds;
    }
    if (params.additionalInstructions) {
      body.additional_instructions = params.additionalInstructions;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: await makeHeadersWithMeta(params.userToken, params.tenantId, params.userId),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      });
    } catch (err: any) {
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        throw new Error("Agency run timed out. Please try again with a simpler request.");
      }
      throw err;
    }

    const data = await handleResponse<any>(response, "executeRun");

    return {
      runId: data.run_id,
      conversationId: data.conversation_id,
      status: data.status,
      response: data.response ?? data.output ?? "",
      creditsUsed: data.credits_used ?? 0,
      durationMs: data.duration_ms ?? 0,
      stepAttemptSnapshots: data.step_attempt_snapshots ?? [],
      structuredResult: data.structured_result ?? null,
      previewArtifacts: data.preview_artifacts ?? [],
    };
  }

  async cancelRun(agencyId: string, runId: string, userToken: string): Promise<void> {
    const runtime = await getAppRuntimeConfig();
    const url = `${runtime.pythonBackendUrl}/api/v1/agencies/${agencyId}/runs/${runId}/cancel`;

    const response = await fetch(url, {
      method: "POST",
      headers: await makeHeaders(userToken),
    });

    await handleResponse<any>(response, "cancelRun");
  }

  async listRuns(
    agencyId: string,
    userToken: string,
    filters: RunFilters,
  ): Promise<RunListResult> {
    const runtime = await getAppRuntimeConfig();
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.limit != null) params.set("limit", String(filters.limit));
    if (filters.offset != null) params.set("offset", String(filters.offset));

    const qs = params.toString();
    const url = `${runtime.pythonBackendUrl}/api/v1/agencies/${agencyId}/runs${qs ? `?${qs}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: await makeHeaders(userToken),
    });

    return handleResponse<RunListResult>(response, "listRuns");
  }

  async getRunDetails(
    agencyId: string,
    runId: string,
    userToken: string,
  ): Promise<RunResult> {
    const runtime = await getAppRuntimeConfig();
    const url = `${runtime.pythonBackendUrl}/api/v1/agencies/${agencyId}/runs/${runId}`;

    const response = await fetch(url, {
      method: "GET",
      headers: await makeHeaders(userToken),
    });

    const data = await handleResponse<any>(response, "getRunDetails");

    return {
      runId: data.run_id ?? data.id,
      conversationId: data.conversation_id,
      status: data.status,
      response: data.response ?? data.output ?? "",
      creditsUsed: data.credits_used ?? data.totalCreditsUsed ?? 0,
      durationMs: data.duration_ms ?? data.durationMs ?? 0,
      startedAt: data.started_at ?? data.startedAt,
      completedAt: data.completed_at ?? data.completedAt ?? null,
      stepAttemptSnapshots: data.step_attempt_snapshots ?? [],
      structuredResult: data.structured_result ?? null,
      previewArtifacts: data.preview_artifacts ?? [],
    };
  }
}

export const agencyBridge = new AgencyBridge();
