/**
 * ConversationStarterChips — suggestion chips shown before first user message.
 *
 * Displayed in the agency chat view. On click, populates the chat input.
 * Hidden after the first message is sent.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface ConversationStarterChipsProps {
  starters: string[];
  onSelect: (text: string) => void;
  visible?: boolean;
}

export function ConversationStarterChips({
  starters,
  onSelect,
  visible = true,
}: ConversationStarterChipsProps) {
  if (!visible || !starters.length) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      <span className="flex items-center gap-1 text-xs text-muted-foreground mb-1 w-full">
        <Sparkles className="h-3 w-3" />
        Try asking:
      </span>
      {starters.map((starter, idx) => (
        <Button
          key={idx}
          variant="outline"
          size="sm"
          onClick={() => onSelect(starter)}
          className="h-auto rounded-full px-3 py-1.5 text-xs font-normal whitespace-normal text-left"
        >
          {starter}
        </Button>
      ))}
    </div>
  );
}
