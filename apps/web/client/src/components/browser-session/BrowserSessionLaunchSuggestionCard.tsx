import { ExternalLink, X } from "lucide-react";

import type { BrowserSessionLaunchSuggestion } from "@/lib/browserSessionInvocation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BrowserSessionLaunchSuggestionCardProps {
  suggestion: BrowserSessionLaunchSuggestion;
  onConfirm: (suggestion: BrowserSessionLaunchSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

export function BrowserSessionLaunchSuggestionCard({
  suggestion,
  onConfirm,
  onDismiss,
}: BrowserSessionLaunchSuggestionCardProps) {
  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/80 p-4 text-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{suggestion.title}</p>
            <Badge variant="outline" className="border-cyan-300 bg-white text-cyan-800">
              Suggested
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-700">{suggestion.description}</p>
          <p className="mt-2 text-xs text-slate-500">{suggestion.launchReason}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-slate-500 hover:text-slate-900"
          onClick={() => onDismiss(suggestion.suggestionId)}
          aria-label="Dismiss browser suggestion"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="sm"
          className="gap-2 bg-cyan-700 text-white hover:bg-cyan-800"
          onClick={() => onConfirm(suggestion)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {suggestion.confirmLabel}
        </Button>
      </div>
    </div>
  );
}
