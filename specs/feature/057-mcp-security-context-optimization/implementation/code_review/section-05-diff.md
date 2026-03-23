diff --git a/apps/web/server/_core/__tests__/mcpPublicServer.test.ts b/apps/web/server/_core/__tests__/mcpPublicServer.test.ts
index f76758e6..40fff416 100644
--- a/apps/web/server/_core/__tests__/mcpPublicServer.test.ts
+++ b/apps/web/server/_core/__tests__/mcpPublicServer.test.ts
@@ -17,6 +17,10 @@ vi.mock("../../services/redis", () => ({
       return "OK";
     }),
     expire: vi.fn(async () => 1),
+    del: vi.fn(async (key: string) => {
+      delete mockRedisData[key];
+      return 1;
+    }),
   }),
 }));
 
@@ -89,12 +93,33 @@ vi.mock("../../services/orchestratorRoomActionsService", () => ({
 function makeApp(scopes?: string[]) {
   const app = express();
   app.use(express.json());
-  if (scopes) {
-    app.use((req: any, _res: any, next: any) => {
-      (req as any)._mockScopes = scopes;
-      next();
-    });
-  }
+  // Simulate apiKeyAuthMiddleware by setting req.auth before routes
+  app.use((req: any, _res: any, next: any) => {
+    req.auth = {
+      ok: true,
+      mode: "api_key",
+      sub: "1",
+      userId: 1,
+      tenantId: "tenant-1",
+      apiKeyId: "key-1",
+      scopes: scopes ?? [
+        "mcp:read",
+        "mcp:write",
+        "skills:list",
+        "skills:execute",
+        "agencies:list",
+        "agencies:invoke",
+        "agency:tools:mcp",
+        "media:generate",
+        "presentations:create",
+        "video_projects:create",
+        "jobs:create",
+        "jobs:read",
+        "llm:chat",
+      ],
+    };
+    next();
+  });
   registerMcpPublicRoutes(app);
   return app;
 }
@@ -405,3 +430,192 @@ describe("GET /.well-known/mcp.json", () => {
     expect(res.body.docs).toBeDefined();
   });
 });
+
+// ---------------------------------------------------------------------------
+// MCP Spec 2025-03-26 Compliance (section-05)
+// ---------------------------------------------------------------------------
+
+describe("MCP Spec Compliance — Batch requests", () => {
+  it("batch request — array of 3 JSON-RPC requests returns array of 3 responses", async () => {
+    const app = makeApp();
+    const sessionId = await initializeSession(app);
+
+    const res = await request(app)
+      .post("/v1/mcp")
+      .set("Mcp-Session-Id", sessionId)
+      .send([
+        { jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 },
+        { jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 },
+        { jsonrpc: "2.0", method: "ping", params: {}, id: 3 },
+      ]);
+
+    expect(res.status).toBe(200);
+    expect(Array.isArray(res.body)).toBe(true);
+    expect(res.body.length).toBe(3);
+    expect(res.body[0].id).toBe(1);
+    expect(res.body[1].id).toBe(2);
+    expect(res.body[2].id).toBe(3);
+  });
+
+  it("single request (non-array) still works", async () => {
+    const app = makeApp();
+    const sessionId = await initializeSession(app);
+
+    const res = await request(app)
+      .post("/v1/mcp")
+      .set("Mcp-Session-Id", sessionId)
+      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 });
+
+    expect(res.status).toBe(200);
+    expect(Array.isArray(res.body)).toBe(false);
+    expect(res.body.id).toBe(1);
+    expect(res.body.result).toBeDefined();
+  });
+
+  it("batch with mixed valid/invalid — each processed independently", async () => {
+    const app = makeApp();
+    const sessionId = await initializeSession(app);
+
+    const res = await request(app)
+      .post("/v1/mcp")
+      .set("Mcp-Session-Id", sessionId)
+      .send([
+        { jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 },
+        { jsonrpc: "2.0", method: "invalid_method", params: {}, id: 2 },
+      ]);
+
+    expect(res.status).toBe(200);
+    expect(Array.isArray(res.body)).toBe(true);
+    expect(res.body[0].result).toBeDefined();
+    expect(res.body[1].error.code).toBe(-32601);
+  });
+
+  it("rejects batch exceeding MAX_BATCH_SIZE with -32600", async () => {
+    const app = makeApp();
+    const sessionId = await initializeSession(app);
+
+    // Create batch of 101 requests (over limit of 100)
+    const batch = Array.from({ length: 101 }, (_, i) => ({
+      jsonrpc: "2.0",
+      method: "tools/list",
+      params: {},
+      id: i + 1,
+    }));
+
+    const res = await request(app)
+      .post("/v1/mcp")
+      .set("Mcp-Session-Id", sessionId)
+      .send(batch);
+
+    expect(res.status).toBe(200);
+    expect(res.body.error.code).toBe(-32600);
+  });
+});
+
+describe("MCP Spec Compliance — Protocol version negotiation", () => {
+  it("client sends supported version — server echoes it", async () => {
+    const res = await request(makeApp())
+      .post("/v1/mcp")
+      .send({
+        jsonrpc: "2.0",
+        method: "initialize",
+        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } },
+        id: 1,
+      });
+
+    expect(res.body.result.protocolVersion).toBe("2025-03-26");
+  });
+
+  it("client sends unsupported version — server returns its latest", async () => {
+    const res = await request(makeApp())
+      .post("/v1/mcp")
+      .send({
+        jsonrpc: "2.0",
+        method: "initialize",
+        params: { protocolVersion: "2020-01-01", capabilities: {}, clientInfo: { name: "test" } },
+        id: 1,
+      });
+
+    expect(res.body.result.protocolVersion).toBe("2025-03-26");
+  });
+});
+
+describe("MCP Spec Compliance — notifications/initialized", () => {
+  it("notifications/initialized accepted as no-op (no error)", async () => {
+    const app = makeApp();
+    const sessionId = await initializeSession(app);
+
+    const res = await request(app)
+      .post("/v1/mcp")
+      .set("Mcp-Session-Id", sessionId)
+      .send({ jsonrpc: "2.0", method: "notifications/initialized" });
+
+    // Notifications have no id → no JSON-RPC response body expected
+    expect(res.status).toBe(204);
+  });
+});
+
+describe("MCP Spec Compliance — Session termination (DELETE)", () => {
+  it("DELETE /v1/mcp with valid Mcp-Session-Id terminates session", async () => {
+    const app = makeApp();
+    const sessionId = await initializeSession(app);
+
+    // Verify session exists
+    expect(mockRedisData[`mcp:session:${sessionId}`]).toBeDefined();
+
+    // Terminate
+    const del = await request(app)
+      .delete("/v1/mcp")
+      .set("Mcp-Session-Id", sessionId);
+
+    expect(del.status).toBe(204);
+
+    // Session should be deleted from Redis
+    expect(mockRedisData[`mcp:session:${sessionId}`]).toBeUndefined();
+  });
+
+  it("subsequent request after session termination returns 404", async () => {
+    const app = makeApp();
+    const sessionId = await initializeSession(app);
+
+    // Terminate the session
+    await request(app)
+      .delete("/v1/mcp")
+      .set("Mcp-Session-Id", sessionId);
+
+    // Try to use the terminated session
+    const res = await request(app)
+      .post("/v1/mcp")
+      .set("Mcp-Session-Id", sessionId)
+      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 });
+
+    expect(res.status).toBe(404);
+  });
+});
+
+describe("MCP Spec Compliance — Expired session HTTP 404", () => {
+  it("expired session returns HTTP 404, not JSON-RPC error in 200", async () => {
+    const res = await request(makeApp())
+      .post("/v1/mcp")
+      .set("Mcp-Session-Id", "00000000-dead-beef-0000-000000000000")
+      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 });
+
+    expect(res.status).toBe(404);
+  });
+});
+
+describe("MCP Spec Compliance — ping method", () => {
+  it("ping returns empty result", async () => {
+    const app = makeApp();
+    const sessionId = await initializeSession(app);
+
+    const res = await request(app)
+      .post("/v1/mcp")
+      .set("Mcp-Session-Id", sessionId)
+      .send({ jsonrpc: "2.0", method: "ping", params: {}, id: 99 });
+
+    expect(res.status).toBe(200);
+    expect(res.body.id).toBe(99);
+    expect(res.body.result).toEqual({});
+  });
+});
diff --git a/apps/web/server/_core/mcpPublicServer.ts b/apps/web/server/_core/mcpPublicServer.ts
index b96b1164..8fdc35c0 100644
--- a/apps/web/server/_core/mcpPublicServer.ts
+++ b/apps/web/server/_core/mcpPublicServer.ts
@@ -47,6 +47,8 @@ interface McpToolDef {
 const SESSION_TTL_SECONDS = parseInt(process.env.MCP_SESSION_TTL_SECONDS || "900", 10);
 const TOOL_TIMEOUT_MS = 60_000;
 const MAX_RESULT_BYTES = 100 * 1024; // 100KB
+const MAX_BATCH_SIZE = 100; // DoS protection: max items per batch request
+const SUPPORTED_PROTOCOL_VERSIONS = ["2025-03-26"];
 
 // ---------------------------------------------------------------------------
 // Tool Registry (28 tools)
@@ -874,8 +876,14 @@ async function handleInitialize(
 
   const sessionId = await createSession(session);
 
+  // Protocol version negotiation per MCP spec 2025-03-26
+  const clientVersion = params?.protocolVersion as string | undefined;
+  const negotiatedVersion = clientVersion && SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion)
+    ? clientVersion
+    : SUPPORTED_PROTOCOL_VERSIONS[0];
+
   const result = {
-    protocolVersion: "2025-03-26",
+    protocolVersion: negotiatedVersion,
     serverInfo: { name: "SmartSpecPro", version: "1.0.0" },
     capabilities: { tools: { listChanged: false } },
   };
@@ -952,39 +960,45 @@ async function handleToolsCall(
 }
 
 // ---------------------------------------------------------------------------
-// Main MCP handler
+// Main MCP handler — processes a single JSON-RPC request object
 // ---------------------------------------------------------------------------
 
-async function mcpHandler(req: Request, res: Response): Promise<void> {
-  const body = req.body as Partial<JsonRpcRequest>;
-
+async function processSingleRequest(
+  body: Partial<JsonRpcRequest>,
+  req: Request,
+  auth: any,
+): Promise<JsonRpcResponse | null> {
   // Validate JSON-RPC format
   if (!body || body.jsonrpc !== "2.0" || !body.method) {
-    res.json(jsonRpcError(body?.id ?? null, -32600, "Invalid Request"));
-    return;
+    return jsonRpcError(body?.id ?? null, -32600, "Invalid Request");
   }
 
   const { method, params = {}, id } = body as JsonRpcRequest;
-  const auth = (req as any).auth;
+  const isNotification = id === undefined || id === null;
+
+  // notifications/initialized — accepted as no-op per MCP spec
+  if (method === "notifications/initialized") {
+    return null; // No response for notifications
+  }
 
   // initialize method creates a new session
   if (method === "initialize") {
     try {
-      const { result, sessionId } = await handleInitialize(req, params, auth);
-      res.setHeader("Mcp-Session-Id", sessionId);
-      res.json(jsonRpcResult(id, result));
+      const { result, sessionId } = await handleInitialize(req, params as Record<string, unknown>, auth);
+      // NOTE: Mcp-Session-Id header is set by the outer handler for single requests
+      // For batches, the session ID from the first initialize in the batch wins
+      (req as any)._mcpNewSessionId = sessionId;
+      return jsonRpcResult(id, result);
     } catch (err: any) {
       console.error("[MCP] initialize error", err);
-      res.json(jsonRpcError(id, -32603, "Internal error"));
+      return jsonRpcError(id, -32603, "Internal error");
     }
-    return;
   }
 
   // All other methods require a session
   const sessionId = req.headers["mcp-session-id"] as string | undefined;
   if (!sessionId) {
-    res.json(jsonRpcError(id, -32603, "Session required. Call initialize first."));
-    return;
+    return jsonRpcError(id, -32603, "Session required. Call initialize first.");
   }
 
   let session: McpSession | null;
@@ -992,36 +1006,105 @@ async function mcpHandler(req: Request, res: Response): Promise<void> {
     session = await loadSession(sessionId);
   } catch (err) {
     console.error("[MCP] session load error", err);
-    res.json(jsonRpcError(id, -32603, "Internal error"));
-    return;
+    return jsonRpcError(id, -32603, "Internal error");
   }
 
   if (!session) {
-    res.json(jsonRpcError(id, -32603, "Session expired or invalid"));
-    return;
+    // Signal to outer handler that session is expired → HTTP 404
+    (req as any)._mcpSessionExpired = true;
+    return jsonRpcError(id, -32603, "Session expired or invalid");
   }
 
   try {
-    if (method === "tools/list") {
+    if (method === "ping") {
+      return jsonRpcResult(id, {});
+    } else if (method === "tools/list") {
       const result = await handleToolsList(session);
-      res.json(jsonRpcResult(id, result));
+      return jsonRpcResult(id, result);
     } else if (method === "tools/call") {
-      const result = await handleToolsCall(session, params);
-      res.json(jsonRpcResult(id, result));
+      const result = await handleToolsCall(session, params as Record<string, unknown>);
+      return jsonRpcResult(id, result);
     } else {
       // M28: Do not reflect method name in error (prevents XSS/injection)
-      res.json(jsonRpcError(id, -32601, "Method not found"));
+      return jsonRpcError(id, -32601, "Method not found");
     }
   } catch (err: any) {
     if (err?.code && typeof err.code === "number") {
-      res.json(jsonRpcError(id, err.code, err.message));
+      return jsonRpcError(id, err.code, err.message);
     } else {
       console.error("[MCP] handler error", err);
-      res.json(jsonRpcError(id, -32603, "Internal error"));
+      return jsonRpcError(id, -32603, "Internal error");
     }
   }
 }
 
+// ---------------------------------------------------------------------------
+// Top-level MCP handler — supports batch and single requests
+// ---------------------------------------------------------------------------
+
+async function mcpHandler(req: Request, res: Response): Promise<void> {
+  const body = req.body;
+  const auth = (req as any).auth;
+
+  // Batch request support per MCP spec 2025-03-26
+  if (Array.isArray(body)) {
+    // DoS protection: limit batch size
+    if (body.length > MAX_BATCH_SIZE) {
+      res.json(jsonRpcError(null, -32600, `Batch too large: ${body.length} items exceeds limit of ${MAX_BATCH_SIZE}`));
+      return;
+    }
+
+    const results = await Promise.all(
+      body.map((item: Partial<JsonRpcRequest>) => processSingleRequest(item, req, auth)),
+    );
+    // Filter out null responses (notifications don't produce a response)
+    const responses = results.filter((r): r is JsonRpcResponse => r !== null);
+
+    // If new session was created in the batch, set the header
+    if ((req as any)._mcpNewSessionId) {
+      res.setHeader("Mcp-Session-Id", (req as any)._mcpNewSessionId);
+    }
+
+    res.json(responses);
+    return;
+  }
+
+  // Single request
+  const result = await processSingleRequest(body, req, auth);
+
+  // Set session ID header if a new session was created
+  if ((req as any)._mcpNewSessionId) {
+    res.setHeader("Mcp-Session-Id", (req as any)._mcpNewSessionId);
+  }
+
+  // Notification: no id means no response
+  if (result === null) {
+    res.status(204).end();
+    return;
+  }
+
+  // HTTP 404 for expired/invalid session per MCP spec
+  if ((req as any)._mcpSessionExpired) {
+    res.status(404).json(result);
+    return;
+  }
+
+  res.json(result);
+}
+
+// ---------------------------------------------------------------------------
+// Session termination handler (DELETE /v1/mcp)
+// ---------------------------------------------------------------------------
+
+async function mcpDeleteHandler(req: Request, res: Response): Promise<void> {
+  const sessionId = req.headers["mcp-session-id"] as string | undefined;
+  if (sessionId) {
+    const redis = getRedisClient();
+    await redis.del(sessionKey(sessionId));
+  }
+  res.status(204).end();
+}
+
 // ---------------------------------------------------------------------------
 // Discovery manifest handler
 // ---------------------------------------------------------------------------
@@ -1050,5 +1133,13 @@ export function registerMcpPublicRoutes(app: Express): void {
     requireScopes("mcp:read"),
     mcpHandler,
   );
+
+  // Session termination per MCP spec 2025-03-26
+  app.delete(
+    "/v1/mcp",
+    requireScopes("mcp:read"),
+    mcpDeleteHandler,
+  );
+
   app.get("/.well-known/mcp.json", mcpDiscoveryHandler);
 }
