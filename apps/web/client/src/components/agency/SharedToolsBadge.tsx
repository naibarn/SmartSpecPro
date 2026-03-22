/**
 * SharedToolsBadge — visual badge indicating a tool is shared across all agents.
 *
 * Rendered next to tool names in ToolPicker when the tool comes from
 * the agency_shared_tools table.
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Share2 } from "lucide-react";

interface SharedToolsBadgeProps {
  className?: string;
}

export function SharedToolsBadge({ className }: SharedToolsBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={`gap-0.5 px-1.5 py-0 text-[10px] font-normal bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 ${className ?? ""}`}
    >
      <Share2 className="h-2.5 w-2.5" />
      Shared
    </Badge>
  );
}
