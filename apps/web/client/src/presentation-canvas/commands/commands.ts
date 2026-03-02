import {
  addElement,
  deleteElements,
  duplicateElements,
  reorderElementById,
  resizeCanvas,
  resizeElementById,
  translateElements,
  updateElementById,
  type ArrangeDirection,
  type PresentationCanvasSize,
  type PresentationElement,
  type PresentationElementPatch,
  type PresentationSlideContent,
} from "@/lib/presentationEditorState";
import { computeSnapPosition, type SnapCandidate, type SnapGuide } from "../snap/SnapEngine";
import type { CanvasCommand } from "./CommandBus";

export interface CanvasCommandState {
  content: PresentationSlideContent;
  selectedElementIds: string[];
  snapGuides: SnapGuide[];
}

const NON_BROADCAST_PATCH_FIELDS = new Set<string>([
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "text",
  "src",
  "poster",
  "title",
  "alt",
  "imagePrompt",
  "imageModelId",
  "imageReferenceUrls",
]);

function shouldBroadcastPatchToSelection(patch: PresentationElementPatch): boolean {
  const keys = Object.keys(patch);
  if (!keys.length) {
    return false;
  }
  return keys.every((key) => !NON_BROADCAST_PATCH_FIELDS.has(key));
}

export function createCanvasCommandState(
  content: PresentationSlideContent,
  selectedElementIds: string[] = [],
): CanvasCommandState {
  return {
    content,
    selectedElementIds,
    snapGuides: [],
  };
}

export function selectElementsCommand(
  elementIds: string[],
): CanvasCommand<CanvasCommandState> {
  return {
    id: "select-elements",
    apply: (state) => ({
      ...state,
      selectedElementIds: [...elementIds],
      snapGuides: [],
    }),
  };
}

export function addElementCommand(
  element: PresentationElement,
): CanvasCommand<CanvasCommandState> {
  return {
    id: "add-element",
    apply: (state) => ({
      ...state,
      content: addElement(state.content, element),
      selectedElementIds: [element.id],
      snapGuides: [],
    }),
  };
}

export function patchSelectedElementCommand(
  patch: PresentationElementPatch,
): CanvasCommand<CanvasCommandState> {
  return {
    id: "patch-selected-element",
    apply: (state) => {
      const targetId = state.selectedElementIds[0];
      if (!targetId) {
        return state;
      }

      const primary = state.content.elements.find((element) => element.id === targetId);
      if (!primary) {
        return state;
      }

      const shouldBroadcast = state.selectedElementIds.length > 1 && shouldBroadcastPatchToSelection(patch);
      if (!shouldBroadcast) {
        return {
          ...state,
          content: updateElementById(state.content, targetId, patch),
          snapGuides: [],
        };
      }

      const selected = new Set(state.selectedElementIds);
      const nextElements = state.content.elements.map((element) => {
        if (!selected.has(element.id) || element.type !== primary.type) {
          return element;
        }
        return {
          ...element,
          ...patch,
        } as PresentationElement;
      });

      return {
        ...state,
        content: {
          ...state.content,
          elements: nextElements,
        },
        snapGuides: [],
      };
    },
  };
}

export function patchElementByIdCommand(
  elementId: string,
  patch: PresentationElementPatch,
): CanvasCommand<CanvasCommandState> {
  return {
    id: "patch-element-by-id",
    apply: (state) => ({
      ...state,
      content: updateElementById(state.content, elementId, patch),
      snapGuides: [],
    }),
  };
}

function getFirstSelectedElement(state: CanvasCommandState): PresentationElement | null {
  const targetId = state.selectedElementIds[0];
  if (!targetId) {
    return null;
  }

  return state.content.elements.find((element) => element.id === targetId) ?? null;
}

function computeSnapCandidates(state: CanvasCommandState): SnapCandidate[] {
  const selected = new Set(state.selectedElementIds);
  return state.content.elements
    .filter((element) => !selected.has(element.id))
    .map((element) => ({
      id: element.id,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    }));
}

export function moveSelectionCommand(
  deltaX: number,
  deltaY: number,
  snapToGuides: boolean = true,
): CanvasCommand<CanvasCommandState> {
  return {
    id: "move-selection",
    apply: (state) => {
      if (!state.selectedElementIds.length) {
        return state;
      }

      const primary = getFirstSelectedElement(state);
      if (!primary) {
        return state;
      }

      const movedPrimary = {
        x: primary.x + deltaX,
        y: primary.y + deltaY,
        width: primary.width,
        height: primary.height,
      };

      if (!snapToGuides) {
        return {
          ...state,
          content: translateElements(
            state.content,
            state.selectedElementIds,
            deltaX,
            deltaY,
          ),
          snapGuides: [],
        };
      }

      const snap = computeSnapPosition(movedPrimary, computeSnapCandidates(state));
      const adjustedDeltaX = snap.x - primary.x;
      const adjustedDeltaY = snap.y - primary.y;

      return {
        ...state,
        content: translateElements(
          state.content,
          state.selectedElementIds,
          adjustedDeltaX,
          adjustedDeltaY,
        ),
        snapGuides: snap.guides,
      };
    },
  };
}

export function resizeSelectionCommand(
  width: number,
  height: number,
): CanvasCommand<CanvasCommandState> {
  return {
    id: "resize-selection",
    apply: (state) => {
      const targetId = state.selectedElementIds[0];
      if (!targetId) {
        return state;
      }

      const nextWidth = Math.max(0, width);
      const nextHeight = Math.max(0, height);

      if (state.selectedElementIds.length <= 1) {
        return {
          ...state,
          content: resizeElementById(state.content, targetId, { width: nextWidth, height: nextHeight }),
          snapGuides: [],
        };
      }

      const primary = state.content.elements.find((element) => element.id === targetId);
      if (!primary) {
        return state;
      }

      const ratioX = nextWidth / Math.max(1, primary.width);
      const ratioY = nextHeight / Math.max(1, primary.height);
      const selected = new Set(state.selectedElementIds);
      const nextElements = state.content.elements.map((element) => {
        if (!selected.has(element.id)) {
          return element;
        }
        return {
          ...element,
          width: Math.max(0, Math.round(element.width * ratioX)),
          height: Math.max(0, Math.round(element.height * ratioY)),
        } as PresentationElement;
      });

      return {
        ...state,
        content: {
          ...state.content,
          elements: nextElements,
        },
        snapGuides: [],
      };
    },
  };
}

export function rotateSelectionCommand(
  deltaDegrees: number,
): CanvasCommand<CanvasCommandState> {
  return {
    id: "rotate-selection",
    apply: (state) => {
      const targetId = state.selectedElementIds[0];
      if (!targetId) {
        return state;
      }

      const current = state.content.elements.find((element) => element.id === targetId);
      if (!current) {
        return state;
      }

      const nextRotation = Math.round(((current.rotation ?? 0) + deltaDegrees) * 10) / 10;
      return {
        ...state,
        content: updateElementById(state.content, targetId, { rotation: nextRotation }),
        snapGuides: [],
      };
    },
  };
}

export function setCanvasSizeCommand(
  nextCanvas: PresentationCanvasSize,
): CanvasCommand<CanvasCommandState> {
  return {
    id: `set-canvas-size-${nextCanvas.width}x${nextCanvas.height}`,
    apply: (state) => ({
      ...state,
      content: resizeCanvas(state.content, nextCanvas, {
        selectedElementIds: state.selectedElementIds,
      }),
      snapGuides: [],
    }),
  };
}

export function arrangeSelectionCommand(
  direction: ArrangeDirection,
): CanvasCommand<CanvasCommandState> {
  return {
    id: `arrange-selection-${direction}`,
    apply: (state) => {
      const targetId = state.selectedElementIds[0];
      if (!targetId) {
        return state;
      }

      return {
        ...state,
        content: reorderElementById(state.content, targetId, direction),
        snapGuides: [],
      };
    },
  };
}

export function deleteSelectionCommand(): CanvasCommand<CanvasCommandState> {
  return {
    id: "delete-selection",
    apply: (state) => {
      const ids = state.selectedElementIds;
      if (!ids.length) {
        return state;
      }

      const nextContent = deleteElements(state.content, ids);
      const nextSelected = nextContent.elements[0]?.id ? [nextContent.elements[0].id] : [];
      return {
        ...state,
        content: nextContent,
        selectedElementIds: nextSelected,
        snapGuides: [],
      };
    },
  };
}

export function duplicateSelectionCommand(
  makeId: (source: PresentationElement) => string,
): CanvasCommand<CanvasCommandState> {
  return {
    id: "duplicate-selection",
    apply: (state) => {
      const ids = state.selectedElementIds;
      if (!ids.length) {
        return state;
      }

      const nextContent = duplicateElements(state.content, ids, makeId);
      const originalSet = new Set(state.content.elements.map((element) => element.id));
      const duplicates = nextContent.elements
        .filter((element) => !originalSet.has(element.id))
        .map((element) => element.id);

      return {
        ...state,
        content: nextContent,
        selectedElementIds: duplicates.length ? duplicates : ids,
        snapGuides: [],
      };
    },
  };
}
