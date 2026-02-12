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
}

export function ShareButton({
  shareCount,
  onOpenDialog,
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
          className="relative"
          onClick={onOpenDialog}
          aria-label={label}
        >
          <Share2 className="mr-1 h-4 w-4" />
          Share
          {shareCount > 0 ? (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">
              {shareCount}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
