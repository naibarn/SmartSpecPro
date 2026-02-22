import { useEffect } from "react";

import type { PresentationElement } from "@/lib/presentationEditorState";
import { CanvasObjects } from "./CanvasObjects";

interface CanvasStageProps {
  elements: PresentationElement[];
  selectedElementId: string | null;
  onSelectElement: (elementId: string) => void;
}

export function CanvasStage({
  elements,
  selectedElementId,
  onSelectElement,
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
            selectedElementId={selectedElementId}
            onSelectElement={onSelectElement}
          />
        </div>
        <div data-testid="canvas-stage-layer-selection-guides" className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
          selection-guides
        </div>
        <div data-testid="canvas-stage-layer-interaction-overlay" className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
          interaction-overlay
        </div>
      </div>
    </div>
  );
}
