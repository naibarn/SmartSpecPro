import {
  presentationSlideContentSchema,
  type PresentationSlideContent as SharedPresentationSlideContent,
  type PresentationSlideElement as SharedPresentationElement,
} from "@shared/presentation/contracts";

export type PresentationElementType = SharedPresentationElement["type"];
export type PresentationElement = SharedPresentationElement;
export type PresentationElementPatch = Partial<Omit<PresentationElement, "id" | "type">>;
export type PresentationSlideContent = SharedPresentationSlideContent;

export function ensureSlideContent(input: unknown): PresentationSlideContent {
  const parsed = presentationSlideContentSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  return {
    elements: [],
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
  patch: PresentationElementPatch,
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
      } as PresentationElement;
    }),
  };
}
