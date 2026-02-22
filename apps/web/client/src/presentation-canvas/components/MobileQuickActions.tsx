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
  const nextModeLabel = mode === "pan_mode" ? "Switch to Edit Mode" : "Switch to Pan Mode";

  return (
    <div className="rounded border p-2 space-y-2" data-testid="mobile-quick-actions">
      <Button
        type="button"
        className="w-full min-h-10"
        variant="outline"
        onClick={onToggleMode}
      >
        {nextModeLabel}
      </Button>
      <div className="grid grid-cols-3 gap-2">
        <Button type="button" className="min-h-10" variant="secondary" disabled={disabled} onClick={() => onNudgeSelection(-8, 0)}>
          Left
        </Button>
        <Button type="button" className="min-h-10" variant="secondary" disabled={disabled} onClick={() => onNudgeSelection(0, -8)}>
          Up
        </Button>
        <Button type="button" className="min-h-10" variant="secondary" disabled={disabled} onClick={() => onNudgeSelection(8, 0)}>
          Right
        </Button>
      </div>
      <Button
        type="button"
        className="w-full min-h-10"
        variant="destructive"
        disabled={disabled}
        onClick={onDeleteSelection}
      >
        Delete Selection
      </Button>
    </div>
  );
}
