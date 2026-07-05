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
  /**
   * Seed the left rail (tool rail + asset panel) as collapsed on first render.
   * Useful for viewport tiers with limited width (e.g. tablet, 768-1023px)
   * where showing every rail expanded at once would starve the canvas of
   * space. Only affects the initial render — the user can still expand it
   * via the existing collapse/expand toggle button. Defaults to `false` so
   * desktop callers are unaffected.
   */
  defaultLeftCollapsed?: boolean;
  /** Same as `defaultLeftCollapsed`, but for the right (properties) rail. */
  defaultRightCollapsed?: boolean;
}

export function CanvasShell({
  slidesPanel,
  toolRail,
  assetPanel,
  canvasToolbar,
  canvasStage,
  canvasFooter,
  propertiesPanel,
  defaultLeftCollapsed = false,
  defaultRightCollapsed = false,
}: CanvasShellProps) {
  const useStudioLayout = Boolean(toolRail || assetPanel);
  const [leftCollapsed, setLeftCollapsed] = useState(defaultLeftCollapsed);
  const [rightCollapsed, setRightCollapsed] = useState(defaultRightCollapsed);

  if (useStudioLayout) {
    return (
      <div className="h-full min-h-0 overflow-hidden rounded-xl border border-slate-300/80 bg-slate-900/95" data-testid="canvas-shell">
        <div
          className="grid h-full min-h-0 transition-[grid-template-columns] duration-300"
          style={{
            gridTemplateColumns: `${leftCollapsed ? "44px 0px" : "74px minmax(280px,320px)"} minmax(0,1fr) ${rightCollapsed ? "44px" : "minmax(280px,320px)"}`,
          }}
        >
          <aside
            className={`min-h-0 min-w-0 overflow-hidden border-r border-slate-800 bg-slate-950 transition-all duration-300 ${
              leftCollapsed ? "px-1.5 py-3 opacity-100" : "px-2 py-3 opacity-100"
            }`}
            data-testid="canvas-shell-left-rail"
          >
            {leftCollapsed ? (
              <div className="flex h-full flex-col items-center">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  onClick={() => setLeftCollapsed(false)}
                  aria-label="Expand Left Panel"
                  title="Expand Left Panel"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
                <div className="mt-3 h-px w-7 bg-slate-800" aria-hidden="true" />
                <span className="mt-3 [writing-mode:vertical-rl] rotate-180 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Library
                </span>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="mb-2 h-9 w-9 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  onClick={() => setLeftCollapsed(true)}
                  aria-label="Collapse Left Panel"
                  title="Collapse Left Panel"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
                {toolRail}
              </>
            )}
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
            className={`min-h-0 overflow-hidden border-l border-slate-300 bg-slate-100 transition-all duration-300 ${
              rightCollapsed ? "p-1.5 opacity-100" : "p-3 opacity-100"
            }`}
            data-testid="canvas-shell-right-rail"
          >
            {rightCollapsed ? (
              <div className="flex h-full flex-col items-center">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-lg text-slate-700 hover:bg-white hover:text-slate-950"
                  onClick={() => setRightCollapsed(false)}
                  aria-label="Expand Right Panel"
                  title="Expand Right Panel"
                >
                  <PanelRightOpen className="h-4 w-4" />
                </Button>
                <div className="mt-3 h-px w-7 bg-slate-300" aria-hidden="true" />
                <span className="mt-3 [writing-mode:vertical-rl] text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Properties
                </span>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col space-y-2 overflow-hidden">
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <h2 className="font-medium">Properties</h2>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-slate-600 hover:bg-white hover:text-slate-950"
                    onClick={() => setRightCollapsed(true)}
                    aria-label="Collapse Right Panel"
                    title="Collapse Right Panel"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {propertiesPanel}
                </div>
              </div>
            )}
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
