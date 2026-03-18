/**
 * Team Orchestration Bridge — HTTP client for Python backend LLM execution.
 *
 * Calls POST /api/team-orchestrator/execute-turn on the Python backend
 * for agent turn execution.
 */

export interface ExecuteTurnRequest {
  runId: string;
  assistantId: string;
  prompt: string;
  modelId?: string;
  tenantId: string;
  userId: number;
}

export interface ExecuteTurnResponse {
  content: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
  costCredits: number;
  nextSpeakerHint?: string;
  metadata?: Record<string, unknown>;
}

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";
const GATEWAY_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? "";
const TIMEOUT_MS = 120_000;

export async function executeAgentTurn(
  params: ExecuteTurnRequest,
): Promise<ExecuteTurnResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}/api/team-orchestrator/execute-turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Token": GATEWAY_TOKEN,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Team orchestrator responded ${res.status}: ${text}`);
    }

    return await res.json() as ExecuteTurnResponse;
  } finally {
    clearTimeout(timeout);
  }
}
