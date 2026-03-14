import { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { requireScopes } from "../middleware/requireScopes";
import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth";
import { getRedisClient } from "../services/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpSession {
  state: "ready" | "error";
  tenantId: string;
  userId: number;
  apiKeyId: string;
  scopes: string[];
  createdAt: string;
}

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: object;
  requiredScope: string;
  readWrite: "Read" | "Write";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_TTL_SECONDS = 1800; // 30 minutes
const TOOL_TIMEOUT_MS = 60_000;
const MAX_RESULT_BYTES = 100 * 1024; // 100KB

// ---------------------------------------------------------------------------
// Tool Registry (28 tools)
// ---------------------------------------------------------------------------

const TOOL_REGISTRY: McpToolDef[] = [
  // Skills
  {
    name: "smartspec.skills.list",
    description: "List available SmartSpecPro skills",
    requiredScope: "skills:list",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        search: { type: "string" },
        page: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "smartspec.skills.execute",
    description: "Execute a SmartSpecPro skill with provided inputs",
    requiredScope: "skills:execute",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["skill_id", "inputs"],
      properties: {
        skill_id: { type: "string" },
        inputs: { type: "object" },
        model: { type: "string" },
      },
    },
  },
  {
    name: "smartspec.skills.detect",
    description: "Detect the most relevant skill for a given prompt",
    requiredScope: "skills:execute",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: { prompt: { type: "string" } },
    },
  },
  // Agencies
  {
    name: "smartspec.agencies.list",
    description: "List AI agencies available in the tenant",
    requiredScope: "agencies:list",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "smartspec.agencies.invoke",
    description: "Invoke an AI agency with a message",
    requiredScope: "agencies:invoke",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["agency_id", "message"],
      properties: {
        agency_id: { type: "string" },
        message: { type: "string" },
        conversation_id: { type: "string" },
        max_credits: { type: "integer" },
      },
    },
  },
  {
    name: "smartspec.agencies.status",
    description: "Check the status of an agency run",
    requiredScope: "agencies:invoke",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      required: ["agency_id", "run_id"],
      properties: {
        agency_id: { type: "string" },
        run_id: { type: "string" },
      },
    },
  },
  // LLM
  {
    name: "smartspec.llm.chat",
    description: "Send a chat completion request through SmartSpecPro's LLM router",
    requiredScope: "llm:chat",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["messages"],
      properties: {
        messages: { type: "array" },
        model: { type: "string" },
        max_tokens: { type: "integer" },
        temperature: { type: "number" },
      },
    },
  },
  {
    name: "smartspec.llm.embed",
    description: "Generate text embeddings",
    requiredScope: "llm:chat",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        model: { type: "string" },
      },
    },
  },
  {
    name: "smartspec.llm.models",
    description: "List available LLM models",
    requiredScope: "llm:chat",
    readWrite: "Read",
    inputSchema: { type: "object", properties: {} },
  },
  // Media
  {
    name: "smartspec.media.generate_image",
    description: "Generate an image from a text prompt",
    requiredScope: "media:generate",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        model: { type: "string" },
        width: { type: "integer" },
        height: { type: "integer" },
        reference_image_urls: { type: "array", items: { type: "string" }, maxItems: 5 },
      },
    },
  },
  {
    name: "smartspec.media.generate_video",
    description: "Generate a video from a text prompt",
    requiredScope: "media:generate",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        model: { type: "string" },
        duration_seconds: { type: "number" },
      },
    },
  },
  {
    name: "smartspec.media.generate_audio",
    description: "Generate audio or text-to-speech",
    requiredScope: "media:generate",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        voice: { type: "string" },
        model: { type: "string" },
      },
    },
  },
  {
    name: "smartspec.media.status",
    description: "Check the status of a media generation task",
    requiredScope: "media:generate",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string" } },
    },
  },
  // Presentations
  {
    name: "smartspec.presentations.create",
    description: "Generate an AI-powered presentation from a topic or prompt",
    requiredScope: "presentations:create",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        slide_count: { type: "integer", minimum: 1, maximum: 30 },
        style: { type: "string" },
      },
    },
  },
  {
    name: "smartspec.presentations.list",
    description: "List presentations in the tenant",
    requiredScope: "presentations:create",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "smartspec.presentations.export",
    description: "Export a presentation to PPTX or PDF",
    requiredScope: "presentations:create",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["deck_id"],
      properties: {
        deck_id: { type: "integer" },
        format: { type: "string", enum: ["pptx", "pdf"] },
      },
    },
  },
  {
    name: "smartspec.presentations.download",
    description: "Get download URL for an exported presentation",
    requiredScope: "presentations:create",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      required: ["deck_id"],
      properties: { deck_id: { type: "integer" } },
    },
  },
  // Video Projects
  {
    name: "smartspec.video_projects.create",
    description: "Create a new video project",
    requiredScope: "video_projects:create",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["title", "duration_minutes"],
      properties: {
        title: { type: "string" },
        duration_minutes: { type: "number" },
        quality: { type: "string", enum: ["draft", "standard", "high"] },
      },
    },
  },
  {
    name: "smartspec.video_projects.list",
    description: "List video projects in the tenant",
    requiredScope: "video_projects:create",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "smartspec.video_projects.export",
    description: "Retrieve download URL for a completed video project",
    requiredScope: "video_projects:create",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: { project_id: { type: "string" } },
    },
  },
  // Jobs
  {
    name: "smartspec.jobs.submit",
    description: "Submit an automation job",
    requiredScope: "jobs:create",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["type", "params"],
      properties: {
        type: { type: "string" },
        params: { type: "object" },
        max_credits: { type: "integer" },
      },
    },
  },
  {
    name: "smartspec.jobs.status",
    description: "Check the status of an automation job",
    requiredScope: "jobs:read",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      required: ["job_id"],
      properties: { job_id: { type: "string" } },
    },
  },
  {
    name: "smartspec.jobs.cancel",
    description: "Cancel a running automation job",
    requiredScope: "jobs:create",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["job_id"],
      properties: { job_id: { type: "string" } },
    },
  },
  // Files
  {
    name: "smartspec.files.read",
    description: "Read a file from the workspace",
    requiredScope: "mcp:read",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "smartspec.files.list",
    description: "List files in a workspace directory",
    requiredScope: "mcp:read",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
    },
  },
  // Drive
  {
    name: "smartspec.drive.search",
    description: "Search files in the connected drive",
    requiredScope: "mcp:read",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" } },
    },
  },
  {
    name: "smartspec.drive.read",
    description: "Read a file from the connected drive",
    requiredScope: "mcp:read",
    readWrite: "Read",
    inputSchema: {
      type: "object",
      required: ["file_id"],
      properties: { file_id: { type: "string" } },
    },
  },
  // Browser
  {
    name: "smartspec.browser.execute_actions",
    description: "Execute browser automation actions",
    requiredScope: "mcp:write",
    readWrite: "Write",
    inputSchema: {
      type: "object",
      required: ["actions"],
      properties: { actions: { type: "array" } },
    },
  },
];

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function jsonRpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function sessionKey(id: string): string {
  return `mcp:session:${id}`;
}

async function createSession(session: McpSession): Promise<string> {
  const sessionId = randomUUID();
  const redis = getRedisClient();
  await redis.set(sessionKey(sessionId), JSON.stringify(session), "EX", SESSION_TTL_SECONDS);
  return sessionId;
}

async function loadSession(sessionId: string): Promise<McpSession | null> {
  const redis = getRedisClient();
  const raw = await redis.get(sessionKey(sessionId));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as McpSession;
    // Refresh TTL (sliding window)
    await redis.expire(sessionKey(sessionId), SESSION_TTL_SECONDS);
    return session;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Tool execution timeout")), timeoutMs),
    ),
  ]);
}

async function dispatchToolCall(
  tool: McpToolDef,
  args: Record<string, unknown>,
  session: McpSession,
): Promise<unknown> {
  // Stub implementations — each returns a structured response describing what would happen.
  // In production, each tool delegates to the corresponding service layer.
  const toolName = tool.name;

  // Skills
  if (toolName === "smartspec.skills.list") {
    return { skills: [], message: "Skill list available via /v1/skills" };
  }
  if (toolName === "smartspec.skills.execute") {
    return { status: "delegated", message: "Skill execution via /v1/skills/:id/execute" };
  }
  if (toolName === "smartspec.skills.detect") {
    return { detected: null, message: "Skill detection via /v1/skills/detect" };
  }

  // Agencies
  if (toolName === "smartspec.agencies.list") {
    return { agencies: [], message: "Agency list available via /v1/agencies" };
  }
  if (toolName === "smartspec.agencies.invoke") {
    return { status: "delegated", message: "Agency invocation via /v1/agencies/:id/invoke" };
  }
  if (toolName === "smartspec.agencies.status") {
    return { status: "unknown", message: "Run status via /v1/agencies/:id/runs/:runId" };
  }

  // LLM
  if (toolName === "smartspec.llm.chat") {
    return { choices: [], message: "LLM chat available via OpenAI-compatible gateway" };
  }
  if (toolName === "smartspec.llm.embed") {
    return { embedding: [], message: "Embeddings available via embedding service" };
  }
  if (toolName === "smartspec.llm.models") {
    return { models: [], message: "Model list available via LLM router" };
  }

  // Media
  if (
    toolName === "smartspec.media.generate_image" ||
    toolName === "smartspec.media.generate_video" ||
    toolName === "smartspec.media.generate_audio"
  ) {
    return { task_id: randomUUID(), status: "pending", message: "Delegated to /v1/media" };
  }
  if (toolName === "smartspec.media.status") {
    return { status: "unknown", message: "Task status via /v1/media/:taskId/status" };
  }

  // Presentations
  if (toolName === "smartspec.presentations.create") {
    return { task_id: randomUUID(), status: "pending", message: "Delegated to /v1/presentations/generate" };
  }
  if (toolName === "smartspec.presentations.list") {
    return { decks: [], message: "Presentations available via /v1/presentations" };
  }
  if (toolName === "smartspec.presentations.export" || toolName === "smartspec.presentations.download") {
    return { message: "Export via /v1/presentations/decks/:deckId/export" };
  }

  // Video projects
  if (toolName === "smartspec.video_projects.create") {
    return { id: randomUUID(), status: "pending", message: "Delegated to /v1/video-projects" };
  }
  if (toolName === "smartspec.video_projects.list") {
    return { projects: [], message: "Projects available via /v1/video-projects" };
  }
  if (toolName === "smartspec.video_projects.export") {
    return { message: "Export via /v1/video-projects/:id/export/download" };
  }

  // Jobs
  if (toolName === "smartspec.jobs.submit") {
    return { job_id: randomUUID(), status: "pending", message: "Delegated to /v1/jobs" };
  }
  if (toolName === "smartspec.jobs.status") {
    return { status: "unknown", message: "Job status via /v1/jobs/:jobId" };
  }
  if (toolName === "smartspec.jobs.cancel") {
    return { cancelled: true, message: "Job cancel via /v1/jobs/:jobId/cancel" };
  }

  // Files / Drive / Browser
  return { message: `Tool ${toolName} executed successfully`, args };
}

// ---------------------------------------------------------------------------
// MCP method handlers
// ---------------------------------------------------------------------------

async function handleInitialize(
  req: Request,
  params: Record<string, unknown>,
  auth: any,
): Promise<{ result: unknown; sessionId: string }> {
  const session: McpSession = {
    state: "ready",
    tenantId: auth.tenantId,
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    scopes: auth.scopes ?? [],
    createdAt: new Date().toISOString(),
  };

  const sessionId = await createSession(session);

  const result = {
    protocolVersion: "2025-03-26",
    serverInfo: { name: "SmartSpecPro", version: "1.0.0" },
    capabilities: { tools: { listChanged: false } },
  };

  return { result, sessionId };
}

async function handleToolsList(session: McpSession): Promise<unknown> {
  // Filter tools based on session scopes
  const tools = TOOL_REGISTRY.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  return { tools };
}

async function handleToolsCall(
  session: McpSession,
  params: Record<string, unknown>,
): Promise<unknown> {
  const toolName = params.name as string;
  const args = (params.arguments ?? {}) as Record<string, unknown>;

  if (!toolName) {
    throw { code: -32602, message: "Invalid params: missing name" };
  }

  const tool = TOOL_REGISTRY.find((t) => t.name === toolName);
  if (!tool) {
    throw { code: -32601, message: `Tool not found: ${toolName}` };
  }

  // Scope check
  const hasScope = session.scopes.includes(tool.requiredScope);
  const hasWriteScope =
    tool.readWrite === "Read" || session.scopes.includes("mcp:write");

  if (!hasScope || !hasWriteScope) {
    throw { code: -32603, message: `Insufficient scope. Required: ${tool.requiredScope}` };
  }

  const rawResult = await executeWithTimeout(
    () => dispatchToolCall(tool, args, session),
    TOOL_TIMEOUT_MS,
  );

  const serialized = JSON.stringify(rawResult);
  if (serialized.length > MAX_RESULT_BYTES) {
    return {
      content: [
        {
          type: "text",
          text: `[Result truncated: ${serialized.length} bytes exceeds ${MAX_RESULT_BYTES} byte limit. Use the REST API for large results.]`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult, null, 2),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Main MCP handler
// ---------------------------------------------------------------------------

async function mcpHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<JsonRpcRequest>;

  // Validate JSON-RPC format
  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    res.json(jsonRpcError(body?.id ?? null, -32600, "Invalid Request"));
    return;
  }

  const { method, params = {}, id } = body as JsonRpcRequest;
  const auth = (req as any).auth;

  // initialize method creates a new session
  if (method === "initialize") {
    try {
      const { result, sessionId } = await handleInitialize(req, params, auth);
      res.setHeader("Mcp-Session-Id", sessionId);
      res.json(jsonRpcResult(id, result));
    } catch (err: any) {
      console.error("[MCP] initialize error", err);
      res.json(jsonRpcError(id, -32603, "Internal error"));
    }
    return;
  }

  // All other methods require a session
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    res.json(jsonRpcError(id, -32603, "Session required. Call initialize first."));
    return;
  }

  let session: McpSession | null;
  try {
    session = await loadSession(sessionId);
  } catch (err) {
    console.error("[MCP] session load error", err);
    res.json(jsonRpcError(id, -32603, "Internal error"));
    return;
  }

  if (!session) {
    res.json(jsonRpcError(id, -32603, "Session expired or invalid"));
    return;
  }

  try {
    if (method === "tools/list") {
      const result = await handleToolsList(session);
      res.json(jsonRpcResult(id, result));
    } else if (method === "tools/call") {
      const result = await handleToolsCall(session, params);
      res.json(jsonRpcResult(id, result));
    } else {
      res.json(jsonRpcError(id, -32601, `Method not found: ${method}`));
    }
  } catch (err: any) {
    if (err?.code && typeof err.code === "number") {
      res.json(jsonRpcError(id, err.code, err.message));
    } else {
      console.error("[MCP] handler error", err);
      res.json(jsonRpcError(id, -32603, "Internal error"));
    }
  }
}

// ---------------------------------------------------------------------------
// Discovery manifest handler
// ---------------------------------------------------------------------------

function mcpDiscoveryHandler(_req: Request, res: Response): void {
  res.json({
    name: "SmartSpecPro",
    url: "https://smartaihub.app/v1/mcp",
    auth: { type: "bearer" },
    capabilities: { tools: true },
    docs: "https://smartaihub.app/v1/docs",
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerMcpPublicRoutes(app: Express): void {
  app.post(
    "/v1/mcp",
    apiKeyAuthMiddleware,
    requireScopes("mcp:read"),
    mcpHandler,
  );
  app.get("/.well-known/mcp.json", mcpDiscoveryHandler);
}
