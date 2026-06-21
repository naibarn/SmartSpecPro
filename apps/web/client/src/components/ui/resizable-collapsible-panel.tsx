import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useMemo,
} from "react";
import { ChevronsLeft, ChevronsRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PanelSide = "left" | "right";

export interface ResizableCollapsiblePanelProps {
  side?: PanelSide;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  collapsedWidth?: number;
  className?: string;
  contentClassName?: string;
  collapsedClassName?: string;
  children: ReactNode;
  collapsedContent?: ReactNode;
  collapseLabel: string;
  expandLabel: string;
  resizeLabel: string;
  testId?: string;
}

function clampPanelWidth(value: number, minWidth: number, maxWidth: number): number {
  if (!Number.isFinite(value)) return minWidth;
  return Math.min(maxWidth, Math.max(minWidth, Math.round(value)));
}

export function ResizableCollapsiblePanel({
  side = "right",
  collapsed,
  onCollapsedChange,
  width,
  onWidthChange,
  minWidth = 280,
  maxWidth = 720,
  collapsedWidth = 48,
  className,
  contentClassName,
  collapsedClassName,
  children,
  collapsedContent,
  collapseLabel,
  expandLabel,
  resizeLabel,
  testId,
}: ResizableCollapsiblePanelProps) {
  const isRight = side === "right";
  const clampedWidth = clampPanelWidth(width, minWidth, maxWidth);
  const panelStyle = useMemo(
    () => ({
      "--resizable-collapsible-panel-width": `${collapsed ? collapsedWidth : clampedWidth}px`,
    }) as CSSProperties,
    [clampedWidth, collapsed, collapsedWidth],
  );

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (collapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = clampedWidth;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = isRight ? startWidth - delta : startWidth + delta;
      onWidthChange(clampPanelWidth(nextWidth, minWidth, maxWidth));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (collapsed) return;
    const step = event.shiftKey ? 48 : 16;
    let nextWidth = clampedWidth;
    if (event.key === "ArrowLeft") {
      nextWidth = clampedWidth + (isRight ? step : -step);
    } else if (event.key === "ArrowRight") {
      nextWidth = clampedWidth + (isRight ? -step : step);
    } else if (event.key === "Home") {
      nextWidth = minWidth;
    } else if (event.key === "End") {
      nextWidth = maxWidth;
    } else {
      return;
    }
    event.preventDefault();
    onWidthChange(clampPanelWidth(nextWidth, minWidth, maxWidth));
  };

  if (collapsed) {
    return (
      <aside
        data-testid={testId}
        data-collapsed="true"
        style={panelStyle}
        className={cn(
          "flex min-h-[12rem] shrink-0 flex-col overflow-hidden rounded-lg border bg-white xl:h-full xl:min-h-0 xl:w-[var(--resizable-collapsible-panel-width)]",
          collapsedClassName,
          className,
        )}
      >
        <div className="flex h-full min-h-[3rem] items-center justify-between gap-2 p-2 xl:min-h-0 xl:flex-col">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            onClick={() => onCollapsedChange(false)}
            aria-label={expandLabel}
            title={expandLabel}
          >
            {isRight ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
          </Button>
          <div className="min-w-0 flex-1 text-center text-xs font-semibold text-slate-600 xl:[writing-mode:vertical-rl]">
            {collapsedContent}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      data-testid={testId}
      data-collapsed="false"
      style={panelStyle}
      className={cn(
        "relative flex min-h-[12rem] w-full shrink-0 flex-col overflow-hidden rounded-lg border bg-white xl:h-full xl:min-h-0 xl:w-[var(--resizable-collapsible-panel-width)]",
        className,
      )}
    >
      <button
        type="button"
        role="separator"
        aria-orientation="vertical"
        aria-label={resizeLabel}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={clampedWidth}
        className={cn(
          "absolute top-0 z-20 hidden h-full w-3 cursor-col-resize items-center justify-center text-slate-300 outline-none transition-colors hover:text-sky-500 focus-visible:text-sky-600 focus-visible:ring-2 focus-visible:ring-sky-500/40 xl:flex",
          isRight ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2",
        )}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className={cn("min-h-0 flex-1", contentClassName)}>
        {children}
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(
          "absolute top-2 z-10 h-8 w-8 rounded-md bg-white/80 text-slate-500 shadow-sm backdrop-blur hover:text-slate-950",
          isRight ? "right-2" : "left-2",
        )}
        onClick={() => onCollapsedChange(true)}
        aria-label={collapseLabel}
        title={collapseLabel}
      >
        {isRight ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </Button>
    </aside>
  );
}
