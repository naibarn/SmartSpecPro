import { ArrowLeft, ArrowRight, ArrowUp, MousePointer2, Move, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MobileInteractionMode } from "@/presentation-canvas/mobile/MobileInteractionState";

interface MobileQuickActionsProps {
  mode: MobileInteractionMode;
  onToggleMode: () => void;
  onNudgeSelection: (deltaX: number, deltaY: number) => void;
  onDeleteSelection: () => void;
  disabled: boolean;
}

export function MobileQuickActions({
  mode,
  onToggleMode,
  onNudgeSelection,
  onDeleteSelection,
  disabled,
}: MobileQuickActionsProps) {
  const isPanMode = mode === "pan_mode";

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
          size="sm"
          className="gap-1.5 text-xs"
          variant="destructive"
          disabled={disabled}
          onClick={onDeleteSelection}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Button type="button" size="sm" className="min-h-9" variant="secondary" disabled={disabled} onClick={() => onNudgeSelection(-8, 0)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" className="min-h-9" variant="secondary" disabled={disabled} onClick={() => onNudgeSelection(0, -8)}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" className="min-h-9" variant="secondary" disabled={disabled} onClick={() => onNudgeSelection(8, 0)}>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
