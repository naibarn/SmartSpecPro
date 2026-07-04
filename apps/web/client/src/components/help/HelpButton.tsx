import { useState, useRef, useCallback, useEffect } from "react";
import { HelpCircle, Minus, X, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpPanel } from "./HelpPanel";

interface HelpButtonProps {
  page?: string;
  topic?: string;
  size?: "default" | "sm" | "icon";
  variant?: "default" | "ghost" | "outline";
  className?: string;
  label?: string;
}

const MIN_WIDTH = 380;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 520;

export function HelpButton({
  page,
  topic,
  size = "icon",
  variant = "ghost",
  className,
  label,
}: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });

  // Resize via mouse drag on left edge
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { active: true, startX: e.clientX, startW: width };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const delta = dragRef.current.startX - e.clientX;
      setWidth(
        Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + delta)),
      );
    };
    const onUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => { setOpen(true); setMinimized(false); }}
        aria-label="Help"
      >
        <HelpCircle className="h-4 w-4" />
        {label && <span className="ml-1">{label}</span>}
      </Button>
    );
  }

  // Minimized bar — pinned to top-right (avoids Feedback widget at bottom-right)
  if (minimized) {
    return (
      <div className="fixed top-2 right-2 z-50 flex items-center gap-1.5 rounded-lg border bg-background/95 backdrop-blur px-3 py-1.5 shadow-lg">
        <HelpCircle className="h-4 w-4 text-sky-500" />
        <span className="text-sm font-medium">Help</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setMinimized(false)}
          title="Expand"
        >
          <Maximize2 className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setOpen(false)}
          title="Close"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Full panel
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 z-50 flex h-dvh flex-col border-l bg-background shadow-2xl"
        style={{ width }}
      >
        {/* Resize handle — wide enough to grab */}
        <div
          className="absolute -left-1 top-0 bottom-0 z-10 w-3 cursor-col-resize group"
          onMouseDown={onResizeStart}
        >
          <div className="absolute left-1 top-0 bottom-0 w-0.5 bg-border group-hover:bg-sky-500 group-active:bg-sky-600 transition-colors" />
        </div>

        {/* Title bar */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b bg-muted/40 px-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-sky-500" />
            <span className="text-xs font-medium text-muted-foreground">Help</span>
          </div>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setMinimized(true)}
              title="Minimize"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Content — uses overflow-y-auto instead of ScrollArea */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <HelpPanel initialPage={page} initialTopic={topic} />
        </div>
      </div>
    </>
  );
}
