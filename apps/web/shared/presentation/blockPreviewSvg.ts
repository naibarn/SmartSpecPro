import type {
  PresentationSlideBackground,
  PresentationSlideElement,
} from "./contracts";

interface PresentationCanvasSize {
  width: number;
  height: number;
  preset?: string;
}

interface PresentationBlockPreviewSvgOptions {
  resolveImageUrl?: (url: string) => string;
}

const SVG_REFERENCE_ATTR_PATTERN = /\b(?:href|xlink:href)=["']([^"']+)["']/gi;

function toSvgDataUri(svgContent: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveMediaUrl(url: string, options?: PresentationBlockPreviewSvgOptions): string {
  return options?.resolveImageUrl ? options.resolveImageUrl(url) : url;
}

function rewriteSvgContentAssetUrls(
  svgContent: string,
  options?: PresentationBlockPreviewSvgOptions,
): string {
  if (!options?.resolveImageUrl) {
    return svgContent;
  }

  return svgContent.replace(SVG_REFERENCE_ATTR_PATTERN, (fullMatch, rawUrl: string) => {
    if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("#")) {
      return fullMatch;
    }
    const resolved = resolveMediaUrl(rawUrl, options);
    const attrName = fullMatch.split("=")[0];
    const quote = fullMatch.includes("\"") ? "\"" : "'";
    return `${attrName}=${quote}${escapeXml(resolved)}${quote}`;
  });
}

function buildMediaShapeMarkup(
  kind: "image" | "video",
  element: Extract<PresentationSlideElement, { type: "image" | "video" }>,
  options?: PresentationBlockPreviewSvgOptions,
): string {
  const fill = kind === "video" ? "#0f172a" : "#e2e8f0";
  const stroke = kind === "video" ? "#334155" : "#94a3b8";
  const text = kind === "video" ? "VIDEO" : "IMAGE";
  const x = element.x;
  const y = element.y;
  const width = element.width;
  const height = element.height;
  const radius = clampNumber(Number(element.mediaCornerRadius ?? 24), 0, 120);
  const shape = element.mediaShape ?? "rect";
  const clipId = `preview-clip-${element.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const label = `<text x="${x + (width / 2)}" y="${y + (height / 2)}" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-size="${Math.max(10, Math.min(width, height) * 0.11)}" font-family="Arial, sans-serif" font-weight="700">${text}</text>`;
  const imageHref = kind === "image"
    ? (element.type === "image" && element.svgContent
      ? toSvgDataUri(rewriteSvgContentAssetUrls(element.svgContent, options))
      : resolveMediaUrl(element.src, options))
    : "";
  const videoPosterHref = kind === "video" && element.type === "video" && typeof element.poster === "string" && element.poster.trim().length > 0
    ? resolveMediaUrl(element.poster, options)
    : "";

  function buildShapeTag(fillColor: string, strokeColor: string, extra = ""): string {
    if (shape === "circle" || shape === "ellipse") {
      return `<ellipse cx="${x + (width / 2)}" cy="${y + (height / 2)}" rx="${width / 2}" ry="${height / 2}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" ${extra} />`;
    }
    if (shape === "diamond") {
      const points = [
        `${x + (width / 2)},${y}`,
        `${x + width},${y + (height / 2)}`,
        `${x + (width / 2)},${y + height}`,
        `${x},${y + (height / 2)}`,
      ].join(" ");
      return `<polygon points="${points}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" ${extra} />`;
    }
    if (shape === "star") {
      const cx = x + (width / 2);
      const cy = y + (height / 2);
      const outer = Math.min(width, height) / 2;
      const inner = outer * 0.45;
      const points = Array.from({ length: 10 }, (_, index) => {
        const angle = ((Math.PI / 5) * index) - (Math.PI / 2);
        const radiusForPoint = index % 2 === 0 ? outer : inner;
        return `${cx + (Math.cos(angle) * radiusForPoint)},${cy + (Math.sin(angle) * radiusForPoint)}`;
      }).join(" ");
      return `<polygon points="${points}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" ${extra} />`;
    }
    const rx = shape === "rounded" ? radius : 0;
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" ${extra} />`;
  }

  if (kind === "image" && imageHref) {
    return [
      "<defs>",
      `<clipPath id="${clipId}">`,
      buildShapeTag("#ffffff", "#ffffff"),
      "</clipPath>",
      "</defs>",
      `<image href="${escapeXml(imageHref)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`,
      buildShapeTag("transparent", stroke),
    ].join("");
  }

  if (kind === "video" && videoPosterHref) {
    return [
      "<defs>",
      `<clipPath id="${clipId}">`,
      buildShapeTag("#ffffff", "#ffffff"),
      "</clipPath>",
      "</defs>",
      `<image href="${escapeXml(videoPosterHref)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`,
      buildShapeTag("transparent", stroke),
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="rgba(15,23,42,0.42)" clip-path="url(#${clipId})" />`,
      label,
    ].join("");
  }
  return `${buildShapeTag(fill, stroke)}${label}`;
}

function buildElementMarkup(
  element: PresentationSlideElement,
  options?: PresentationBlockPreviewSvgOptions,
): string {
  if (element.type === "rect") {
    return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="${escapeXml(element.fill || "#cbd5e1")}"${element.stroke ? ` stroke="${escapeXml(element.stroke)}" stroke-width="${Math.max(1, element.strokeWidth ?? 1)}"` : ""} />`;
  }
  if (element.type === "line") {
    const y = element.y + (element.height / 2);
    return `<line x1="${element.x}" y1="${y}" x2="${element.x + element.width}" y2="${y}" stroke="${escapeXml(element.stroke || "#94a3b8")}" stroke-width="${Math.max(1, element.strokeWidth ?? 2)}" />`;
  }
  if (element.type === "text") {
    const text = escapeXml(element.text || "");
    const fontSize = clampNumber(Number(element.fontSize ?? 24), 8, 72);
    const fontFamily = escapeXml(element.fontFamily || "Arial, sans-serif");
    const fontWeight = escapeXml(element.fontWeight || "600");
    const color = escapeXml(element.color || "#0f172a");
    const textAlign = ["left", "center", "right", "justify"].includes(String(element.textAlign))
      ? String(element.textAlign)
      : "left";
    const style = `width:100%;height:100%;overflow:hidden;padding:8px;box-sizing:border-box;word-break:break-word;white-space:pre-wrap;font-size:${fontSize}px;font-family:${fontFamily};font-weight:${fontWeight};color:${color};text-align:${textAlign}`;
    return [
      `<foreignObject x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}">`,
      `<div xmlns="http://www.w3.org/1999/xhtml" style="${style}">${text.slice(0, 120)}</div>`,
      "</foreignObject>",
    ].join("");
  }
  if (element.type === "image") {
    return buildMediaShapeMarkup("image", element, options);
  }
  if (element.type === "video") {
    return buildMediaShapeMarkup("video", element, options);
  }
  return "";
}

function buildBackgroundMarkup(
  background: PresentationSlideBackground | undefined,
  canvasSize: Pick<PresentationCanvasSize, "width" | "height">,
  options?: PresentationBlockPreviewSvgOptions,
): string {
  if (!background) {
    return `<rect x="0" y="0" width="${canvasSize.width}" height="${canvasSize.height}" fill="#ffffff" />`;
  }
  if (background.type === "image") {
    const resolvedUrl = options?.resolveImageUrl ? options.resolveImageUrl(background.url) : background.url;
    return [
      `<rect x="0" y="0" width="${canvasSize.width}" height="${canvasSize.height}" fill="#ffffff" />`,
      `<image href="${escapeXml(resolvedUrl)}" x="0" y="0" width="${canvasSize.width}" height="${canvasSize.height}" preserveAspectRatio="xMidYMid slice" />`,
    ].join("");
  }
  return `<rect x="0" y="0" width="${canvasSize.width}" height="${canvasSize.height}" fill="${escapeXml(background.value)}" />`;
}

export function buildPresentationBlockPreviewSvg(
  elements: PresentationSlideElement[],
  canvasSize: Pick<PresentationCanvasSize, "width" | "height">,
  background?: PresentationSlideBackground,
  options?: PresentationBlockPreviewSvgOptions,
): string {
  const markup = elements.map((element) => buildElementMarkup(element, options)).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize.width} ${canvasSize.height}" style="width:100%;height:auto;display:block;">`,
    buildBackgroundMarkup(background, canvasSize, options),
    markup,
    "</svg>",
  ].join("");
}
