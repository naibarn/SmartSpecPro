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
import { PRESENTATION_MEDIA_MOTION_RUNTIME_CONFIG } from "@shared/presentation/mediaMotion";

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
    const mediaMotionRuntimeConfigJson = JSON.stringify(PRESENTATION_MEDIA_MOTION_RUNTIME_CONFIG)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

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
    background: transparent;
  }
  #slide-viewport {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: transparent;
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
  var MEDIA_MOTION_RUNTIME = ${mediaMotionRuntimeConfigJson};

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

  function isLikelySvgMarkup(value) {
    var normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    return normalized.indexOf("<svg") >= 0 && normalized.indexOf("</svg>") >= 0;
  }

  function normalizeMediaMotionSegment(motion) {
    var preset = motion && typeof motion.preset === "string"
      && MEDIA_MOTION_RUNTIME.validPresets.indexOf(motion.preset) >= 0
      ? motion.preset
      : "none";
    var easing = motion && typeof motion.easing === "string"
      && MEDIA_MOTION_RUNTIME.validEasings.indexOf(motion.easing) >= 0
      ? motion.easing
      : MEDIA_MOTION_RUNTIME.defaultEasing;
    var timingMode = motion && typeof motion.timingMode === "string"
      && MEDIA_MOTION_RUNTIME.validTimingModes.indexOf(motion.timingMode) >= 0
      ? motion.timingMode
      : MEDIA_MOTION_RUNTIME.defaultTimingMode;
    return {
      preset: preset,
      intensity: clamp(asNumber(motion && motion.intensity, MEDIA_MOTION_RUNTIME.defaultIntensity), 0, 1),
      easing: easing,
      timingMode: timingMode,
      durationMs: Math.round(clamp(
        asNumber(motion && motion.durationMs, MEDIA_MOTION_RUNTIME.defaultDurationMs),
        250,
        120000
      )),
    };
  }

  function normalizeMediaMotion(motion) {
    var hasSegments = motion && typeof motion === "object"
      && (Object.prototype.hasOwnProperty.call(motion, "intro") || Object.prototype.hasOwnProperty.call(motion, "outro"));
    return {
      intro: hasSegments ? normalizeMediaMotionSegment(motion && motion.intro) : normalizeMediaMotionSegment(motion),
      outro: hasSegments ? normalizeMediaMotionSegment(motion && motion.outro) : normalizeMediaMotionSegment(null),
    };
  }

  function computeMediaMotionFrame(segment, progress) {
    var normalized = normalizeMediaMotionSegment(segment);
    var clampedProgress = clamp(asNumber(progress, 0), 0, 1);
    var easedProgress = normalized.easing === "linear"
      ? clampedProgress
      : 0.5 - (Math.cos(Math.PI * clampedProgress) / 2);
    var panTravelPercent = MEDIA_MOTION_RUNTIME.maxPanTravelPercent * normalized.intensity;
    var zoomDelta = MEDIA_MOTION_RUNTIME.maxZoomDelta * normalized.intensity;
    var panVector = MEDIA_MOTION_RUNTIME.panVectors[normalized.preset] || null;
    if (panVector) {
      var vectorMagnitude = Math.min(Math.hypot(panVector.x, panVector.y), Math.SQRT2);
      var overscanDelta = MEDIA_MOTION_RUNTIME.maxPanOverscanDelta * normalized.intensity * vectorMagnitude;
      return {
        scaleMultiplier: 1 + overscanDelta,
        translateXPercent: panVector.x * panTravelPercent * easedProgress,
        translateYPercent: panVector.y * panTravelPercent * easedProgress,
      };
    }
    switch (normalized.preset) {
      case "zoom-in":
        return { scaleMultiplier: 1 + (zoomDelta * easedProgress), translateXPercent: 0, translateYPercent: 0 };
      case "zoom-out":
        return { scaleMultiplier: 1 + (zoomDelta * (1 - easedProgress)), translateXPercent: 0, translateYPercent: 0 };
      case "none":
      default:
        return { scaleMultiplier: 1, translateXPercent: 0, translateYPercent: 0 };
    }
  }

  function computeMediaMotionPlaybackProgress(elapsedMs, durationMs) {
    var safeElapsedMs = Math.max(0, asNumber(elapsedMs, 0));
    var safeDurationMs = clamp(
      asNumber(durationMs, MEDIA_MOTION_RUNTIME.maxAnimationWindowMs),
      250,
      120000
    );
    var effectiveDurationMs = Math.max(
      1,
      Math.min(safeDurationMs, MEDIA_MOTION_RUNTIME.maxAnimationWindowMs)
    );
    return clamp(safeElapsedMs / effectiveDurationMs, 0, 1);
  }

  function computeMediaMotionPhaseProgress(segment, phase, elapsedMs, durationMs) {
    var safeElapsedMs = Math.max(0, asNumber(elapsedMs, 0));
    var safeDurationMs = clamp(
      asNumber(durationMs, MEDIA_MOTION_RUNTIME.defaultDurationMs),
      250,
      120000
    );
    if (segment.timingMode === "until-slide-end") {
      return clamp(safeElapsedMs / safeDurationMs, 0, 1);
    }
    var effectiveDurationMs = Math.max(250, Math.min(asNumber(segment.durationMs, MEDIA_MOTION_RUNTIME.defaultDurationMs), safeDurationMs));
    if (phase === "intro") {
      return clamp(safeElapsedMs / effectiveDurationMs, 0, 1);
    }
    var startMs = Math.max(0, safeDurationMs - effectiveDurationMs);
    return clamp((safeElapsedMs - startMs) / effectiveDurationMs, 0, 1);
  }

  function computeMediaMotionTimelineFrame(motion, elapsedMs, durationMs) {
    var normalized = normalizeMediaMotion(motion);
    var introFrame = computeMediaMotionFrame(
      normalized.intro,
      computeMediaMotionPhaseProgress(normalized.intro, "intro", elapsedMs, durationMs)
    );
    var outroFrame = computeMediaMotionFrame(
      normalized.outro,
      computeMediaMotionPhaseProgress(normalized.outro, "outro", elapsedMs, durationMs)
    );
    return {
      scaleMultiplier: introFrame.scaleMultiplier * outroFrame.scaleMultiplier,
      translateXPercent: introFrame.translateXPercent + outroFrame.translateXPercent,
      translateYPercent: introFrame.translateYPercent + outroFrame.translateYPercent,
    };
  }

  function applyMediaMotion(node, baseZoom, posX, posY, motion, elapsedMs, durationMs) {
    var frame = computeMediaMotionTimelineFrame(motion, elapsedMs, durationMs);
    node.style.transform = "translate(" + frame.translateXPercent + "%, " + frame.translateYPercent + "%) scale(" + (baseZoom * frame.scaleMultiplier) + ")";
    node.style.transformOrigin = posX + "% " + posY + "%";
  }

  function registerMediaMotionNode(node, baseZoom, posX, posY, motion) {
    if (!node) return;
    motionNodes.push({
      node: node,
      baseZoom: baseZoom,
      posX: posX,
      posY: posY,
      motion: motion || null,
    });
    applyMediaMotion(node, baseZoom, posX, posY, motion, 0, slideDurationMs);
  }

  function createSvgPlaceholder() {
    var node = document.createElement("div");
    node.style.width = "100%";
    node.style.height = "100%";
    node.style.display = "grid";
    node.style.placeItems = "center";
    node.style.background = "rgba(226, 232, 240, 0.82)";
    node.style.color = "#475569";
    node.style.fontSize = "11px";
    node.style.fontWeight = "600";
    node.textContent = "SVG unavailable";
    return node;
  }

  function normalizeMediaSrc(value) {
    var src = typeof value === "string" ? value.trim() : "";
    if (!src) return "";
    if (/^(https?:\\/\\/|data:|blob:|\\/)/i.test(src)) {
      return src;
    }
    if (src.indexOf("api/storage/files/") === 0) {
      return "/" + src;
    }
    if (src.indexOf("uploads/") === 0) {
      return "/" + src;
    }
    return "/api/storage/files/" + encodeURI(src.replace(/^\\/+/, ""));
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
  var query = new URLSearchParams(window.location.search || "");
  var renderMode = query.get("mode") === "record" ? "record" : "screenshot";
  var slideDurationMs = clamp(asNumber(slide && slide.durationMs, 3000), 250, 120000);
  var READY_GATE_POLL_INTERVAL_MS = 200;
  var READY_GATE_SOFT_WAIT_MS = 5000;
  var READY_GATE_RETRY_DELAYS_MS = [750, 750];
  var READY_GATE_HARD_TIMEOUT_MS = 8000;
  var READY_GATE_FAIL_CODE = "E_SLIDE_READY_TIMEOUT";
  var READY_GATE_DEGRADED_CODE = "W_SLIDE_READY_TIMEOUT";

  var readyGateStartedAt = Date.now();
  var readyGateRetryAttempts = 0;
  var readyGateNextRetryAt = READY_GATE_SOFT_WAIT_MS;
  var readyGateFontsReady = false;
  var readyGateMediaReady = false;
  var readyGateStableFramesReady = false;
  var readyGateMediaDegraded = false;
  var readyGateFontTimedOut = false;
  var expectedTextNodeCount = 0;
  var readyGateChecker = null;
  var readyGateHardTimeout = null;
  var motionNodes = [];

  window.__slideReadyState = {
    status: "pending",
    code: null,
    reason: null,
    attempts: 0,
    elapsedMs: 0,
    baseLayoutReady: false,
    textReady: false,
    fontsReady: false,
    mediaReady: false,
    stableFramesReady: false,
    mediaDegraded: false,
    fontTimedOut: false,
  };

  var canvasWidth = asNumber(slide && slide.canvas && slide.canvas.width, 1920);
  var canvasHeight = asNumber(slide && slide.canvas && slide.canvas.height, 1080);
  var canvas = document.getElementById("slide-canvas");
  var viewport = document.getElementById("slide-viewport");
  if (!canvas || !viewport) {
    window.__slideReadyState = {
      status: "failed",
      code: READY_GATE_FAIL_CODE,
      reason: "viewport_or_canvas_missing",
      attempts: readyGateRetryAttempts,
      elapsedMs: 0,
      baseLayoutReady: false,
      textReady: false,
      fontsReady: readyGateFontsReady,
      mediaReady: readyGateMediaReady,
      stableFramesReady: readyGateStableFramesReady,
      mediaDegraded: readyGateMediaDegraded,
      fontTimedOut: readyGateFontTimedOut,
    };
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
    node.style.overflow = "visible";
    var hasThaiText = /[\u0e00-\u0e7f]/.test(typeof el.text === "string" ? el.text : "");
    var p = document.createElement("p");
    p.style.margin = "0";
    p.style.width = "100%";
    p.style.display = "block";
    p.style.minHeight = "100%";
    p.style.padding = "8px";
    p.style.paddingTop = hasThaiText ? "0.2em" : "0.04em";
    p.style.paddingBottom = hasThaiText ? "0.48em" : "0.14em";
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
    var rawLineHeight = typeof el.lineHeight === "number" ? el.lineHeight : 1.25;
    p.style.lineHeight = String(hasThaiText ? Math.max(1.5, rawLineHeight) : rawLineHeight);
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
    var posX = clamp(asNumber(el.imagePositionX, 50), 0, 100);
    var posY = clamp(asNumber(el.imagePositionY, 50), 0, 100);
    var zoom = clamp(asNumber(el.imageZoom, 1), 0.5, 3);

    if (typeof el.svgContent === "string" && el.svgContent.trim()) {
      if (!isLikelySvgMarkup(el.svgContent)) {
        wrapper.appendChild(createSvgPlaceholder());
        return wrapper;
      }
      var color = (typeof el.svgColor === "string" && el.svgColor.trim()) ? el.svgColor : "#ffffff";
      var svgNode = document.createElement("div");
      svgNode.setAttribute("data-slide-media-id", typeof el.id === "string" ? el.id : "");
      svgNode.style.width = "100%";
      svgNode.style.height = "100%";
      svgNode.style.color = color;
      registerMediaMotionNode(svgNode, zoom, posX, posY, el.mediaMotion);
      svgNode.innerHTML = el.svgContent.replace(/currentColor/g, color);
      wrapper.appendChild(svgNode);
      return wrapper;
    }

    var src = normalizeMediaSrc(el.src);
    if (!src) {
      return wrapper;
    }

    var img = document.createElement("img");
    img.setAttribute("data-slide-media-id", typeof el.id === "string" ? el.id : "");
    img.alt = typeof el.alt === "string" ? el.alt : "";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.display = "block";
    // Keep default behavior aligned with editor canvas renderer.
    img.style.objectFit = typeof el.imageFit === "string" ? el.imageFit : "contain";
    img.style.objectPosition = posX + "% " + posY + "%";
    registerMediaMotionNode(img, zoom, posX, posY, el.mediaMotion);

    img.src = src;
    if (/\.svg(?:$|[?#])/i.test(src)) {
      img.addEventListener("error", function() {
        if (img.parentNode === wrapper) {
          wrapper.removeChild(img);
        }
        wrapper.appendChild(createSvgPlaceholder());
      }, { once: true });
    }

    wrapper.appendChild(img);
    return wrapper;
  }

  function renderVideo(el) {
    var src = normalizeMediaSrc(el.src);
    var poster = normalizeMediaSrc(el.poster);
    var fit = (typeof el.videoFit === "string" && (el.videoFit === "contain" || el.videoFit === "fill" || el.videoFit === "cover"))
      ? el.videoFit
      : "cover";
    var posX = clamp(asNumber(el.videoPositionX, 50), 0, 100);
    var posY = clamp(asNumber(el.videoPositionY, 50), 0, 100);
    var zoom = clamp(asNumber(el.videoZoom, 1), 0.5, 3);
    if (!src) {
      if (poster) {
        var asImage = {
          x: el.x, y: el.y, width: el.width, height: el.height, opacity: el.opacity, rotation: el.rotation,
          src: poster,
          alt: typeof el.title === "string" ? el.title : "video poster",
          imageFit: fit,
          imagePositionX: posX,
          imagePositionY: posY,
          imageZoom: zoom,
          mediaMotion: el.mediaMotion,
        };
        return renderImage(asImage);
      }
      var empty = document.createElement("div");
      applyBaseStyle(empty, el);
      empty.style.background = "#000";
      return empty;
    }

    var wrapper = document.createElement("div");
    applyBaseStyle(wrapper, el);
    wrapper.style.overflow = "hidden";
    wrapper.style.background = "#000";

    var video = document.createElement("video");
    video.setAttribute("data-slide-media-id", typeof el.id === "string" ? el.id : "");
    video.src = src;
    if (poster) {
      video.poster = poster;
    }
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.display = "block";
    video.style.objectFit = fit;
    video.style.objectPosition = posX + "% " + posY + "%";
    registerMediaMotionNode(video, zoom, posX, posY, el.mediaMotion);
    video.muted = el.muted !== false;
    video.loop = el.loop === true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";

    wrapper.appendChild(video);
    return wrapper;
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

  function renderBackground() {
    var bg = slide && slide.background;
    if (!bg) {
      canvas.style.background = "#ffffff";
      return;
    }
    if (bg.type === "color") {
      canvas.style.background = typeof bg.value === "string" && bg.value ? bg.value : "#ffffff";
      canvas.style.backgroundImage = "";
    } else if (bg.type === "image") {
      var bgUrl = normalizeMediaSrc(bg.url);
      canvas.style.background = "#ffffff";
      if (bgUrl) {
        canvas.style.backgroundImage = "url(" + bgUrl + ")";
        canvas.style.backgroundSize = "cover";
        canvas.style.backgroundPosition = "center";
        canvas.style.backgroundRepeat = "no-repeat";
      }
    }
  }

  function renderElements() {
    canvas.innerHTML = "";
    motionNodes = [];
    var elements = Array.isArray(slide && slide.elements) ? slide.elements : [];
    expectedTextNodeCount = 0;
    for (var i = 0; i < elements.length; i += 1) {
      var el = elements[i] || {};
      var node = null;
      if (el.type === "text") {
        expectedTextNodeCount += 1;
        node = renderText(el);
      }
      else if (el.type === "image") node = renderImage(el);
      else if (el.type === "video") node = renderVideo(el);
      else if (el.type === "rect") node = renderRect(el);
      else if (el.type === "line") node = renderLine(el);
      if (node) canvas.appendChild(node);
    }
  }

  function startMediaMotionLoopIfNeeded() {
    if (renderMode !== "record" || !motionNodes.length) {
      return;
    }
    var startedAt = null;
    var tick = function(timestamp) {
      if (startedAt === null) {
        startedAt = timestamp;
      }
      var elapsedMs = timestamp - startedAt;
      for (var i = 0; i < motionNodes.length; i += 1) {
        var item = motionNodes[i];
        applyMediaMotion(item.node, item.baseZoom, item.posX, item.posY, item.motion, elapsedMs, slideDurationMs);
      }
      if (elapsedMs < slideDurationMs) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }

  function elapsedReadyMs() {
    return Math.max(0, Date.now() - readyGateStartedAt);
  }

  function evaluateBaseLayoutAndText() {
    var canvasRect = canvas.getBoundingClientRect();
    var baseLayoutReady = canvasRect.width > 0 && canvasRect.height > 0;
    var textReady = true;
    if (expectedTextNodeCount > 0) {
      var textNodes = canvas.querySelectorAll("p");
      if (!textNodes || textNodes.length < expectedTextNodeCount) {
        textReady = false;
      } else {
        for (var i = 0; i < textNodes.length; i += 1) {
          var textRect = textNodes[i].getBoundingClientRect();
          if (textRect.width <= 0 || textRect.height <= 0) {
            textReady = false;
            break;
          }
        }
      }
    }
    return {
      baseLayoutReady: baseLayoutReady,
      textReady: textReady,
    };
  }

  function updateReadyState(status, code, reason) {
    var layoutState = evaluateBaseLayoutAndText();
    window.__slideReadyState = {
      status: status,
      code: code || null,
      reason: reason || null,
      attempts: readyGateRetryAttempts,
      elapsedMs: elapsedReadyMs(),
      baseLayoutReady: layoutState.baseLayoutReady,
      textReady: layoutState.textReady,
      fontsReady: readyGateFontsReady,
      mediaReady: readyGateMediaReady,
      stableFramesReady: readyGateStableFramesReady,
      mediaDegraded: readyGateMediaDegraded,
      fontTimedOut: readyGateFontTimedOut,
    };
  }

  function clearReadyTimers() {
    if (readyGateChecker !== null) {
      clearInterval(readyGateChecker);
      readyGateChecker = null;
    }
    if (readyGateHardTimeout !== null) {
      clearTimeout(readyGateHardTimeout);
      readyGateHardTimeout = null;
    }
  }

  function markReady(status, code, reason) {
    if (window.__slideReady === true) {
      return;
    }
    updateReadyState(status, code, reason);
    window.__slideReady = true;
    clearReadyTimers();
  }

  function waitForFontsReady() {
    var settled = false;
    var settle = function(timedOut) {
      if (settled) return;
      settled = true;
      readyGateFontsReady = true;
      readyGateFontTimedOut = timedOut === true;
    };
    var timeoutId = setTimeout(function() {
      settle(true);
    }, READY_GATE_SOFT_WAIT_MS);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready
        .then(function() {
          clearTimeout(timeoutId);
          settle(false);
        })
        .catch(function() {
          clearTimeout(timeoutId);
          settle(true);
        });
      return;
    }
    clearTimeout(timeoutId);
    settle(false);
  }

  function waitForStableFrames(requiredCount, done) {
    var stableCount = 0;
    var prevSignature = "";
    var tick = function() {
      var rect = canvas.getBoundingClientRect();
      var signature = [
        Math.round(rect.width),
        Math.round(rect.height),
        canvas.childElementCount,
      ].join(":");
      if (signature === prevSignature) {
        stableCount += 1;
      } else {
        stableCount = 1;
      }
      prevSignature = signature;
      if (stableCount >= requiredCount) {
        done();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function waitForMediaThenReady(done) {
    var imgs = canvas.querySelectorAll("img");
    var videos = canvas.querySelectorAll("video");
    var imgCount = imgs ? imgs.length : 0;
    var videoCount = videos ? videos.length : 0;

    // Track background image loading (CSS backgroundImage on canvas)
    var bgImg = null;
    var bg = slide && slide.background;
    if (bg && bg.type === "image" && bg.url) {
      var bgUrl = normalizeMediaSrc(bg.url);
      if (bgUrl) {
        bgImg = new Image();
      }
    }
    var bgCount = bgImg ? 1 : 0;

    if ((imgCount + videoCount + bgCount) === 0) {
      done(false);
      return;
    }

    var remaining = imgCount + videoCount + bgCount;
    var hadFallback = false;
    var doneOne = function(fallbackUsed) {
      if (fallbackUsed === true) {
        hadFallback = true;
      }
      remaining -= 1;
      if (remaining <= 0) {
        done(hadFallback);
      }
    };

    for (var i = 0; i < imgs.length; i += 1) {
      var img = imgs[i];
      if (img.complete) {
        doneOne(false);
      } else {
        img.addEventListener("load", function() {
          doneOne(false);
        }, { once: true });
        img.addEventListener("error", function() {
          doneOne(true);
        }, { once: true });
      }
    }

    // Track background image
    if (bgImg) {
      bgImg.addEventListener("load", function() { doneOne(false); }, { once: true });
      bgImg.addEventListener("error", function() { doneOne(true); }, { once: true });
      bgImg.src = normalizeMediaSrc(bg.url);
    }

    var primeVideo = function(video, fallbackTimeoutMs, mode, onDone) {
      var finished = false;
      var timeoutId = setTimeout(function() {
        if (finished) return;
        finished = true;
        onDone(true);
      }, fallbackTimeoutMs);
      var finish = function(fallbackUsed) {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        onDone(fallbackUsed);
      };
      var waitForFramePaint = function() {
        if (mode === "record") {
          finish(false);
          return;
        }
        if (typeof video.requestVideoFrameCallback === "function") {
          video.requestVideoFrameCallback(function() {
            video.pause();
            finish(false);
          });
          return;
        }
        setTimeout(function() {
          video.pause();
          finish(false);
        }, 120);
      };

      var captureFrame = function() {
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          waitForFramePaint();
          return;
        }
        var playPromise = video.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(function() {
              waitForFramePaint();
            })
            .catch(function() {
              finish(true);
            });
          return;
        }
        waitForFramePaint();
      };

      if (video.readyState >= 2) {
        captureFrame();
        return;
      }
      video.addEventListener("loadeddata", captureFrame, { once: true });
      video.addEventListener("canplay", captureFrame, { once: true });
      video.addEventListener("error", function() {
        finish(true);
      }, { once: true });
    };

    for (var j = 0; j < videos.length; j += 1) {
      primeVideo(videos[j], 3000, renderMode, doneOne);
    }
  }

  function evaluateReadyGate() {
    if (window.__slideReady === true) {
      return;
    }

    var layoutState = evaluateBaseLayoutAndText();
    var allReady =
      layoutState.baseLayoutReady
      && layoutState.textReady
      && readyGateFontsReady
      && readyGateMediaReady
      && readyGateStableFramesReady;

    if (allReady) {
      markReady("ready", null, null);
      return;
    }

    var elapsedMs = elapsedReadyMs();
    if (
      elapsedMs >= readyGateNextRetryAt
      && readyGateRetryAttempts < READY_GATE_RETRY_DELAYS_MS.length
    ) {
      readyGateRetryAttempts += 1;
      readyGateNextRetryAt += READY_GATE_RETRY_DELAYS_MS[readyGateRetryAttempts - 1];
      fitCanvasToViewport();
    }

    if (elapsedMs >= READY_GATE_HARD_TIMEOUT_MS) {
      if (!layoutState.baseLayoutReady || !layoutState.textReady) {
        markReady("failed", READY_GATE_FAIL_CODE, "base_layout_or_text_not_ready");
      } else {
        var degradeReason = readyGateFontTimedOut ? "fonts_timeout" : "non_critical_assets_unresolved";
        markReady("degraded", READY_GATE_DEGRADED_CODE, degradeReason);
      }
      return;
    }

    updateReadyState("pending", null, null);
  }

  try {
    renderBackground();
    renderElements();
    startMediaMotionLoopIfNeeded();
    fitCanvasToViewport();
    window.addEventListener("resize", fitCanvasToViewport);
  } catch (_err) {
    markReady("failed", READY_GATE_FAIL_CODE, "render_exception");
    return;
  }

  waitForFontsReady();
  waitForMediaThenReady(function(hadFallback) {
    readyGateMediaReady = true;
    readyGateMediaDegraded = hadFallback === true;
  });
  waitForStableFrames(2, function() {
    readyGateStableFramesReady = true;
  });

  readyGateHardTimeout = setTimeout(function() {
    evaluateReadyGate();
  }, READY_GATE_HARD_TIMEOUT_MS);
  readyGateChecker = setInterval(evaluateReadyGate, READY_GATE_POLL_INTERVAL_MS);
  evaluateReadyGate();
})();
</script>
</body>
</html>`;

    return res.status(200).set("Content-Type", "text/html").send(html);
  });

  return router;
}
