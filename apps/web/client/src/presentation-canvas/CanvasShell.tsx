import type { ReactNode } from "react";

interface CanvasShellProps {
  slidesPanel: ReactNode;
  canvasToolbar: ReactNode;
  canvasStage: ReactNode;
  canvasFooter?: ReactNode;
  propertiesPanel: ReactNode;
}

export function CanvasShell({
  slidesPanel,
  canvasToolbar,
  canvasStage,
  canvasFooter,
  propertiesPanel,
}: CanvasShellProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]" data-testid="canvas-shell">
      <aside className="rounded border bg-card p-3 space-y-3">
        <h2 className="font-medium">Slides</h2>
        {slidesPanel}
      </aside>

      <section className="rounded border bg-card p-3 space-y-3">
        {canvasToolbar}
        {canvasStage}
        {canvasFooter}
      </section>

      <aside className="rounded border bg-card p-3 space-y-3">
        <h2 className="font-medium">Properties</h2>
        {propertiesPanel}
      </aside>
    </div>
  );
}
