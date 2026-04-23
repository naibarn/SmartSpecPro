import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Placeholder } from "@tiptap/extension-placeholder";
import type { Editor, Extension } from "@tiptap/core";
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
import "./editor.css";

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
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [insertMenuType, setInsertMenuType] = useState<"image" | "video" | "audio" | "file">("image");
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

  const insertLink = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const url = window.prompt("Enter URL", "https://");
    if (!url) return;

    const href = url.trim();
    if (!href) return;

    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, []);

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
