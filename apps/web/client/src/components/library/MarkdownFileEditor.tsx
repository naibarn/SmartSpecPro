import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Bold,
  Code2,
  Edit3,
  Eye,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Import,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Quote,
  Redo2,
  Save,
  Underline,
  Undo2,
} from "lucide-react";

import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import CodeMirrorEditor, { useLineNumbersToggle, type CodeMirrorEditorMethods } from "./CodeMirrorEditor";
import { MarkdownVersionHistory } from "./MarkdownVersionHistory";

interface MarkdownFileEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onVersionRestore?: () => void;
  disabled?: boolean;
  isSaving?: boolean;
  updatedAt?: string;
  errorMessage?: string;
  fullHeight?: boolean;
  editorOnly?: boolean;
  documentId?: number;
}

export default function MarkdownFileEditor({
  value,
  onChange,
  onSave,
  onVersionRestore,
  disabled,
  isSaving,
  updatedAt,
  errorMessage,
  fullHeight,
  editorOnly,
  documentId,
}: MarkdownFileEditorProps) {
  const editorRef = useRef<CodeMirrorEditorMethods | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [debouncedImageQuery, setDebouncedImageQuery] = useState("");
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // Start in view mode
  const { showLineNumbers, toggleLineNumbers } = useLineNumbersToggle(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedImageQuery(imageSearchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [imageSearchQuery]);

  const imageSearchInput = useMemo(() => ({
    query: debouncedImageQuery || undefined,
    limit: 50,
    offset: 0,
    scope: "all" as const,
    filters: { itemType: "image" },
  }), [debouncedImageQuery]);

  const { data: imageSearchData, isLoading: imageSearchLoading } =
    trpc.library.listDocuments.useQuery(imageSearchInput, {
      enabled: imagePickerOpen,
    });

  const availableImages = useMemo(() => {
    return (imageSearchData?.results || [])
      .filter((item: any) => Boolean(item.source_url))
      .map((item: any) => ({
        id: item.id as number,
        title: item.title as string,
        source_url: item.source_url as string | null,
        thumbnail_url: (item.thumbnail_url ?? item.source_url) as string | null,
      }));
  }, [imageSearchData]);

  function wrapSelection(prefix: string, suffix: string, fallbackText: string) {
    if (!editorRef.current) return;
    editorRef.current.wrapSelection(prefix, suffix, fallbackText);
  }

  function prefixLines(prefix: string, fallbackText: string) {
    if (!editorRef.current) return;
    const selectedText = editorRef.current.getSelection() || fallbackText;
    const prefixed = selectedText
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
    editorRef.current.replaceSelection(prefixed);
  }

  function insertHeading(level: 1 | 2 | 3 | 4) {
    const prefix = `${"#".repeat(level)} `;
    prefixLines(prefix, "Heading");
  }

  function clearInlineFormatting() {
    if (!editorRef.current) return;
    const selectedText = editorRef.current.getSelection() || "";
    const cleared = selectedText
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/<u>(.*?)<\/u>/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
    editorRef.current.replaceSelection(cleared);
  }

  function insertLink() {
    if (!editorRef.current) return;
    const url = window.prompt("Enter URL", "https://");
    if (!url) return;

    const linkText = editorRef.current.getSelection() || "link text";
    const markdown = `[${linkText}](${url.trim()})`;
    editorRef.current.replaceSelection(markdown);
  }

  function insertImageFromLibrary(image: { title: string; source_url: string | null }) {
    if (!image.source_url || !editorRef.current) return;

    const alt = image.title.trim() || "image";
    const markdown = `![${alt}](${image.source_url})`;
    editorRef.current.insertText(markdown);
    setImagePickerOpen(false);
  }

  function handleUndo() {
    editorRef.current?.undo();
  }

  function handleRedo() {
    editorRef.current?.redo();
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const text = await file.text();
    if (!text && !value) {
      onChange("");
      return;
    }

    if (value.trim().length > 0) {
      const shouldReplace = window.confirm("Replace current markdown content with imported file?");
      if (!shouldReplace) return;
    }

    onChange(text);
  }

  function toggleEditorCollapsed() {
    setEditorCollapsed((prev) => {
      const next = !prev;
      if (next && previewCollapsed) {
        setPreviewCollapsed(false);
      }
      return next;
    });
  }

  function togglePreviewCollapsed() {
    setPreviewCollapsed((prev) => {
      const next = !prev;
      if (next && editorCollapsed) {
        setEditorCollapsed(false);
      }
      return next;
    });
  }

  const editorMinHeightClass = fullHeight ? "min-h-[70vh]" : "min-h-[320px]";
  const previewMinHeightClass = fullHeight ? "min-h-[70vh]" : "min-h-[320px]";

  if (editorOnly) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">
              {updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleString()}` : "Markdown file"}
            </div>
            {!isEditMode && (
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                View Mode
              </div>
            )}
            {isEditMode && (
              <div className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                Edit Mode
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={isEditMode ? "outline" : "default"}
              size="sm"
              onClick={() => setIsEditMode(!isEditMode)}
            >
              {isEditMode ? (
                <>
                  <Eye className="mr-1 h-4 w-4" />
                  View Mode
                </>
              ) : (
                <>
                  <Edit3 className="mr-1 h-4 w-4" />
                  Edit Mode
                </>
              )}
            </Button>
            {isEditMode && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => importInputRef.current?.click()}
                >
                  <Import className="mr-1 h-4 w-4" />
                  Import .md/.txt
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={disabled || isSaving}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Save to Library"}
                </Button>
              </>
            )}
          </div>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept=".md,.markdown,.txt,text/plain,text/markdown"
          className="hidden"
          onChange={handleImportFile}
        />

        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {isEditMode ? (
          <>
            <div className="flex flex-wrap gap-2 rounded-md border bg-muted/20 p-2.5">
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Undo (Ctrl+Z)" onClick={handleUndo}><Undo2 className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Redo (Ctrl+Shift+Z)" onClick={handleRedo}><Redo2 className="h-5 w-5" /></Button>
              <div className="border-r" />
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Heading 1" onClick={() => insertHeading(1)}><Heading1 className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Heading 2" onClick={() => insertHeading(2)}><Heading2 className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Heading 3" onClick={() => insertHeading(3)}><Heading3 className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Heading 4" onClick={() => insertHeading(4)}><Heading4 className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Bold" onClick={() => wrapSelection("**", "**", "bold text")}><Bold className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Italic" onClick={() => wrapSelection("*", "*", "italic text")}><Italic className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Underline" onClick={() => wrapSelection("<u>", "</u>", "underline text")}><Underline className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Link" onClick={insertLink}><Link2 className="h-5 w-5" /></Button>
              <Button type="button" size="sm" variant="outline" className="h-10 px-3" onClick={clearInlineFormatting}>Normal</Button>
              <Popover open={imagePickerOpen} onOpenChange={(open) => { setImagePickerOpen(open); if (!open) setImageSearchQuery(""); }}>
                <PopoverTrigger asChild>
                  <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Insert image from library">
                    <ImagePlus className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[480px] p-2" align="start">
                  <div className="space-y-2">
                    <Input
                      placeholder="Search images in library..."
                      value={imageSearchQuery}
                      onChange={(event) => setImageSearchQuery(event.target.value)}
                    />
                    <ScrollArea className="h-[320px] rounded-md border">
                      {imageSearchLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : availableImages.length ? (
                        <div className="grid grid-cols-2 gap-2 p-2">
                          {availableImages.map((image) => (
                            <button
                              key={image.id}
                              type="button"
                              className="group relative overflow-hidden rounded-lg border bg-white transition-all hover:border-primary hover:shadow-md"
                              onClick={() => insertImageFromLibrary(image)}
                            >
                              {image.thumbnail_url ? (
                                <img
                                  src={image.thumbnail_url}
                                  alt={image.title}
                                  className="h-24 w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-24 w-full items-center justify-center bg-slate-100">
                                  <ImagePlus className="h-8 w-8 text-slate-400" />
                                </div>
                              )}
                              <div className="bg-gradient-to-t from-black/70 to-transparent p-1.5">
                                <div className="truncate text-xs font-medium text-white">
                                  {image.title}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                          {imageSearchQuery ? "No images found matching your search." : "No images in library."}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </PopoverContent>
              </Popover>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Bulleted list" onClick={() => prefixLines("- ", "list item")}><List className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Numbered list" onClick={() => prefixLines("1. ", "list item")}><ListOrdered className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Quote" onClick={() => prefixLines("> ", "quote")}><Quote className="h-5 w-5" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Inline code" onClick={() => wrapSelection("`", "`", "code")}><Code2 className="h-5 w-5" /></Button>
              <Button type="button" size="sm" variant="outline" className="h-10 px-3" onClick={() => wrapSelection("```text\n", "\n```", "code block")}>Code Block</Button>
              <div className="ml-auto flex items-center gap-2 border-l pl-2">
                <Button
                  type="button"
                  size="icon"
                  variant={showLineNumbers ? "default" : "outline"}
                  className="h-10 w-10"
                  title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
                  onClick={toggleLineNumbers}
                >
                  <Hash className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <CodeMirrorEditor
              ref={editorRef}
              value={value}
              onChange={onChange}
              fileExtension="md"
              showLineNumbers={showLineNumbers}
              height={fullHeight ? "70vh" : "auto"}
              minHeight={fullHeight ? "70vh" : "320px"}
              placeholder="Write markdown content..."
              disabled={disabled}
            />

            {documentId && (
              <MarkdownVersionHistory
                itemId={documentId}
                onRestore={onVersionRestore}
              />
            )}
          </>
        ) : (
          <div className={`${editorMinHeightClass} rounded-md border bg-gradient-to-br from-slate-50 via-white to-sky-50/30 p-6 shadow-inner`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-muted-foreground">Markdown Preview</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsEditMode(true)}
              >
                <Edit3 className="mr-1 h-4 w-4" />
                Edit
              </Button>
            </div>
            <ScrollArea className={`${editorMinHeightClass} pr-4`}>
              <SafeMarkdown className="md-preview prose max-w-none">
                {value || "_Empty markdown file_"}
              </SafeMarkdown>
            </ScrollArea>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleString()}` : "Markdown file"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => importInputRef.current?.click()}
          >
            <Import className="mr-1 h-4 w-4" />
            Import .md/.txt
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={disabled || isSaving}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save to Library"}
          </Button>
        </div>
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/plain,text/markdown"
        className="hidden"
        onChange={handleImportFile}
      />

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {!editorCollapsed ? (
        <div className="flex flex-wrap gap-2 rounded-md border bg-muted/20 p-2.5">
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Undo (Ctrl+Z)" onClick={handleUndo}><Undo2 className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Redo (Ctrl+Shift+Z)" onClick={handleRedo}><Redo2 className="h-5 w-5" /></Button>
          <div className="border-r" />
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Heading 1" onClick={() => insertHeading(1)}><Heading1 className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Heading 2" onClick={() => insertHeading(2)}><Heading2 className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Heading 3" onClick={() => insertHeading(3)}><Heading3 className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Heading 4" onClick={() => insertHeading(4)}><Heading4 className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Bold" onClick={() => wrapSelection("**", "**", "bold text")}><Bold className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Italic" onClick={() => wrapSelection("*", "*", "italic text")}><Italic className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Underline" onClick={() => wrapSelection("<u>", "</u>", "underline text")}><Underline className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Link" onClick={insertLink}><Link2 className="h-5 w-5" /></Button>
          <Button type="button" size="sm" variant="outline" className="h-10 px-3" onClick={clearInlineFormatting}>Normal</Button>
          <Popover open={imagePickerOpen} onOpenChange={(open) => { setImagePickerOpen(open); if (!open) setImageSearchQuery(""); }}>
            <PopoverTrigger asChild>
              <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Insert image from library">
                <ImagePlus className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[480px] p-2" align="start">
              <div className="space-y-2">
                <Input
                  placeholder="Search images in library..."
                  value={imageSearchQuery}
                  onChange={(event) => setImageSearchQuery(event.target.value)}
                />
                <ScrollArea className="h-[320px] rounded-md border">
                  {imageSearchLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : availableImages.length ? (
                    <div className="grid grid-cols-2 gap-2 p-2">
                      {availableImages.map((image) => (
                        <button
                          key={image.id}
                          type="button"
                          className="group relative overflow-hidden rounded-lg border bg-white transition-all hover:border-primary hover:shadow-md"
                          onClick={() => insertImageFromLibrary(image)}
                        >
                          {image.thumbnail_url ? (
                            <img
                              src={image.thumbnail_url}
                              alt={image.title}
                              className="h-24 w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-24 w-full items-center justify-center bg-slate-100">
                              <ImagePlus className="h-8 w-8 text-slate-400" />
                            </div>
                          )}
                          <div className="bg-gradient-to-t from-black/70 to-transparent p-1.5">
                            <div className="truncate text-xs font-medium text-white">
                              {image.title}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                      {imageSearchQuery ? "No images found matching your search." : "No images in library."}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </PopoverContent>
          </Popover>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Bulleted list" onClick={() => prefixLines("- ", "list item")}><List className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Numbered list" onClick={() => prefixLines("1. ", "list item")}><ListOrdered className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Quote" onClick={() => prefixLines("> ", "quote")}><Quote className="h-5 w-5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10" title="Inline code" onClick={() => wrapSelection("`", "`", "code")}><Code2 className="h-5 w-5" /></Button>
          <Button type="button" size="sm" variant="outline" className="h-10 px-3" onClick={() => wrapSelection("```text\n", "\n```", "code block")}>Code Block</Button>
          <div className="ml-auto flex items-center gap-2 border-l pl-2">
            <Button
              type="button"
              size="icon"
              variant={showLineNumbers ? "default" : "outline"}
              className="h-10 w-10"
              title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
              onClick={toggleLineNumbers}
            >
              <Hash className="h-5 w-5" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 md:hidden">
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={toggleEditorCollapsed}
            title={editorCollapsed ? "Show editor" : "Hide editor"}
          >
            {editorCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={togglePreviewCollapsed}
            title={previewCollapsed ? "Show preview" : "Hide preview"}
          >
            {previewCollapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
          </Button>
        </div>
        {!editorCollapsed ? (
          <CodeMirrorEditor
            ref={editorRef}
            value={value}
            onChange={onChange}
            fileExtension="md"
            showLineNumbers={showLineNumbers}
            height="auto"
            minHeight={fullHeight ? "70vh" : "320px"}
            placeholder="Write markdown content..."
            disabled={disabled}
          />
        ) : null}
        {!previewCollapsed ? (
          <div className={`${previewMinHeightClass} rounded-md border bg-background p-3`}>
            <div className="mb-2 text-xs text-muted-foreground">Preview</div>
            <SafeMarkdown className="md-preview">
              {value || "_Empty markdown file_"}
            </SafeMarkdown>
          </div>
        ) : null}
      </div>

      <div className="hidden items-stretch md:flex">
        {!editorCollapsed ? (
          <div className="relative min-w-0 flex-1">
            <CodeMirrorEditor
              ref={editorRef}
              value={value}
              onChange={onChange}
              fileExtension="md"
              showLineNumbers={showLineNumbers}
              height="auto"
              minHeight={fullHeight ? "70vh" : "320px"}
              placeholder="Write markdown content..."
              disabled={disabled}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute -right-3 top-1/2 z-10 h-10 w-6 -translate-y-1/2 rounded-full border bg-background shadow-sm hover:bg-primary/10"
              onClick={toggleEditorCollapsed}
              title="Hide editor"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggleEditorCollapsed}
            className={`mx-1 flex w-5 items-center justify-center rounded-md border bg-background transition-colors hover:bg-primary/10 ${
              fullHeight ? "min-h-[70vh]" : "min-h-[320px]"
            }`}
            title="Show editor"
          >
            <div className="h-8 w-1.5 rounded-full bg-border" />
          </button>
        )}

        {!previewCollapsed ? (
          <div className={`${previewMinHeightClass} relative min-w-0 flex-1 rounded-md border bg-background p-3`}>
            <div className="mb-2 text-xs text-muted-foreground">Preview</div>
            <SafeMarkdown className="md-preview">
              {value || "_Empty markdown file_"}
            </SafeMarkdown>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute -left-3 top-1/2 z-10 h-10 w-6 -translate-y-1/2 rounded-full border bg-background shadow-sm hover:bg-primary/10"
              onClick={togglePreviewCollapsed}
              title="Hide preview"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={togglePreviewCollapsed}
            className={`mx-1 flex w-5 items-center justify-center rounded-md border bg-background transition-colors hover:bg-primary/10 ${
              fullHeight ? "min-h-[70vh]" : "min-h-[320px]"
            }`}
            title="Show preview"
          >
            <div className="h-8 w-1.5 rounded-full bg-border" />
          </button>
        )}
      </div>
    </div>
  );
}
