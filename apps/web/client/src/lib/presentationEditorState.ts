export type PresentationElementType = "text" | "image" | "rect" | "line";

interface PresentationElementBase {
  id: string;
  type: PresentationElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}

export interface PresentationTextElement extends PresentationElementBase {
  type: "text";
  text: string;
  color: string;
}

export interface PresentationImageElement extends PresentationElementBase {
  type: "image";
  src: string;
  alt: string;
}

export interface PresentationRectElement extends PresentationElementBase {
  type: "rect";
  fill: string;
}

export interface PresentationLineElement extends PresentationElementBase {
  type: "line";
  stroke: string;
  strokeWidth: number;
}

export type PresentationElement =
  | PresentationTextElement
  | PresentationImageElement
  | PresentationRectElement
  | PresentationLineElement;

export interface PresentationSlideContent {
  elements: PresentationElement[];
  transition?: string;
  durationMs?: number;
}

export function ensureSlideContent(input: unknown): PresentationSlideContent {
  const asObject =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const elements = Array.isArray(asObject.elements)
    ? (asObject.elements as PresentationElement[])
    : [];
  const transition =
    typeof asObject.transition === "string" ? asObject.transition : undefined;
  const durationMs =
    typeof asObject.durationMs === "number" && Number.isFinite(asObject.durationMs)
      ? asObject.durationMs
      : undefined;

  return {
    elements,
    transition,
    durationMs,
  };
}

export function createElement(
  type: PresentationElementType,
  id: string,
): PresentationElement {
  switch (type) {
    case "text":
      return {
        id,
        type,
        x: 80,
        y: 80,
        width: 320,
        height: 80,
        text: "New text",
        color: "#111827",
      };
    case "image":
      return {
        id,
        type,
        x: 80,
        y: 80,
        width: 320,
        height: 200,
        src: "",
        alt: "Image",
      };
    case "rect":
      return {
        id,
        type,
        x: 80,
        y: 80,
        width: 180,
        height: 120,
        fill: "#93c5fd",
      };
    case "line":
      return {
        id,
        type,
        x: 80,
        y: 80,
        width: 200,
        height: 0,
        stroke: "#1f2937",
        strokeWidth: 2,
      };
    default:
      return {
        id,
        type: "text",
        x: 80,
        y: 80,
        width: 320,
        height: 80,
        text: "New text",
        color: "#111827",
      };
  }
}

export function addElement(
  content: PresentationSlideContent,
  element: PresentationElement,
): PresentationSlideContent {
  return {
    ...content,
    elements: [...content.elements, element],
  };
}

export function updateElementById(
  content: PresentationSlideContent,
  elementId: string,
  patch: Partial<PresentationElement>,
): PresentationSlideContent {
  return {
    ...content,
    elements: content.elements.map((element) => {
      if (element.id !== elementId) {
        return element;
      }

      return {
        ...element,
        ...patch,
      };
    }),
  };
}
