import {
  getPresentationSlideRenderableElements,
  presentationRenderOrderIdForComponent,
  presentationRenderOrderIdForElement,
  presentationSlideContentSchema,
  resolvePresentationSlideRenderOrder,
  type PresentationComponentInstance as SharedPresentationComponentInstance,
  type PresentationRenderableOrderEntry as SharedPresentationRenderableOrderEntry,
  type PresentationSlideBackground,
  type PresentationSlideContent as SharedPresentationSlideContent,
  type PresentationSlideElement as SharedPresentationElement,
} from "@shared/presentation/contracts";
import {
  DEFAULT_PRESENTATION_CANVAS_SIZE,
  normalizeCanvasSize,
  type PresentationCanvasSize,
} from "@/presentation-canvas/constants";
import {
  buildBuiltInPresentationComponentInstanceFromSlotBindings,
  getBuiltInPresentationComponentDefinition,
} from "@/lib/presentationComponentCatalog";
import { presentationMediaShapeRequiresSquare } from "@shared/presentation/mediaShape";

export type PresentationElementType = SharedPresentationElement["type"];
export type PresentationElement = SharedPresentationElement;
export type PresentationComponentInstance = SharedPresentationComponentInstance;
type PresentationRenderableOrderEntry = SharedPresentationRenderableOrderEntry;
type DistributivePatch<T> = T extends unknown ? Partial<Omit<T, "id" | "type">> : never;
export type PresentationElementPatch = DistributivePatch<PresentationElement>;
export type PresentationSlideContent = SharedPresentationSlideContent;
export type ArrangeDirection = "forward" | "backward" | "front" | "back";
export type { PresentationCanvasSize };
export type { PresentationSlideBackground };

export const PRESENTATION_GROUP_COMPONENT_ID = "grouped-elements";
export const PRESENTATION_GROUP_COMPONENT_REVISION = 1;

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

function getRenderOrder(content: PresentationSlideContent): PresentationRenderableOrderEntry[] {
  return resolvePresentationSlideRenderOrder(content).order;
}

function sortCollectionsByRenderOrder(content: PresentationSlideContent): PresentationSlideContent {
  const renderOrder = getRenderOrder(content);
  const elementOrder = new Map<string, number>();
  const componentOrder = new Map<string, number>();

  renderOrder.forEach((entry, index) => {
    if (entry.startsWith("element:")) {
      elementOrder.set(entry.slice("element:".length), index);
      return;
    }
    if (entry.startsWith("component:")) {
      componentOrder.set(entry.slice("component:".length), index);
    }
  });

  return {
    ...content,
    renderOrder,
    elements: [...content.elements].sort((left, right) => (
      (elementOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (elementOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    )),
    components: content.components
      ? [...content.components].sort((left, right) => (
        (componentOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (componentOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      ))
      : undefined,
  };
}

function refreshBuiltInComponents(
  components: PresentationComponentInstance[] | undefined,
  canvas: PresentationCanvasSize,
): PresentationComponentInstance[] | undefined {
  if (!components?.length) {
    return components;
  }

  return components.map((component) => {
    if (component.componentType !== "built-in") {
      return component;
    }
    const definition = getBuiltInPresentationComponentDefinition(component.componentId);
    if (!definition) {
      return component;
    }
    const rebuilt = buildBuiltInPresentationComponentInstanceFromSlotBindings(definition.id, {
      canvas,
      instanceId: component.id,
      slotBindings: component.slotBindings,
    });
    const fitted = definition.category === "A4"
      ? fitComponentFallbackElementsToCanvas(
        {
          elements: [],
          canvas,
          components: [rebuilt],
        },
        rebuilt.id,
        "canvas",
      ).components?.[0] ?? rebuilt
      : rebuilt;
    return {
      ...fitted,
      componentType: component.componentType,
      definitionRevision: component.definitionRevision,
    };
  });
}

function reorderRenderableEntry(
  content: PresentationSlideContent,
  entry: PresentationRenderableOrderEntry,
  direction: ArrangeDirection,
): PresentationSlideContent {
  const order = [...getRenderOrder(content)];
  const index = order.indexOf(entry);
  if (index < 0) {
    return content;
  }

  if (direction === "forward" && index < order.length - 1) {
    [order[index], order[index + 1]] = [order[index + 1], order[index]];
  } else if (direction === "backward" && index > 0) {
    [order[index], order[index - 1]] = [order[index - 1], order[index]];
  } else if (direction === "front" && index < order.length - 1) {
    const [item] = order.splice(index, 1);
    order.push(item);
  } else if (direction === "back" && index > 0) {
    const [item] = order.splice(index, 1);
    order.unshift(item);
  }

  return sortCollectionsByRenderOrder({
    ...content,
    renderOrder: order,
  });
}

export function ensureSlideContent(input: unknown): PresentationSlideContent {
  const parsed = presentationSlideContentSchema.safeParse(input);
  if (parsed.success) {
    const normalizedCanvas = normalizeCanvasSize(parsed.data.canvas);
    return sortCollectionsByRenderOrder({
      ...parsed.data,
      canvas: normalizedCanvas,
      components: refreshBuiltInComponents(parsed.data.components, normalizedCanvas),
      transition: parsed.data.transition,
      durationMs: parsed.data.durationMs,
      pendingMediaJobs: parsed.data.pendingMediaJobs,
      background: parsed.data.background,
      visualOnly: parsed.data.visualOnly,
      aiDesign: parsed.data.aiDesign,
    });
  }

  return {
    elements: [],
    canvas: DEFAULT_PRESENTATION_CANVAS_SIZE,
    transition: undefined,
    durationMs: undefined,
    pendingMediaJobs: undefined,
    background: undefined,
    visualOnly: undefined,
    aiDesign: undefined,
  };
}

export function getRenderableSlideElements(content: PresentationSlideContent): PresentationElement[] {
  return getPresentationSlideRenderableElements(content).elements;
}

export function findRenderableElementById(
  content: PresentationSlideContent,
  elementId: string,
): PresentationElement | null {
  const direct = content.elements.find((element) => element.id === elementId);
  if (direct) {
    return direct;
  }
  for (const component of content.components ?? []) {
    const nested = component.fallbackElements.find((element) => element.id === elementId);
    if (nested) {
      return nested;
    }
  }
  return null;
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
    return sortCollectionsByRenderOrder({
      ...content,
      canvas: nextCanvas,
    });
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

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: nextCanvas,
    elements: content.elements.map((element) => {
      const width = Math.max(0, Math.min(nextCanvas.width, Math.round(element.width * uniformScale)));
      const height = Math.max(0, Math.min(nextCanvas.height, Math.round(element.height * uniformScale)));
      const maxX = Math.max(0, nextCanvas.width - width);
      const maxY = Math.max(0, nextCanvas.height - height);
      const arrangedX = Math.round((element.x * uniformScale) + translateX);
      const arrangedY = Math.round((element.y * uniformScale) + translateY);
      return {
        ...element,
        width,
        height,
        x: Math.max(0, Math.min(maxX, arrangedX)),
        y: Math.max(0, Math.min(maxY, arrangedY)),
      };
    }),
    components: content.components?.map((component) => ({
      ...component,
      fallbackElements: component.fallbackElements.map((element) => {
        const width = Math.max(0, Math.min(nextCanvas.width, Math.round(element.width * uniformScale)));
        const height = Math.max(0, Math.min(nextCanvas.height, Math.round(element.height * uniformScale)));
        const maxX = Math.max(0, nextCanvas.width - width);
        const maxY = Math.max(0, nextCanvas.height - height);
        const arrangedX = Math.round((element.x * uniformScale) + translateX);
        const arrangedY = Math.round((element.y * uniformScale) + translateY);
        return {
          ...element,
          width,
          height,
          x: Math.max(0, Math.min(maxX, arrangedX)),
          y: Math.max(0, Math.min(maxY, arrangedY)),
        };
      }),
    })),
  });
}

export function addElement(
  content: PresentationSlideContent,
  element: PresentationElement,
): PresentationSlideContent {
  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    elements: [...content.elements, element],
    renderOrder: [...getRenderOrder(content), presentationRenderOrderIdForElement(element.id)],
  });
}

export function addElements(
  content: PresentationSlideContent,
  elements: PresentationElement[],
): PresentationSlideContent {
  if (!elements.length) {
    return content;
  }

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    elements: [...content.elements, ...elements],
    renderOrder: [
      ...getRenderOrder(content),
      ...elements.map((element) => presentationRenderOrderIdForElement(element.id)),
    ],
  });
}

export function addComponent(
  content: PresentationSlideContent,
  component: PresentationComponentInstance,
): PresentationSlideContent {
  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    components: [...(content.components ?? []), component],
    renderOrder: [...getRenderOrder(content), presentationRenderOrderIdForComponent(component.id)],
  });
}

export function isPresentationGroupComponent(
  component: Pick<PresentationComponentInstance, "componentId" | "componentType"> | null | undefined,
): boolean {
  return component?.componentId === PRESENTATION_GROUP_COMPONENT_ID
    || component?.componentType === PRESENTATION_GROUP_COMPONENT_ID;
}

export function groupElementsIntoComponent(
  content: PresentationSlideContent,
  elementIds: string[],
  component: PresentationComponentInstance,
): PresentationSlideContent {
  return groupRenderablesIntoComponent(content, { elementIds, componentIds: [] }, component);
}

export function groupRenderablesIntoComponent(
  content: PresentationSlideContent,
  selection: {
    elementIds: string[];
    componentIds: string[];
  },
  component: PresentationComponentInstance,
): PresentationSlideContent {
  if (selection.elementIds.length + selection.componentIds.length < 2) {
    return content;
  }

  const selected = new Set(selection.elementIds);
  const selectedComponentIds = new Set(selection.componentIds);
  const elementsById = new Map(content.elements.map((element) => [element.id, element] as const));
  const componentsById = new Map((content.components ?? []).map((item) => [item.id, item] as const));
  const renderOrder = getRenderOrder(content);
  let selectedRenderableCount = 0;
  const orderedFallbackElements = renderOrder.flatMap((entry) => {
    if (entry.startsWith("element:")) {
      const elementId = entry.slice("element:".length);
      if (!selected.has(elementId)) {
        return [];
      }
      const element = elementsById.get(elementId);
      if (!element) {
        return [];
      }
      selectedRenderableCount += 1;
      return [{ ...element }];
    }

    if (!entry.startsWith("component:")) {
      return [];
    }

    const componentId = entry.slice("component:".length);
    if (!selectedComponentIds.has(componentId)) {
      return [];
    }

    const selectedComponent = componentsById.get(componentId);
    if (!selectedComponent) {
      return [];
    }
    selectedRenderableCount += 1;
    return selectedComponent.fallbackElements.map((element) => ({ ...element }));
  });

  if (selectedRenderableCount < 2 || orderedFallbackElements.length < 2) {
    return content;
  }

  const componentEntry = presentationRenderOrderIdForComponent(component.id);
  let insertedComponent = false;
  const nextOrder = renderOrder.flatMap((entry) => {
    if (!entry.startsWith("element:")) {
      return [entry];
    }

    const elementId = entry.slice("element:".length);
    if (!selected.has(elementId)) {
      return [entry];
    }

    if (insertedComponent) {
      return [];
    }

    insertedComponent = true;
    return [componentEntry];
  });

  const nextOrderWithComponents = nextOrder.flatMap((entry) => {
    if (!entry.startsWith("component:")) {
      return [entry];
    }

    const componentId = entry.slice("component:".length);
    if (!selectedComponentIds.has(componentId)) {
      return [entry];
    }

    if (insertedComponent) {
      return [];
    }

    insertedComponent = true;
    return [componentEntry];
  });

  if (!insertedComponent) {
    return content;
  }

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    elements: content.elements.filter((element) => !selected.has(element.id)),
    components: [
      ...(content.components ?? []).filter((item) => !selectedComponentIds.has(item.id)),
      {
        ...component,
        fallbackElements: orderedFallbackElements,
      },
    ],
    renderOrder: nextOrderWithComponents,
  });
}

function getComponentBoundsFromElements(
  elements: PresentationElement[],
): { x: number; y: number; width: number; height: number } | null {
  if (!elements.length) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + Math.max(2, element.height));
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function duplicateComponentElementId(componentElementId: string, nextComponentId: string): string {
  const delimiter = componentElementId.indexOf("::");
  const suffix = delimiter >= 0 ? componentElementId.slice(delimiter + 2) : componentElementId;
  return `${nextComponentId}::${suffix}`;
}

export function updateComponentById(
  content: PresentationSlideContent,
  componentId: string,
  nextComponent: PresentationComponentInstance,
): PresentationSlideContent {
  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    components: (content.components ?? []).map((component) => (
      component.id === componentId ? nextComponent : component
    )),
  });
}

export function deleteComponents(
  content: PresentationSlideContent,
  componentIds: string[],
): PresentationSlideContent {
  if (!componentIds.length) {
    return content;
  }

  const selected = new Set(componentIds);
  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    components: (content.components ?? []).filter((component) => !selected.has(component.id)),
    renderOrder: getRenderOrder(content).filter((entry) => {
      if (!entry.startsWith("component:")) {
        return true;
      }
      return !selected.has(entry.slice("component:".length));
    }),
  });
}

export function detachComponentById(
  content: PresentationSlideContent,
  componentId: string,
): PresentationSlideContent {
  const component = (content.components ?? []).find((item) => item.id === componentId);
  if (!component) {
    return content;
  }

  const componentEntry = presentationRenderOrderIdForComponent(componentId);
  const fallbackEntries = component.fallbackElements.map((element) => presentationRenderOrderIdForElement(element.id));
  const nextOrder = getRenderOrder(content).flatMap((entry) => (
    entry === componentEntry ? fallbackEntries : [entry]
  ));

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    elements: [...content.elements, ...component.fallbackElements],
    components: (content.components ?? []).filter((item) => item.id !== componentId),
    renderOrder: nextOrder,
  });
}

export function duplicateComponentById(
  content: PresentationSlideContent,
  componentId: string,
  makeComponentId: (component: PresentationComponentInstance) => string,
  offsetX: number = 16,
  offsetY: number = 16,
): PresentationSlideContent {
  const components = content.components ?? [];
  const index = components.findIndex((component) => component.id === componentId);
  if (index < 0) {
    return content;
  }

  const source = components[index];
  const nextComponentId = makeComponentId(source);
  const duplicate: PresentationComponentInstance = {
    ...source,
    id: nextComponentId,
    fallbackElements: source.fallbackElements.map((element) => ({
      ...element,
      id: duplicateComponentElementId(element.id, nextComponentId),
      x: element.x + offsetX,
      y: element.y + offsetY,
    })),
  };

  const nextComponents = [...components];
  nextComponents.splice(index + 1, 0, duplicate);

  const sourceEntry = presentationRenderOrderIdForComponent(componentId);
  const duplicateEntry = presentationRenderOrderIdForComponent(nextComponentId);
  const nextOrder = getRenderOrder(content).flatMap((entry) => (
    entry === sourceEntry ? [entry, duplicateEntry] : [entry]
  ));

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    components: nextComponents,
    renderOrder: nextOrder,
  });
}

export function translateComponentFallbackElements(
  content: PresentationSlideContent,
  componentId: string,
  deltaX: number,
  deltaY: number,
): PresentationSlideContent {
  if ((!deltaX && !deltaY) || !(content.components ?? []).length) {
    return content;
  }

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    components: (content.components ?? []).map((component) => {
      if (component.id !== componentId) {
        return component;
      }

      return {
        ...component,
        fallbackElements: component.fallbackElements.map((element) => ({
          ...element,
          x: element.x + deltaX,
          y: element.y + deltaY,
        })),
      };
    }),
  });
}

export function resizeComponentFallbackElements(
  content: PresentationSlideContent,
  componentId: string,
  nextWidth: number,
  nextHeight: number,
): PresentationSlideContent {
  if (!(content.components ?? []).length) {
    return content;
  }

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    components: (content.components ?? []).map((component) => {
      if (component.id !== componentId) {
        return component;
      }

      const bounds = getComponentBoundsFromElements(component.fallbackElements);
      if (!bounds) {
        return component;
      }

      const targetWidth = Math.max(1, Math.round(nextWidth));
      const targetHeight = Math.max(1, Math.round(nextHeight));
      const scaleX = bounds.width > 0 ? targetWidth / bounds.width : 1;
      const scaleY = bounds.height > 0 ? targetHeight / bounds.height : 1;

      return {
        ...component,
        fallbackElements: component.fallbackElements.map((element) => ({
          ...element,
          x: Math.round(bounds.x + ((element.x - bounds.x) * scaleX)),
          y: Math.round(bounds.y + ((element.y - bounds.y) * scaleY)),
          width: Math.max(element.type === "line" ? 0 : 1, Math.round(element.width * scaleX)),
          height: Math.max(element.type === "line" ? 0 : 1, Math.round(element.height * scaleY)),
        })),
      };
    }),
  });
}

export function resizeComponentSlotFallbackElements(
  content: PresentationSlideContent,
  componentId: string,
  targetElementIds: string[],
  nextWidth: number,
  nextHeight: number,
): PresentationSlideContent {
  if (!(content.components ?? []).length || !targetElementIds.length) {
    return content;
  }

  const targetIds = new Set(targetElementIds);
  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    components: (content.components ?? []).map((component) => {
      if (component.id !== componentId) {
        return component;
      }

      const matchedElements = component.fallbackElements.filter((element) => targetIds.has(element.id));
      const bounds = getComponentBoundsFromElements(matchedElements);
      if (!bounds) {
        return component;
      }

      const targetWidth = Math.max(1, Math.round(nextWidth));
      const targetHeight = Math.max(1, Math.round(nextHeight));
      const scaleX = bounds.width > 0 ? targetWidth / bounds.width : 1;
      const scaleY = bounds.height > 0 ? targetHeight / bounds.height : 1;

      return {
        ...component,
        fallbackElements: component.fallbackElements.map((element) => {
          if (!targetIds.has(element.id)) {
            return element;
          }
          return {
            ...element,
            x: Math.round(bounds.x + ((element.x - bounds.x) * scaleX)),
            y: Math.round(bounds.y + ((element.y - bounds.y) * scaleY)),
            width: Math.max(element.type === "line" ? 0 : 1, Math.round(element.width * scaleX)),
            height: Math.max(element.type === "line" ? 0 : 1, Math.round(element.height * scaleY)),
          };
        }),
      };
    }),
  });
}

export function fitComponentFallbackElementsToCanvas(
  content: PresentationSlideContent,
  componentId: string,
  mode: "canvas" | "width",
): PresentationSlideContent {
  const component = (content.components ?? []).find((entry) => entry.id === componentId);
  if (!component) {
    return content;
  }
  const bounds = getComponentBoundsFromElements(component.fallbackElements);
  if (!bounds) {
    return content;
  }

  const canvas = getCanvasSize(content);
  const definition = getBuiltInPresentationComponentDefinition(component.componentId);
  const shouldStretchToCanvas = mode === "canvas" && definition?.category === "A4";
  const scale = shouldStretchToCanvas
    ? 1
    : mode === "canvas"
      ? Math.min(canvas.width / Math.max(1, bounds.width), canvas.height / Math.max(1, bounds.height))
      : canvas.width / Math.max(1, bounds.width);
  const targetWidth = shouldStretchToCanvas
    ? canvas.width
    : Math.max(1, Math.round(bounds.width * scale));
  const targetHeight = shouldStretchToCanvas
    ? canvas.height
    : mode === "canvas"
      ? Math.max(1, Math.round(bounds.height * scale))
      : bounds.height;

  const resized = resizeComponentFallbackElements(content, componentId, targetWidth, targetHeight);
  const nextComponent = (resized.components ?? []).find((entry) => entry.id === componentId);
  const nextBounds = nextComponent ? getComponentBoundsFromElements(nextComponent.fallbackElements) : null;
  if (!nextBounds) {
    return resized;
  }

  const targetX = mode === "canvas"
    ? (shouldStretchToCanvas ? 0 : Math.round((canvas.width - nextBounds.width) / 2))
    : 0;
  const targetY = mode === "canvas"
    ? (shouldStretchToCanvas ? 0 : Math.round((canvas.height - nextBounds.height) / 2))
    : nextBounds.y;
  return translateComponentFallbackElements(
    resized,
    componentId,
    targetX - nextBounds.x,
    targetY - nextBounds.y,
  );
}

export function rotateComponentFallbackElements(
  content: PresentationSlideContent,
  componentId: string,
  deltaDegrees: number,
): PresentationSlideContent {
  if (!deltaDegrees || !(content.components ?? []).length) {
    return content;
  }

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    components: (content.components ?? []).map((component) => {
      if (component.id !== componentId) {
        return component;
      }

      const bounds = getComponentBoundsFromElements(component.fallbackElements);
      if (!bounds) {
        return component;
      }

      const radians = (deltaDegrees * Math.PI) / 180;
      const centerX = bounds.x + (bounds.width / 2);
      const centerY = bounds.y + (bounds.height / 2);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      return {
        ...component,
        fallbackElements: component.fallbackElements.map((element) => {
          const elementCenterX = element.x + (element.width / 2);
          const elementCenterY = element.y + (element.height / 2);
          const relativeX = elementCenterX - centerX;
          const relativeY = elementCenterY - centerY;
          const rotatedCenterX = centerX + (relativeX * cos) - (relativeY * sin);
          const rotatedCenterY = centerY + (relativeX * sin) + (relativeY * cos);

          return {
            ...element,
            x: Math.round(rotatedCenterX - (element.width / 2)),
            y: Math.round(rotatedCenterY - (element.height / 2)),
            rotation: (element.rotation ?? 0) + deltaDegrees,
          };
        }),
      };
    }),
  });
}

export function reorderComponentById(
  content: PresentationSlideContent,
  componentId: string,
  direction: ArrangeDirection,
): PresentationSlideContent {
  return reorderRenderableEntry(content, presentationRenderOrderIdForComponent(componentId), direction);
}

export function updateElementById(
  content: PresentationSlideContent,
  elementId: string,
  patch: PresentationElementPatch,
): PresentationSlideContent {
  const topLevelElement = content.elements.find((element) => element.id === elementId);
  if (!topLevelElement) {
    return sortCollectionsByRenderOrder({
      ...content,
      canvas: getCanvasSize(content),
      components: (content.components ?? []).map((component) => ({
        ...component,
        fallbackElements: component.fallbackElements.map((element) => {
          if (element.id !== elementId) {
            return element;
          }

          const nextElement = {
            ...element,
            ...patch,
          } as PresentationElement;
          if (
            (nextElement.type === "image" || nextElement.type === "video")
            && presentationMediaShapeRequiresSquare(nextElement.mediaShape)
          ) {
            const size = Math.max(nextElement.width, nextElement.height);
            nextElement.width = size;
            nextElement.height = size;
          }
          return nextElement;
        }),
      })),
    });
  }

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    elements: content.elements.map((element) => {
      if (element.id !== elementId) {
        return element;
      }

      const nextElement = {
        ...element,
        ...patch,
      } as PresentationElement;
      if (
        (nextElement.type === "image" || nextElement.type === "video")
        && presentationMediaShapeRequiresSquare(nextElement.mediaShape)
      ) {
        const size = Math.max(nextElement.width, nextElement.height);
        nextElement.width = size;
        nextElement.height = size;
      }
      return nextElement;
    }),
  });
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
  return sortCollectionsByRenderOrder({
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
    components: (content.components ?? []).map((component) => ({
      ...component,
      fallbackElements: component.fallbackElements.map((element) => {
        if (!selected.has(element.id)) {
          return element;
        }
        return {
          ...element,
          x: element.x + deltaX,
          y: element.y + deltaY,
        } as PresentationElement;
      }),
    })),
  });
}

export function resizeElementById(
  content: PresentationSlideContent,
  elementId: string,
  patch: Partial<Pick<PresentationElement, "x" | "y" | "width" | "height">>,
): PresentationSlideContent {
  const topLevelElement = content.elements.find((element) => element.id === elementId);
  if (!topLevelElement) {
    return sortCollectionsByRenderOrder({
      ...content,
      canvas: getCanvasSize(content),
      components: (content.components ?? []).map((component) => ({
        ...component,
        fallbackElements: component.fallbackElements.map((element) => {
          if (element.id !== elementId) {
            return element;
          }

          const width = patch.width === undefined ? element.width : Math.max(0, patch.width);
          const height = patch.height === undefined ? element.height : Math.max(0, patch.height);
          const requiresSquare = (
            (element.type === "image" || element.type === "video")
            && presentationMediaShapeRequiresSquare(element.mediaShape)
          );
          const normalizedSize = requiresSquare ? Math.max(width, height) : undefined;

          return {
            ...element,
            x: patch.x ?? element.x,
            y: patch.y ?? element.y,
            width: normalizedSize ?? width,
            height: normalizedSize ?? height,
          } as PresentationElement;
        }),
      })),
    });
  }

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    elements: content.elements.map((element) => {
      if (element.id !== elementId) {
        return element;
      }

      const width = patch.width === undefined ? element.width : Math.max(0, patch.width);
      const height = patch.height === undefined ? element.height : Math.max(0, patch.height);
      const requiresSquare = (
        (element.type === "image" || element.type === "video")
        && presentationMediaShapeRequiresSquare(element.mediaShape)
      );
      const normalizedSize = requiresSquare ? Math.max(width, height) : undefined;

      return {
        ...element,
        x: patch.x ?? element.x,
        y: patch.y ?? element.y,
        width: normalizedSize ?? width,
        height: normalizedSize ?? height,
      } as PresentationElement;
    }),
  });
}

export function reorderElementById(
  content: PresentationSlideContent,
  elementId: string,
  direction: ArrangeDirection,
): PresentationSlideContent {
  return reorderRenderableEntry(content, presentationRenderOrderIdForElement(elementId), direction);
}

export function deleteElements(
  content: PresentationSlideContent,
  elementIds: string[],
): PresentationSlideContent {
  if (!elementIds.length) {
    return content;
  }

  const selected = new Set(elementIds);
  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    elements: content.elements.filter((element) => !selected.has(element.id)),
    components: (content.components ?? []).map((component) => ({
      ...component,
      fallbackElements: component.fallbackElements.filter((element) => !selected.has(element.id)),
    })),
    renderOrder: getRenderOrder(content).filter((entry) => (
      !entry.startsWith("element:") || !selected.has(entry.slice("element:".length))
    )),
  });
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
  const duplicateIdsBySource = new Map<string, string>();

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
    duplicateIdsBySource.set(element.id, duplicate.id);
    nextElements.push(duplicate);
  }

  const nextComponents = (content.components ?? []).map((component) => {
    const nextFallbackElements: PresentationElement[] = [];
    for (const element of component.fallbackElements) {
      nextFallbackElements.push(element);
      if (!selected.has(element.id)) {
        continue;
      }
      const duplicate: PresentationElement = {
        ...element,
        id: makeId(element),
        x: element.x + 16,
        y: element.y + 16,
      };
      duplicateIdsBySource.set(element.id, duplicate.id);
      nextFallbackElements.push(duplicate);
    }
    return {
      ...component,
      fallbackElements: nextFallbackElements,
    };
  });

  const nextOrder = getRenderOrder(content).flatMap((entry) => {
    if (!entry.startsWith("element:")) {
      return [entry];
    }
    const elementId = entry.slice("element:".length);
    const duplicateId = duplicateIdsBySource.get(elementId);
    return duplicateId
      ? [entry, presentationRenderOrderIdForElement(duplicateId)]
      : [entry];
  });

  return sortCollectionsByRenderOrder({
    ...content,
    canvas: getCanvasSize(content),
    elements: nextElements,
    components: nextComponents,
    renderOrder: nextOrder,
  });
}

export function setSlideBackground(
  content: PresentationSlideContent,
  background: PresentationSlideBackground | undefined,
): PresentationSlideContent {
  return { ...content, background };
}
