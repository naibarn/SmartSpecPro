import { Button } from "@/components/ui/button";

interface TransformHandlesProps {
  disabled?: boolean;
  onMove: (deltaX: number, deltaY: number) => void;
  onResize: (width: number, height: number) => void;
  onRotate: (deltaDegrees: number) => void;
  onArrange: (direction: "forward" | "backward" | "front" | "back") => void;
  currentWidth: number;
  currentHeight: number;
}

export function TransformHandles({
  disabled,
  onMove,
  onResize,
  onRotate,
  onArrange,
  currentWidth,
  currentHeight,
}: TransformHandlesProps) {
  return (
    <div className="space-y-2 rounded border border-dashed p-2" data-testid="canvas-transform-handles">
      <p className="text-xs text-muted-foreground">Transform Handles</p>
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onMove(-10, 0)}>
          Left
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onMove(10, 0)}>
          Right
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onMove(0, -10)}>
          Up
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onMove(0, 10)}>
          Down
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onResize(currentWidth + 10, currentHeight)}>
          Wider
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onResize(Math.max(0, currentWidth - 10), currentHeight)}>
          Narrower
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onResize(currentWidth, currentHeight + 10)}>
          Taller
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onResize(currentWidth, Math.max(0, currentHeight - 10))}>
          Shorter
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onRotate(-15)}>
          Rotate -15
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onRotate(15)}>
          Rotate +15
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onArrange("back")}>
          Send Back
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onArrange("backward")}>
          Backward
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onArrange("forward")}>
          Forward
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onArrange("front")}>
          Bring Front
        </Button>
      </div>
    </div>
  );
}
