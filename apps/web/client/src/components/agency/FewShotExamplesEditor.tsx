/**
 * FewShotExamplesEditor — editor for per-agent example conversation pairs.
 *
 * Each example is a user/assistant message pair. Max 10 pairs per agent.
 * Embedded in the agent property panel.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, MessageSquare } from "lucide-react";

export interface ExamplePair {
  role: "user" | "assistant";
  content: string;
}

interface FewShotExamplesEditorProps {
  examples: ExamplePair[][];
  onChange: (examples: ExamplePair[][]) => void;
  maxPairs?: number;
  maxContentLength?: number;
}

export function FewShotExamplesEditor({
  examples,
  onChange,
  maxPairs = 10,
  maxContentLength = 2000,
}: FewShotExamplesEditorProps) {
  const addPair = () => {
    if (examples.length >= maxPairs) return;
    onChange([
      ...examples,
      [
        { role: "user", content: "" },
        { role: "assistant", content: "" },
      ],
    ]);
  };

  const removePair = (index: number) => {
    onChange(examples.filter((_, i) => i !== index));
  };

  const updateMessage = (
    pairIndex: number,
    msgIndex: number,
    content: string,
  ) => {
    const updated = examples.map((pair, pi) =>
      pi === pairIndex
        ? pair.map((msg, mi) =>
            mi === msgIndex ? { ...msg, content } : msg,
          )
        : pair,
    );
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          Few-Shot Examples ({examples.length}/{maxPairs})
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addPair}
          disabled={examples.length >= maxPairs}
          className="h-6 px-2 text-xs"
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>

      {examples.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No examples yet. Add example conversations to guide the agent's behavior.
        </p>
      )}

      {examples.map((pair, pairIdx) => (
        <div
          key={pairIdx}
          className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Example {pairIdx + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removePair(pairIdx)}
              className="h-5 w-5 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {pair.map((msg, msgIdx) => (
            <div key={msgIdx}>
              <Label className="text-xs text-muted-foreground capitalize">
                {msg.role}
              </Label>
              <Textarea
                value={msg.content}
                onChange={(e) =>
                  updateMessage(pairIdx, msgIdx, e.target.value)
                }
                placeholder={
                  msg.role === "user"
                    ? "User message..."
                    : "Assistant response..."
                }
                className="mt-1 min-h-[60px] text-xs resize-none"
                maxLength={maxContentLength}
              />
              <span className="text-[10px] text-muted-foreground">
                {msg.content.length}/{maxContentLength}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
