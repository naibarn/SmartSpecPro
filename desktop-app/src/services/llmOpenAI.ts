import { uploadToArtifactStorage } from "./artifacts";

const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: any;
  tool_call_id?: string;
};

export type StreamHandlers = {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
};

function parseSseBuffer(buf: string): { events: string[]; rest: string } {
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  return { events: parts, rest };
}

function extractDataLines(evt: string): string[] {
  return evt
    .split("\n")
    .filter(l => l.startsWith("data:"))
    .map(l => l.replace(/^data:\s?/, ""));
}

export async function chatStream(params: {
  model?: string;
  messages: ChatMessage[];
  tools?: any[];
  tool_choice?: any;
  response_format?: any;
  handlers: StreamHandlers;
}) {
  const body = {
    model: params.model || "gpt-4.1-mini",
    messages: params.messages,
    tools: params.tools,
    tool_choice: params.tool_choice,
    response_format: params.response_format,
    stream: true,
  };

  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    params.handlers.onError(`HTTP ${res.status}: ${text}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { events, rest } = parseSseBuffer(buffer);
      buffer = rest;

      for (const evt of events) {
        const lines = extractDataLines(evt);
        for (const d of lines) {
          if (d === "[DONE]") {
            params.handlers.onDone();
            return;
          }
          try {
            const obj = JSON.parse(d);
            const delta = obj?.choices?.[0]?.delta;
            const tok = delta?.content;
            if (typeof tok === "string" && tok.length) {
              params.handlers.onToken(tok);
            }
          } catch {
            // ignore
          }
        }
      }
    }
    params.handlers.onDone();
  } catch (e: any) {
    params.handlers.onError(String(e?.message || e));
  }
}

export async function buildUserMessageWithOptionalImage(opts: {
  workspace: string;
  text: string;
  file?: File | null;
}) {
  const parts: any[] = [];
  if (opts.text?.trim()) parts.push({ type: "text", text: opts.text.trim() });

  if (opts.file) {
    const uploaded = await uploadToArtifactStorage({ workspace: opts.workspace, file: opts.file, iteration: 0 });
    parts.push({ type: "image_url", image_url: { url: uploaded.getUrl, detail: "auto" } });
    return { message: { role: "user", content: parts }, artifact: uploaded };
  }

  return { message: { role: "user", content: parts.length === 1 ? parts[0].text : parts }, artifact: null };
}
