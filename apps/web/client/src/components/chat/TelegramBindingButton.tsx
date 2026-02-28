import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TelegramBindingButtonProps {
  conversationId: string;
  conversationType: "chat" | "agency";
  compact?: boolean;
}

export function TelegramBindingButton({
  conversationId,
  conversationType,
  compact = true,
}: TelegramBindingButtonProps) {
  const [open, setOpen] = useState(false);
  const [syncMode, setSyncMode] = useState<"two_way" | "notify_only">("two_way");

  const telegramStatus = trpc.telegram.checkTelegramStatus.useQuery(undefined, {
    staleTime: 30_000,
  });

  const channelStatus = trpc.telegram.getConversationChannelStatus.useQuery(
    { conversationId, conversationType },
    { enabled: !!conversationId && telegramStatus.data?.linked === true },
  );

  const bindMutation = trpc.telegram.bindConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation connected to Telegram");
      channelStatus.refetch();
      setOpen(false);
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("This conversation is already bound to Telegram");
      } else {
        toast.error(err.message);
      }
    },
  });

  const unbindMutation = trpc.telegram.unbindConversation.useMutation({
    onSuccess: () => {
      toast.success("Telegram disconnected from conversation");
      channelStatus.refetch();
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const isLinked = telegramStatus.data?.linked === true;
  const isBound = channelStatus.data?.bound === true;
  const isPending = bindMutation.isPending || unbindMutation.isPending;

  // Loading state — show skeleton
  if (telegramStatus.isLoading) {
    return (
      <Button variant="ghost" size="sm" className="h-8" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin opacity-40" />
      </Button>
    );
  }

  // Query error — show disabled button with error tooltip
  if (telegramStatus.isError || channelStatus.isError) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8" disabled>
              <Send className="h-3.5 w-3.5 opacity-40" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Failed to load Telegram status</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Not linked — show disabled button with tooltip
  if (!isLinked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8" disabled>
              <Send className="h-3.5 w-3.5 opacity-40" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Link Telegram in Settings first</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant={isBound ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 gap-1",
                  isBound && "bg-blue-500 hover:bg-blue-600 text-white",
                )}
              >
                <Send className="h-3.5 w-3.5" />
                {!compact && (
                  <span className="text-xs">
                    {isBound ? "Telegram" : "Bind Telegram"}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isBound ? "Telegram bridge active" : "Bind to Telegram"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent className="w-64 max-w-[calc(100vw-2rem)] p-3" align="end">
        {isBound ? (
          // ── Bound state: show status + unbind ──
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                Active
              </Badge>
              <span className="text-xs text-muted-foreground">
                {channelStatus.data?.bound && channelStatus.data.syncMode === "two_way"
                  ? "Two-way sync"
                  : "Notify only"}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-red-600 border-red-200 hover:bg-red-50"
              onClick={() =>
                unbindMutation.mutate({ conversationId, conversationType })
              }
              disabled={isPending}
            >
              {unbindMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              Unbind Telegram
            </Button>
          </div>
        ) : (
          // ── Unbound state: sync mode picker + bind ──
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Sync Mode
              </label>
              <select
                value={syncMode}
                onChange={(e) =>
                  setSyncMode(e.target.value as "two_way" | "notify_only")
                }
                className="w-full text-sm border rounded-md px-2 py-1.5"
              >
                <option value="two_way">Two-way (send & receive)</option>
                <option value="notify_only">Notify only (receive)</option>
              </select>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() =>
                bindMutation.mutate({
                  conversationId,
                  conversationType,
                  syncMode,
                })
              }
              disabled={isPending}
            >
              {bindMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              Bind to Telegram
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
