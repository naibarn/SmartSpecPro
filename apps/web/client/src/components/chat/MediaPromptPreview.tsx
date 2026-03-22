/**
 * MediaPromptPreview — Shows a generated prompt preview and lets the user
 * confirm, edit, or cancel before executing a media-generate skill.
 *
 * Used when the intent router detects a media generation request (e.g., "สร้างภาพ").
 * The system first generates a structured prompt via LLM, then shows this preview
 * for user confirmation before executing the actual media generation.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Edit3, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MediaPromptPreviewProps {
  /** The generated prompt text */
  prompt: string;
  /** Skill name that will be used for generation */
  skillName: string;
  /** Skill category for display */
  skillCategory: string;
  /** Extracted media parameters (aspectRatio, style, etc.) */
  mediaParams?: Record<string, unknown>;
  /** Whether the confirm action is in progress */
  isExecuting?: boolean;
  /** Called when user confirms — proceed with media generation */
  onConfirm: (editedPrompt: string, params: Record<string, unknown>) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

export function MediaPromptPreview({
  prompt,
  skillName,
  skillCategory,
  mediaParams = {},
  isExecuting = false,
  onConfirm,
  onCancel,
}: MediaPromptPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(prompt);

  const handleConfirm = () => {
    onConfirm(isEditing ? editedPrompt : prompt, mediaParams);
  };

  const categoryLabel =
    skillCategory.includes("image") ? "Image" :
    skillCategory.includes("video") ? "Video" :
    skillCategory.includes("audio") ? "Audio" :
    "Media";

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30 p-4 space-y-3 max-w-xl">
      <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
        <Sparkles className="h-4 w-4" />
        <span>
          {categoryLabel} Prompt Preview — {skillName}
        </span>
      </div>

      {isEditing ? (
        <Textarea
          value={editedPrompt}
          onChange={(e) => setEditedPrompt(e.target.value)}
          className="min-h-[100px] text-sm"
          autoFocus
        />
      ) : (
        <div className="rounded-md bg-white dark:bg-gray-900 p-3 text-sm whitespace-pre-wrap border">
          {prompt}
        </div>
      )}

      {Object.keys(mediaParams).length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {Object.entries(mediaParams).map(([key, value]) => (
            <span key={key} className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
              {key}: {String(value)}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isExecuting}
          className={cn("gap-1.5")}
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" />
              Confirm & Generate
            </>
          )}
        </Button>

        {!isEditing && !isExecuting && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsEditing(true)}
            className="gap-1.5"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Edit Prompt
          </Button>
        )}

        {isEditing && !isExecuting && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIsEditing(false);
              setEditedPrompt(prompt);
            }}
          >
            Reset
          </Button>
        )}

        {!isExecuting && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="gap-1.5 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
