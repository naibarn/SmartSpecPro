import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsUpDown, Maximize2, MousePointer2, Move, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MobileInteractionMode } from "@/presentation-canvas/mobile/MobileInteractionState";

interface MobileQuickActionsProps {
  mode: MobileInteractionMode;
  viewportScale: number;
  onToggleMode: () => void;
  onFitViewport: () => void;
  onCenterViewport: () => void;
  onResetViewport: () => void;
  onNudgeSelection: (deltaX: number, deltaY: number) => void;
  onDeleteSelection: () => void;
  hasSelection: boolean;
  canCenterViewport: boolean;
}

export function MobileQuickActions({
  mode,
  viewportScale,
  onToggleMode,
  onFitViewport,
  onCenterViewport,
  onResetViewport,
  onNudgeSelection,
  onDeleteSelection,
  hasSelection,
  canCenterViewport,
}: MobileQuickActionsProps) {
  const isPanMode = mode === "pan_mode";
  const isEditMode = !isPanMode;
  const resetDisabled = Math.abs(viewportScale - 1) < 0.001;
  const [isSelectionControlsOpen, setIsSelectionControlsOpen] = useState(false);

  useEffect(() => {
    if (!hasSelection || isPanMode) {
      setIsSelectionControlsOpen(false);
      return;
    }
    setIsSelectionControlsOpen(true);
  }, [hasSelection, isPanMode]);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 space-y-2" data-testid="mobile-quick-actions">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          className="flex-1 gap-1.5 text-xs"
          size="sm"
          variant={isPanMode ? "secondary" : "outline"}
          onClick={onToggleMode}
        >
          {isPanMode ? <MousePointer2 className="h-3.5 w-3.5" /> : <Move className="h-3.5 w-3.5" />}
          {isPanMode ? "Edit Mode" : "Pan Mode"}
        </Button>
        <Button
          type="button"
          className="gap-1.5 text-xs"
          size="sm"
          variant={isSelectionControlsOpen ? "secondary" : "outline"}
          disabled={!hasSelection}
          onClick={() => setIsSelectionControlsOpen((prev) => !prev)}
          aria-label="Toggle Selection Controls"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          Adjust
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <div className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-300">
          Zoom {Math.round(viewportScale * 100)}%
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 px-2 text-xs"
          variant="outline"
          onClick={onFitViewport}
          aria-label="Fit Canvas to View"
        >
          Fit
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 px-2 text-xs"
          variant="outline"
          onClick={onCenterViewport}
          disabled={!canCenterViewport}
          aria-label="Center Canvas View"
        >
          Center
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 text-xs"
          variant="outline"
          disabled={resetDisabled}
          onClick={onResetViewport}
          aria-label="Reset Canvas View"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Reset View
        </Button>
      </div>
      {isSelectionControlsOpen ? (
        <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2" data-testid="mobile-selection-controls">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {isEditMode ? "Selection Tools" : "Selection Locked"}
            </p>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              variant="destructive"
              disabled={!hasSelection}
              onClick={onDeleteSelection}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div aria-hidden="true" />
            <Button
              type="button"
              size="sm"
              className="min-h-9"
              variant="secondary"
              disabled={!hasSelection}
              onClick={() => onNudgeSelection(0, -8)}
              aria-label="Move Selection Up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div aria-hidden="true" />
            <Button
              type="button"
              size="sm"
              className="min-h-9"
              variant="secondary"
              disabled={!hasSelection}
              onClick={() => onNudgeSelection(-8, 0)}
              aria-label="Move Selection Left"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-9"
              variant="secondary"
              disabled={!hasSelection}
              onClick={() => onNudgeSelection(0, 8)}
              aria-label="Move Selection Down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-9"
              variant="secondary"
              disabled={!hasSelection}
              onClick={() => onNudgeSelection(8, 0)}
              aria-label="Move Selection Right"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
