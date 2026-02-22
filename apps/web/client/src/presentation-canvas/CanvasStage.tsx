import { useEffect } from "react";

import type { PresentationElement } from "@/lib/presentationEditorState";
import type { SnapGuide } from "./snap/SnapEngine";
import { CanvasObjects } from "./CanvasObjects";
import { TransformHandles } from "./components/TransformHandles";
import type { ArrangeDirection } from "@/lib/presentationEditorState";

interface CanvasStageProps {
  elements: PresentationElement[];
  selectedElementIds: string[];
  snapGuides: SnapGuide[];
  onSelectElement: (elementId: string, options?: { additive?: boolean }) => void;
  onMoveSelection: (deltaX: number, deltaY: number) => void;
  onResizeSelection: (width: number, height: number) => void;
  onRotateSelection: (deltaDegrees: number) => void;
  onArrangeSelection: (direction: ArrangeDirection) => void;
}

export function CanvasStage({
  elements,
  selectedElementIds,
  snapGuides,
  onSelectElement,
  onMoveSelection,
  onResizeSelection,
  onRotateSelection,
  onArrangeSelection,
}: CanvasStageProps) {
  useEffect(() => {
    const onResize = () => {
      // Placeholder for viewport recalculation once react-konva stage sizing is enabled.
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const primarySelected = selectedElementIds[0]
    ? elements.find((element) => element.id === selectedElementIds[0]) || null
    : null;

  return (
    <div className="rounded border bg-background p-3 min-h-[320px]" data-testid="canvas-stage">
      <h3 className="text-sm font-medium mb-2">Canvas Stage</h3>
      <div className="space-y-3">
        <div data-testid="canvas-stage-layer-background" className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
          background
        </div>
        <div data-testid="canvas-stage-layer-content">
          <CanvasObjects
            elements={elements}
            selectedElementIds={selectedElementIds}
            onSelectElement={onSelectElement}
          />
        </div>
        <div data-testid="canvas-stage-layer-selection-guides" className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground space-y-1">
          <p>selection-guides</p>
          {snapGuides.length ? (
            <ul className="space-y-1 text-[11px]" aria-label="Snap Guides">
              {snapGuides.map((guide) => (
                <li key={`${guide.axis}-${guide.type}-${guide.sourceElementId}`}>
                  {guide.axis}:{guide.type} {"->"} {guide.sourceElementId}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div data-testid="canvas-stage-layer-interaction-overlay" className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
          <p className="mb-2">interaction-overlay</p>
          <TransformHandles
            disabled={!primarySelected}
            onMove={onMoveSelection}
            onResize={onResizeSelection}
            onRotate={onRotateSelection}
            onArrange={onArrangeSelection}
            currentWidth={primarySelected?.width ?? 0}
            currentHeight={primarySelected?.height ?? 0}
          />
        </div>
      </div>
    </div>
  );
}
