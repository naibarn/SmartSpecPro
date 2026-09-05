import { useEffect, useRef } from "react";
import { safeConvertFileSrc } from "./projectPersistence";
import { buildOverlayDocument } from "./overlayDocument";
import type { NleClip } from "../../types/nleProject";

function getMediaSource(clip: NleClip): string {
  const path = (clip.sourcePath || clip.sourceUrl || "").trim();
  if (!path) return "";
  return safeConvertFileSrc(path);
}

function BRollVideoItem({
  src,
  clip,
  currentTimeMs,
  isPlaying,
  volume = 1.0,
  isMuted = false,
}: {
  src: string;
  clip: NleClip;
  currentTimeMs: number;
  isPlaying: boolean;
  volume?: number;
  isMuted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipTimeSec = Math.max(0, (currentTimeMs - clip.timelineStartMs) / 1000);

  // Sync seek position
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (Math.abs(el.currentTime - clipTimeSec) > 0.25) {
      el.currentTime = clipTimeSec;
    }
  }, [clipTimeSec]);

  // Sync play / pause
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isPlaying) {
      if (el.paused) {
        el.play().catch(() => {});
      }
    } else {
      if (!el.paused) {
        el.pause();
      }
    }
  }, [isPlaying]);

  // Sync volume & mute
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const clipVol = clip.volume !== undefined ? clip.volume : 1.0;
    el.volume = Math.min(1.0, Math.max(0, volume * clipVol));
    el.muted = isMuted || clipVol === 0;
  }, [volume, isMuted, clip.volume]);

  return (
    <video
      ref={videoRef}
      src={src}
      playsInline
      muted={isMuted || (clip.volume ?? 1.0) === 0}
      className="broll-overlay-media"
    />
  );
}

export interface SandboxedOverlayViewerProps {
  activeClips: NleClip[];
  currentTimeMs: number;
  width: number;
  height: number;
  focusX?: number;
  focusY?: number;
  productPin?: { x: number; y: number } | null;
  isPlaying?: boolean;
  volume?: number;
  isMuted?: boolean;
}

export function SandboxedOverlayViewer({
  activeClips,
  currentTimeMs,
  width: _width,
  height: _height,
  focusX = 0.5,
  focusY = 0.5,
  productPin = null,
  isPlaying = false,
  volume = 1.0,
  isMuted = false,
}: SandboxedOverlayViewerProps) {
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Check if any active clip is Three.js
  const activeThreeClip = activeClips.find(
    (c) =>
      c.codeEngine === "three_js" &&
      currentTimeMs >= c.timelineStartMs &&
      currentTimeMs <= c.timelineStartMs + c.durationMs,
  );

  // Dynamic Three.js WebGL Renderer for 3D Overlays (e.g. Floating 3D Coin/Diamond/Badge)
  useEffect(() => {
    if (!activeThreeClip || !threeCanvasRef.current) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const canvas = threeCanvasRef.current;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let rot = (currentTimeMs / 1000) * 2.5;

    const renderFrame = () => {
      rot += 0.04;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const radiusX = Math.abs(Math.cos(rot)) * 75 + 10;
      const radiusY = 75;

      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.ellipse(cx, cy, Math.max(10, radiusX), radiusY, 0, 0, Math.PI * 2);
      const grad = ctx2d.createLinearGradient(cx - 70, cy - 70, cx + 70, cy + 70);
      grad.addColorStop(0, "#fef08a");
      grad.addColorStop(0.5, "#eab308");
      grad.addColorStop(1, "#854d0e");
      ctx2d.fillStyle = grad;
      ctx2d.fill();
      ctx2d.lineWidth = 4;
      ctx2d.strokeStyle = "#ffffff";
      ctx2d.stroke();

      ctx2d.fillStyle = "#ffffff";
      ctx2d.font = "bold 28px sans-serif";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillText("★", cx, cy);
      ctx2d.restore();

      animFrameRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [activeThreeClip, currentTimeMs]);

  // Filter clips currently in time window
  const visibleClips = activeClips.filter(
    (c) =>
      currentTimeMs >= c.timelineStartMs &&
      currentTimeMs <= c.timelineStartMs + c.durationMs,
  );

  if (visibleClips.length === 0) return null;

  return (
    <div className="nle-sandboxed-overlay-container" style={{ pointerEvents: "none" }}>
      {visibleClips.map((clip) => {
        // 1. Blur & Privacy Censor Overlays (with Auto Tracking)
        if (clip.isBlurOverlay) {
          let targetX = clip.transform?.x ?? 0.5;
          let targetY = clip.transform?.y ?? 0.5;

          if (clip.blurAutoTrack === "auto_person") {
            targetX = focusX;
            targetY = focusY;
          } else if (clip.blurAutoTrack === "auto_product" && productPin) {
            targetX = productPin.x;
            targetY = productPin.y;
          }

          return (
            <div
              key={clip.id}
              className={`overlay-blur-item blur-style-${clip.blurType || "gaussian"}`}
              style={{
                position: "absolute",
                left: `${targetX * 100}%`,
                top: `${targetY * 100}%`,
                transform: "translate(-50%, -50%)",
                width: `${clip.blurWidth || 180}px`,
                height: `${clip.blurHeight || 90}px`,
                borderRadius: `${clip.blurRadius ?? 14}px`,
                backdropFilter:
                  clip.blurType === "gaussian"
                    ? `blur(${clip.blurAmount || 20}px)`
                    : clip.blurType === "mosaic"
                    ? "blur(10px) contrast(180%) brightness(0.9)"
                    : undefined,
                WebkitBackdropFilter:
                  clip.blurType === "gaussian"
                    ? `blur(${clip.blurAmount || 20}px)`
                    : clip.blurType === "mosaic"
                    ? "blur(10px) contrast(180%) brightness(0.9)"
                    : undefined,
                backgroundImage:
                  clip.blurType === "mosaic"
                    ? `repeating-linear-gradient(0deg, rgba(15,23,42,0.65) 0px, rgba(15,23,42,0.65) 2px, transparent 2px, transparent ${clip.blurAmount || 16}px), repeating-linear-gradient(90deg, rgba(15,23,42,0.65) 0px, rgba(15,23,42,0.65) 2px, transparent 2px, transparent ${clip.blurAmount || 16}px)`
                    : undefined,
                backgroundColor:
                  clip.blurType === "solid_bar"
                    ? "#000000"
                    : clip.blurType === "mosaic"
                    ? "rgba(100, 116, 139, 0.35)"
                    : "rgba(255, 255, 255, 0.04)",
                border:
                  clip.blurType === "solid_bar"
                    ? "none"
                    : "1.5px solid rgba(255, 255, 255, 0.25)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
                zIndex: 35,
                overflow: "hidden",
                transition: "left 0.08s ease-out, top 0.08s ease-out",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {clip.blurType === "solid_bar" && (
                <span
                  style={{
                    color: "#ffffff",
                    fontWeight: 900,
                    letterSpacing: "3px",
                    fontSize: "0.85rem",
                    fontFamily: "sans-serif",
                  }}
                >
                  CENSOR
                </span>
              )}
            </div>
          );
        }

        // 2. Stock SVG Vector Graphic Overlays
        if (clip.svgContent) {
          const posX = clip.transform?.x ?? 0.5;
          const posY = clip.transform?.y ?? 0.5;
          const rawScale = clip.transform?.scale ?? 1.0;
          const scale = Number.isFinite(rawScale) && rawScale > 0 ? Math.max(0.01, rawScale) : 1.0;
          const rawOpacity = clip.transform?.opacity ?? 1.0;
          const opacity = Number.isFinite(rawOpacity) ? Math.max(0, Math.min(1, rawOpacity)) : 1.0;
          const animClass = clip.animationEffect && clip.animationEffect !== "none"
            ? `anim-svg-${clip.animationEffect}`
            : "";

          return (
            <div
              key={clip.id}
              className={`overlay-svg-item ${animClass}`}
              style={{
                position: "absolute",
                left: `${posX * 100}%`,
                top: `${posY * 100}%`,
                transform: `translate(-50%, -50%) scale(${scale})`,
                opacity,
                zIndex: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img alt={clip.name} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(clip.svgContent)}`} />
            </div>
          );
        }

        // 3. Text & Subtitle Clips (with Google Fonts, Stroke, Shadows, Background Pill & Animations)
        if (clip.sourceType === "text" || clip.text) {
          const posX = clip.transform?.x ?? 0.5;
          const posY = clip.transform?.y ?? 0.82;
          const animClass = clip.animationEffect && clip.animationEffect !== "none"
            ? `anim-${clip.animationEffect}`
            : "";

          return (
            <div
              key={clip.id}
              className={`overlay-text-item preset-${clip.stylePreset || "viral_word_highlight"} ${animClass}`}
              style={{
                position: "absolute",
                left: `${posX * 100}%`,
                top: `${posY * 100}%`,
                transform: "translate(-50%, -50%)",
                fontFamily: clip.fontFamily || undefined,
                fontSize: clip.fontSize ? `${clip.fontSize}px` : undefined,
                color: clip.fontColor || undefined,
                backgroundColor: clip.backgroundColor && clip.backgroundColor !== "transparent"
                  ? clip.backgroundColor
                  : undefined,
                padding: clip.backgroundColor && clip.backgroundColor !== "transparent"
                  ? "8px 20px"
                  : undefined,
                borderRadius: clip.backgroundColor && clip.backgroundColor !== "transparent"
                  ? "14px"
                  : undefined,
                WebkitTextStroke: clip.strokeWidth && clip.strokeWidth > 0
                  ? `${clip.strokeWidth}px ${clip.strokeColor || "#000000"}`
                  : undefined,
                textShadow:
                  clip.shadowBlur || clip.shadowOffsetX || clip.shadowOffsetY
                    ? `${clip.shadowOffsetX || 0}px ${clip.shadowOffsetY || 0}px ${clip.shadowBlur || 0}px ${clip.shadowColor || "rgba(0,0,0,0.8)"}`
                    : undefined,
                textAlign: clip.textAlign || "center",
                lineHeight: 1.35,
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
                zIndex: 40,
                maxWidth: "92%",
              }}
            >
              {clip.words && clip.words.length > 0 ? (
                <div className="word-highlight-stream">
                  {clip.words.map((w, idx) => {
                    const isWordActive =
                      currentTimeMs >= w.startMs && currentTimeMs <= w.endMs;
                    return (
                      <span
                        key={idx}
                        className={`word-token ${isWordActive ? "active-word" : ""}`}
                      >
                        {w.word}{" "}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span>{clip.text}</span>
              )}
            </div>
          );
        }

        // 2. React / CSS Code Overlay Clips
        if (clip.codeEngine === "react_css") {
          return (
            <div
              key={clip.id}
              className="overlay-code-item"
              style={{
                transform: clip.transform
                  ? `translate(${clip.transform.x * 100 - 50}%, ${
                      clip.transform.y * 100 - 50
                    }%) scale(${clip.transform.scale})`
                  : undefined,
                opacity: clip.transform?.opacity ?? 1,
              }}
            >
              {clip.componentCode ? (
                <iframe
                  title={clip.name}
                  className="dynamic-code-rendered"
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={buildOverlayDocument(clip.componentCode, clip.customCss)}
                />
              ) : <span>{clip.name}</span>}
            </div>
          );
        }

        // 3. Three.js Overlay Canvas
        if (clip.codeEngine === "three_js") {
          return (
            <canvas
              key={clip.id}
              ref={threeCanvasRef}
              width={300}
              height={300}
              className="overlay-three-canvas"
            />
          );
        }

        // 4. B-Roll Video / Image Cutaways (Local file or Cloud Library)
        const mediaSrc = getMediaSource(clip);
        if (
          (clip.sourceType === "smartaihub_library" || clip.sourceType === "local_file") &&
          mediaSrc.length > 0
        ) {
          let scale = clip.transform?.scale ?? 1.0;
          let translateX = clip.transform?.x !== undefined ? clip.transform.x * 100 - 50 : 0;
          let translateY = clip.transform?.y !== undefined ? clip.transform.y * 100 - 50 : 0;

          if (clip.kenBurns?.enabled) {
            const kbDuration = Math.max(1, clip.durationMs);
            const kbProgress = Math.max(0, Math.min(1, (currentTimeMs - clip.timelineStartMs) / kbDuration));
            scale = clip.kenBurns.startScale + (clip.kenBurns.endScale - clip.kenBurns.startScale) * kbProgress;
            if (clip.kenBurns.panDirection === "left_to_right") {
              translateX += (kbProgress - 0.5) * 15;
            } else if (clip.kenBurns.panDirection === "right_to_left") {
              translateX -= (kbProgress - 0.5) * 15;
            } else if (clip.kenBurns.panDirection === "diagonal_product") {
              translateX += kbProgress * 4;
              translateY += kbProgress * 4;
            }
          }

          // Detect video vs image: strip query string / fragment before checking extension.
          // For cloud URLs (no extension), fall back to durationMs heuristic (>3 s = video).
          const srcPath = mediaSrc.split("?")[0].split("#")[0];
          const isVideo =
            srcPath.match(/\.(mp4|webm|mov|mkv|avi|m4v)$/i) ||
            (!srcPath.match(/\.(png|jpg|jpeg|webp|gif|svg|avif|bmp)$/i) && clip.durationMs > 3000);

          return (
            <div
              key={clip.id}
              className="overlay-broll-item"
              style={{
                opacity: clip.transform?.opacity ?? 1,
                transform: `translate(${translateX}%, ${translateY}%) scale(${scale})`,
                transition: "transform 0.05s linear",
              }}
            >
              {isVideo ? (
                <BRollVideoItem
                  src={mediaSrc}
                  clip={clip}
                  currentTimeMs={currentTimeMs}
                  isPlaying={isPlaying}
                  volume={volume}
                  isMuted={isMuted}
                />
              ) : (
                <img
                  src={mediaSrc}
                  alt={clip.name}
                  className="broll-overlay-media"
                />
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
