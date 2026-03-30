import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CopyLinkButtonProps {
  shareUrl: string;
  compact?: boolean;
}

export function CopyLinkButton({
  shareUrl,
  compact = false,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCopied(false);
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, [shareUrl]);

  const label = copied ? "Link copied" : "Copy link";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("[CopyLinkButton] copy failed:", error);
      toast.error("Failed to copy link");
    }
  }

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
          onClick={() => void handleCopy()}
          aria-label={label}
          title={label}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {compact ? null : <span className="hidden sm:inline">{copied ? "Copied" : "Copy Link"}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default CopyLinkButton;
