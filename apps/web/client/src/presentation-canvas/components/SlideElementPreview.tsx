import type { CSSProperties } from "react";

import { normalizeMediaSourceUrl } from "@/lib/mediaUrl";
import type {
  PresentationCanvasSize,
  PresentationElement,
  PresentationSlideBackground,
} from "@/lib/presentationEditorState";
import { buildPresentationMediaShapeStyleForElement } from "@shared/presentation/mediaShape";

interface SlideElementPreviewProps {
  elements: PresentationElement[];
  canvasSize: PresentationCanvasSize;
  background?: PresentationSlideBackground;
  testId?: string;
  targetWidth?: number;
  className?: string;
}

const MIN_PREVIEW_LINE_HEIGHT = 2;
const DEFAULT_PREVIEW_WIDTH = 272;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isLikelySvgMarkup(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("<svg") && normalized.includes("</svg>");
}

function renderPreviewElement(
  element: PresentationElement,
  index: number,
  canvasWidth: number,
  canvasHeight: number,
): JSX.Element {
  const commonStyle = {
    left: `${(element.x / canvasWidth) * 100}%`,
    top: `${(element.y / canvasHeight) * 100}%`,
    width: `${(element.width / canvasWidth) * 100}%`,
    height:
      element.type === "line"
        ? `${Math.max((element.height / canvasHeight) * 100, (MIN_PREVIEW_LINE_HEIGHT / canvasHeight) * 100)}%`
        : `${(element.height / canvasHeight) * 100}%`,
    opacity: element.opacity ?? 1,
    transform: `rotate(${element.rotation ?? 0}deg)`,
    transformOrigin: "center center",
  } satisfies CSSProperties;

  if (element.type === "text") {
    const fontSize = typeof element.fontSize === "number" && Number.isFinite(element.fontSize)
      ? element.fontSize
      : 48;
    const lineHeight = Number.isFinite(element.lineHeight) ? element.lineHeight : 1.25;
    const letterSpacing = typeof element.letterSpacing === "number" && Number.isFinite(element.letterSpacing)
      ? element.letterSpacing
      : 0;
    return (
      <div
        key={element.id || `preview-${index}`}
        className="absolute overflow-hidden"
        style={{
          ...commonStyle,
          backgroundColor: element.backgroundColor || "transparent",
          padding: "8px",
          boxSizing: "border-box",
        }}
      >
        <p
          className="w-full whitespace-pre-wrap break-all"
          style={{
            color: element.color || "#111827",
            fontSize,
            fontFamily: element.fontFamily || "Inter, system-ui, sans-serif",
            fontWeight: element.fontWeight || "600",
            fontStyle: element.fontStyle || "normal",
            textDecoration: element.textDecoration || "none",
            textAlign: element.textAlign || "left",
            lineHeight,
            letterSpacing: `${letterSpacing}px`,
            ...(element.textShadow ? { textShadow: element.textShadow } : {}),
            ...(element.textStroke ? { WebkitTextStroke: element.textStroke } : {}),
          }}
        >
          {element.text || "Text"}
        </p>
      </div>
    );
  }

  if (element.type === "image") {
    const fit = (element.imageFit === "cover" || element.imageFit === "fill")
      ? element.imageFit
      : "contain";
    const positionX = clampNumber(Number(element.imagePositionX ?? 50), 0, 100);
    const positionY = clampNumber(Number(element.imagePositionY ?? 50), 0, 100);
    const zoom = clampNumber(Number(element.imageZoom ?? 1), 0.5, 3);
    const source = normalizeMediaSourceUrl(element.src);
    const mediaShapeStyle = buildPresentationMediaShapeStyleForElement(element);
    const inlineSvg = typeof element.svgContent === "string" ? element.svgContent.trim() : "";
    const hasInlineSvg = inlineSvg.length > 0;
    const hasValidInlineSvg = hasInlineSvg && isLikelySvgMarkup(inlineSvg);
    const coloredSvg = hasValidInlineSvg
      ? inlineSvg.replace(/currentColor/g, element.svgColor || "#ffffff")
      : "";
    return (
      <div
        key={element.id || `preview-${index}`}
        className={`absolute overflow-hidden ${!source && !hasInlineSvg ? "bg-slate-100" : ""}`}
        style={{ ...commonStyle, ...mediaShapeStyle }}
      >
        {hasValidInlineSvg ? (
          <div
            className="h-full w-full"
            style={{
              color: element.svgColor || "#ffffff",
              transform: `scale(${zoom})`,
              transformOrigin: `${positionX}% ${positionY}%`,
            }}
            dangerouslySetInnerHTML={{ __html: coloredSvg }}
          />
        ) : source ? (
          <img
            src={source}
            alt={element.alt || "Image"}
            className="h-full w-full"
            draggable={false}
            style={{
              objectFit: fit,
              objectPosition: `${positionX}% ${positionY}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${positionX}% ${positionY}%`,
            }}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[10px] font-medium text-slate-500">
            Image
          </div>
        )}
      </div>
    );
  }

  if (element.type === "video") {
    const fit = (element.videoFit === "contain" || element.videoFit === "fill")
      ? element.videoFit
      : "cover";
    const positionX = clampNumber(Number(element.videoPositionX ?? 50), 0, 100);
    const positionY = clampNumber(Number(element.videoPositionY ?? 50), 0, 100);
    const zoom = clampNumber(Number(element.videoZoom ?? 1), 0.5, 3);
    const poster = normalizeMediaSourceUrl(element.poster || element.src);
    const mediaShapeStyle = buildPresentationMediaShapeStyleForElement(element);
    return (
      <div
        key={element.id || `preview-${index}`}
        className="absolute overflow-hidden bg-black/85"
        style={{ ...commonStyle, ...mediaShapeStyle }}
      >
        {poster ? (
          <img
            src={poster}
            alt={element.title || "Video preview"}
            className="h-full w-full"
            draggable={false}
            style={{
              objectFit: fit,
              objectPosition: `${positionX}% ${positionY}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${positionX}% ${positionY}%`,
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[11px] text-white">
          <span className="truncate">{element.title || "Video"}</span>
        </div>
      </div>
    );
  }

  if (element.type === "rect") {
    return (
      <div
        key={element.id || `preview-${index}`}
        className="absolute"
        style={{
          ...commonStyle,
          backgroundColor: element.fill || "#93c5fd",
          border: `${Math.max(0, element.strokeWidth ?? 0)}px solid ${element.stroke || "transparent"}`,
        }}
      />
    );
  }

  return (
    <div
      key={element.id || `preview-${index}`}
      className="absolute"
      style={commonStyle}
    >
      <div
        className="absolute left-0 right-0 top-1/2"
        style={{
          borderTop: `${Math.max(1, element.strokeWidth || 1)}px solid ${element.stroke || "#1f2937"}`,
        }}
      />
    </div>
  );
}

export function SlideElementPreview({
  elements,
  canvasSize,
  background,
  testId,
  targetWidth = DEFAULT_PREVIEW_WIDTH,
  className = "",
}: SlideElementPreviewProps) {
  const previewHeight = Math.max(120, Math.round((targetWidth * canvasSize.height) / canvasSize.width));
  const backgroundColor = background?.type === "color" ? background.value : "#ffffff";

  return (
    <div
      className={`overflow-hidden rounded-md border border-slate-200 bg-slate-50 ${className}`.trim()}
      data-testid={testId}
    >
      <div className="flex justify-center p-2">
        <div
          className="relative overflow-hidden rounded-md border border-slate-200 shadow-sm"
          style={{
            width: `${targetWidth}px`,
            height: `${previewHeight}px`,
            backgroundColor,
          }}
        >
          {background?.type === "image" ? (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${background.url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            />
          ) : null}
          <div
            className="absolute inset-0 origin-top-left"
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
              transform: `scale(${targetWidth / canvasSize.width})`,
            }}
          >
            {elements.map((element, index) => (
              renderPreviewElement(element, index, canvasSize.width, canvasSize.height)
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
