import { useState } from "react";
import { Hash, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import CodeMirrorEditor, { getLanguageName, useLineNumbersToggle } from "./CodeMirrorEditor";

interface CodeFileEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  fileExtension?: string;
  disabled?: boolean;
  readOnly?: boolean;
  isSaving?: boolean;
  updatedAt?: string;
  errorMessage?: string;
  fullHeight?: boolean;
  showToolbar?: boolean;
}

/**
 * Code file editor with syntax highlighting for multiple languages
 * Supports: JavaScript, TypeScript, Python, PHP, HTML, CSS, JSON, XML, SQL, YAML, and more
 */
export default function CodeFileEditor({
  value,
  onChange,
  onSave,
  fileExtension,
  disabled = false,
  readOnly = false,
  isSaving = false,
  updatedAt,
  errorMessage,
  fullHeight = true,
  showToolbar = true,
}: CodeFileEditorProps) {
  const { showLineNumbers, toggleLineNumbers } = useLineNumbersToggle(true);
  const languageName = getLanguageName(fileExtension);
  const isEditable = !disabled && !readOnly && Boolean(onChange);

  return (
    <div className="space-y-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">
              {updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleString()}` : `${languageName} file`}
            </div>
            <div className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
              {languageName}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant={showLineNumbers ? "default" : "outline"}
              className="h-9 w-9"
              title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
              onClick={toggleLineNumbers}
            >
              <Hash className="h-4 w-4" />
            </Button>
            {isEditable && onSave && (
              <Button
                size="sm"
                onClick={onSave}
                disabled={disabled || isSaving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <CodeMirrorEditor
        value={value}
        onChange={onChange || (() => {})}
        fileExtension={fileExtension}
        showLineNumbers={showLineNumbers}
        height={fullHeight ? "70vh" : "auto"}
        minHeight={fullHeight ? "70vh" : "320px"}
        placeholder={`Edit ${languageName} file...`}
        disabled={disabled || readOnly || !isEditable}
      />

      {readOnly && (
        <div className="text-xs text-muted-foreground italic">
          This file is read-only. You cannot edit its contents.
        </div>
      )}
    </div>
  );
}
