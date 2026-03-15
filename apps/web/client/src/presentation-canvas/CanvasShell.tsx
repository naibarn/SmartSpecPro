import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CanvasShellProps {
  slidesPanel: ReactNode;
  toolRail?: ReactNode;
  assetPanel?: ReactNode;
  canvasToolbar: ReactNode;
  canvasStage: ReactNode;
  canvasFooter?: ReactNode;
  propertiesPanel: ReactNode;
}

export function CanvasShell({
  slidesPanel,
  toolRail,
  assetPanel,
  canvasToolbar,
  canvasStage,
  canvasFooter,
  propertiesPanel,
}: CanvasShellProps) {
  const useStudioLayout = Boolean(toolRail || assetPanel);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  if (useStudioLayout) {
    return (
      <div className="h-full min-h-0 overflow-hidden rounded-xl border border-slate-300/80 bg-slate-900/95" data-testid="canvas-shell">
        <div
          className="grid h-full min-h-0 transition-[grid-template-columns] duration-300"
          style={{
            gridTemplateColumns: `${leftCollapsed ? "0px 0px" : "74px minmax(280px,320px)"} minmax(0,1fr) ${rightCollapsed ? "0px" : "minmax(280px,320px)"}`,
          }}
        >
          <aside
            className={`min-h-0 min-w-0 overflow-hidden border-r border-slate-800 bg-slate-950 transition-all duration-300 ${
              leftCollapsed ? "pointer-events-none opacity-0" : "px-2 py-3 opacity-100"
            }`}
          >
            {toolRail}
          </aside>
          <aside
            className={`min-h-0 min-w-0 overflow-hidden border-r border-slate-800 bg-slate-900 transition-all duration-300 ${
              leftCollapsed ? "pointer-events-none opacity-0" : "px-3 py-3 opacity-100"
            }`}
          >
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              {assetPanel}
            </div>
          </aside>
          <section className="relative flex min-h-0 flex-col gap-1.5 bg-slate-100/90 p-2">
            <div className="absolute left-0 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-6 rounded-full bg-white/95 shadow"
                onClick={() => setLeftCollapsed((prev) => !prev)}
                aria-label={leftCollapsed ? "Expand Left Panel" : "Collapse Left Panel"}
              >
                {leftCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </div>
            <div className="absolute right-0 top-1/2 z-30 translate-x-1/2 -translate-y-1/2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-6 rounded-full bg-white/95 shadow"
                onClick={() => setRightCollapsed((prev) => !prev)}
                aria-label={rightCollapsed ? "Expand Right Panel" : "Collapse Right Panel"}
              >
                {rightCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
              </Button>
            </div>
            <div className="shrink-0">{canvasToolbar}</div>
            <div className="min-h-0 flex-1">{canvasStage}</div>
            {canvasFooter ? (
              <div className="pointer-events-none absolute bottom-0 left-3 right-3 z-20">
                <div className="pointer-events-auto">
                  {canvasFooter}
                </div>
              </div>
            ) : null}
          </section>
          <aside
            className={`min-h-0 overflow-y-auto border-l border-slate-300 bg-slate-100 transition-all duration-300 ${
              rightCollapsed ? "pointer-events-none opacity-0" : "p-3 opacity-100"
            }`}
          >
            <div className="space-y-2">
              <h2 className="font-medium">Properties</h2>
              {propertiesPanel}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // Mobile layout: canvas fills available height, bottom sheet below canvas
  return (
    <div className="flex h-full flex-col" data-testid="canvas-shell">
      <section className="relative flex min-h-0 flex-1 flex-col gap-1.5 p-2">
        <div className="shrink-0">{canvasToolbar}</div>
        <div className="min-h-0 flex-1">{canvasStage}</div>
        {canvasFooter ? <div className="shrink-0">{canvasFooter}</div> : null}
      </section>
      {propertiesPanel ? <div className="shrink-0">{propertiesPanel}</div> : null}
    </div>
  );
}
