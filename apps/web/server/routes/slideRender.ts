/**
 * Internal Express route for Playwright-based slide screenshots.
 *
 * GET /internal/slide-render/:deckId/:slideIndex
 *
 * Security model (two layers):
 *   Layer 1 (primary):   Nginx `location /internal/ { deny all; }` blocks external access.
 *   Layer 2 (secondary): Application checks req.socket.remoteAddress is a loopback address.
 *   Layer 3 (content):   JWT in `X-Internal-Token` header encodes deckId + slideIndex + scope.
 *
 * The route returns a minimal self-contained HTML page with inlined slide data.
 * Playwright navigates here, waits for `window.__slideReady === true`, then screenshots.
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { presentationSlides } from "../../drizzle/schema";
import { verifyBearerToken } from "../_core/tokens";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isLoopback(address: string | undefined): boolean {
  return !!address && LOOPBACK_ADDRESSES.has(address);
}

export function createSlideRenderRouter(): Router {
  const router = Router();

  router.get("/slide-render/:deckId/:slideIndex", async (req, res) => {
    // --- Layer 2: Loopback-only enforcement ---
    const remoteAddress = req.socket?.remoteAddress;
    if (!isLoopback(remoteAddress)) {
      return res.status(403).json({ error: "Forbidden: localhost only" });
    }

    // --- Layer 3: JWT header validation ---
    const tokenHeader = req.headers["x-internal-token"];
    const tokenStr = typeof tokenHeader === "string" ? tokenHeader : undefined;
    if (!tokenStr) {
      return res.status(401).json({ error: "Unauthorized: missing X-Internal-Token header" });
    }

    let claims: Awaited<ReturnType<typeof verifyBearerToken>>;
    try {
      claims = await verifyBearerToken(tokenStr);
    } catch {
      return res.status(401).json({ error: "Unauthorized: invalid or expired token" });
    }

    // Validate scope — exact match only; wildcards (internal:*, admin) must NOT grant access
    // to this route as it serves raw slide content to Playwright.
    if (!Array.isArray(claims.scopes) || !claims.scopes.includes("internal:slide-render")) {
      return res.status(401).json({ error: "Unauthorized: missing internal:slide-render scope" });
    }

    // Validate deckId and slideIndex claims match URL params
    const urlDeckId = parseInt(req.params.deckId, 10);
    const urlSlideIndex = parseInt(req.params.slideIndex, 10);
    if (isNaN(urlDeckId) || isNaN(urlSlideIndex)) {
      return res.status(400).json({ error: "Bad request: deckId and slideIndex must be integers" });
    }
    // Non-standard claims added at token minting time — not present in the base JWT type
    const claimsAny = claims as any;
    if (claimsAny.deckId !== urlDeckId || claimsAny.slideIndex !== urlSlideIndex) {
      return res.status(401).json({ error: "Unauthorized: token claims do not match URL params" });
    }

    // --- DB query: fetch full slide content (not slideshow metadata) ---
    const db = await getDb();
    if (!db) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const slides = await db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.deckId, urlDeckId))
      .orderBy(presentationSlides.orderIndex);

    if (slides.length === 0 || urlSlideIndex < 0 || urlSlideIndex >= slides.length) {
      return res.status(404).json({ error: "Not found: slide index out of bounds" });
    }

    const slide = slides[urlSlideIndex];
    // Escape `</script>` and `&` sequences to prevent XSS when embedding JSON in HTML
    const slideContentJson = JSON.stringify(slide.slideContent ?? {})
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

    // --- HTML response with inlined slide data and __slideReady sentinel ---
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1920, height=1080">
<style>
  body { margin: 0; overflow: hidden; background: #fff; }
  #slide-canvas { width: 1920px; height: 1080px; position: relative; overflow: hidden; }
</style>
</head>
<body>
<script id="slide-data" type="application/json">${slideContentJson}</script>
<div id="slide-canvas"></div>
<script>
window.__slideReady = false;
document.fonts.ready.then(function() {
  var imgs = document.querySelectorAll('img');
  var checkInterval = setInterval(function() {
    var allLoaded = Array.from(imgs).every(function(img) { return img.complete; });
    if (allLoaded) {
      clearInterval(checkInterval);
      window.__slideReady = true;
    }
  }, 50);
  // Safety: set ready after 8s even if images haven't loaded (avoids Playwright timeout)
  setTimeout(function() {
    clearInterval(checkInterval);
    window.__slideReady = true;
  }, 8000);
});
</script>
</body>
</html>`;

    return res.status(200).set("Content-Type", "text/html").send(html);
  });

  return router;
}
