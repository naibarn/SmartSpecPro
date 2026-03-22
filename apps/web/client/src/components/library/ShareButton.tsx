import React from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ShareButtonProps {
  shareCount: number;
  onOpenDialog: () => void;
  compact?: boolean;
}

export function ShareButton({
  shareCount,
  onOpenDialog,
  compact = false,
}: ShareButtonProps) {
  const label =
    shareCount > 0
      ? `Share file (${shareCount} shares)`
      : "Share file";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={compact
            ? "relative h-8 w-8 rounded-full p-0"
            : "relative gap-1.5 px-2 sm:px-3"}
          onClick={onOpenDialog}
          aria-label={label}
        >
          <Share2 className="h-4 w-4" />
          {compact ? null : <span className="hidden sm:inline">Share</span>}
          {shareCount > 0 ? (
            compact ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-semibold text-white">
                {shareCount}
              </span>
            ) : (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white sm:ml-1">
                {shareCount}
              </span>
            )
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
