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
  personaContext?: string;
  teamId?: string;
  roomId?: string;
}

export interface ExecuteTurnResponse {
  content: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
  costCredits: number;
  nextSpeakerHint?: string;
  metadata?: Record<string, unknown>;
}

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";
const INTERNAL_PROXY_TOKEN = process.env.SMARTSPEC_PROXY_TOKEN ?? process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? "";
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
        "X-Proxy-Token": INTERNAL_PROXY_TOKEN,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Team orchestrator responded ${res.status}: ${text}`);
    }

    const raw = await res.json();
    return {
      content: raw.content ?? "",
      tokenUsage: {
        inputTokens: raw.tokenUsage?.inputTokens ?? raw.input_tokens ?? 0,
        outputTokens: raw.tokenUsage?.outputTokens ?? raw.output_tokens ?? 0,
      },
      costCredits: raw.costCredits ?? raw.cost_credits ?? 0,
      nextSpeakerHint: raw.nextSpeakerHint ?? raw.next_speaker_hint ?? undefined,
      metadata: raw.metadata ?? {},
    };
  } finally {
    clearTimeout(timeout);
  }
}
