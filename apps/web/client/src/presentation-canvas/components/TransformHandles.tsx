import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  RotateCcw,
  RotateCw,
  Scale,
  Shrink,
} from "lucide-react";

import { Button } from "@/components/ui/button";

interface TransformHandlesProps {
  compact?: boolean;
  disabled?: boolean;
  onMove: (deltaX: number, deltaY: number) => void;
  onResize: (width: number, height: number) => void;
  onRotate: (deltaDegrees: number) => void;
  onArrange: (direction: "forward" | "backward" | "front" | "back") => void;
  currentWidth: number;
  currentHeight: number;
}

export function TransformHandles({
  compact,
  disabled,
  onMove,
  onResize,
  onRotate,
  onArrange,
  currentWidth,
  currentHeight,
}: TransformHandlesProps) {
  const moveButtonClass = compact ? "h-7 gap-1 px-2 text-[11px]" : undefined;
  const actionButtonClass = compact ? "h-7 gap-1 px-2 text-[11px]" : undefined;

  return (
    <div className="space-y-2" data-testid="canvas-transform-handles">
      <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Transform</p>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={moveButtonClass}
          disabled={disabled}
          onClick={() => onMove(-10, 0)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Left
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={moveButtonClass}
          disabled={disabled}
          onClick={() => onMove(10, 0)}
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Right
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={moveButtonClass}
          disabled={disabled}
          onClick={() => onMove(0, -10)}
        >
          <ArrowUp className="h-3.5 w-3.5" />
          Up
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={moveButtonClass}
          disabled={disabled}
          onClick={() => onMove(0, 10)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Down
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onResize(currentWidth + 10, currentHeight)}
        >
          <Scale className="h-3.5 w-3.5" />
          Wider
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onResize(Math.max(0, currentWidth - 10), currentHeight)}
        >
          <Shrink className="h-3.5 w-3.5" />
          Narrower
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onResize(currentWidth, currentHeight + 10)}
        >
          <Scale className="h-3.5 w-3.5" />
          Taller
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onResize(currentWidth, Math.max(0, currentHeight - 10))}
        >
          <Shrink className="h-3.5 w-3.5" />
          Shorter
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onRotate(-15)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Rotate -15
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onRotate(15)}
        >
          <RotateCw className="h-3.5 w-3.5" />
          Rotate +15
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onArrange("back")}
        >
          <ChevronsDown className="h-3.5 w-3.5" />
          Send Back
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onArrange("backward")}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Backward
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onArrange("forward")}
        >
          <ArrowUp className="h-3.5 w-3.5" />
          Forward
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClass}
          disabled={disabled}
          onClick={() => onArrange("front")}
        >
          <ChevronsUp className="h-3.5 w-3.5" />
          Bring Front
        </Button>
      </div>
    </div>
  );
}
