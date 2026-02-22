import {
  addElement,
  deleteElements,
  duplicateElements,
  reorderElementById,
  resizeElementById,
  translateElements,
  updateElementById,
  type ArrangeDirection,
  type PresentationElement,
  type PresentationElementPatch,
  type PresentationSlideContent,
} from "@/lib/presentationEditorState";
import { computeSnapPosition, type SnapCandidate, type SnapGuide } from "../snap/SnapEngine";
import type { CanvasCommand } from "./CommandBus";

export interface CanvasCommandState {
  content: PresentationSlideContent;
  selectedElementIds: string[];
  rotationByElementId: Record<string, number>;
  snapGuides: SnapGuide[];
}

export function createCanvasCommandState(
  content: PresentationSlideContent,
  selectedElementIds: string[] = [],
): CanvasCommandState {
  return {
    content,
    selectedElementIds,
    rotationByElementId: {},
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

      return {
        ...state,
        content: updateElementById(state.content, targetId, patch),
        snapGuides: [],
      };
    },
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

      return {
        ...state,
        content: resizeElementById(state.content, targetId, { width, height }),
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

      const current = state.rotationByElementId[targetId] ?? 0;
      const next = current + deltaDegrees;
      return {
        ...state,
        rotationByElementId: {
          ...state.rotationByElementId,
          [targetId]: next,
        },
        snapGuides: [],
      };
    },
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
