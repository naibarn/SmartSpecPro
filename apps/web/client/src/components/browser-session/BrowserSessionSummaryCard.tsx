import type { ReactNode } from "react";
import { ExternalLink, MonitorPlay } from "lucide-react";

import type { BrowserSessionArtifact } from "@shared/browserSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BrowserSessionSummaryCardProps {
  artifact: BrowserSessionArtifact;
  onOpen: (artifact: BrowserSessionArtifact) => void;
  children?: ReactNode;
}

export function BrowserSessionSummaryCard({
  artifact,
  onOpen,
  children,
}: BrowserSessionSummaryCardProps) {
  const { summary } = artifact;

  return (
    <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50/80 p-4 text-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-cyan-700" />
            <p className="text-sm font-semibold">Browser Session</p>
            <Badge variant="outline" className="border-cyan-300 bg-white text-cyan-800">
              {summary.badgeLabel}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-700">{summary.statusLine}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{summary.sourceLabel}</span>
            {summary.pageTitle ? <span>{summary.pageTitle}</span> : null}
          </div>
          {summary.compactNotice ? (
            <p className="mt-2 text-xs text-slate-500">{summary.compactNotice}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0 gap-2 bg-cyan-700 text-white hover:bg-cyan-800"
          onClick={() => onOpen(artifact)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {summary.primaryActionLabel}
        </Button>
      </div>
      {children ? (
        <div className="mt-4 border-t border-cyan-200/80 pt-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
