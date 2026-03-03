/**
 * Internal Express route for Playwright-based slide screenshots.
 *
 * GET /internal/slide-render/:deckId/:slideIndex
 *
 * Security model (two layers):
 *   Layer 1 (primary):   Nginx `location /internal/ { deny all; }` blocks external access.
 *   Layer 2 (secondary): Application checks req.socket.remoteAddress is loopback or RFC 1918
 *                        private range. Private ranges are needed for Docker Celery workers
 *                        that connect via host.docker.internal (172.17.0.1 gateway).
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

/** Accept loopback or RFC 1918 private addresses (Docker Celery workers use 172.17.x.x). */
function isInternalAddress(address: string | undefined): boolean {
  if (!address) return false;
  if (LOOPBACK_ADDRESSES.has(address)) return true;
  // Strip IPv6-mapped IPv4 prefix
  const ip = address.startsWith("::ffff:") ? address.slice(7) : address;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 10 ||                          // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168)             // 192.168.0.0/16
  );
}

export function createSlideRenderRouter(): Router {
  const router = Router();

  router.get("/slide-render/:deckId/:slideIndex", async (req, res) => {
    // --- Layer 2: Internal network enforcement ---
    const remoteAddress = req.socket?.remoteAddress;
    if (!isInternalAddress(remoteAddress)) {
      return res.status(403).json({ error: "Forbidden: internal network only" });
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
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Kanit:wght@400;500;600;700&family=Prompt:wght@400;500;600;700&family=Sarabun:wght@400;500;600;700&display=swap"
  rel="stylesheet"
>
<style>
  html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #fff;
  }
  #slide-viewport {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #fff;
  }
  #slide-canvas {
    position: absolute;
    left: 0;
    top: 0;
    overflow: hidden;
    transform-origin: top left;
  }
  .slide-el {
    position: absolute;
    box-sizing: border-box;
  }
</style>
</head>
<body>
<script id="slide-data" type="application/json">${slideContentJson}</script>
<div id="slide-viewport">
  <div id="slide-canvas"></div>
</div>
<script>
window.__slideReady = false;
;(function() {
  function asNumber(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clamp(v, min, max) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  function resolveFontFamily(value) {
    var fallback = "'Inter', 'Sarabun', 'Prompt', 'Kanit', 'Noto Sans Thai', 'Noto Sans', system-ui, sans-serif";
    if (typeof value !== "string" || !value.trim()) {
      return fallback;
    }
    return value + ", " + fallback;
  }

  var dataNode = document.getElementById("slide-data");
  var slide = {};
  try {
    slide = JSON.parse((dataNode && dataNode.textContent) || "{}");
  } catch (_err) {
    slide = {};
  }

  var canvasWidth = asNumber(slide && slide.canvas && slide.canvas.width, 1920);
  var canvasHeight = asNumber(slide && slide.canvas && slide.canvas.height, 1080);
  var canvas = document.getElementById("slide-canvas");
  var viewport = document.getElementById("slide-viewport");
  if (!canvas || !viewport) {
    window.__slideReady = true;
    return;
  }

  canvas.style.width = canvasWidth + "px";
  canvas.style.height = canvasHeight + "px";

  function fitCanvasToViewport() {
    var vw = window.innerWidth || canvasWidth;
    var vh = window.innerHeight || canvasHeight;
    var scale = Math.min(vw / canvasWidth, vh / canvasHeight);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    var left = (vw - canvasWidth * scale) / 2;
    var top = (vh - canvasHeight * scale) / 2;
    canvas.style.transform = "translate(" + left + "px," + top + "px) scale(" + scale + ")";
  }

  function applyBaseStyle(node, el) {
    node.className = "slide-el";
    node.style.left = asNumber(el.x, 0) + "px";
    node.style.top = asNumber(el.y, 0) + "px";
    node.style.width = Math.max(0, asNumber(el.width, 0)) + "px";
    node.style.height = Math.max(0, asNumber(el.height, 0)) + "px";
    if (typeof el.opacity === "number") {
      node.style.opacity = String(clamp(el.opacity, 0, 1));
    }
    var rotate = asNumber(el.rotation, 0);
    if (rotate) {
      node.style.transform = "rotate(" + rotate + "deg)";
      node.style.transformOrigin = "center center";
    }
  }

  function renderText(el) {
    var node = document.createElement("div");
    applyBaseStyle(node, el);
    node.style.overflow = "hidden";
    var p = document.createElement("p");
    p.style.margin = "0";
    p.style.width = "100%";
    p.style.display = "block";
    p.style.minHeight = "100%";
    p.style.padding = "8px";
    p.style.paddingBottom = "0.14em";
    p.style.boxSizing = "border-box";
    p.style.whiteSpace = "pre-wrap";
    p.style.wordBreak = "break-word";
    p.style.color = typeof el.color === "string" ? el.color : "#111827";
    p.style.background = typeof el.backgroundColor === "string" ? el.backgroundColor : "transparent";
    p.style.fontSize = asNumber(el.fontSize, 48) + "px";
    p.style.fontFamily = resolveFontFamily(el.fontFamily);
    p.style.fontWeight = typeof el.fontWeight === "string" ? el.fontWeight : "600";
    p.style.fontStyle = typeof el.fontStyle === "string" ? el.fontStyle : "normal";
    p.style.textDecoration = typeof el.textDecoration === "string" ? el.textDecoration : "none";
    p.style.textAlign = typeof el.textAlign === "string" ? el.textAlign : "left";
    p.style.lineHeight = String(typeof el.lineHeight === "number" ? el.lineHeight : 1.25);
    p.style.letterSpacing = asNumber(el.letterSpacing, 0) + "px";
    if (typeof el.textShadow === "string") {
      p.style.textShadow = el.textShadow;
    }
    if (typeof el.textStroke === "string") {
      p.style.webkitTextStroke = el.textStroke;
    }
    p.textContent = typeof el.text === "string" ? el.text : "";
    node.appendChild(p);
    return node;
  }

  function renderImage(el) {
    var wrapper = document.createElement("div");
    applyBaseStyle(wrapper, el);
    wrapper.style.overflow = "hidden";

    var img = document.createElement("img");
    img.alt = typeof el.alt === "string" ? el.alt : "";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.display = "block";
    // Keep default behavior aligned with editor canvas renderer.
    img.style.objectFit = typeof el.imageFit === "string" ? el.imageFit : "contain";
    var posX = clamp(asNumber(el.imagePositionX, 50), 0, 100);
    var posY = clamp(asNumber(el.imagePositionY, 50), 0, 100);
    img.style.objectPosition = posX + "% " + posY + "%";
    var zoom = clamp(asNumber(el.imageZoom, 1), 0.5, 3);
    if (zoom !== 1) {
      img.style.transform = "scale(" + zoom + ")";
      img.style.transformOrigin = posX + "% " + posY + "%";
    }

    if (typeof el.svgContent === "string" && el.svgContent.trim()) {
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(el.svgContent);
    } else {
      img.src = typeof el.src === "string" ? el.src : "";
    }

    wrapper.appendChild(img);
    return wrapper;
  }

  function renderVideo(el) {
    if (typeof el.poster === "string" && el.poster.trim()) {
      var asImage = {
        x: el.x, y: el.y, width: el.width, height: el.height, opacity: el.opacity, rotation: el.rotation,
        src: el.poster, alt: typeof el.title === "string" ? el.title : "video poster", imageFit: "cover",
      };
      return renderImage(asImage);
    }
    var node = document.createElement("div");
    applyBaseStyle(node, el);
    node.style.background = "#000";
    return node;
  }

  function renderRect(el) {
    var node = document.createElement("div");
    applyBaseStyle(node, el);
    node.style.background = typeof el.fill === "string" ? el.fill : "transparent";
    if (typeof el.stroke === "string" && asNumber(el.strokeWidth, 0) > 0) {
      node.style.border = asNumber(el.strokeWidth, 0) + "px solid " + el.stroke;
    }
    return node;
  }

  function renderLine(el) {
    var node = document.createElement("div");
    node.className = "slide-el";
    var x = asNumber(el.x, 0);
    var y = asNumber(el.y, 0);
    var w = asNumber(el.width, 0);
    var h = asNumber(el.height, 0);
    var length = Math.sqrt(w * w + h * h);
    var angle = (Math.atan2(h, w) * 180) / Math.PI;
    var extraRotation = asNumber(el.rotation, 0);
    node.style.left = x + "px";
    node.style.top = y + "px";
    node.style.width = Math.max(0, length) + "px";
    node.style.height = Math.max(1, asNumber(el.strokeWidth, 1)) + "px";
    node.style.background = typeof el.stroke === "string" ? el.stroke : "#000";
    node.style.transformOrigin = "0 50%";
    node.style.transform = "rotate(" + (angle + extraRotation) + "deg)";
    if (typeof el.opacity === "number") {
      node.style.opacity = String(clamp(el.opacity, 0, 1));
    }
    return node;
  }

  function renderElements() {
    canvas.innerHTML = "";
    var elements = Array.isArray(slide && slide.elements) ? slide.elements : [];
    for (var i = 0; i < elements.length; i += 1) {
      var el = elements[i] || {};
      var node = null;
      if (el.type === "text") node = renderText(el);
      else if (el.type === "image") node = renderImage(el);
      else if (el.type === "video") node = renderVideo(el);
      else if (el.type === "rect") node = renderRect(el);
      else if (el.type === "line") node = renderLine(el);
      if (node) canvas.appendChild(node);
    }
  }

  function markReady() {
    window.__slideReady = true;
  }

  function waitForImagesThenReady() {
    var imgs = canvas.querySelectorAll("img");
    if (!imgs || imgs.length === 0) {
      markReady();
      return;
    }
    var remaining = imgs.length;
    var done = function() {
      remaining -= 1;
      if (remaining <= 0) markReady();
    };
    for (var i = 0; i < imgs.length; i += 1) {
      var img = imgs[i];
      if (img.complete) {
        done();
      } else {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }
    }
  }

  try {
    renderElements();
    fitCanvasToViewport();
    window.addEventListener("resize", fitCanvasToViewport);
  } catch (_err) {
    markReady();
    return;
  }

  var safetyTimeout = setTimeout(markReady, 8000);
  var finishReady = function() {
    waitForImagesThenReady();
    var checker = setInterval(function() {
      if (window.__slideReady === true) {
        clearInterval(checker);
        clearTimeout(safetyTimeout);
      }
    }, 50);
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(finishReady).catch(finishReady);
  } else {
    finishReady();
  }
})();
</script>
</body>
</html>`;

    return res.status(200).set("Content-Type", "text/html").send(html);
  });

  return router;
}
