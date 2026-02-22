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
      text: element.text,
      color: element.color,
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
      src: element.src,
      alt: element.alt,
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
      fill: element.fill,
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
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
  };
}

export function normalizePresentationSlideContent(input: unknown): PresentationSlideContent {
  const parsed = presentationSlideContentSchema.parse(input);

  return {
    elements: parsed.elements.map((element) => normalizeElement(element)),
    transition: parsed.transition,
    durationMs: parsed.durationMs,
  };
}
