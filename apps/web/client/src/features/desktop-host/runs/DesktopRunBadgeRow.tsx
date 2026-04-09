import type { DesktopRunLabels } from "@shared/desktopHost";

import { formatDesktopRunLabels } from "../labels";

export function DesktopRunBadgeRow({ labels }: { labels: DesktopRunLabels }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="desktop-run-badge-row">
      {formatDesktopRunLabels(labels).map((label) => (
        <span
          key={label}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
        >
          {label}
        </span>
      ))}
    </div>
  );
}
