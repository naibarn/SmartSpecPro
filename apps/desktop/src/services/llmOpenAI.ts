import { getProxyToken } from "./authStore";
import { getAuthToken } from "./authService";

export type Role = "system" | "user" | "assistant" | "tool";

export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };
export type FilePart = { type: "file_url"; file_url: { url: string; mime_type?: string; name?: string } };

export type ContentPart = TextPart | ImagePart | FilePart;

export type Message = {
  role: Role;
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
};

export type ChatCompletionRequest = {
  model?: string;
  messages: Message[];
  tools?: any[];
  tool_choice?: any;
  response_format?: any;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
};

export type ChatCompletionResponse = any;

export type StreamDelta = {
  raw: any;
  text?: string;
  tool_calls?: any;
};

const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

/**
 * Legacy key-in-query is risky (leaks in logs). Disabled by default.
 * Enable only for local dev and older backends.
 */
const ALLOW_LEGACY_KEY = import.meta.env.VITE_ALLOW_LEGACY_KEY === "1";
const LEGACY_KEY = import.meta.env.VITE_ORCHESTRATOR_KEY || "";

function buildUrl(path: string) {
  const u = new URL(`${BASE.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`);
  if (ALLOW_LEGACY_KEY && LEGACY_KEY) u.searchParams.set("key", LEGACY_KEY);
  return u;
}

function authHeaders(extra?: Record<string, string>) {
  const h: Record<string, string> = {
    "content-type": "application/json",
    ...(extra || {}),
  };

  // Prefer auth token (for credit tracking) over proxy token
  const authToken = getAuthToken();
  const proxyToken = getProxyToken();

  const token = authToken || proxyToken;
  if (token) {
    h["authorization"] = `Bearer ${token}`;
    // Keep x-proxy-token for backward compatibility
    if (proxyToken) {
      h["x-proxy-token"] = proxyToken;
    }
  }
  return h;
}

export async function chatCompletions(req: ChatCompletionRequest): Promise<ChatCompletionResponse>;
export async function chatCompletions(
  messages: Message[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  model?: string
): Promise<void>;
export async function chatCompletions(
  reqOrMessages: ChatCompletionRequest | Message[],
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  model?: string
): Promise<ChatCompletionResponse | void> {
  // Check if this is the streaming callback version
  if (Array.isArray(reqOrMessages)) {
    const messages = reqOrMessages;
    const url = buildUrl("/v1/chat/completions");

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: authHeaders({ accept: "text/event-stream" }),
      body: JSON.stringify({ messages, stream: true, model: model || undefined }),
      signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM error (${res.status}): ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const lines = chunk.split("\n").map((l) => l.trim());
        const dataLines = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;

        for (const data of dataLines) {
          if (!data) continue;
          if (data === "[DONE]") return;

          let parsed: any = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          const choice = parsed?.choices?.[0];
          const delta = choice?.delta ?? choice?.message ?? null;
          const textDelta: string | undefined = typeof delta?.content === "string" ? delta.content : undefined;

          if (textDelta && onChunk) {
            onChunk(textDelta);
          }
        }
      }
    }
    return;
  }

  // Original non-streaming version
  const req = reqOrMessages;
  const url = buildUrl("/v1/chat/completions");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ...req, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM error (${res.status}): ${text}`);
  }

  return res.json();
}

export async function* chatCompletionsStream(req: ChatCompletionRequest): AsyncGenerator<StreamDelta, void, void> {
  const url = buildUrl("/v1/chat/completions");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: authHeaders({ accept: "text/event-stream" }),
    body: JSON.stringify({ ...req, stream: true }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM stream error (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = chunk.split("\n").map((l) => l.trim());
      const dataLines = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
      if (dataLines.length === 0) continue;

      for (const data of dataLines) {
        if (!data) continue;
        if (data === "[DONE]") return;

        let parsed: any = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        const choice = parsed?.choices?.[0];
        const delta = choice?.delta ?? choice?.message ?? null;

        const textDelta: string | undefined = typeof delta?.content === "string" ? delta.content : undefined;
        const toolCalls = delta?.tool_calls;

        yield { raw: parsed, text: textDelta, tool_calls: toolCalls };
      }
    }
  }
}
