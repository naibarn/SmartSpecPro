import {
  presentationSlideContentSchema,
  type PresentationSlideBackground,
  type PresentationSlideContent as SharedPresentationSlideContent,
  type PresentationSlideElement as SharedPresentationElement,
} from "@shared/presentation/contracts";
import {
  DEFAULT_PRESENTATION_CANVAS_SIZE,
  normalizeCanvasSize,
  type PresentationCanvasSize,
} from "@/presentation-canvas/constants";

export type PresentationElementType = SharedPresentationElement["type"];
export type PresentationElement = SharedPresentationElement;
type DistributivePatch<T> = T extends unknown ? Partial<Omit<T, "id" | "type">> : never;
export type PresentationElementPatch = DistributivePatch<PresentationElement>;
export type PresentationSlideContent = SharedPresentationSlideContent;
export type ArrangeDirection = "forward" | "backward" | "front" | "back";
export type { PresentationCanvasSize };
export type { PresentationSlideBackground };

const ELEMENT_FOCUS_TYPE_WEIGHTS: Record<PresentationElementType, number> = {
  text: 2.1,
  image: 1,
  video: 1.9,
  rect: 0.55,
  line: 0.3,
};
const SELECTED_FOCUS_MULTIPLIER = 2.8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeElementFocusScore(
  element: PresentationElement,
  index: number,
  totalElements: number,
  options: {
    selectedElementIds?: Set<string>;
  } = {},
): number {
  const typeWeight = ELEMENT_FOCUS_TYPE_WEIGHTS[element.type] ?? 1;
  const effectiveWidth = Math.max(24, element.width);
  const effectiveHeight = Math.max(24, element.height || 2);
  const sizeWeight = Math.sqrt(effectiveWidth * effectiveHeight);
  const layerWeight = 1 + ((index + 1) / Math.max(1, totalElements)) * 0.12;
  const selectedBoost = options.selectedElementIds?.has(element.id) ? SELECTED_FOCUS_MULTIPLIER : 1;
  return sizeWeight * typeWeight * layerWeight * selectedBoost;
}

function computeVisualFocusPoint(
  elements: PresentationElement[],
  canvas: PresentationCanvasSize,
  selectedElementIds: Set<string> = new Set<string>(),
): { xRatio: number; yRatio: number } {
  if (!elements.length) {
    return { xRatio: 0.5, yRatio: 0.5 };
  }

  const selectedElements = selectedElementIds.size
    ? elements.filter((element) => selectedElementIds.has(element.id))
    : [];
  const focusElements = selectedElements.length > 0 ? selectedElements : elements;

  let weightedCenterX = 0;
  let weightedCenterY = 0;
  let totalWeight = 0;

  focusElements.forEach((element, index) => {
    const weight = computeElementFocusScore(element, index, focusElements.length);
    const centerX = clamp(element.x + (element.width / 2), 0, canvas.width);
    const centerY = clamp(element.y + (Math.max(2, element.height) / 2), 0, canvas.height);
    weightedCenterX += centerX * weight;
    weightedCenterY += centerY * weight;
    totalWeight += weight;
  });

  if (totalWeight <= 0) {
    return { xRatio: 0.5, yRatio: 0.5 };
  }

  return {
    xRatio: clamp(weightedCenterX / totalWeight / canvas.width, 0, 1),
    yRatio: clamp(weightedCenterY / totalWeight / canvas.height, 0, 1),
  };
}

export function getCanvasSize(content: PresentationSlideContent): PresentationCanvasSize {
  return normalizeCanvasSize(content.canvas);
}

export function ensureSlideContent(input: unknown): PresentationSlideContent {
  const parsed = presentationSlideContentSchema.safeParse(input);
  if (parsed.success) {
    return {
      ...parsed.data,
      canvas: normalizeCanvasSize(parsed.data.canvas),
      transition: parsed.data.transition,
      durationMs: parsed.data.durationMs,
      pendingMediaJobs: parsed.data.pendingMediaJobs,
    };
  }

  return {
    elements: [],
    canvas: DEFAULT_PRESENTATION_CANVAS_SIZE,
    transition: undefined,
    durationMs: undefined,
    pendingMediaJobs: undefined,
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
        width: 420,
        height: 140,
        rotation: 0,
        text: "Add your text",
        color: "#111827",
        fontSize: 48,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: "600",
        fontStyle: "normal",
        textDecoration: "none",
        textAlign: "left",
        lineHeight: 1.25,
        letterSpacing: 0,
        backgroundColor: "transparent",
      };
    case "image":
      return {
        id,
        type,
        x: 80,
        y: 80,
        width: 320,
        height: 200,
        rotation: 0,
        src: "",
        alt: "Image",
        imageFit: "contain",
        imagePositionX: 50,
        imagePositionY: 50,
        imageZoom: 1,
        imagePrompt: "",
        imageReferenceUrls: [],
      };
    case "video":
      return {
        id,
        type,
        x: 120,
        y: 120,
        width: 480,
        height: 270,
        rotation: 0,
        src: "",
        poster: "",
        title: "Video",
        muted: true,
        videoFit: "cover",
        videoPositionX: 50,
        videoPositionY: 50,
        videoZoom: 1,
        videoPrompt: "",
        videoReferenceUrls: [],
        videoExtraParams: {},
      };
    case "rect":
      return {
        id,
        type,
        x: 80,
        y: 80,
        width: 180,
        height: 120,
        rotation: 0,
        fill: "#93c5fd",
        stroke: "#2563eb",
        strokeWidth: 2,
      };
    case "line":
      return {
        id,
        type,
        x: 80,
        y: 80,
        width: 200,
        height: 0,
        rotation: 0,
        fill: "transparent",
        stroke: "#1f2937",
        strokeWidth: 2,
      };
  }
}

export function resizeCanvas(
  content: PresentationSlideContent,
  nextCanvas: PresentationCanvasSize,
  options: {
    selectedElementIds?: string[];
  } = {},
): PresentationSlideContent {
  const currentCanvas = getCanvasSize(content);
  if (
    currentCanvas.width === nextCanvas.width
    && currentCanvas.height === nextCanvas.height
    && currentCanvas.preset === nextCanvas.preset
  ) {
    return {
      ...content,
      canvas: nextCanvas,
    };
  }

  const scaleX = nextCanvas.width / currentCanvas.width;
  const scaleY = nextCanvas.height / currentCanvas.height;
  const uniformScale = Math.min(scaleX, scaleY);
  const selectedElementIds = new Set(options.selectedElementIds || []);
  const scaledElements = content.elements.map((element, index) => {
    const width = Math.max(0, Math.min(nextCanvas.width, Math.round(element.width * uniformScale)));
    const height = Math.max(0, Math.min(nextCanvas.height, Math.round(element.height * uniformScale)));
    const x = Math.round(element.x * uniformScale);
    const y = Math.round(element.y * uniformScale);
    const weight = computeElementFocusScore(element, index, content.elements.length, {
      selectedElementIds,
    });

    return {
      element,
      width,
      height,
      x,
      y,
      weight,
      centerX: x + (width / 2),
      centerY: y + (Math.max(2, height) / 2),
    };
  });

  const centeredOffsetX = (nextCanvas.width - (currentCanvas.width * uniformScale)) / 2;
  const centeredOffsetY = (nextCanvas.height - (currentCanvas.height * uniformScale)) / 2;

  let translateX = centeredOffsetX;
  let translateY = centeredOffsetY;

  if (scaledElements.length > 0) {
    let weightedScaledCenterX = 0;
    let weightedScaledCenterY = 0;
    let totalScaledWeight = 0;

    for (const element of scaledElements) {
      weightedScaledCenterX += element.centerX * element.weight;
      weightedScaledCenterY += element.centerY * element.weight;
      totalScaledWeight += element.weight;
    }

    const scaledFocusX = totalScaledWeight > 0
      ? weightedScaledCenterX / totalScaledWeight
      : (nextCanvas.width / 2);
    const scaledFocusY = totalScaledWeight > 0
      ? weightedScaledCenterY / totalScaledWeight
      : (nextCanvas.height / 2);

    const focus = computeVisualFocusPoint(content.elements, currentCanvas, selectedElementIds);
    const targetFocusX = focus.xRatio * nextCanvas.width;
    const targetFocusY = focus.yRatio * nextCanvas.height;

    const desiredTranslateX = targetFocusX - scaledFocusX;
    const desiredTranslateY = targetFocusY - scaledFocusY;

    let minTranslateX = -Infinity;
    let maxTranslateX = Infinity;
    let minTranslateY = -Infinity;
    let maxTranslateY = Infinity;

    for (const element of scaledElements) {
      minTranslateX = Math.max(minTranslateX, -element.x);
      maxTranslateX = Math.min(maxTranslateX, nextCanvas.width - element.width - element.x);
      minTranslateY = Math.max(minTranslateY, -element.y);
      maxTranslateY = Math.min(maxTranslateY, nextCanvas.height - element.height - element.y);
    }

    const hasFiniteXBounds = Number.isFinite(minTranslateX) && Number.isFinite(maxTranslateX) && minTranslateX <= maxTranslateX;
    const hasFiniteYBounds = Number.isFinite(minTranslateY) && Number.isFinite(maxTranslateY) && minTranslateY <= maxTranslateY;

    translateX = hasFiniteXBounds
      ? clamp(desiredTranslateX, minTranslateX, maxTranslateX)
      : centeredOffsetX;
    translateY = hasFiniteYBounds
      ? clamp(desiredTranslateY, minTranslateY, maxTranslateY)
      : centeredOffsetY;
  }

  return {
    ...content,
    canvas: nextCanvas,
    elements: scaledElements.map((item) => {
      const { element, width, height } = item;
      const maxX = Math.max(0, nextCanvas.width - width);
      const maxY = Math.max(0, nextCanvas.height - height);
      const arrangedX = Math.round(item.x + translateX);
      const arrangedY = Math.round(item.y + translateY);
      return {
        ...element,
        width,
        height,
        x: Math.max(0, Math.min(maxX, arrangedX)),
        y: Math.max(0, Math.min(maxY, arrangedY)),
      };
    }),
  };
}

export function addElement(
  content: PresentationSlideContent,
  element: PresentationElement,
): PresentationSlideContent {
  return {
    ...content,
    canvas: getCanvasSize(content),
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
    canvas: getCanvasSize(content),
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
    canvas: getCanvasSize(content),
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
    canvas: getCanvasSize(content),
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
    canvas: getCanvasSize(content),
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
    canvas: getCanvasSize(content),
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
    canvas: getCanvasSize(content),
    elements: nextElements,
  };
}

export function setSlideBackground(
  content: PresentationSlideContent,
  background: PresentationSlideBackground | undefined,
): PresentationSlideContent {
  return { ...content, background };
}
