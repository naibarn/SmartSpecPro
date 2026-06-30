import { Router } from "express";

import { signBearerToken, verifyBearerToken, type TokenClaims } from "../_core/tokens";
import {
  getPreviewMatchCaptureRoutePayload,
  type StoryboardPreviewMatchCaptureDeps,
} from "../services/storyboardPreviewMatchCaptureService";
import type { PreviewMatchCompositionPayload } from "../../shared/storyboardPreviewMatchCapture";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const STORYBOARD_CAPTURE_SCOPE = "internal:storyboard-final-capture";

function isInternalAddress(address: string | undefined): boolean {
  if (!address) return false;
  if (LOOPBACK_ADDRESSES.has(address)) return true;
  const ip = address.startsWith("::ffff:") ? address.slice(7) : address;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function hasExactStoryboardCaptureScope(claims: TokenClaims): boolean {
  return Array.isArray(claims.scopes) && claims.scopes.includes(STORYBOARD_CAPTURE_SCOPE);
}

function safeCssFontFamily(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const allowed = new Set([
    "Prompt",
    "Noto Sans Thai",
    "Plus Jakarta Sans",
    "Kanit",
    "Sarabun",
    "Poppins",
    "Montserrat",
    "Oswald",
  ]);
  return allowed.has(raw) ? raw : "Prompt";
}

function buildCaptureFontStack(primaryFontFamily: string): string {
  return [
    primaryFontFamily,
    "Prompt",
    "Noto Sans Thai",
    "Plus Jakarta Sans",
    "system-ui",
    "sans-serif",
  ]
    .filter((font, index, list) => list.indexOf(font) === index)
    .map(font => font === "system-ui" || font === "sans-serif" ? font : `"${font}"`)
    .join(", ");
}

export function signStoryboardFinalCaptureToken(input: {
  captureJobId: string;
  attemptId: string;
  tenantId: string;
  userId: number;
  previewCompositionHash: string;
  timelineHash: string;
  expiresIn?: Parameters<typeof signBearerToken>[1];
}): string {
  return signBearerToken(
    {
      sub: "storyboard-capture-worker",
      scopes: [STORYBOARD_CAPTURE_SCOPE],
      tenantId: input.tenantId,
      userId: input.userId,
      captureJobId: input.captureJobId,
      attemptId: input.attemptId,
      previewCompositionHash: input.previewCompositionHash,
      timelineHash: input.timelineHash,
    } as TokenClaims & {
      captureJobId: string;
      attemptId: string;
      previewCompositionHash: string;
      timelineHash: string;
    },
    input.expiresIn ?? "5m",
  );
}

export function renderStoryboardFinalCaptureHtml(input: {
  captureJobId: string;
  attemptId: string;
  payload: {
    previewCompositionHash: string;
    timelineHash: string;
    output: { width: number; height: number; fps: number; durationSeconds: number };
    text?: Record<string, unknown>;
    shots: Array<{
      id: string;
      sourceVideoRef: string | null;
      mediaStartSec?: number;
      startSec: number;
      endSec: number;
      durationSeconds?: number;
      overlayPreset?: string;
      animationPreset?: string;
      transition?: string;
      textMotionPreset?: string;
      subtitleCues: Array<{ startSec: number; endSec: number; text: string }>;
      onScreenText: string[];
      subtitleText?: string[];
    }>;
  };
}): string {
  const payloadJson = safeJsonForScript(input.payload);
  const initialState = {
    status: "pending",
    code: null,
    reason: null,
    compositionHash: input.payload.previewCompositionHash,
    timelineHash: input.payload.timelineHash,
    durationSec: input.payload.output.durationSeconds,
    fps: input.payload.output.fps,
    mediaReady: false,
    fontsReady: false,
    degradedFlags: [],
  };
  const stateJson = safeJsonForScript(initialState);
  const width = Math.max(1, Math.round(Number(input.payload.output.width || 1080)));
  const height = Math.max(1, Math.round(Number(input.payload.output.height || 1920)));
  const primaryFontFamily = safeCssFontFamily(input.payload.text?.fontFamily);
  const primaryFontFamilyJson = safeJsonForScript(primaryFontFamily);
  const captureFontStack = buildCaptureFontStack(primaryFontFamily);
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${width},height=${height},initial-scale=1" />
  <title>Storyboard Final Capture</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&family=Noto+Sans+Thai:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Bangers&family=Boogaloo&family=Fredoka+One&family=Anton&family=Paytone+One&family=Righteous&family=Permanent+Marker&family=Bebas+Neue&family=Nunito:wght@700;900&family=Poppins:wght@400;600;700&family=Montserrat:wght@400;600;700&family=Oswald:wght@600;700&display=swap" rel="stylesheet" />
  <style>
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
    #capture-root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; color: white; font-family: ${captureFontStack}; }
    .shot { position: absolute; inset: 0; display: grid; place-items: center; background: #000; opacity: 0; transform: translate3d(0,0,0) scale(1); transition: opacity 180ms linear, transform 420ms cubic-bezier(.2,.9,.2,1); contain: strict; }
    .shot.active { opacity: 1; transform: translate3d(0,0,0) scale(1); }
    .shot[data-transition="none"] { transition: none; }
    .shot[data-transition="slide"] { transform: translate3d(8%,0,0) scale(1.015); transition-duration: 360ms; }
    .shot[data-transition="slide"].active { transform: translate3d(0,0,0) scale(1); }
    .shot[data-transition="zoom"] { transform: scale(1.065); transition-duration: 460ms; }
    .shot[data-transition="zoom"].active { transform: scale(1); }
    .shot[data-transition="whip"] { transform: translate3d(18%,0,0) scale(1.04); filter: blur(2px); transition-duration: 260ms; }
    .shot[data-transition="whip"].active { transform: translate3d(0,0,0) scale(1); filter: blur(0); }
    .source { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; background: #000; }
    .hf-preview-stage { position: absolute; inset: 0; overflow: hidden; container-type: inline-size; text-align: left; color: #0f172a; }
    .hf-preview-overlay-copy { position: absolute; left: 9%; top: 12.5%; width: 82%; height: 52%; z-index: 20; display: flex; flex-direction: column; justify-content: flex-start; gap: 16px; pointer-events: none; overflow: visible; }
    .hf-preview-copy-top { max-width: 96%; overflow: visible; }
    .hf-preview-title, .hf-preview-hook, .hf-preview-price, .hf-preview-chip, .hf-sub-line { font-family: ${captureFontStack}; overflow: visible; word-break: keep-all; overflow-wrap: anywhere; }
    .hf-preview-title { max-width: 92%; color: #fff; font-size: clamp(28px, 6.5cqw, 64px); font-weight: 900; line-height: 1.26; padding-top: .16em; text-wrap: balance; text-shadow: 0 3px 0 rgba(2,6,23,.84), 0 16px 32px rgba(2,6,23,.62); }
    .hf-preview-hook { margin-top: 16px; color: #fff; font-size: clamp(18px, 4.2cqw, 40px); font-weight: 900; line-height: 1.28; padding-top: .12em; text-wrap: balance; text-shadow: 0 3px 0 rgba(2,6,23,.82), 0 14px 28px rgba(2,6,23,.55); }
    .hf-preview-price { margin-top: 16px; color: #facc15; font-size: clamp(34px, 7.8cqw, 76px); font-weight: 900; line-height: 1.18; padding-top: .14em; text-shadow: 0 3px 0 rgba(2,6,23,.9), 0 0 34px rgba(250,204,21,.42); }
    .hf-preview-chip-list { display: grid; width: 100%; gap: 16px; margin-top: 24px; }
    .hf-preview-chip { box-sizing: border-box; border-radius: 999px; background: rgba(255,255,255,.88); padding: 18px 22px 16px; color: #0f172a; font-size: 31px; font-weight: 900; line-height: 1.26; box-shadow: 0 16px 32px rgba(2,6,23,.28); backdrop-filter: blur(8px); }
    .hf-sub-preview-inline { position: absolute; left: 7%; right: 7%; bottom: 32%; z-index: 30; display: flex; justify-content: center; text-align: center; pointer-events: none; }
    .hf-sub-line { box-sizing: border-box; max-width: 100%; color: #fff; font-size: var(--hf-subtitle-font-size, 38px); font-weight: 900; line-height: 1.34; padding-top: .12em; animation: hfPreviewRise .52s cubic-bezier(.2,.9,.2,1) both; }
    .hf-preview-stage[data-preset="kinetic_bold_hook"] .hf-preview-title { max-width: 96%; border-radius: 0; background: transparent; padding: 0; color: white; text-shadow: 0 3px 0 rgba(0,0,0,.55), 0 14px 30px rgba(2,6,23,.58); }
    .hf-preview-stage[data-preset="kinetic_bold_hook"] .hf-preview-hook { display: inline-block; width: fit-content; transform: rotate(-2deg); border-radius: 10px; background: #facc15; padding: 8px 12px; color: #020617; text-shadow: none; }
    .hf-preview-stage[data-preset="kinetic_bold_hook"] .hf-preview-chip { border-radius: 10px; background: white; color: #020617; transform: rotate(-1deg); }
    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-overlay-copy { justify-content: flex-start; align-items: center; gap: 4px; padding-bottom: 18%; text-align: center; }
    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-copy-top { margin-top: 5%; max-width: 92%; }
    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-title,
    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-hook,
    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-chip { display: block; padding: 0; border-radius: 0; background: transparent; font-weight: 900; line-height: 1.02; text-align: center; text-shadow: 0 2px 0 #020617, 0 4px 10px rgba(2,6,23,.66); -webkit-text-stroke: .9px #020617; }
    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-title { color: #a7f3d0; }
    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-hook { margin-top: 0; color: #fff; }
    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-chip-list { margin-top: 4px !important; margin-left: 0 !important; width: 84% !important; justify-items: center; }
    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-chip { color: #fff; font-size: clamp(13px, 3cqw, 28px); }
    .hf-preview-stage[data-layer="opening_hook"] .hf-preview-overlay-copy { justify-content: flex-start; gap: 16px; }
    .hf-preview-stage[data-layer="opening_hook"] .hf-preview-title { display: block !important; max-width: 96% !important; border-radius: 0 !important; background: transparent !important; padding-top: .16em !important; color: #fff !important; font-size: clamp(28px, 6.5cqw, 64px) !important; font-weight: 900; line-height: 1.26 !important; text-shadow: 0 3px 0 rgba(0,0,0,.55), 0 14px 30px rgba(2,6,23,.58) !important; }
    .hf-preview-stage[data-layer="opening_hook"] .hf-preview-hook { display: inline-block !important; width: fit-content !important; max-width: 92% !important; margin-top: 0 !important; transform: none !important; border-radius: 18px !important; background: #facc15 !important; padding: 12px 16px 10px !important; color: #020617 !important; font-size: clamp(18px, 4.2cqw, 40px) !important; font-weight: 900; line-height: 1.28 !important; text-shadow: none !important; box-shadow: 0 14px 28px rgba(2,6,23,.22); }
    .hf-preview-stage[data-preset="premium_product_hero"] .hf-preview-title { color: #fff; }
    .hf-preview-stage[data-preset="premium_product_hero"] .hf-preview-hook { display: inline-block; border-radius: 999px; background: rgba(255,255,255,.9); padding: 12px 18px; color: #0f172a; text-shadow: none; }
    .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-title { display: inline-block; width: fit-content; border-radius: 999px; background: rgba(15,23,42,.88); padding: 16px 22px; color: #fff; font-size: 54px; }
    .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-hook { display: inline-block; border-radius: 999px; background: #0ea5e9; padding: 14px 20px; color: #fff; transform: translateX(42px); }
    .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-chip-list { width: 72%; margin-left: 72px; }
    .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-chip:nth-child(odd) { background: rgba(250,204,21,.94); color: #020617; transform: translateX(34px); }
    .hf-preview-stage[data-preset="feature_cards"] .hf-preview-chip-list,
    .hf-preview-stage[data-preset="badge_cascade"] .hf-preview-chip-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .hf-preview-stage[data-preset="lower_third_review"] .hf-preview-overlay-copy { top: auto; bottom: 22%; height: auto; }
    .hf-preview-stage[data-preset="lower_third_review"] .hf-preview-title { border-left: 9px solid #38bdf8; border-radius: 22px; background: rgba(15,23,42,.82); padding: 16px 20px; font-size: 50px; }
    .hf-preview-stage[data-preset="price_impact"] .hf-preview-overlay-copy,
    .hf-preview-stage[data-preset="hero_price_billboard"] .hf-preview-overlay-copy { top: auto; bottom: 24%; height: auto; }
    .hf-preview-stage[data-preset="price_impact"] .hf-preview-copy-top,
    .hf-preview-stage[data-preset="hero_price_billboard"] .hf-preview-copy-top { border-left: 10px solid #facc15; border-radius: 28px; background: rgba(2,6,23,.76); padding: 18px 22px; box-shadow: 0 24px 46px rgba(2,6,23,.42); backdrop-filter: blur(10px); }
    .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-copy-top,
    .hf-preview-stage[data-preset="split_product_specs"] .hf-preview-chip-list { width: 46%; max-width: 46%; margin-left: auto; }
    .hf-preview-stage[data-preset="neon_gaming_specs"] .hf-preview-title,
    .hf-preview-stage[data-preset="neon_gaming_specs"] .hf-preview-chip { border: 1px solid rgba(34,211,238,.6); background: rgba(8,47,73,.64); color: #cffafe; box-shadow: 0 0 34px rgba(34,211,238,.32); }
    .hf-preview-stage[data-preset="clean_subtitle"] .hf-preview-overlay-copy { display: none; }
    .hf-preview-stage[data-text-motion="slide_right_to_left"] .hf-preview-overlay-copy { animation: hfPreviewSlideRightToLeft .64s cubic-bezier(.2,.9,.2,1) both; }
    .hf-preview-stage[data-text-motion="slide_left_to_right"] .hf-preview-overlay-copy { animation: hfPreviewSlideLeftToRight .64s cubic-bezier(.2,.9,.2,1) both; }
    .hf-preview-stage[data-text-motion="stagger_rise"] .hf-preview-title,
    .hf-preview-stage[data-text-motion="stagger_rise"] .hf-preview-hook,
    .hf-preview-stage[data-text-motion="stagger_rise"] .hf-preview-chip { animation: hfPreviewRise .58s cubic-bezier(.2,.9,.2,1) both; }
    .hf-preview-stage[data-text-motion="pop_scale"] .hf-preview-title,
    .hf-preview-stage[data-text-motion="pop_scale"] .hf-preview-hook,
    .hf-preview-stage[data-text-motion="pop_scale"] .hf-preview-chip { animation: hfPreviewPop .62s cubic-bezier(.18,.9,.24,1) both; }
    .hf-preview-stage[data-text-motion="wipe_reveal"] .hf-preview-title,
    .hf-preview-stage[data-text-motion="wipe_reveal"] .hf-preview-hook,
    .hf-preview-stage[data-text-motion="wipe_reveal"] .hf-preview-chip { animation: hfPreviewWipe .72s cubic-bezier(.22,1,.36,1) both; }
    .hf-preview-stage[data-text-motion="none"] .hf-preview-title,
    .hf-preview-stage[data-text-motion="none"] .hf-preview-hook,
    .hf-preview-stage[data-text-motion="none"] .hf-preview-chip,
    .hf-preview-stage[data-text-motion="none"] .hf-preview-overlay-copy { animation: none !important; opacity: 1; clip-path: none; transform: none; }
    .hf-preview-stage[data-animation="glow_feature"] .hf-preview-title,
    .hf-preview-stage[data-animation="glow_feature"] .hf-preview-hook { text-shadow: 0 3px 0 rgba(2,6,23,.86), 0 0 34px rgba(14,165,233,.62), 0 18px 34px rgba(2,6,23,.55); }
    .hf-preview-stage .hf-preview-title,
    .hf-preview-stage .hf-preview-hook,
    .hf-preview-stage .hf-preview-price,
    .hf-preview-stage .hf-preview-chip {
      box-sizing: border-box;
      overflow: visible !important;
      line-height: 1.34 !important;
      padding-top: max(.24em, 10px) !important;
      padding-bottom: max(.08em, 4px) !important;
      font-family: ${captureFontStack} !important;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
      transform-box: border-box;
    }
    .hf-preview-stage[data-preset="kinetic_bold_hook"] .hf-preview-title {
      padding-top: max(.28em, 12px) !important;
      padding-bottom: max(.1em, 5px) !important;
    }
    .hf-preview-stage[data-layer="opening_hook"] .hf-preview-title {
      padding-top: max(.28em, 12px) !important;
      padding-bottom: max(.1em, 5px) !important;
      line-height: 1.34 !important;
    }
    .hf-preview-stage[data-layer="opening_hook"] .hf-preview-hook {
      padding: 14px 16px 11px !important;
      line-height: 1.32 !important;
    }
    .hf-preview-stage[data-animation="bounce_price"] .hf-preview-price,
    .hf-preview-stage[data-animation="bounce_price"] .hf-preview-chip:first-child { animation: hfPreviewPop .55s cubic-bezier(.15,1.25,.35,1) both; }
    .hf-sub-preview-inline[data-subtitle-preset="classic_box"] .hf-sub-line { border-radius: 10px; background: rgba(0,0,0,.76); padding: 10px 14px; color: #fff; }
    .hf-sub-preview-inline[data-subtitle-preset="minimal_shadow"] .hf-sub-line { background: transparent; color: #fff; text-shadow: 0 3px 8px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9); }
    .hf-sub-preview-inline[data-subtitle-preset="creator_pop"] .hf-sub-line { border-radius: 999px; background: #fff; padding: 10px 16px; color: #020617; box-shadow: 0 10px 24px rgba(0,0,0,.28); animation-name: hfPreviewPop; }
    .hf-sub-preview-inline[data-subtitle-preset="karaoke_word"] .hf-sub-word { display: inline-block; margin: 0 2px 4px; border-radius: 8px; padding: 2px 6px; animation: hfPreviewPop .42s cubic-bezier(.2,.9,.2,1) both; }
    .hf-sub-preview-inline[data-subtitle-preset="karaoke_word"] .hf-sub-word:nth-child(odd) { background: #facc15; color: #020617; }
    .hf-sub-preview-inline[data-subtitle-preset="karaoke_word"] .hf-sub-word:nth-child(even) { color: #fff; }
    .hf-sub-preview-inline[data-subtitle-preset="highlight_bar"] .hf-sub-line { background: linear-gradient(transparent 52%, rgba(250,204,21,.82) 52%); color: #fff; text-shadow: 0 3px 8px rgba(0,0,0,.9); }
    .hf-sub-preview-inline[data-subtitle-preset="lower_third"] .hf-sub-line { width: 100%; border-left: 5px solid #38bdf8; background: rgba(15,23,42,.82); padding: 12px 16px; text-align: left; color: #fff; }
    .hf-sub-preview-inline[data-subtitle-preset="cinematic_wide"] .hf-sub-line { width: 100%; background: rgba(0,0,0,.58); padding: 12px 20px; color: #f8fafc; }
    .hf-sub-preview-inline[data-subtitle-preset="neon_glow"] .hf-sub-line { border: 1px solid rgba(34,211,238,.55); border-radius: 12px; background: rgba(2,6,23,.72); padding: 10px 14px; color: #cffafe; box-shadow: 0 0 28px rgba(34,211,238,.32); }
    .hf-sub-preview-inline[data-subtitle-preset="review_bubble"] .hf-sub-line { border-radius: 18px 18px 18px 4px; background: #fff; padding: 12px 16px; color: #0f172a; box-shadow: 0 10px 24px rgba(0,0,0,.24); }
    .hf-sub-preview-inline[data-subtitle-preset="no_subtitle_style"] .hf-sub-line { display: none; }
    @keyframes hfPreviewRise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes hfPreviewPop { 0% { opacity: 0; transform: scale(.92); } 72% { opacity: 1; transform: scale(1.035); } 100% { opacity: 1; transform: scale(1); } }
    @keyframes hfPreviewWipe { from { opacity: 0; clip-path: inset(0 100% 0 0); transform: translateY(8px); } to { opacity: 1; clip-path: inset(0 0 0 0); transform: translateY(0); } }
    @keyframes hfPreviewSlideRightToLeft { from { opacity: 0; transform: translateX(52px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes hfPreviewSlideLeftToRight { from { opacity: 0; transform: translateX(-52px); } to { opacity: 1; transform: translateX(0); } }
  </style>
</head>
<body>
  <main id="capture-root" data-capture-job-id="${input.captureJobId}" data-attempt-id="${input.attemptId}" aria-hidden="true"></main>
  <script>
    window.__storyboardCaptureReady = false;
    window.__storyboardCaptureState = ${stateJson};
    const payload = ${payloadJson};
    const primaryFontFamily = ${primaryFontFamilyJson};
    const root = document.getElementById("capture-root");
    function updateState(next) {
      window.__storyboardCaptureState = Object.assign({}, window.__storyboardCaptureState, next);
      window.__storyboardCaptureReady = window.__storyboardCaptureState.status === "ready" || window.__storyboardCaptureState.status === "degraded";
    }
    function resolveMediaUrl(ref) {
      if (typeof ref !== "string") return null;
      const value = ref.trim();
      if (!value) return null;
      if (/^https?:\\/\\//i.test(value)) return value;
      if (value.startsWith("/")) return value;
      if (value.startsWith("storage://")) return "/api/storage/files/" + encodeURI(value.slice("storage://".length));
      return null;
    }
    function waitForVideoFrame(video) {
      return new Promise((resolve) => {
        if (typeof video.requestVideoFrameCallback === "function") {
          video.requestVideoFrameCallback(() => resolve(true));
          return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
      });
    }
    function waitForEvent(target, eventName, timeoutMs) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(eventName + "_timeout"));
        }, timeoutMs);
        target.addEventListener(eventName, () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(true);
        }, { once: true });
      });
    }
    async function waitForCaptureFonts() {
      if (!document.fonts || typeof document.fonts.ready === "undefined") {
        return { ready: false, flags: ["font_api_unavailable"] };
      }
      await document.fonts.ready;
      const checkText = "โต๊ะกลางโซฟา วางไปวางมา";
      const primaryReady = document.fonts.check("900 48px " + JSON.stringify(primaryFontFamily), checkText);
      const promptReady = document.fonts.check('900 48px "Prompt"', checkText);
      const notoReady = document.fonts.check('900 48px "Noto Sans Thai"', checkText);
      const flags = [];
      if (!primaryReady) flags.push("font_not_loaded:" + primaryFontFamily);
      if (!promptReady) flags.push("font_not_loaded:Prompt");
      if (!notoReady) flags.push("font_not_loaded:Noto Sans Thai");
      return { ready: primaryReady || promptReady || notoReady, flags };
    }
    function waitForVideo(video, shotId, mediaStartSec, shouldPrimePlayback) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve(true);
        };
        const fail = () => {
          if (settled) return;
          settled = true;
          reject(new Error("media_preload_failed:" + shotId));
        };
        const timer = window.setTimeout(fail, 45000);
        const cleanupFinish = () => {
          window.clearTimeout(timer);
          finish();
        };
        video.addEventListener("loadeddata", cleanupFinish, { once: true });
        video.addEventListener("canplay", cleanupFinish, { once: true });
        video.addEventListener("error", fail, { once: true });
        video.load();
      }).then(async () => {
        const start = Number(mediaStartSec || 0);
        video.dataset.mediaStartSec = String(Number.isFinite(start) ? Math.max(0, start) : 0);
        if (Number.isFinite(start) && start > 0 && video.duration > start) {
          try {
            video.currentTime = start;
            await waitForEvent(video, "seeked", 8000).catch(() => undefined);
          } catch {}
        }
        if (shouldPrimePlayback) {
          await video.play().catch(() => undefined);
          await waitForVideoFrame(video);
        } else {
          video.pause();
        }
        return true;
      });
    }
    function activeShotIndexAt(elapsedSec) {
      const shots = payload.shots || [];
      if (shots.length === 0) return -1;
      const index = shots.findIndex((shot) => elapsedSec >= Number(shot.startSec || 0) && elapsedSec < Number(shot.endSec || 0));
      if (index >= 0) return index;
      return elapsedSec < Number(shots[0].startSec || 0) ? 0 : shots.length - 1;
    }
    function cleanLine(value) {
      return typeof value === "string" ? value.trim() : "";
    }
    function hookLinesForFirstShot() {
      const text = payload.text || {};
      return [cleanLine(text.hookText), cleanLine(text.supportingText)].filter(Boolean);
    }
    function isOpeningHookWindow(index, elapsedSec) {
      return index === 0 && elapsedSec < 3 && hookLinesForFirstShot().length > 0;
    }
    function linesForShotAt(shot, index, elapsedSec) {
      const openingHookLines = isOpeningHookWindow(index, elapsedSec) ? hookLinesForFirstShot() : [];
      return openingHookLines.length > 0 ? openingHookLines : (shot.onScreenText || []).filter(Boolean);
    }
    function activeSubtitleCueForShot(shot, elapsedSec) {
      if (!payload.text || payload.text.burnInSubtitles === false || payload.text.subtitlePreset === "no_subtitle_style") {
        return null;
      }
      const shotStart = Number(shot.startSec || 0);
      const localSec = Math.max(0, elapsedSec - shotStart);
      const cues = Array.isArray(shot.subtitleCues) ? shot.subtitleCues : [];
      return cues.find((cue) => {
        const start = Number(cue.startSec || 0);
        const end = Number(cue.endSec || 0);
        const hasAbsoluteWindow = start >= shotStart - 0.001;
        const timelineSec = hasAbsoluteWindow ? elapsedSec : localSec;
        return timelineSec >= start && timelineSec < end && cleanLine(cue.text);
      }) || null;
    }
    function setTextNode(node, value) {
      const text = cleanLine(value);
      node.textContent = text;
      node.style.display = text ? "" : "none";
    }
    function previewSubtitleFontSizeCss(renderFontSizePx) {
      const numeric = Number(renderFontSizePx);
      const renderPx = Number.isFinite(numeric) ? Math.max(24, Math.min(52, Math.round(numeric))) : 34;
      const previewPx = Math.max(12, Math.min(24, Math.round(renderPx * 0.48)));
      return "clamp(" + previewPx + "px, 4.2cqw, " + Math.max(28, Math.round(previewPx * 2.1)) + "px)";
    }
    function renderSubtitleText(node, text, preset) {
      const clean = cleanLine(text);
      node.textContent = "";
      if (preset === "karaoke_word") {
        clean.split(/\\s+/).filter(Boolean).forEach((word) => {
          const span = document.createElement("span");
          span.className = "hf-sub-word";
          span.textContent = word;
          node.appendChild(span);
        });
      } else {
        node.textContent = clean;
      }
    }
    function restartMotionFor(node) {
      if (!node) return;
      node.style.animation = "none";
      void node.offsetWidth;
      node.style.animation = "";
      node.querySelectorAll(".hf-preview-title, .hf-preview-hook, .hf-preview-price, .hf-preview-chip, .hf-sub-line, .hf-sub-word").forEach((child) => {
        child.style.animation = "none";
        void child.offsetWidth;
        child.style.animation = "";
      });
    }
    function mediaTargetSecForShot(shot, elapsedSec, video) {
      const shotStart = Number(shot.startSec || 0);
      const mediaStart = Number(shot.mediaStartSec || 0);
      const localElapsed = Math.max(0, elapsedSec - shotStart);
      const rawTarget = Math.max(0, mediaStart + localElapsed);
      if (Number.isFinite(video.duration) && video.duration > 0) {
        return Math.min(rawTarget, Math.max(0, video.duration - 0.05));
      }
      return rawTarget;
    }
    function syncShotVideo(frame, shot, elapsedSec, active) {
      const video = frame.querySelector("video.source");
      if (!video || !shot) return;
      const wasActive = frame.dataset.wasActive === "true";
      frame.dataset.wasActive = active ? "true" : "false";
      if (!active) {
        if (wasActive) video.pause();
        return;
      }
      const target = mediaTargetSecForShot(shot, elapsedSec, video);
      const drift = Math.abs(Number(video.currentTime || 0) - target);
      if (!wasActive || drift > 0.35) {
        try { video.currentTime = target; } catch {}
      }
      if (video.paused) {
        void video.play().catch(() => undefined);
      }
    }
    function updateFrameContent(frame, shot, index, elapsedSec, active) {
      const stage = frame.querySelector(".hf-preview-stage");
      const titleNode = frame.querySelector(".hf-preview-title");
      const hookNode = frame.querySelector(".hf-preview-hook, .hf-preview-price");
      const chipList = frame.querySelector(".hf-preview-chip-list");
      const captionWrap = frame.querySelector(".hf-sub-preview-inline");
      const captionNode = frame.querySelector(".hf-sub-line");
      if (stage && titleNode && hookNode && chipList) {
        const lines = active ? linesForShotAt(shot, index, elapsedSec) : [];
        stage.dataset.layer = active && isOpeningHookWindow(index, elapsedSec) ? "opening_hook" : "shot_overlay";
        stage.dataset.textMotion = shot.textMotionPreset || (payload.text && payload.text.textMotionPreset) || "none";
        const overlaySignature = JSON.stringify({
          active,
          layer: stage.dataset.layer,
          motion: stage.dataset.textMotion,
          lines,
        });
        setTextNode(titleNode, lines[0] || "");
        setTextNode(hookNode, lines[1] || "");
        const chips = lines.slice(2).filter(Boolean);
        chipList.innerHTML = "";
        chips.forEach((line) => {
          const chip = document.createElement("div");
          chip.className = "hf-preview-chip";
          chip.textContent = line;
          chipList.appendChild(chip);
        });
        chipList.style.display = chips.length > 0 ? "" : "none";
        const overlay = frame.querySelector(".hf-preview-overlay-copy");
        if (overlay) {
          overlay.style.display = lines.length > 0 ? "" : "none";
          if (active && lines.length > 0 && overlay.dataset.motionSignature !== overlaySignature) {
            overlay.dataset.motionSignature = overlaySignature;
            restartMotionFor(overlay);
          }
        }
      }
      if (captionWrap && captionNode) {
        const cue = active ? activeSubtitleCueForShot(shot, elapsedSec) : null;
        const subtitleSignature = JSON.stringify({
          active,
          preset: captionWrap.dataset.subtitlePreset || "classic_box",
          text: cue ? cleanLine(cue.text) : "",
        });
        renderSubtitleText(captionNode, cue ? cue.text : "", captionWrap.dataset.subtitlePreset || "classic_box");
        captionWrap.style.display = cue ? "" : "none";
        if (cue && captionWrap.dataset.motionSignature !== subtitleSignature) {
          captionWrap.dataset.motionSignature = subtitleSignature;
          restartMotionFor(captionWrap);
        }
      }
    }
    function startTimeline(frames) {
      const shots = payload.shots || [];
      const startedAt = performance.now();
      const tick = () => {
        const elapsedSec = (performance.now() - startedAt) / 1000;
        const activeIndex = activeShotIndexAt(elapsedSec);
        frames.forEach((frame, index) => {
          const active = index === activeIndex;
          frame.classList.toggle("active", active);
          syncShotVideo(frame, shots[index], elapsedSec, active);
          updateFrameContent(frame, shots[index], index, elapsedSec, active);
        });
        if (elapsedSec <= Number(payload.output.durationSeconds || 0) + 1) {
          requestAnimationFrame(tick);
        }
      };
      tick();
    }
    function renderShots() {
      const shots = payload.shots || [];
      if (shots.length === 0) {
        updateState({ status: "error", code: "capture_payload_missing", reason: "No shots available" });
        return;
      }
      const mediaPromises = [];
      const degradedFlags = [];
      const frames = shots.map((shot, index) => {
          const frame = document.createElement("section");
          frame.className = index === 0 ? "shot active" : "shot";
        frame.dataset.transition = shot.transition || "fade";
        const mediaUrl = resolveMediaUrl(shot.sourceVideoRef);
        if (mediaUrl) {
          const video = document.createElement("video");
          video.className = "source";
          video.src = mediaUrl;
          video.muted = true;
          video.playsInline = true;
          video.autoplay = false;
          video.preload = "auto";
          video.loop = false;
          mediaPromises.push(waitForVideo(video, shot.id || String(index), shot.mediaStartSec, index === 0));
          frame.appendChild(video);
        } else {
          degradedFlags.push("missing_media_url:" + (shot.id || index));
        }
        const stage = document.createElement("div");
        stage.className = "hf-preview-stage";
        stage.dataset.preset = shot.overlayPreset || (payload.text && payload.text.overlayPreset) || "premium_product_hero";
        stage.dataset.textMotion = shot.textMotionPreset || (payload.text && payload.text.textMotionPreset) || "none";
        stage.dataset.animation = shot.animationPreset || "smooth_reveal";
        stage.dataset.previewMode = "video";
        stage.dataset.hasMedia = mediaUrl ? "true" : "false";
        stage.dataset.layer = isOpeningHookWindow(index, 0) ? "opening_hook" : "shot_overlay";
        const lines = linesForShotAt(shot, index, 0);
        const title = lines[0] || "";
        const hook = lines[1] || "";
        const chips = lines.slice(2);
        if (lines.length > 0) {
          const overlay = document.createElement("div");
          overlay.className = "hf-preview-overlay-copy";
          const top = document.createElement("div");
          top.className = "hf-preview-copy-top";
          const titleNode = document.createElement("div");
          titleNode.className = "hf-preview-title";
          titleNode.textContent = title;
          titleNode.style.display = title ? "" : "none";
          top.appendChild(titleNode);
          const hookNode = document.createElement("div");
          hookNode.className = (stage.dataset.preset || "").includes("price") ? "hf-preview-price" : "hf-preview-hook";
          hookNode.textContent = hook;
          hookNode.style.display = hook ? "" : "none";
          top.appendChild(hookNode);
          overlay.appendChild(top);
          const chipList = document.createElement("div");
          chipList.className = "hf-preview-chip-list";
          chipList.style.display = chips.length > 0 ? "" : "none";
          chips.forEach((line) => {
            const chip = document.createElement("div");
            chip.className = "hf-preview-chip";
            chip.textContent = line;
            chipList.appendChild(chip);
          });
          overlay.appendChild(chipList);
          stage.appendChild(overlay);
        }
        if (payload.text && payload.text.burnInSubtitles !== false && payload.text.subtitlePreset !== "no_subtitle_style") {
          const captionWrap = document.createElement("div");
          captionWrap.className = "hf-sub-preview-inline";
          captionWrap.dataset.subtitlePreset = (payload.text && payload.text.subtitlePreset) || "classic_box";
          captionWrap.style.display = "none";
          const caption = document.createElement("div");
          caption.className = "hf-sub-line";
          caption.style.setProperty("--hf-subtitle-font-size", previewSubtitleFontSizeCss(payload.text && payload.text.subtitleFontSizePx));
          captionWrap.appendChild(caption);
          stage.appendChild(captionWrap);
        }
        frame.appendChild(stage);
        root.appendChild(frame);
        return frame;
      });
      Promise.all([
        waitForCaptureFonts().catch((error) => ({
          ready: false,
          flags: ["font_preload_failed:" + (error && error.message ? error.message : "unknown")],
        })),
        Promise.all(mediaPromises),
      ]).then(([fontStatus]) => {
        const fontFlags = fontStatus && Array.isArray(fontStatus.flags) ? fontStatus.flags : [];
        startTimeline(frames);
        updateState({
          status: degradedFlags.length > 0 || fontFlags.length > 0 ? "degraded" : "ready",
          mediaReady: mediaPromises.length > 0,
          fontsReady: Boolean(fontStatus && fontStatus.ready),
          degradedFlags: degradedFlags.concat(fontFlags),
        });
      }).catch((error) => {
        updateState({
          status: "error",
          code: "media_preload_failed",
          reason: error && error.message ? error.message : "Media failed to load",
          mediaReady: false,
          fontsReady: true,
        });
      });
    }
    renderShots();
  </script>
</body>
</html>`;
}

export function createStoryboardFinalCaptureRouter(options?: {
  deps?: StoryboardPreviewMatchCaptureDeps;
}): Router {
  const router = Router();

  router.get("/storyboard-final-capture/:captureJobId", async (req, res) => {
    if (!isInternalAddress(req.socket?.remoteAddress)) {
      return res.status(403).json({ error: "Forbidden: internal network only" });
    }
    const tokenHeader = req.headers["x-internal-token"];
    const tokenStr = typeof tokenHeader === "string" ? tokenHeader : undefined;
    if (!tokenStr) {
      return res.status(401).json({ error: "Unauthorized: missing X-Internal-Token header" });
    }
    let claims: TokenClaims & {
      captureJobId?: string;
      attemptId?: string;
      previewCompositionHash?: string;
      timelineHash?: string;
    };
    try {
      claims = await verifyBearerToken(tokenStr);
    } catch {
      return res.status(401).json({ error: "Unauthorized: invalid or expired token" });
    }
    if (!hasExactStoryboardCaptureScope(claims)) {
      return res.status(401).json({ error: "Unauthorized: missing internal:storyboard-final-capture scope" });
    }
    if (
      claims.captureJobId !== req.params.captureJobId ||
      !claims.attemptId ||
      !claims.tenantId
    ) {
      return res.status(401).json({ error: "Unauthorized: token claims do not match URL params" });
    }
    const routePayload = await getPreviewMatchCaptureRoutePayload({
      captureJobId: req.params.captureJobId,
      attemptId: claims.attemptId,
      tenantId: claims.tenantId,
      deps: options?.deps,
    });
    if (!routePayload) {
      return res.status(404).json({ error: "Not found: capture job or attempt unavailable" });
    }
    if (
      claims.previewCompositionHash !== routePayload.payload.previewCompositionHash ||
      claims.timelineHash !== routePayload.payload.timelineHash
    ) {
      return res.status(401).json({ error: "Unauthorized: token hash claims do not match capture payload" });
    }
    const payload = routePayload.payload as PreviewMatchCompositionPayload;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(renderStoryboardFinalCaptureHtml({
      captureJobId: routePayload.job.id,
      attemptId: routePayload.attempt.id,
      payload,
    }));
  });

  return router;
}
