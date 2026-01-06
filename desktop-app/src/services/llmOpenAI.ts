import { uploadToArtifactStorage } from "./artifacts";

const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: any;
  tool_call_id?: string;
};

export type ToolStatus = {
  traceId: string;
  phase: "start" | "end" | "limit";
  name?: string;
  toolCallId?: string;
  ok?: boolean;
  argsHash?: string;
  resultHash?: string;
  message?: string;
};

export type ToolApprovalRequired = {
  traceId: string;
  toolCallId: string;
  name?: string;
  reason?: string;
};

export type StreamHandlers = {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  onTrace?: (traceId: string) => void;
  onToolStatus?: (s: ToolStatus) => void;
  onToolApprovalRequired?: (a: ToolApprovalRequired) => void;
};

function parseSseBuffer(buf: string): { events: string[]; rest: string } {
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  return { events: parts, rest };
}

function parseEventBlock(block: string): { event?: string; dataLines: string[] } {
  const lines = block.split("\n");
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const l of lines) {
    if (l.startsWith("event:")) event = l.replace(/^event:\s?/, "").trim();
    if (l.startsWith("data:")) dataLines.push(l.replace(/^data:\s?/, ""));
  }
  return { event, dataLines };
}

export async function approveTool(params: { traceId: string; toolCallId: string; approved: boolean; writeToken?: string }) {
  const res = await fetch(`${BASE}/v1/tool-approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`approve_failed:${res.status}:${text}`);
  }
  return await res.json().catch(() => ({ ok: true }));
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

      for (const block of events) {
        const { event, dataLines } = parseEventBlock(block);
        for (const d of dataLines) {
          if (d === "[DONE]") {
            params.handlers.onDone();
            return;
          }

          if (event === "trace") {
            try {
              const obj = JSON.parse(d);
              if (obj?.traceId && params.handlers.onTrace) params.handlers.onTrace(String(obj.traceId));
            } catch {}
            continue;
          }

          if (event === "tool_status") {
            try {
              const obj = JSON.parse(d);
              if (params.handlers.onToolStatus) params.handlers.onToolStatus(obj);
            } catch {}
            continue;
          }

          if (event === "tool_approval_required") {
            try {
              const obj = JSON.parse(d);
              if (params.handlers.onToolApprovalRequired) params.handlers.onToolApprovalRequired(obj);
            } catch {}
            continue;
          }

          try {
            const obj = JSON.parse(d);
            const delta = obj?.choices?.[0]?.delta;
            const tok = delta?.content;
            if (typeof tok === "string" && tok.length) params.handlers.onToken(tok);
          } catch {}
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
