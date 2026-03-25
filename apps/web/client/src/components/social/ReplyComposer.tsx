import { useMemo, useState } from "react";
import { Loader2, Send, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DraftResult } from "@/types/social";

interface ReplyComposerProps {
  onSend: (body: string) => Promise<void> | void;
  onGenerateDraft: () => Promise<DraftResult>;
  isSending: boolean;
  disabled?: boolean;
}

export function ReplyComposer({
  onSend,
  onGenerateDraft,
  isSending,
  disabled = false,
}: ReplyComposerProps) {
  const [body, setBody] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftConfidence, setDraftConfidence] = useState<number | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const rows = useMemo(() => {
    const lineCount = body.split(/\r?\n/).length;
    return Math.min(Math.max(lineCount, 2), 6);
  }, [body]);

  const canSend = body.trim().length > 0 && !isSending && !disabled;

  const handleSend = async () => {
    if (!canSend) return;
    try {
      await onSend(body.trim());
      setBody("");
      setDraftConfidence(null);
      setDraftNotice(null);
    } catch {
      // Parent handler already owns user-facing error reporting.
    }
  };

  const handleGenerateDraft = async () => {
    if (disabled || isDrafting) return;
    setIsDrafting(true);
    try {
      const result = await onGenerateDraft();
      if (result.autoSent) {
        setBody("");
        setDraftNotice("Sent automatically");
      } else {
        setBody(result.draft ?? "");
        setDraftNotice(result.approvalId ? "Waiting for approval" : null);
      }
      setDraftConfidence(Number.isFinite(result.confidence) ? result.confidence : null);
    } catch {
      // Parent handler already owns user-facing error reporting.
    } finally {
      setIsDrafting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
          onClick={() => void handleGenerateDraft()}
          disabled={disabled || isSending || isDrafting}
          aria-label="Generate AI draft reply"
        >
            {isDrafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            AI Draft
          </Button>
          {draftConfidence !== null ? (
            <Badge className="rounded-full bg-violet-100 text-violet-700 hover:bg-violet-100">
              {Math.round(draftConfidence * 100)}% confident
            </Badge>
          ) : null}
          {draftNotice ? (
            <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
              {draftNotice}
            </Badge>
          ) : null}
        </div>
        <span className="text-xs text-slate-500">Ctrl+Enter to send</span>
      </div>

      <div className="space-y-2">
        <Textarea
          aria-label="Reply message"
          value={body}
          rows={rows}
          onChange={(event) => {
            setBody(event.target.value);
            setDraftConfidence(null);
            setDraftNotice(null);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Write a reply..."
          className={cn("min-h-[92px] resize-none rounded-2xl border-slate-200 bg-slate-50/60")}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          aria-label="Send reply"
          className="gap-2"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </Button>
      </div>
    </div>
  );
}
