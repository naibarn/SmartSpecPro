/**
 * SharedInstructionsPanel — textarea for agency-level shared instructions.
 *
 * Displayed in the agency settings sidebar (not per-agent).
 * Text is prepended to every agent's system prompt at runtime.
 */

import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BookOpen } from "lucide-react";

interface SharedInstructionsPanelProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

export function SharedInstructionsPanel({
  value,
  onChange,
  maxLength = 50000,
}: SharedInstructionsPanelProps) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        Shared Instructions
      </Label>
      <p className="text-[11px] text-muted-foreground">
        Instructions prepended to every agent in this agency.
      </p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter shared instructions for all agents..."
        className="min-h-[100px] text-xs resize-y"
        maxLength={maxLength}
      />
      <span className="text-[10px] text-muted-foreground">
        {value.length}/{maxLength}
      </span>
    </div>
  );
}
