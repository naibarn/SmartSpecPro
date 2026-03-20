import { useState, useRef, useCallback, useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { parse, serialize } from "./TiptapMarkdownBridge";
import { checkSerializationIntegrity } from "./serialization-guard";
import TiptapEditor from "./TiptapEditor";
import SourceModePanel from "./SourceModePanel";
import { ConflictResolutionDialog } from "./ConflictResolutionDialog";
import type {
  EditorMode,
  SaveStatus,
  JSONContent,
  UnifiedDocumentSurfaceProps,
} from "./types";

const AUTO_SAVE_DELAY = 2000;

export default function UnifiedDocumentSurface({
  initialContent,
  updatedAt,
  onContentChange,
  onSave,
  onSaveForce,
  onReloadContent,
  onEnterEditMode,
  isSaving,
  errorMessage,
  hasConflict = false,
  documentTitle,
}: UnifiedDocumentSurfaceProps) {
  const [mode, setMode] = useState<EditorMode>("view");
  const [tiptapContent, setTiptapContent] = useState<JSONContent>(() =>
    parse(initialContent),
  );
  const [sourceMarkdown, setSourceMarkdown] = useState(initialContent);
  const [dirty, setDirty] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastResetKeyRef = useRef(updatedAt);
  const latestMarkdownRef = useRef(initialContent);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Reset content on version restore (updatedAt change)
  useEffect(() => {
    if (updatedAt !== lastResetKeyRef.current) {
      const parsed = parse(initialContent);
      setTiptapContent(parsed);
      // Push new document into live Tiptap instance (it ignores content prop after mount)
      editorRef.current?.commands.setContent(parsed);
      setSourceMarkdown(initialContent);
      latestMarkdownRef.current = initialContent;
      setDirty(false);
      lastResetKeyRef.current = updatedAt;
    }
  }, [updatedAt, initialContent]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Check serialization integrity on initial load
  const [serializationWarning, setSerializationWarning] = useState<
    string | null
  >(null);
  useEffect(() => {
    const result = checkSerializationIntegrity(tiptapContent);
    if (!result.ok && result.warning) {
      setSerializationWarning(result.warning);
      console.warn("[Editor] Serialization integrity warning:", result.warning);
    }
    // Only run once on mount (initial content)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveStatus: SaveStatus = hasConflict
    ? "conflict"
    : isSaving
      ? "saving"
      : errorMessage
        ? "error"
        : dirty
          ? "dirty"
          : "clean";

  // NOTE: onSave is fire-and-forget — caller must set errorMessage on failure (S10)
  const doSave = useCallback(
    (md: string) => {
      onSave?.(md);
      setDirty(false);
    },
    [onSave],
  );

  const conflictRef = useRef(false);
  conflictRef.current = hasConflict;

  const scheduleSave = useCallback(
    (md: string) => {
      if (conflictRef.current) return; // Pause auto-save during conflict
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!conflictRef.current) doSave(md);
      }, AUTO_SAVE_DELAY);
    },
    [doSave],
  );

  const handleTiptapUpdate = useCallback(
    (editor: Editor) => {
      if (modeRef.current === "view") return;
      editorRef.current = editor;
      const md = (
        editor.storage as Record<string, any>
      ).markdown.getMarkdown() as string;
      latestMarkdownRef.current = md;
      setDirty(true);
      onContentChange?.(md);
      scheduleSave(md);
    },
    [onContentChange, scheduleSave],
  );

  const handleSourceChange = useCallback(
    (value: string) => {
      setSourceMarkdown(value);
      latestMarkdownRef.current = value;
      setDirty(true);
      onContentChange?.(value);
      scheduleSave(value);
    },
    [onContentChange, scheduleSave],
  );

  const immediateSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSave(latestMarkdownRef.current);
  }, [doSave]);

  const switchMode = useCallback(
    (newMode: EditorMode) => {
      if (newMode === mode) return;

      // Edit -> Source: serialize current content
      if (mode === "edit" && newMode === "source") {
        if (editorRef.current) {
          const md = (
            editorRef.current.storage as Record<string, any>
          ).markdown.getMarkdown() as string;
          setSourceMarkdown(md);
          latestMarkdownRef.current = md;
        }
      }

      // Source -> Edit: re-parse markdown
      if (mode === "source" && newMode === "edit") {
        const parsed = parse(sourceMarkdown);
        setTiptapContent(parsed);
      }

      // Switching to View triggers save if dirty
      if (newMode === "view" && dirty) {
        immediateSave();
      }

      if (newMode === "edit") {
        onEnterEditMode?.();
      }

      setMode(newMode);
    },
    [mode, dirty, sourceMarkdown, immediateSave, onEnterEditMode],
  );

  const handleDoubleClick = useCallback(() => {
    if (mode === "view") {
      switchMode("edit");
    }
  }, [mode, switchMode]);

  // Ctrl+S / Cmd+S and Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        immediateSave();
      }
      if (e.key === "Escape" && mode !== "view") {
        switchMode("view");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [immediateSave, mode, switchMode]);

  // Conflict resolution handlers — parent controls hasConflict prop
  const handleConflictOverwrite = useCallback(() => {
    // Re-save without expectedUpdatedAt (last-write-wins)
    onSaveForce?.(latestMarkdownRef.current);
    setDirty(false);
  }, [onSaveForce]);

  const handleConflictReload = useCallback(() => {
    setDirty(false);
    onReloadContent?.();
    // Content will be updated via initialContent/updatedAt prop changes
  }, [onReloadContent]);

  return (
    <div className="unified-document-surface flex flex-col h-full">
      {/* Minimal mode switcher — EditorToolbar replaces this in Section 04 */}
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <button
          type="button"
          className={`px-2 py-1 text-sm rounded ${mode === "view" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => switchMode("view")}
          data-testid="mode-view"
        >
          View
        </button>
        <button
          type="button"
          className={`px-2 py-1 text-sm rounded ${mode === "edit" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => switchMode("edit")}
          data-testid="mode-edit"
        >
          Edit
        </button>
        <button
          type="button"
          className={`px-2 py-1 text-sm rounded ${mode === "source" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => switchMode("source")}
          data-testid="mode-source"
        >
          Source
        </button>
        <span className="ml-auto text-xs text-muted-foreground" data-testid="save-status">
          {saveStatus === "conflict"
            ? "Conflict detected"
            : saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "dirty"
                ? "Unsaved changes"
                : saveStatus === "error"
                  ? "Error"
                  : saveStatus === "clean"
                    ? "Saved"
                    : ""}
        </span>
      </div>

      {errorMessage && (
        <div
          className="bg-destructive/10 text-destructive px-4 py-2 text-sm"
          data-testid="error-banner"
        >
          {errorMessage}
        </div>
      )}

      {serializationWarning && (
        <div
          className="bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200 px-4 py-2 text-sm flex items-center justify-between"
          data-testid="serialization-warning"
        >
          <span>{serializationWarning}</span>
          <button
            type="button"
            className="ml-2 text-xs underline hover:no-underline"
            onClick={() => setSerializationWarning(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className="flex-1 overflow-auto"
        style={{ display: mode === "source" ? "none" : undefined }}
        onDoubleClick={handleDoubleClick}
      >
        <TiptapEditor
          content={tiptapContent}
          editable={mode === "edit"}
          onUpdate={handleTiptapUpdate}
        />
      </div>

      <SourceModePanel
        value={sourceMarkdown}
        onChange={handleSourceChange}
        visible={mode === "source"}
      />

      {hasConflict && (
        <ConflictResolutionDialog
          open={true}
          documentTitle={documentTitle}
          onOverwrite={handleConflictOverwrite}
          onReload={handleConflictReload}
        />
      )}
    </div>
  );
}

export { UnifiedDocumentSurface };
export type { UnifiedDocumentSurfaceProps };
