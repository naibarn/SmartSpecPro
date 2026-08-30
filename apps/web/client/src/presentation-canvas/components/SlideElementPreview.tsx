import type { CSSProperties, ReactElement } from "react";
import DOMPurify from "dompurify";

import { normalizeMediaSourceUrl } from "@/lib/mediaUrl";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
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
  renderScale: number,
): ReactElement {
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
    const rawFontSize = typeof element.fontSize === "number" && Number.isFinite(element.fontSize)
      ? element.fontSize
      : 48;
    const fontSize = rawFontSize * renderScale;
    const lineHeight = Number.isFinite(element.lineHeight) ? element.lineHeight : 1.25;
    const rawLetterSpacing = typeof element.letterSpacing === "number" && Number.isFinite(element.letterSpacing)
      ? element.letterSpacing
      : 0;
    const letterSpacing = rawLetterSpacing * renderScale;
    const padding = 8 * renderScale;
    return (
      <div
        key={element.id || `preview-${index}`}
        className="absolute overflow-hidden"
        style={{
          ...commonStyle,
          backgroundColor: element.backgroundColor || "transparent",
          padding: `${padding}px`,
          boxSizing: "border-box",
        }}
      >
        <p
          className="w-full whitespace-pre-wrap break-words"
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
          {element.text || ""}
        </p>
      </div>
    );
  }

  if (element.type === "image") {
    const isFullCanvasImage = Math.abs(element.x) <= 1
      && Math.abs(element.y) <= 1
      && Math.abs(element.width - canvasWidth) <= 1
      && Math.abs(element.height - canvasHeight) <= 1;
    const fit = isFullCanvasImage
      ? "cover"
      : (element.imageFit === "cover" || element.imageFit === "fill")
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
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(coloredSvg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
          />
        ) : source ? (
          <AuthenticatedMediaImage
            src={source}
            alt={element.alt || "Image"}
            className="block h-full w-full"
            draggable={false}
            style={{
              objectFit: fit,
              objectPosition: `${positionX}% ${positionY}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${positionX}% ${positionY}%`,
            }}
          />
        ) : (
          <div className="grid h-full w-full place-items-center font-medium text-slate-500" style={{ fontSize: `${Math.max(8, 10 * renderScale)}px` }}>
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
          <AuthenticatedMediaImage
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
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent text-white" style={{ padding: `${Math.max(2, 4 * renderScale)}px ${Math.max(4, 8 * renderScale)}px`, fontSize: `${Math.max(8, 11 * renderScale)}px` }}>
          <span className="truncate">{element.title || "Video"}</span>
        </div>
      </div>
    );
  }

  if (element.type === "rect") {
    const strokeWidth = Math.max(0, (element.strokeWidth ?? 0) * renderScale);
    return (
      <div
        key={element.id || `preview-${index}`}
        className="absolute"
        style={{
          ...commonStyle,
          backgroundColor: element.fill || "#93c5fd",
          border: `${strokeWidth}px solid ${element.stroke || "transparent"}`,
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
          borderTop: `${Math.max(1, (element.strokeWidth || 1) * renderScale)}px solid ${element.stroke || "#1f2937"}`,
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
  const renderScale = targetWidth / canvasSize.width;
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
            <AuthenticatedMediaImage
              className="absolute inset-0"
              src={background.url}
              alt=""
              aria-hidden="true"
              draggable={false}
              style={{ objectFit: "cover", objectPosition: "center" }}
            />
          ) : null}
          <div
            className="absolute inset-0"
          >
            {elements.map((element, index) => (
              renderPreviewElement(element, index, canvasSize.width, canvasSize.height, renderScale)
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
