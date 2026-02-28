/**
 * AgencyBridge -- HTTP client for Python agency service.
 *
 * All methods construct requests to the Python backend's
 * /api/v1/agencies/* endpoints and return parsed responses.
 * Streaming is NOT handled here -- see section-07 (SSE streaming).
 */

import { ENV } from "../_core/env";

const PYTHON_BACKEND_URL = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");
const GATEWAY_TOKEN = ENV.webGatewayToken;
const RUN_TIMEOUT_MS = 120_000; // 2 minutes for multi-agent runs

interface RunParams {
  agencyId: string;
  conversationId: string;
  message: string;
  userToken: string;
  tenantId: string;
  userId: number;
}

export interface RunResult {
  runId: string;
  status: string;
  response: string;
  creditsUsed: number;
  durationMs: number;
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

function makeHeaders(userToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${GATEWAY_TOKEN}`,
    "X-User-Token": userToken,
  };
}

function makeHeadersWithMeta(
  userToken: string,
  tenantId: string,
  userId: number,
): Record<string, string> {
  return {
    ...makeHeaders(userToken),
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
    const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${params.agencyId}/run`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: makeHeadersWithMeta(params.userToken, params.tenantId, params.userId),
        body: JSON.stringify({
          conversation_id: params.conversationId,
          message: params.message,
        }),
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
      status: data.status,
      response: data.response,
      creditsUsed: data.credits_used ?? 0,
      durationMs: data.duration_ms ?? 0,
    };
  }

  async cancelRun(agencyId: string, runId: string, userToken: string): Promise<void> {
    const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${agencyId}/runs/${runId}/cancel`;

    const response = await fetch(url, {
      method: "POST",
      headers: makeHeaders(userToken),
    });

    await handleResponse<any>(response, "cancelRun");
  }

  async listRuns(
    agencyId: string,
    userToken: string,
    filters: RunFilters,
  ): Promise<RunListResult> {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.limit != null) params.set("limit", String(filters.limit));
    if (filters.offset != null) params.set("offset", String(filters.offset));

    const qs = params.toString();
    const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${agencyId}/runs${qs ? `?${qs}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: makeHeaders(userToken),
    });

    return handleResponse<RunListResult>(response, "listRuns");
  }

  async getRunDetails(
    agencyId: string,
    runId: string,
    userToken: string,
  ): Promise<RunResult> {
    const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${agencyId}/runs/${runId}`;

    const response = await fetch(url, {
      method: "GET",
      headers: makeHeaders(userToken),
    });

    const data = await handleResponse<any>(response, "getRunDetails");

    return {
      runId: data.run_id ?? data.id,
      status: data.status,
      response: data.response ?? "",
      creditsUsed: data.credits_used ?? data.totalCreditsUsed ?? 0,
      durationMs: data.duration_ms ?? data.durationMs ?? 0,
    };
  }
}

export const agencyBridge = new AgencyBridge();
