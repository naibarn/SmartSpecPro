diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 9b34af8..3a65273 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -19,6 +19,7 @@ import { registerMCPRoutes } from "./mcpRoutes";
 import { registerMediaJobRoutes } from "../routers/mediaJobs";
 
 import { createWebhookRouter } from "../routes/webhooks";
+import { createSlideRenderRouter } from "../routes/slideRender";
 import { registerDeviceAuthRoutes } from "./deviceAuthRoutes";
 import { registerServicesRoutes } from "../routers/services";
 import { registerTenantRoutes } from "../routers/tenant";
@@ -321,6 +322,9 @@ app.get("/api/storage/files/*", async (req, res) => {
   }
 });
 
+// Internal slide render route — localhost-only, JWT-gated, for Playwright screenshots
+app.use("/internal", createSlideRenderRouter());
+
 // Webhook routes (before CSRF-protected routes, Google Drive sends raw POSTs)
 app.use("/api/webhooks", createWebhookRouter());
 
diff --git a/apps/web/server/routes/slideRender.test.ts b/apps/web/server/routes/slideRender.test.ts
new file mode 100644
index 0000000..4490a28
--- /dev/null
+++ b/apps/web/server/routes/slideRender.test.ts
@@ -0,0 +1,280 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import express from "express";
+import request from "supertest";
+import { signBearerToken } from "../_core/tokens";
+
+// --------------------------------------------------------------------------
+// Mocks
+// --------------------------------------------------------------------------
+
+const dbMocks = vi.hoisted(() => {
+  // Minimal chainable Drizzle mock: db.select().from().where().orderBy() => rows
+  function makeChain(resolvedValue: unknown[]) {
+    const chain: any = {
+      select: () => chain,
+      from: () => chain,
+      where: () => chain,
+      orderBy: () => Promise.resolve(resolvedValue),
+    };
+    return chain;
+  }
+
+  return {
+    getDb: vi.fn(),
+    makeChain,
+  };
+});
+
+vi.mock("../db", () => ({
+  getDb: dbMocks.getDb,
+}));
+
+// Mock schema imports — Drizzle table objects are only used as query tokens
+vi.mock("../../drizzle/schema", () => ({
+  presentationSlides: { deckId: "deckId", orderIndex: "orderIndex" },
+  presentationDecks: {},
+}));
+
+// --------------------------------------------------------------------------
+// Helpers
+// --------------------------------------------------------------------------
+
+const DECK_ID = 7;
+const SLIDE_INDEX = 2;
+
+function makeValidToken(overrides: Record<string, unknown> = {}): string {
+  return signBearerToken(
+    {
+      sub: "internal-render",
+      scopes: ["internal:slide-render"],
+      deckId: DECK_ID,
+      slideIndex: SLIDE_INDEX,
+      ...overrides,
+    } as any,
+    "5m",
+  );
+}
+
+function makeSlide(index: number) {
+  return {
+    id: 100 + index,
+    deckId: DECK_ID,
+    orderIndex: index,
+    title: `Slide ${index}`,
+    slideContent: {
+      elements: [
+        { id: `el-${index}`, type: "text", content: `Hello slide ${index}` },
+      ],
+    },
+    audioTrack: null,
+    version: 1,
+    createdAt: new Date(),
+    updatedAt: new Date(),
+  };
+}
+
+function buildApp(remoteAddress: string = "127.0.0.1") {
+  const app = express();
+  // Simulate a specific remote address by patching socket before route
+  app.use((req, _res, next) => {
+    Object.defineProperty(req, "socket", {
+      value: { remoteAddress },
+      writable: true,
+    });
+    next();
+  });
+  // Lazy import to ensure mocks are in place
+  return import("./slideRender").then(({ createSlideRenderRouter }) => {
+    app.use("/internal", createSlideRenderRouter());
+    return app;
+  });
+}
+
+// --------------------------------------------------------------------------
+// Tests
+// --------------------------------------------------------------------------
+
+describe("GET /internal/slide-render/:deckId/:slideIndex", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    // Default: DB returns 4 slides for the deck
+    const slides = [makeSlide(0), makeSlide(1), makeSlide(2), makeSlide(3)];
+    dbMocks.getDb.mockResolvedValue(dbMocks.makeChain(slides));
+  });
+
+  // -------------------------------------------------------------------------
+  // Access control — IP address checks
+  // -------------------------------------------------------------------------
+
+  it("returns 403 for non-localhost remote address (simulate ::2)", async () => {
+    const app = await buildApp("::2");
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(403);
+  });
+
+  it("accepts req.socket.remoteAddress === '127.0.0.1' (IPv4 loopback)", async () => {
+    const app = await buildApp("127.0.0.1");
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(200);
+  });
+
+  it("accepts req.socket.remoteAddress === '::1' (IPv6 loopback)", async () => {
+    const app = await buildApp("::1");
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(200);
+  });
+
+  it("accepts req.socket.remoteAddress === '::ffff:127.0.0.1' (IPv4-mapped IPv6)", async () => {
+    const app = await buildApp("::ffff:127.0.0.1");
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(200);
+  });
+
+  // -------------------------------------------------------------------------
+  // JWT header checks
+  // -------------------------------------------------------------------------
+
+  it("returns 401 when X-Internal-Token header is missing", async () => {
+    const app = await buildApp();
+    const res = await request(app).get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`);
+    expect(res.status).toBe(401);
+  });
+
+  it("returns 401 when X-Internal-Token contains an expired JWT", async () => {
+    const app = await buildApp();
+    // Sign with -1s expiry so it's already expired
+    const expired = signBearerToken(
+      { sub: "internal-render", scopes: ["internal:slide-render"], deckId: DECK_ID, slideIndex: SLIDE_INDEX } as any,
+      "-1s" as any,
+    );
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", expired);
+    expect(res.status).toBe(401);
+  });
+
+  it("returns 401 when JWT deckId claim does not match URL :deckId param", async () => {
+    const app = await buildApp();
+    const token = makeValidToken({ deckId: 999 }); // different from DECK_ID=7
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(401);
+  });
+
+  it("returns 401 when JWT slideIndex claim does not match URL :slideIndex param", async () => {
+    const app = await buildApp();
+    const token = makeValidToken({ slideIndex: 99 }); // different from SLIDE_INDEX=2
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(401);
+  });
+
+  it("returns 401 when JWT scope does not include 'internal:slide-render'", async () => {
+    const app = await buildApp();
+    const token = makeValidToken({ scopes: ["other:scope"] });
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(401);
+  });
+
+  // -------------------------------------------------------------------------
+  // Success cases
+  // -------------------------------------------------------------------------
+
+  it("returns 200 with HTML when JWT is valid and remote address is loopback", async () => {
+    const app = await buildApp();
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(200);
+    expect(res.type).toMatch(/html/);
+  });
+
+  it("HTML response body contains window.__slideReady = false initialization", async () => {
+    const app = await buildApp();
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.text).toContain("window.__slideReady = false");
+  });
+
+  it("HTML response body contains inlined slideContent JSON (full element data)", async () => {
+    const app = await buildApp();
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    // Should contain the elements array from slideContent — not just slideshow metadata
+    expect(res.text).toContain(`el-${SLIDE_INDEX}`);
+    expect(res.text).toContain(`Hello slide ${SLIDE_INDEX}`);
+  });
+
+  it("HTML response sets document.body margin to 0 and overflow to hidden", async () => {
+    const app = await buildApp();
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.text).toContain("margin");
+    expect(res.text).toContain("overflow");
+    expect(res.text).toContain("hidden");
+  });
+
+  it("HTML response contains script tag with id='slide-data' and correct JSON", async () => {
+    const app = await buildApp();
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.text).toContain(`id="slide-data"`);
+    expect(res.text).toContain(`application/json`);
+    // Verify the script tag contains parseable JSON with the elements
+    const match = res.text.match(/<script[^>]+id="slide-data"[^>]*>([\s\S]*?)<\/script>/);
+    expect(match).not.toBeNull();
+    const parsed = JSON.parse(match![1]);
+    expect(parsed.elements).toBeDefined();
+    expect(parsed.elements[0].id).toBe(`el-${SLIDE_INDEX}`);
+  });
+
+  // -------------------------------------------------------------------------
+  // Error cases
+  // -------------------------------------------------------------------------
+
+  it("returns 404 when slideIndex is out of bounds for the deck", async () => {
+    const app = await buildApp();
+    const outOfBoundsIndex = 99;
+    const token = makeValidToken({ slideIndex: outOfBoundsIndex });
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${outOfBoundsIndex}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(404);
+  });
+
+  it("returns 404 when deckId does not exist (empty slides)", async () => {
+    // Override: DB returns empty array (no slides for this deck)
+    dbMocks.getDb.mockResolvedValue(dbMocks.makeChain([]));
+    const app = await buildApp();
+    const token = makeValidToken();
+    const res = await request(app)
+      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
+      .set("X-Internal-Token", token);
+    expect(res.status).toBe(404);
+  });
+});
diff --git a/apps/web/server/routes/slideRender.ts b/apps/web/server/routes/slideRender.ts
new file mode 100644
index 0000000..906fa83
--- /dev/null
+++ b/apps/web/server/routes/slideRender.ts
@@ -0,0 +1,122 @@
+/**
+ * Internal Express route for Playwright-based slide screenshots.
+ *
+ * GET /internal/slide-render/:deckId/:slideIndex
+ *
+ * Security model (two layers):
+ *   Layer 1 (primary):   Nginx `location /internal/ { deny all; }` blocks external access.
+ *   Layer 2 (secondary): Application checks req.socket.remoteAddress is a loopback address.
+ *   Layer 3 (content):   JWT in `X-Internal-Token` header encodes deckId + slideIndex + scope.
+ *
+ * The route returns a minimal self-contained HTML page with inlined slide data.
+ * Playwright navigates here, waits for `window.__slideReady === true`, then screenshots.
+ */
+
+import { Router } from "express";
+import { and, eq } from "drizzle-orm";
+import { getDb } from "../db";
+import { presentationSlides } from "../../drizzle/schema";
+import { verifyBearerToken, hasScope } from "../_core/tokens";
+
+const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
+
+function isLoopback(address: string | undefined): boolean {
+  return !!address && LOOPBACK_ADDRESSES.has(address);
+}
+
+export function createSlideRenderRouter(): Router {
+  const router = Router();
+
+  router.get("/slide-render/:deckId/:slideIndex", async (req, res) => {
+    // --- Layer 2: Loopback-only enforcement ---
+    const remoteAddress = req.socket?.remoteAddress;
+    if (!isLoopback(remoteAddress)) {
+      return res.status(403).json({ error: "Forbidden: localhost only" });
+    }
+
+    // --- Layer 3: JWT header validation ---
+    const tokenHeader = req.headers["x-internal-token"];
+    const tokenStr = typeof tokenHeader === "string" ? tokenHeader : undefined;
+    if (!tokenStr) {
+      return res.status(401).json({ error: "Unauthorized: missing X-Internal-Token header" });
+    }
+
+    let claims: Awaited<ReturnType<typeof verifyBearerToken>>;
+    try {
+      claims = await verifyBearerToken(tokenStr);
+    } catch {
+      return res.status(401).json({ error: "Unauthorized: invalid or expired token" });
+    }
+
+    // Validate scope
+    if (!hasScope(claims.scopes, "internal:slide-render")) {
+      return res.status(401).json({ error: "Unauthorized: missing internal:slide-render scope" });
+    }
+
+    // Validate deckId and slideIndex claims match URL params
+    const urlDeckId = parseInt(req.params.deckId, 10);
+    const urlSlideIndex = parseInt(req.params.slideIndex, 10);
+    const claimsAny = claims as any;
+    if (claimsAny.deckId !== urlDeckId || claimsAny.slideIndex !== urlSlideIndex) {
+      return res.status(401).json({ error: "Unauthorized: token claims do not match URL params" });
+    }
+
+    // --- DB query: fetch full slide content (not slideshow metadata) ---
+    const db = await getDb();
+    if (!db) {
+      return res.status(503).json({ error: "Database unavailable" });
+    }
+
+    const slides = await db
+      .select()
+      .from(presentationSlides)
+      .where(eq(presentationSlides.deckId, urlDeckId))
+      .orderBy(presentationSlides.orderIndex);
+
+    if (slides.length === 0 || urlSlideIndex < 0 || urlSlideIndex >= slides.length) {
+      return res.status(404).json({ error: "Not found: slide index out of bounds" });
+    }
+
+    const slide = slides[urlSlideIndex];
+    const slideContentJson = JSON.stringify(slide.slideContent ?? {});
+
+    // --- HTML response with inlined slide data and __slideReady sentinel ---
+    const html = `<!DOCTYPE html>
+<html>
+<head>
+<meta charset="utf-8">
+<meta name="viewport" content="width=1920, height=1080">
+<style>
+  body { margin: 0; overflow: hidden; background: #fff; }
+  #slide-canvas { width: 1920px; height: 1080px; position: relative; overflow: hidden; }
+</style>
+</head>
+<body>
+<script id="slide-data" type="application/json">${slideContentJson}</script>
+<div id="slide-canvas"></div>
+<script>
+window.__slideReady = false;
+document.fonts.ready.then(function() {
+  var imgs = document.querySelectorAll('img');
+  var checkInterval = setInterval(function() {
+    var allLoaded = Array.from(imgs).every(function(img) { return img.complete; });
+    if (allLoaded) {
+      clearInterval(checkInterval);
+      window.__slideReady = true;
+    }
+  }, 50);
+  // Safety: set ready after 8s even if images haven't loaded (avoids Playwright timeout)
+  setTimeout(function() {
+    clearInterval(checkInterval);
+    window.__slideReady = true;
+  }, 8000);
+});
+</script>
+</body>
+</html>`;
+
+    return res.status(200).set("Content-Type", "text/html").send(html);
+  });
+
+  return router;
+}
diff --git a/nginx/conf.d/dev-host.conf b/nginx/conf.d/dev-host.conf
index 30032f6..370eefd 100644
--- a/nginx/conf.d/dev-host.conf
+++ b/nginx/conf.d/dev-host.conf
@@ -156,6 +156,12 @@ server {
         proxy_set_header Host $host;
     }
 
+    # Block external access to internal Playwright/screenshot routes
+    location /internal/ {
+        deny all;
+        return 403;
+    }
+
     # Main web app
     location / {
         client_max_body_size 100M;  # Allow moderate file uploads in web app
@@ -312,6 +318,12 @@ server {
         limit_conn conn_limit 30;
     }
 
+    # Block external access to internal Playwright/screenshot routes
+    location /internal/ {
+        deny all;
+        return 403;
+    }
+
     location / {
         client_max_body_size 100M;  # Allow moderate file uploads in web app
 
