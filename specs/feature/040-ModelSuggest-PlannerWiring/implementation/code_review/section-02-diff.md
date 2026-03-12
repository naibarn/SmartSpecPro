diff --git a/apps/web/server/routers/modelSuggestTool.test.ts b/apps/web/server/routers/modelSuggestTool.test.ts
index 6ab0eadb..bc7a453d 100644
--- a/apps/web/server/routers/modelSuggestTool.test.ts
+++ b/apps/web/server/routers/modelSuggestTool.test.ts
@@ -16,6 +16,7 @@ vi.mock("../middleware/contentAutomationGate", () => ({
 import { modelSuggestHandler, creditCostToTier, suggestModel } from "./modelSuggestTool";
 import { getModelsByTypeAsync } from "../services/modelRegistry";
 import { contentAutomationGate } from "../middleware/contentAutomationGate";
+import { ENV } from "../_core/env";
 
 const MOCK_MODELS = [
   { id: "img-model-1", name: "Fast Image", type: "image", provider: "openai", creditCost: 3, priority: 1, isEnabled: true, description: "Fast image model" },
@@ -272,6 +273,63 @@ describe("suggestModel() standalone function", () => {
   });
 });
 
+describe("verifyInternalToken security", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    vi.mocked(getModelsByTypeAsync).mockResolvedValue(MOCK_MODELS as never);
+  });
+
+  it("returns true (200) when token matches expected value", async () => {
+    const req = buildRequest(); // sends "test-gateway-token" which matches ENV mock
+    const { res, statusMock, jsonMock } = buildResponse();
+    await modelSuggestHandler(req, res);
+    expect(statusMock).not.toHaveBeenCalledWith(401);
+    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
+  });
+
+  it("returns false (401) when token is wrong", async () => {
+    const req = buildRequest();
+    (req.headers as Record<string, string>)["x-internal-token"] = "wrong-token";
+    const { res, statusMock } = buildResponse();
+    await modelSuggestHandler(req, res);
+    expect(statusMock).toHaveBeenCalledWith(401);
+  });
+
+  it("returns false (401) when token header is missing", async () => {
+    const req = buildRequest();
+    (req.headers as Record<string, string>)["x-internal-token"] = "";
+    const { res, statusMock } = buildResponse();
+    await modelSuggestHandler(req, res);
+    expect(statusMock).toHaveBeenCalledWith(401);
+  });
+
+  it("tokens of different lengths are rejected without throwing RangeError", async () => {
+    for (const badToken of ["x", "a".repeat(200)]) {
+      const req = buildRequest();
+      (req.headers as Record<string, string>)["x-internal-token"] = badToken;
+      const { res, statusMock } = buildResponse();
+      await expect(modelSuggestHandler(req, res)).resolves.toBeUndefined();
+      expect(statusMock).toHaveBeenCalledWith(401);
+      vi.clearAllMocks();
+      vi.mocked(getModelsByTypeAsync).mockResolvedValue(MOCK_MODELS as never);
+    }
+  });
+
+  it("returns false (401) when ENV.webGatewayToken is empty string", async () => {
+    const envMock = ENV as unknown as Record<string, string>;
+    const saved = envMock.webGatewayToken;
+    envMock.webGatewayToken = "";
+    try {
+      const req = buildRequest();
+      const { res, statusMock } = buildResponse();
+      await modelSuggestHandler(req, res);
+      expect(statusMock).toHaveBeenCalledWith(401);
+    } finally {
+      envMock.webGatewayToken = saved;
+    }
+  });
+});
+
 describe("creditCostToTier", () => {
   it("maps creditCost <= 5 to 'low'", () => {
     expect(creditCostToTier(1)).toBe("low");
diff --git a/apps/web/server/routers/modelSuggestTool.ts b/apps/web/server/routers/modelSuggestTool.ts
index 957f6d17..46d7eb17 100644
--- a/apps/web/server/routers/modelSuggestTool.ts
+++ b/apps/web/server/routers/modelSuggestTool.ts
@@ -79,11 +79,12 @@ function verifyInternalToken(req: Request): boolean {
   if (!expected) return false;
   const token = req.headers["x-internal-token"] as string | undefined;
   if (!token) return false;
-  try {
-    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
-  } catch {
-    return false;
-  }
+  // Hash both values with SHA-256 to ensure equal-length 32-byte buffers.
+  // This prevents a length oracle attack where timingSafeEqual throws
+  // RangeError on length mismatch, leaking the expected token's length.
+  const tokenHash = crypto.createHash("sha256").update(token).digest();
+  const expectedHash = crypto.createHash("sha256").update(expected).digest();
+  return crypto.timingSafeEqual(tokenHash, expectedHash);
 }
 
 export async function modelSuggestHandler(req: Request, res: Response): Promise<void> {
