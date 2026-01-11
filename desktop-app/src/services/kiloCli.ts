import { getProxyToken, loadProxyToken } from "./authStore";

export type KiloRunResult = { 
  jobId: string;
  sessionId?: string;
  contextInfo?: {
    totalTokens: number;
    wasTruncated: boolean;
    usagePercent: number;
  };
};

export type WorkflowArgType = "string" | "enum";

export interface WorkflowArgSchema {
  name: string;
  type: WorkflowArgType;
  values?: string[];
  required?: boolean;
}

export interface WorkflowSchema {
  name: string;
  description?: string;
  example?: string;
  args?: WorkflowArgSchema[];
}

export type WorkflowList = {
  workflows: string[];
  schemas?: WorkflowSchema[];
};

export type StreamMessage = {
  type: "stdout" | "done" | "error" | "status" | string;
  seq: number;
  line?: string;
  data?: string;  // Backend sends 'data' field for stdout
  status?: string;
  returncode?: number;
  message?: string;
};

// Conversation context types
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

export interface ConversationContext {
  sessionId?: string;
  recentMessages?: ConversationMessage[];
  summary?: string;
}

export interface SessionContextInfo {
  sessionId: string;
  messageCount: number;
  totalTokens: number;
  effectiveLimit: number;
  usagePercent: number;
  hasSummary: boolean;
  reservedForOutput: number;
}

const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

function authHeaders(): Record<string, string> {
  const t = getProxyToken();
  if (!t) return {};
  return { authorization: `Bearer ${t}`, "x-proxy-token": t };
}

async function ensureToken() {
  if (!getProxyToken()) await loadProxyToken();
}

/**
 * Run a Kilo CLI command with optional conversation context.
 * 
 * @param workspace - The workspace directory
 * @param command - The command to run
 * @param context - Optional conversation context for multi-turn conversations
 */
export async function kiloRun(
  workspace: string, 
  command: string,
  context?: ConversationContext
): Promise<KiloRunResult> {
  await ensureToken();
  
  const body: Record<string, unknown> = { workspace, command };
  
  // Add session and context if provided
  if (context?.sessionId) {
    body.session_id = context.sessionId;
  }
  if (context) {
    body.conversation_context = {
      session_id: context.sessionId,
      recent_messages: context.recentMessages?.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp
      })),
      summary: context.summary
    };
  }
  
  const res = await fetch(`${BASE}/api/v1/kilo/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`kiloRun failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Record assistant response for context tracking.
 * Called after job completes to store the response in conversation history.
 */
export async function kiloRecordResponse(
  jobId: string, 
  response: string
): Promise<void> {
  await ensureToken();
  
  const res = await fetch(`${BASE}/api/v1/kilo/jobs/${encodeURIComponent(jobId)}/response`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ response }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`kiloRecordResponse failed (${res.status}): ${text}`);
    // Don't throw - this is not critical
  }
}

/**
 * Get context usage information for a session.
 */
export async function kiloGetSessionContext(
  sessionId: string
): Promise<SessionContextInfo> {
  await ensureToken();
  
  const res = await fetch(`${BASE}/api/v1/kilo/sessions/${encodeURIComponent(sessionId)}/context`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`kiloGetSessionContext failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function kiloListWorkflows(workspace: string): Promise<WorkflowList> {
  await ensureToken();
  const url = new URL(`${BASE}/api/v1/kilo/workflows`);
  if (workspace) {
    url.searchParams.set("workspace", workspace);
  }

  console.log("🔍 Fetching workflows from:", url.toString());
  console.log("🔑 Headers:", authHeaders());

  try {
    const res = await fetch(url.toString(), { headers: authHeaders() });
    console.log("📡 Response status:", res.status, res.statusText);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("❌ API Error:", res.status, text);
      throw new Error(`Failed to fetch workflows (${res.status}): ${text}`);
    }

    const data = await res.json();
    console.log("✅ Got data:", data);

    if (!data.workflows) {
      data.workflows = [];
    }
    return data as WorkflowList;
  } catch (err) {
    console.error("❌ Fetch error:", err);
    throw err;
  }
}

// Backwards compatible alias used by older code paths.
export const kiloWorkflows = kiloListWorkflows;

export async function kiloStreamNdjson(
  jobId: string,
  from: number,
  onMsg: (m: StreamMessage) => void,
  signal?: AbortSignal
): Promise<void> {
  await ensureToken();
  const url = new URL(`${BASE}/api/v1/kilo/jobs/${encodeURIComponent(jobId)}/events`);
  if (from && from > 0) {
    url.searchParams.set("from", String(from));
  }

  const res = await fetch(url.toString(), {
    headers: authHeaders(),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`events failed (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buf.indexOf("\n");
      if (idx < 0) break;
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        onMsg(JSON.parse(line));
      } catch {
        // ignore malformed lines
      }
    }
  }
}

export async function kiloCancel(jobId: string): Promise<void> {
  await ensureToken();
  const res = await fetch(`${BASE}/api/v1/kilo/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`kiloCancel failed (${res.status}): ${text}`);
  }
}

export async function kiloSendInput(jobId: string, text: string): Promise<void> {
  await ensureToken();
  const res = await fetch(`${BASE}/api/v1/kilo/jobs/${encodeURIComponent(jobId)}/input`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`kiloSendInput failed (${res.status}): ${t}`);
  }
}
