import {
  presentationSlideContentSchema,
  type PresentationSlideContent as SharedPresentationSlideContent,
  type PresentationSlideElement as SharedPresentationElement,
} from "@shared/presentation/contracts";

export type PresentationElementType = SharedPresentationElement["type"];
export type PresentationElement = SharedPresentationElement;
export type PresentationElementPatch = Partial<Omit<PresentationElement, "id" | "type">>;
export type PresentationSlideContent = SharedPresentationSlideContent;
export type ArrangeDirection = "forward" | "backward" | "front" | "back";

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

export function translateElements(
  content: PresentationSlideContent,
  elementIds: string[],
  deltaX: number,
  deltaY: number,
): PresentationSlideContent {
  if (!elementIds.length || (!deltaX && !deltaY)) {
    return content;
  }

  const selected = new Set(elementIds);
  return {
    ...content,
    elements: content.elements.map((element) => {
      if (!selected.has(element.id)) {
        return element;
      }

      return {
        ...element,
        x: element.x + deltaX,
        y: element.y + deltaY,
      } as PresentationElement;
    }),
  };
}

export function resizeElementById(
  content: PresentationSlideContent,
  elementId: string,
  patch: Partial<Pick<PresentationElement, "x" | "y" | "width" | "height">>,
): PresentationSlideContent {
  return {
    ...content,
    elements: content.elements.map((element) => {
      if (element.id !== elementId) {
        return element;
      }

      const width = patch.width === undefined ? element.width : Math.max(0, patch.width);
      const height = patch.height === undefined ? element.height : Math.max(0, patch.height);

      return {
        ...element,
        x: patch.x ?? element.x,
        y: patch.y ?? element.y,
        width,
        height,
      } as PresentationElement;
    }),
  };
}

export function reorderElementById(
  content: PresentationSlideContent,
  elementId: string,
  direction: ArrangeDirection,
): PresentationSlideContent {
  const index = content.elements.findIndex((element) => element.id === elementId);
  if (index < 0) {
    return content;
  }

  const next = [...content.elements];

  if (direction === "forward" && index < next.length - 1) {
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
  } else if (direction === "backward" && index > 0) {
    [next[index], next[index - 1]] = [next[index - 1], next[index]];
  } else if (direction === "front" && index < next.length - 1) {
    const [item] = next.splice(index, 1);
    next.push(item);
  } else if (direction === "back" && index > 0) {
    const [item] = next.splice(index, 1);
    next.unshift(item);
  }

  return {
    ...content,
    elements: next,
  };
}

export function deleteElements(
  content: PresentationSlideContent,
  elementIds: string[],
): PresentationSlideContent {
  if (!elementIds.length) {
    return content;
  }

  const selected = new Set(elementIds);
  return {
    ...content,
    elements: content.elements.filter((element) => !selected.has(element.id)),
  };
}

export function duplicateElements(
  content: PresentationSlideContent,
  elementIds: string[],
  makeId: (source: PresentationElement) => string,
): PresentationSlideContent {
  if (!elementIds.length) {
    return content;
  }

  const selected = new Set(elementIds);
  const nextElements: PresentationElement[] = [];

  for (const element of content.elements) {
    nextElements.push(element);

    if (!selected.has(element.id)) {
      continue;
    }

    const duplicate: PresentationElement = {
      ...element,
      id: makeId(element),
      x: element.x + 16,
      y: element.y + 16,
    };
    nextElements.push(duplicate);
  }

  return {
    ...content,
    elements: nextElements,
  };
}
