import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export interface MessageCostBadgeProps {
  messageId: number;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  creditsUsed?: string | number;
}

export function MessageCostBadge({
  messageId,
  model,
  inputTokens = 0,
  outputTokens = 0,
  creditsUsed,
}: MessageCostBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "domain_admin";

  const { data, isLoading } = trpc.chat.getMessageCost.useQuery(
    { messageId },
    { enabled: isExpanded }
  );

  const totalTokens = inputTokens + outputTokens;
  const credits = creditsUsed != null ? Number(creditsUsed) : 0;

  // Don't show badge if there's no useful data
  if (!model && totalTokens === 0 && credits === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground/70 transition-colors",
          "hover:text-muted-foreground hover:bg-muted/50",
          isExpanded && "bg-muted/50 text-muted-foreground"
        )}
      >
        <Zap className="h-3 w-3" />
        {model && <span>{model}</span>}
        {model && totalTokens > 0 && <span className="opacity-50">·</span>}
        {totalTokens > 0 && <span>{formatTokens(totalTokens)} tokens</span>}
        {totalTokens > 0 && credits > 0 && (
          <span className="opacity-50">·</span>
        )}
        {credits > 0 && <span>{credits} credits</span>}
        {isExpanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {isLoading && <p>Loading cost data...</p>}
          {data && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="opacity-70">Model</span>
              <span>{data.model}</span>
              {data.provider && (
                <>
                  <span className="opacity-70">Provider</span>
                  <span>{data.provider}</span>
                </>
              )}
              <span className="opacity-70">Input tokens</span>
              <span>{data.inputTokens.toLocaleString()}</span>
              <span className="opacity-70">Output tokens</span>
              <span>{data.outputTokens.toLocaleString()}</span>
              <span className="opacity-70">Credits</span>
              <span>{data.creditsUsed}</span>
              {isAdmin && data.costUsd != null && (
                <>
                  <span className="opacity-70">Cost</span>
                  <span>${data.costUsd.toFixed(6)}</span>
                </>
              )}
              <span className="opacity-70">Latency</span>
              <span>
                {data.responseTimeMs > 0
                  ? `${(data.responseTimeMs / 1000).toFixed(1)}s`
                  : "—"}
              </span>
              {data.wasFallback && data.fallbackFrom && (
                <>
                  <span className="opacity-70">Fallback from</span>
                  <span>{data.fallbackFrom}</span>
                </>
              )}
            </div>
          )}
          {!isLoading && !data && (
            <p className="opacity-70">No detailed cost data available</p>
          )}
        </div>
      )}
    </div>
  );
}
