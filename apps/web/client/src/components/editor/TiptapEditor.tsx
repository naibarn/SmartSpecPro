import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Placeholder } from "@tiptap/extension-placeholder";
import type { Editor, Extension } from "@tiptap/core";
import { FileText, GripHorizontal, Loader2, Search, X } from "lucide-react";
import { getDefaultExtensions } from "./TiptapMarkdownBridge";
import { handlePaste, transformPastedHTML } from "./pasteHandlers";
import { handleDrop } from "./dropHandler";
import type { JSONContent } from "./types";
import type { TiptapEditorTemplate } from "./types";
import { createSlashCommandExtension } from "./slashCommandExtension";
import { createWikiLinkSuggestionExtension } from "./wikiLinkSuggestionExtension";
import { createTagSuggestionExtension } from "./tagSuggestionExtension";
import { createPropertyReferenceSuggestionExtension } from "./propertyReferenceSuggestionExtension";
import EditorFormattingBar from "./EditorFormattingBar";
import { getEditorTemplatePreset } from "./editorTemplates";
import MediaInsertMenu, { type MediaInsertAttrs } from "./MediaInsertMenu";
import { resolveWikiLinkTargetFromNote } from "@/lib/wikiLink";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConfirm } from "@/components/ui/confirm/ConfirmProvider";
import "./editor.css";

const KNOWLEDGE_LINK_PICKER_MIN_WIDTH = 420;
const KNOWLEDGE_LINK_PICKER_MIN_HEIGHT = 420;
const KNOWLEDGE_LINK_PICKER_DEFAULT_WIDTH = 760;
const KNOWLEDGE_LINK_PICKER_DEFAULT_HEIGHT = 680;
const KNOWLEDGE_LINK_PICKER_MARGIN = 16;
const KNOWLEDGE_LINK_PICKER_DRAG_THRESHOLD = 4;

type KnowledgeLinkPickerFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type KnowledgeLinkPickerInteraction =
  | {
      kind: "move";
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
      moved: boolean;
    }
  | {
      kind: "resize";
      pointerId: number;
      startX: number;
      startY: number;
      originWidth: number;
      originHeight: number;
      moved: boolean;
    };

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getDefaultKnowledgeLinkPickerFrame(
  viewportWidth = 1280,
  viewportHeight = 800,
): KnowledgeLinkPickerFrame {
  const width = Math.min(
    KNOWLEDGE_LINK_PICKER_DEFAULT_WIDTH,
    viewportWidth - KNOWLEDGE_LINK_PICKER_MARGIN * 2,
  );
  const height = Math.min(
    KNOWLEDGE_LINK_PICKER_DEFAULT_HEIGHT,
    viewportHeight - KNOWLEDGE_LINK_PICKER_MARGIN * 2,
  );

  return {
    x: Math.max(KNOWLEDGE_LINK_PICKER_MARGIN, Math.round((viewportWidth - width) / 2)),
    y: Math.max(KNOWLEDGE_LINK_PICKER_MARGIN, Math.round((viewportHeight - height) / 2)),
    width,
    height,
  };
}

function normalizeKnowledgeLinkPickerFrame(
  frame: KnowledgeLinkPickerFrame,
  viewportWidth: number,
  viewportHeight: number,
): KnowledgeLinkPickerFrame {
  const maxWidth = Math.max(
    KNOWLEDGE_LINK_PICKER_MIN_WIDTH,
    viewportWidth - KNOWLEDGE_LINK_PICKER_MARGIN * 2,
  );
  const maxHeight = Math.max(
    KNOWLEDGE_LINK_PICKER_MIN_HEIGHT,
    viewportHeight - KNOWLEDGE_LINK_PICKER_MARGIN * 2,
  );
  const width = clampNumber(
    frame.width,
    Math.min(KNOWLEDGE_LINK_PICKER_MIN_WIDTH, maxWidth),
    maxWidth,
  );
  const height = clampNumber(
    frame.height,
    Math.min(KNOWLEDGE_LINK_PICKER_MIN_HEIGHT, maxHeight),
    maxHeight,
  );

  return {
    x: clampNumber(
      frame.x,
      KNOWLEDGE_LINK_PICKER_MARGIN,
      Math.max(KNOWLEDGE_LINK_PICKER_MARGIN, viewportWidth - width - KNOWLEDGE_LINK_PICKER_MARGIN),
    ),
    y: clampNumber(
      frame.y,
      KNOWLEDGE_LINK_PICKER_MARGIN,
      Math.max(KNOWLEDGE_LINK_PICKER_MARGIN, viewportHeight - height - KNOWLEDGE_LINK_PICKER_MARGIN),
    ),
    width,
    height,
  };
}

interface TiptapEditorProps {
  content: JSONContent;
  editable: boolean;
  onUpdate?: (editor: Editor) => void;
  onInsertMedia?: (type: "image" | "video" | "audio") => void;
  onInsertFile?: () => void;
  placeholder?: string;
  className?: string;
  template?: TiptapEditorTemplate;
  headerActions?: ReactNode;
  uploadMetadata?: Record<string, unknown>;
  libraryScope?: "all" | "my_library" | "private_vault";
  viewZoom?: number;
  onOpenWikiLink?: (reference: string) => void;
}

export default function TiptapEditor({
  content,
  editable,
  onUpdate,
  onInsertMedia,
  onInsertFile,
  placeholder = "",
  className,
  template = "simple",
  headerActions,
  uploadMetadata,
  libraryScope = "all",
  viewZoom = 100,
  onOpenWikiLink,
}: TiptapEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const trpcUtils = trpc.useUtils();
  const { prompt } = useConfirm();
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [insertMenuType, setInsertMenuType] = useState<"image" | "video" | "audio" | "file">("image");
  const [knowledgeLinkPickerOpen, setKnowledgeLinkPickerOpen] = useState(false);
  const [knowledgeLinkSearch, setKnowledgeLinkSearch] = useState("");
  const [debouncedKnowledgeLinkSearch, setDebouncedKnowledgeLinkSearch] = useState("");
  const [knowledgeLinkPickerFrame, setKnowledgeLinkPickerFrame] =
    useState<KnowledgeLinkPickerFrame>(() => {
      if (typeof window === "undefined") {
        return getDefaultKnowledgeLinkPickerFrame();
      }
      return getDefaultKnowledgeLinkPickerFrame(window.innerWidth, window.innerHeight);
    });
  const knowledgeLinkPickerInteractionRef =
    useRef<KnowledgeLinkPickerInteraction | null>(null);
  const templateMode = template;
  const templatePreset = getEditorTemplatePreset(templateMode);
  const viewScale = !editable && templateMode === "page"
    ? Math.max(50, Math.min(200, viewZoom)) / 100
    : 1;
  const viewZoomStyle = viewScale !== 1
    ? {
        transform: `scale(${viewScale})`,
        transformOrigin: "top center",
        width: `${100 / viewScale}%`,
        marginInline: "auto",
      }
    : undefined;
  const openInsertMenu = useCallback((type: "image" | "video" | "audio" | "file") => {
    setInsertMenuType(type);
    setInsertMenuOpen(true);
  }, []);
  const insertMedia = onInsertMedia ?? openInsertMenu;
  const insertFile = onInsertFile ?? (() => openInsertMenu("file"));
  const wikiLinkItems = useCallback(async (query: string) => {
    try {
      const result = await trpcUtils.library.quickSwitchNotes.fetch({
        query: query.trim() || undefined,
        limit: 8,
      });

      return result.results.map((note) => {
        const target = resolveWikiLinkTargetFromNote({
          title: note.title,
          logicalPath: note.logicalPath,
        });

        return {
          id: String(note.libraryItemId),
          label: target.label,
          reference: target.reference,
          logicalPath: note.logicalPath,
          aliases: note.aliases ?? [],
          matchType: note.matchType,
          disambiguation: note.disambiguation,
        };
      });
    } catch (error) {
      console.error("[TiptapEditor] wiki link suggestions failed:", error);
      return [];
    }
  }, [trpcUtils]);
  const tagItems = useCallback(async (query: string) => {
    try {
      const result = await trpcUtils.library.listTagCatalog.fetch({
        query: query.trim() || undefined,
      });

      return result.tags.slice(0, 8).map((entry) => ({
        id: entry.tag,
        label: entry.tag,
        detail: `Used in ${entry.usageCount} note${entry.usageCount === 1 ? "" : "s"}`,
        meta: "tag",
      }));
    } catch (error) {
      console.error("[TiptapEditor] tag suggestions failed:", error);
      return [];
    }
  }, [trpcUtils]);
  const propertyReferenceItems = useCallback(async (query: string) => {
    try {
      const result = await trpcUtils.library.listPropertyCatalog.fetch({
        query: query.trim() || undefined,
      });

      return result.properties.slice(0, 8).map((entry) => ({
        id: entry.key,
        label: entry.key,
        detail: `Used in ${entry.usageCount} note${entry.usageCount === 1 ? "" : "s"}`,
        meta: entry.inferredType,
      }));
    } catch (error) {
      console.error("[TiptapEditor] property suggestions failed:", error);
      return [];
    }
  }, [trpcUtils]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKnowledgeLinkSearch(knowledgeLinkSearch.trim());
    }, 180);
    return () => window.clearTimeout(timer);
  }, [knowledgeLinkSearch]);
  useEffect(() => {
    if (!knowledgeLinkPickerOpen || typeof window === "undefined") {
      return;
    }

    setKnowledgeLinkPickerFrame(current =>
      normalizeKnowledgeLinkPickerFrame(
        current,
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }, [knowledgeLinkPickerOpen]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setKnowledgeLinkPickerFrame(current =>
        normalizeKnowledgeLinkPickerFrame(
          current,
          window.innerWidth,
          window.innerHeight,
        ),
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = knowledgeLinkPickerInteractionRef.current;
      if (!current || current.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - current.startX;
      const deltaY = event.clientY - current.startY;

      if (!current.moved) {
        if (Math.abs(deltaX) + Math.abs(deltaY) < KNOWLEDGE_LINK_PICKER_DRAG_THRESHOLD) {
          return;
        }
        current.moved = true;
      }

      event.preventDefault();

      setKnowledgeLinkPickerFrame(previous => {
        if (typeof window === "undefined") {
          return previous;
        }

        const nextFrame = current.kind === "move"
          ? {
              ...previous,
              x: current.originX + deltaX,
              y: current.originY + deltaY,
            }
          : {
              ...previous,
              width: current.originWidth + deltaX,
              height: current.originHeight + deltaY,
            };

        return normalizeKnowledgeLinkPickerFrame(
          nextFrame,
          window.innerWidth,
          window.innerHeight,
        );
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = knowledgeLinkPickerInteractionRef.current;
      if (!current || current.pointerId !== event.pointerId) {
        return;
      }
      knowledgeLinkPickerInteractionRef.current = null;
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);
  const knowledgeLinkQuery = trpc.library.quickSwitchNotes.useQuery(
    {
      query: debouncedKnowledgeLinkSearch || undefined,
      limit: 12,
    },
    {
      enabled: editable && knowledgeLinkPickerOpen,
      refetchOnWindowFocus: false,
    },
  );
  const extensions = useMemo(
    () => [
      ...getDefaultExtensions(),
      createSlashCommandExtension({
        onMediaInsert: insertMedia,
        onFileInsert: insertFile,
      }),
      createWikiLinkSuggestionExtension({
        getItems: wikiLinkItems,
      }),
      createTagSuggestionExtension({
        getItems: tagItems,
      }),
      createPropertyReferenceSuggestionExtension({
        getItems: propertyReferenceItems,
      }),
      Placeholder.configure({ placeholder }),
    ] as Extension[],
    [
      insertMedia,
      insertFile,
      placeholder,
      wikiLinkItems,
      tagItems,
      propertyReferenceItems,
    ],
  );

  const handleInsertAsset = useCallback((attrs: MediaInsertAttrs) => {
    const editor = editorRef.current;
    if (!editor) return;

    if (attrs.type === "image") {
      editor.chain().focus().setImage({
        src: attrs.src,
        alt: attrs.alt,
        assetId: attrs.assetId || null,
      }).run();
    } else if (attrs.type === "video") {
      editor.chain().focus().setVideo({
        src: attrs.src,
        poster: attrs.poster || null,
        caption: attrs.caption || null,
        assetId: attrs.assetId || null,
      }).run();
    } else if (attrs.type === "audio") {
      editor.chain().focus().setAudio({
        src: attrs.src,
        caption: attrs.caption || null,
        assetId: attrs.assetId || null,
      }).run();
    } else {
      editor.chain().focus().setAttachment({
        src: attrs.src,
        title: attrs.title,
        fileName: attrs.fileName,
        mimeType: attrs.mimeType,
        assetId: attrs.assetId,
        sizeBytes: attrs.sizeBytes || null,
      }).run();
    }

    // ProseMirror/Tiptap usually emits its own update transaction here, but we
    // also notify the parent explicitly so autosave state cannot miss media
    // insertions when a menu closes or focus shifts mid-transaction.
    onUpdate?.(editor);
    setInsertMenuOpen(false);
  }, [onUpdate]);

  const insertLink = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const url = await prompt({ title: "Enter URL", defaultValue: "https://" });
    if (!url) return;

    const href = url.trim();
    if (!href) return;

    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, [prompt]);

  const openKnowledgeLinkPicker = useCallback(() => {
    setKnowledgeLinkSearch("");
    setDebouncedKnowledgeLinkSearch("");
    if (typeof window !== "undefined") {
      setKnowledgeLinkPickerFrame(current =>
        normalizeKnowledgeLinkPickerFrame(
          current,
          window.innerWidth,
          window.innerHeight,
        ),
      );
    }
    setKnowledgeLinkPickerOpen(true);
  }, []);

  const insertKnowledgeLinkNote = useCallback((
    note: {
      title: string;
      logicalPath?: string | null;
    },
  ) => {
    const editor = editorRef.current;
    if (!editor) return;

    const target = resolveWikiLinkTargetFromNote(note);
    const selection = editor.state.selection;
    const selectedText = editor.state.doc
      .textBetween(selection.from, selection.to, " ")
      .trim();

    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "wikiLink",
          attrs: {
            reference: target.reference,
            label: selectedText || target.label,
          },
        },
        {
          type: "text",
          text: " ",
        },
      ])
      .run();

    onUpdate?.(editor);
    setKnowledgeLinkPickerOpen(false);
    setKnowledgeLinkSearch("");
    setDebouncedKnowledgeLinkSearch("");
  }, [onUpdate]);

  const beginKnowledgeLinkPickerMove = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    knowledgeLinkPickerInteractionRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: knowledgeLinkPickerFrame.x,
      originY: knowledgeLinkPickerFrame.y,
      moved: false,
    };
  }, [knowledgeLinkPickerFrame.x, knowledgeLinkPickerFrame.y]);

  const beginKnowledgeLinkPickerResize = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    knowledgeLinkPickerInteractionRef.current = {
      kind: "resize",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: knowledgeLinkPickerFrame.width,
      originHeight: knowledgeLinkPickerFrame.height,
      moved: false,
    };
  }, [knowledgeLinkPickerFrame.height, knowledgeLinkPickerFrame.width]);

  const editor = useEditor({
    extensions,
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onUpdate?.(ed);
    },
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Document editor",
      },
      handleClick: (_view, _pos, event) => {
        if (!onOpenWikiLink) {
          return false;
        }

        if (!(event.target instanceof Element)) {
          return false;
        }

        const wikiLinkElement = event.target.closest<HTMLElement>("[data-wikilink='true']");
        const reference = wikiLinkElement?.dataset.reference?.trim();
        if (!reference) {
          return false;
        }

        if (editable && !(event.metaKey || event.ctrlKey)) {
          return false;
        }

        event.preventDefault();
        onOpenWikiLink(reference);
        return true;
      },
      handlePaste: (view, event, slice) => {
        if (!editorRef.current) return false;
        return handlePaste(view, event, slice, editorRef.current, {
          uploadMetadata,
          onInserted: onUpdate,
        }) || false;
      },
      handleDrop: (view, event, slice, moved) => {
        if (!editorRef.current) return false;
        return (
          handleDrop(view, event, slice, moved, editorRef.current, {
            uploadMetadata,
            onInserted: onUpdate,
          }) || false
        );
      },
      transformPastedHTML: (html) => transformPastedHTML(html),
    },
  });

  // Keep ref in sync
  editorRef.current = editor;

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return (
    <div
      className={`tiptap-editor flex h-full min-h-0 flex-col${className ? ` ${className}` : ""}`}
      data-template={templateMode}
    >
      {editable ? (
        <div className={templatePreset.shellClassName}>
          <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2 sm:pb-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-900 sm:text-sm">
                {templatePreset.label} editor
              </div>
              <div className="hidden text-xs text-slate-500 sm:block">{templatePreset.description}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                  Type <span className="font-semibold">[[</span> to link notes
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Reuse <span className="font-semibold">#tag</span> and <span className="font-semibold">owner::</span>
                </span>
                <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[11px] text-slate-500">
                  {editable
                    ? "Ctrl/Cmd+Click opens note links while editing"
                    : "Tap a note link to jump across the vault"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {headerActions ? (
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {headerActions}
                </div>
              ) : null}
              <div className={`rounded-full px-2 py-0.5 text-[11px] font-medium sm:px-2.5 sm:py-1 sm:text-xs ${templatePreset.badgeClassName}`}>
                {templatePreset.badgeLabel}
              </div>
            </div>
          </div>
          <div className="pt-1.5 sm:pt-2">
            <EditorFormattingBar
              editor={editor}
              onInsertLink={insertLink}
              onInsertKnowledgeLink={openKnowledgeLinkPicker}
              onInsertMedia={insertMedia}
              onInsertFile={insertFile}
              collapseOnMobile
            />
          </div>
        </div>
      ) : null}

      {templatePreset.showBubbleMenu && editable && editor ? (
        <>
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor: bubbleEditor }: { editor: Editor }) =>
              !bubbleEditor.state.selection.empty && bubbleEditor.isEditable
            }
          >
            <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-xl shadow-slate-200/60 backdrop-blur">
              <EditorFormattingBar
                editor={editor}
                compact
                onInsertLink={insertLink}
                onInsertKnowledgeLink={openKnowledgeLinkPicker}
                onInsertMedia={insertMedia}
                onInsertFile={insertFile}
              />
            </div>
          </BubbleMenu>
        </>
      ) : null}

      {editable && (
        <MediaInsertMenu
          open={insertMenuOpen}
          onOpenChange={(open) => {
            setInsertMenuOpen(open);
            if (!open) {
              setInsertMenuType("image");
            }
          }}
          mediaType={insertMenuType}
          onInsert={handleInsertAsset}
          uploadMetadata={uploadMetadata}
          libraryScope={libraryScope}
        />
      )}

      {editable ? (
        <Dialog
          open={knowledgeLinkPickerOpen}
          onOpenChange={setKnowledgeLinkPickerOpen}
        >
          <DialogContent
            showCloseButton={false}
            className="fixed max-w-none gap-0 overflow-hidden rounded-3xl p-0"
            style={{
              left: knowledgeLinkPickerFrame.x,
              top: knowledgeLinkPickerFrame.y,
              width: knowledgeLinkPickerFrame.width,
              height: knowledgeLinkPickerFrame.height,
            }}
          >
            <div className="flex h-full min-h-0 flex-col bg-white">
              <div
                className="flex cursor-move items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"
                onPointerDown={beginKnowledgeLinkPickerMove}
                style={{ touchAction: "none" }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-slate-900">
                    <GripHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
                    <DialogTitle className="truncate text-xl">
                      Insert knowledge link
                    </DialogTitle>
                  </div>
                  <DialogDescription className="mt-1 leading-6">
                    Search markdown notes and insert a wiki link that feeds the
                    Virtual Graph.
                  </DialogDescription>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0 rounded-full"
                  onClick={() => setKnowledgeLinkPickerOpen(false)}
                  aria-label="Close knowledge link picker"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={knowledgeLinkSearch}
                  onChange={(event) => setKnowledgeLinkSearch(event.target.value)}
                  placeholder="Search note title, alias, or path..."
                  className="pl-9"
                  autoFocus
                />
              </div>
              <ScrollArea className="min-h-[180px] flex-1 rounded-2xl border border-slate-200 bg-slate-50/60">
                {knowledgeLinkQuery.isLoading ? (
                  <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching notes
                  </div>
                ) : knowledgeLinkQuery.data?.results.length ? (
                  <div className="space-y-2 p-2">
                    {knowledgeLinkQuery.data.results.map((note) => {
                      const target = resolveWikiLinkTargetFromNote({
                        title: note.title,
                        logicalPath: note.logicalPath,
                      });

                      return (
                        <button
                          key={note.libraryItemId}
                          type="button"
                          className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition-colors hover:border-sky-200 hover:bg-sky-50"
                          onClick={() => insertKnowledgeLinkNote(note)}
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                            <FileText className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">
                              {note.title}
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-xs text-slate-500">
                              [[{target.reference}
                              {target.label !== target.reference ? `|${target.label}` : ""}]]
                            </span>
                            {note.aliases?.length ? (
                              <span className="mt-2 flex flex-wrap gap-1">
                                {note.aliases.slice(0, 3).map((alias) => (
                                  <Badge
                                    key={`${note.libraryItemId}-${alias}`}
                                    variant="outline"
                                    className="rounded-full bg-white text-[10px]"
                                  >
                                    {alias}
                                  </Badge>
                                ))}
                              </span>
                            ) : null}
                          </span>
                          <Badge
                            variant="outline"
                            className="shrink-0 rounded-full bg-white text-[10px]"
                          >
                            {note.matchType.replace(/_/g, " ")}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-sm text-slate-500">
                    No markdown notes found. Try a title, alias, or logical path.
                  </div>
                )}
              </ScrollArea>
              <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
                Tip: selected text becomes the visible link label. The target
                still points to the selected note.
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setKnowledgeLinkPickerOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
              <div
                className="absolute bottom-0 right-0 h-7 w-7 cursor-nwse-resize rounded-tl-2xl bg-transparent"
                onPointerDown={beginKnowledgeLinkPickerResize}
                style={{ touchAction: "none" }}
                title="Resize knowledge link picker"
                aria-hidden="true"
              >
                <div className="absolute bottom-2 right-2 h-3.5 w-3.5 rounded-br-2xl border-r-2 border-b-2 border-sky-300" />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <div className={templatePreset.contentShellClassName}>
        <div className="flex h-full min-h-0 flex-col">
          <div className={`h-full min-h-0 overflow-auto ${templatePreset.contentInnerClassName}`}>
            <div className="min-h-full" style={viewZoomStyle}>
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { TiptapEditor };
export type { TiptapEditorProps };
