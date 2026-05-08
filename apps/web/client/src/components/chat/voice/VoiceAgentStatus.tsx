import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function VoiceAgentStatus({
  status,
  mode,
  error,
}: {
  status: string;
  mode?: string;
  error?: string | null;
}) {
  const active = status === "connected" || status === "active";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Badge
        variant="outline"
        className={cn(
          "h-6 shrink-0 px-2 text-[11px]",
          active && "border-emerald-300 bg-emerald-50 text-emerald-700",
          error && "border-red-300 bg-red-50 text-red-700",
        )}
      >
        {error ? "Error" : active ? mode ?? "Active" : status}
      </Badge>
      {error ? <span className="truncate text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
