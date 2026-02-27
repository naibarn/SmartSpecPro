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

interface RunResult {
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

async function handleResponse<T>(response: Response, context: string): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let detail = "";
  try {
    const body = await response.json();
    detail = body.detail || body.error || JSON.stringify(body);
  } catch {
    detail = `HTTP ${response.status}`;
  }

  if (response.status === 402) {
    throw new Error(`Insufficient credits: ${detail}`);
  }
  if (response.status === 404) {
    throw new Error(`Not found: ${detail}`);
  }
  if (response.status === 429) {
    throw new Error(`Rate limit exceeded: ${detail}`);
  }

  throw new Error(`Agency bridge ${context} failed (${response.status}): ${detail}`);
}

export class AgencyBridge {
  async executeRun(params: RunParams): Promise<RunResult> {
    const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${params.agencyId}/run`;

    const response = await fetch(url, {
      method: "POST",
      headers: makeHeadersWithMeta(params.userToken, params.tenantId, params.userId),
      body: JSON.stringify({
        conversation_id: params.conversationId,
        message: params.message,
      }),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });

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
