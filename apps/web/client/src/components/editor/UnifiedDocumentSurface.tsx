import { useState, useRef, useCallback, useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { parse } from "./TiptapMarkdownBridge";
import TiptapEditor from "./TiptapEditor";
import SourceModePanel from "./SourceModePanel";
import { ConflictResolutionDialog } from "./ConflictResolutionDialog";
import { EDITOR_TEMPLATE_PRESETS } from "./editorTemplates";
import { Minus, Plus, Maximize2, Minimize2 } from "lucide-react";
import type {
  EditorMode,
  SaveStatus,
  JSONContent,
  TiptapEditorTemplate,
  UnifiedDocumentSurfaceProps,
} from "./types";

const AUTO_SAVE_DELAY = 4000;

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
  documentId,
  initialEditorTemplate = "page",
  surfaceHeaderActions,
  editorHeaderActions,
  editorUploadMetadata,
  editorLibraryScope = "all",
  onOpenWikiLink,
}: UnifiedDocumentSurfaceProps) {
  const [mode, setMode] = useState<EditorMode>("view");
  const [editorTemplate, setEditorTemplate] =
    useState<TiptapEditorTemplate>(initialEditorTemplate);
  const [tiptapContent, setTiptapContent] = useState<JSONContent>(() =>
    parse(initialContent),
  );
  const [sourceMarkdown, setSourceMarkdown] = useState(initialContent);
  const [dirty, setDirty] = useState(false);
  const [viewZoom, setViewZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const lastHydratedDocumentIdRef = useRef<number | null>(null);
  const lastHydratedContentRef = useRef<string | null>(null);
  const lastHydratedUpdatedAtRef = useRef<string | undefined>(undefined);
  const latestMarkdownRef = useRef(initialContent);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const currentDocumentId = documentId ?? null;
  const currentTemplateIsPage = editorTemplate === "page";
  const zoomStep = 10;
  const minZoom = 80;
  const maxZoom = 140;

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(document.fullscreenElement === surfaceRef.current);
    };
    handler();
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Reset content when the active document or source snapshot changes.
  useEffect(() => {
    if (isSaving) {
      return;
    }

    const documentChanged = currentDocumentId !== lastHydratedDocumentIdRef.current;
    const snapshotChanged =
      initialContent !== lastHydratedContentRef.current ||
      updatedAt !== lastHydratedUpdatedAtRef.current;

    if (!documentChanged && !snapshotChanged) {
      return;
    }

    const localMarkdownMatchesHydrated =
      latestMarkdownRef.current === lastHydratedContentRef.current;

    // If we have a dirty flag but the live markdown still matches the last
    // hydrated snapshot, this is usually a bootstrap/update race rather than a
    // real user edit. In that case we still want late-arriving server content
    // to hydrate the editor instead of leaving the surface blank.
    if (!documentChanged && dirty && !localMarkdownMatchesHydrated) {
      return;
    }

    if (!documentChanged && initialContent === latestMarkdownRef.current) {
      lastHydratedDocumentIdRef.current = currentDocumentId;
      lastHydratedContentRef.current = initialContent;
      lastHydratedUpdatedAtRef.current = updatedAt;
      return;
    }

    const parsed = parse(initialContent);
    setTiptapContent(parsed);
    const editor = editorRef.current;
    if (editor) {
      const selection = editor.isEditable
        ? {
            from: editor.state.selection.from,
            to: editor.state.selection.to,
          }
        : null;
      // Push the new document into the live Tiptap instance. If we're
      // re-hydrating the same markdown after an autosave, preserve the cursor
      // so the user can keep typing without interruption.
      editor.commands.setContent(parsed);
      if (selection) {
        editor.commands.setTextSelection(selection);
      }
    }
    setSourceMarkdown(initialContent);
    latestMarkdownRef.current = initialContent;
    setDirty(false);
    lastHydratedDocumentIdRef.current = currentDocumentId;
    lastHydratedContentRef.current = initialContent;
    lastHydratedUpdatedAtRef.current = updatedAt;
  }, [currentDocumentId, dirty, initialContent, isSaving, updatedAt]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Check serialization integrity on initial load (lazy import to avoid circular dep)
  const [serializationWarning, setSerializationWarning] = useState<
    string | null
  >(null);
  useEffect(() => {
    import("./serialization-guard").then(({ checkSerializationIntegrity }) => {
      const result = checkSerializationIntegrity(tiptapContent);
      if (!result.ok && result.warning) {
        setSerializationWarning(result.warning);
        console.warn(
          "[Editor] Serialization integrity warning:",
          result.warning,
        );
      }
    });
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
      // Ignore transactions that merely re-apply the same markdown we already
      // know about.  Tiptap can emit `onUpdate` for programmatic setContent
      // calls during hydrate/switching modes, and we must not treat those as
      // user edits or we'll lock the draft into a dirty state before the real
      // server content arrives.
      if (md === latestMarkdownRef.current) {
        return;
      }
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

  const decreaseViewZoom = useCallback(() => {
    setViewZoom((prev) => Math.max(minZoom, prev - zoomStep));
  }, []);

  const increaseViewZoom = useCallback(() => {
    setViewZoom((prev) => Math.min(maxZoom, prev + zoomStep));
  }, []);

  const resetViewZoom = useCallback(() => {
    setViewZoom(100);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = surfaceRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
      }
    } catch (error) {
      console.error("[UnifiedDocumentSurface] fullscreen toggle failed:", error);
    }
  }, []);

  return (
    <div ref={surfaceRef} className="unified-document-surface flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2 sm:gap-2">
        <button
          type="button"
          className={`rounded px-2 py-1 text-xs font-medium sm:text-sm ${mode === "view" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => switchMode("view")}
          data-testid="mode-view"
        >
          View
        </button>
        <button
          type="button"
          className={`rounded px-2 py-1 text-xs font-medium sm:text-sm ${mode === "edit" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => switchMode("edit")}
          data-testid="mode-edit"
        >
          Edit
        </button>
        <button
          type="button"
          className={`rounded px-2 py-1 text-xs font-medium sm:text-sm ${mode === "source" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => switchMode("source")}
          data-testid="mode-source"
        >
          Source
        </button>
        <div className="ml-0 inline-flex items-center rounded-full border border-border bg-muted/20 p-0.5 shadow-sm sm:ml-2">
          {(Object.values(EDITOR_TEMPLATE_PRESETS) as Array<
            (typeof EDITOR_TEMPLATE_PRESETS)[keyof typeof EDITOR_TEMPLATE_PRESETS]
          >).map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none transition-colors sm:px-3 ${editorTemplate === preset.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setEditorTemplate(preset.id)}
              data-testid={`template-${preset.id}`}
              aria-pressed={editorTemplate === preset.id}
              title={preset.description}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {surfaceHeaderActions ? (
          <div className="ml-0 flex shrink-0 items-center gap-1.5 whitespace-nowrap sm:ml-2">
            {surfaceHeaderActions}
          </div>
        ) : null}
        {mode === "view" && currentTemplateIsPage ? (
          <div className="ml-0 inline-flex items-center gap-1 rounded-full border border-border bg-background/80 p-1 shadow-sm sm:ml-2">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={decreaseViewZoom}
              aria-label="Zoom out"
              disabled={viewZoom <= minZoom}
              title="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="min-w-14 rounded-full px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
              onClick={resetViewZoom}
              title="Reset zoom"
            >
              {viewZoom}%
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={increaseViewZoom}
              aria-label="Zoom in"
              disabled={viewZoom >= maxZoom}
              title="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        ) : null}
        <span className="basis-full text-right text-xs text-muted-foreground sm:ml-auto sm:basis-auto sm:text-left" data-testid="save-status">
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
        className="flex-1 min-h-0 overflow-hidden"
        style={{ display: mode === "source" ? "none" : undefined }}
        onDoubleClick={handleDoubleClick}
      >
        <TiptapEditor
          content={tiptapContent}
          editable={mode === "edit"}
          onUpdate={handleTiptapUpdate}
          template={editorTemplate}
          headerActions={editorHeaderActions}
          uploadMetadata={editorUploadMetadata}
          libraryScope={editorLibraryScope}
          viewZoom={viewZoom}
          onOpenWikiLink={onOpenWikiLink}
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
