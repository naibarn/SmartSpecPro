import {
  presentationSlideContentSchema,
  type PresentationSlideContent,
  type PresentationSlideElement,
} from "./contracts";

function normalizeElement(element: PresentationSlideElement): PresentationSlideElement {
  if (element.type === "text") {
    return {
      id: element.id,
      type: "text",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      opacity: element.opacity,
      rotation: element.rotation,
      text: element.text,
      color: element.color,
      fontSize: element.fontSize,
      fontFamily: element.fontFamily,
      fontWeight: element.fontWeight,
      fontStyle: element.fontStyle,
      textDecoration: element.textDecoration,
      textAlign: element.textAlign,
      lineHeight: element.lineHeight,
      letterSpacing: element.letterSpacing,
      backgroundColor: element.backgroundColor,
    };
  }

  if (element.type === "image") {
    return {
      id: element.id,
      type: "image",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      opacity: element.opacity,
      rotation: element.rotation,
      src: element.src,
      alt: element.alt,
    };
  }

  if (element.type === "video") {
    return {
      id: element.id,
      type: "video",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      opacity: element.opacity,
      rotation: element.rotation,
      src: element.src,
      poster: element.poster,
      title: element.title,
      muted: element.muted,
      loop: element.loop,
    };
  }

  if (element.type === "rect") {
    return {
      id: element.id,
      type: "rect",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      opacity: element.opacity,
      rotation: element.rotation,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
    };
  }

  return {
    id: element.id,
    type: "line",
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    opacity: element.opacity,
    rotation: element.rotation,
    fill: element.fill,
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
  };
}

export function normalizePresentationSlideContent(input: unknown): PresentationSlideContent {
  const parsed = presentationSlideContentSchema.parse(input);

  return {
    elements: parsed.elements.map((element) => normalizeElement(element)),
    canvas: parsed.canvas
      ? {
        preset: parsed.canvas.preset,
        width: parsed.canvas.width,
        height: parsed.canvas.height,
      }
      : undefined,
    transition: parsed.transition,
    durationMs: parsed.durationMs,
  };
}
