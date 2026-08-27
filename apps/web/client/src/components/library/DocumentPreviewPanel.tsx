import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { DocumentLibraryItem, DocumentPreviewType } from "@/lib/documentManagementUi";
import { getLibraryItemProcessingMeta } from "@/lib/libraryUi";
import { getOfficePreviewDecision } from "@/lib/previewHostSafety";
import { trpc } from "@/lib/trpc";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { AlertTriangle, Check, Copy, Download, ExternalLink, ImagePlus, Loader2, Maximize2, Minimize2, Minus, Pencil, Plus, Upload, X } from "lucide-react";
// Heavy viewer components — lazy-loaded so they don't bloat the initial DocumentManagement chunk
// ROLLBACK: To revert to old editor, replace UnifiedDocumentSurface with:
// const MarkdownFileEditor = lazy(() => import("./MarkdownFileEditor"));
const UnifiedDocumentSurface = lazy(() => import("../editor/UnifiedDocumentSurface"));
const CodeViewer = lazy(() => import("./CodeViewer"));
const CSVViewer = lazy(() => import("./CSVViewer"));
const JSONViewer = lazy(() => import("./JSONViewer"));
const ExcelViewer = lazy(() => import("./ExcelViewer"));
import { DocumentVersionHistory } from "./DocumentVersionHistory";
import { CopyLinkButton } from "./CopyLinkButton";
import MarkdownExportActions from "./MarkdownExportActions";
import { ShareButton } from "./ShareButton";
import { ShareDialog } from "./ShareDialog";
import type { TiptapEditorTemplate } from "../editor/types";
import KnowledgeNoteHoverPreview from "./KnowledgeNoteHoverPreview";

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

interface DocumentPreviewPanelProps {
  item: DocumentLibraryItem | null;
  previewType: DocumentPreviewType;
  previewText?: string;
  markdownValue?: string;
  markdownUpdatedAt?: string;
  markdownError?: string;
  isMarkdownSaving?: boolean;
  isRenamingTitle?: boolean;
  documentId?: number;
  onMarkdownChange?: (value: string) => void;
  onMarkdownSave?: (value?: string) => void;
  onVersionRestore?: () => void;
  onEnterEditMode?: () => void;
  onRenameTitle?: (title: string) => Promise<void> | void;
  onReplaceFile?: (file: File, changeDescription?: string) => Promise<void>;
  isReplacingFile?: boolean;
  canAddToGallery?: boolean;
  onAddToGallery?: () => Promise<void> | void;
  isAddingToGallery?: boolean;
  initialEditorTemplate?: TiptapEditorTemplate;
  shareUrl?: string;
  onOpenWikiLink?: (reference: string) => void;
  knowledgeBacklinks?: Array<{
    libraryItemId: number | null;
    title: string | null;
    logicalPath: string | null;
    rawReference: string;
  }>;
  onOpenKnowledgeItem?: (itemId: number, title: string) => void;
}

export default function DocumentPreviewPanel({
  item,
  previewType,
  previewText,
  markdownValue,
  markdownUpdatedAt,
  markdownError,
  isMarkdownSaving,
  isRenamingTitle,
  documentId,
  onMarkdownChange,
  onMarkdownSave,
  onVersionRestore,
  onEnterEditMode,
  onRenameTitle,
  onReplaceFile,
  isReplacingFile,
  canAddToGallery = false,
  onAddToGallery,
  isAddingToGallery = false,
  initialEditorTemplate,
  shareUrl,
  onOpenWikiLink,
  knowledgeBacklinks = [],
  onOpenKnowledgeItem,
}: DocumentPreviewPanelProps) {
  const { t } = useScopedTranslation("common");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [previewLoadError, setPreviewLoadError] = useState<string | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [pendingReplaceFile, setPendingReplaceFile] = useState<File | null>(null);
  const [replaceDescription, setReplaceDescription] = useState("");
  const [previewZoom, setPreviewZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isPrivateVaultItem = Boolean(
    item?.metadata?.private_vault === true
    || item?.metadata?.privateVault === true
    || item?.metadata?.vault === true,
  );
  const editorUploadMetadata = isPrivateVaultItem ? { private_vault: true } : undefined;

  const { data: sharesData } = trpc.library.getItemShares.useQuery(
    { itemId: item?.id ?? 0 },
    { enabled: Boolean(item?.id) && !isPrivateVaultItem },
  );

  useEffect(() => {
    setTitleDraft(item?.title || "");
    setIsEditingTitle(false);
    setShareDialogOpen(false);
  }, [item?.id, item?.title]);

  // Reset replace dialog state when switching items
  useEffect(() => {
    setReplaceDialogOpen(false);
    setPendingReplaceFile(null);
    setReplaceDescription("");
  }, [item?.id]);

  useEffect(() => {
    setPreviewLoadError(null);
  }, [item?.id, item?.source_url, previewType]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current);
    };
    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const decreasePreviewZoom = useCallback(() => {
    setPreviewZoom((prev) => Math.max(80, prev - 10));
  }, []);

  const increasePreviewZoom = useCallback(() => {
    setPreviewZoom((prev) => Math.min(140, prev + 10));
  }, []);

  const resetPreviewZoom = useCallback(() => {
    setPreviewZoom(100);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = panelRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
      }
    } catch (error) {
      console.error("[DocumentPreviewPanel] fullscreen toggle failed:", error);
    }
  }, []);

  useEffect(() => {
    if (previewType !== "pdf" || !item?.source_url) {
      setPdfObjectUrl(null);
      setIsPdfLoading(false);
      return;
    }

    let revokedUrl: string | null = null;
    let cancelled = false;
    const controller = new AbortController();
    setIsPdfLoading(true);

    fetch(item.source_url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load PDF (${response.status})`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        revokedUrl = URL.createObjectURL(blob);
        setPdfObjectUrl(revokedUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setPdfObjectUrl(null);
        setPreviewLoadError("PDF preview could not be loaded. Try Download File.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsPdfLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [previewType, item?.id, item?.source_url]);

  if (!item) {
    return (
      <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
        Select a document to preview.
      </div>
    );
  }

  const sourceUrl = item.source_url;
  const processingMeta = getLibraryItemProcessingMeta({
    status: item.status,
    metadata: item.metadata,
  });
  const canRename = Boolean(onRenameTitle);
  const normalizedTitle = titleDraft.trim();
  const officePreviewDecision = previewType === "office" && sourceUrl
    ? getOfficePreviewDecision(sourceUrl, {
      origin: typeof window !== "undefined" ? window.location.origin : undefined,
    })
    : null;
  const officeViewerUrl = officePreviewDecision?.viewerUrl ?? null;
  const canUseOfficeViewer = Boolean(officePreviewDecision?.canEmbed && officeViewerUrl);
  const officeFallbackMessage = officePreviewDecision?.message
    || "Office preview is limited in this environment. Use Download File for full document access.";
  const isMarkdownPreview = previewType === "markdown";
  const isMediaPreview = previewType === "image" || previewType === "video" || previewType === "audio";
  const canZoomPreview = previewType === "pdf" || (previewType === "office" && Boolean(officeViewerUrl));
  const previewScale = Math.max(80, Math.min(140, previewZoom)) / 100;
  const previewZoomStyle = canZoomPreview && previewScale !== 1
    ? {
        transform: `scale(${previewScale})`,
        transformOrigin: "top center",
        width: `${100 / previewScale}%`,
        marginInline: "auto",
      }
    : undefined;
  const publicShareActions = (compact = false) => !isPrivateVaultItem ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <ShareButton
        shareCount={sharesData?.shares?.length ?? 0}
        onOpenDialog={() => setShareDialogOpen(true)}
        compact={compact}
      />
      {shareUrl ? <CopyLinkButton shareUrl={shareUrl} compact={compact} /> : null}
    </div>
  ) : null;
  const markdownSurfaceHeaderActions = isMarkdownPreview ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <MarkdownExportActions title={item.title} markdown={markdownValue || ""} />
      {publicShareActions(false)}
    </div>
  ) : null;
  const markdownEditorHeaderActions = isMarkdownPreview ? (
    <>
      {documentId ? (
        <DocumentVersionHistory
          itemId={documentId}
          onRestore={onVersionRestore}
          compact={isMediaPreview}
        />
      ) : null}
      {onReplaceFile ? (
        <Button
          size="sm"
          variant="outline"
          className={isMediaPreview ? "h-8 w-8 rounded-full p-0" : "gap-1.5 px-2 sm:px-3"}
          onClick={() => replaceFileInputRef.current?.click()}
          disabled={isReplacingFile}
          aria-label="Upload new version"
          title="Upload new version"
        >
          {isReplacingFile ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {isMediaPreview ? null : <span className="hidden sm:inline">Upload New Version</span>}
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <div ref={panelRef} className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-xl border bg-background/90 p-3 shadow-sm">
      <div className={`shrink-0 rounded-lg border bg-gradient-to-r from-slate-50 via-sky-50 to-cyan-50 ${isMarkdownPreview ? "p-2.5" : isMediaPreview ? "p-2.5" : "p-3"}`}>
        <div className={isMarkdownPreview ? "flex items-center justify-between gap-2" : "flex items-start justify-between gap-3"}>
          <div className={isMarkdownPreview ? "flex min-w-0 flex-1 items-center gap-2" : isMediaPreview ? "min-w-0 flex-1" : "min-w-0 flex-1"}>
            {isEditingTitle ? (
              <div className="space-y-2">
                <Input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  maxLength={255}
                  autoFocus
                  onKeyDown={async (event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (!canRename || !normalizedTitle || normalizedTitle === item.title) {
                        setIsEditingTitle(false);
                        return;
                      }
                      await onRenameTitle?.(normalizedTitle);
                      setIsEditingTitle(false);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setTitleDraft(item.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  placeholder="Document title"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      if (!canRename || !normalizedTitle || normalizedTitle === item.title) {
                        setIsEditingTitle(false);
                        return;
                      }
                      await onRenameTitle?.(normalizedTitle);
                      setIsEditingTitle(false);
                    }}
                    disabled={!normalizedTitle || isRenamingTitle}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTitleDraft(item.title);
                      setIsEditingTitle(false);
                    }}
                    disabled={isRenamingTitle}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : isMarkdownPreview ? (
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-base font-semibold sm:text-lg" title={item.title}>
                  {item.title}
                </h2>
                {canRename ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 sm:h-7 sm:w-7"
                    onClick={() => setIsEditingTitle(true)}
                    title="Rename document"
                  >
                    <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                ) : null}
              </div>
            ) : isMediaPreview ? (
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-base font-semibold sm:text-lg" title={item.title}>
                  {item.title}
                </h2>
                {canRename ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setIsEditingTitle(true)}
                    title="Rename document"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <h2 className="truncate text-lg font-semibold" title={item.title}>
                  {item.title}
                </h2>
                {canRename ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setIsEditingTitle(true)}
                    title="Rename document"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            )}
            {!isMarkdownPreview && !isMediaPreview ? (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge className={processingMeta.className}>{processingMeta.label}</Badge>
                  <Badge variant="secondary" className="bg-white/70">{item.item_type}</Badge>
                  {processingMeta.searchQuality === "metadata_only" ? (
                    <Badge variant="outline">Metadata Search</Badge>
                  ) : null}
                </div>
                {processingMeta.detail ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-700">
                    {processingMeta.detail}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          {isMarkdownPreview ? (
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge className={processingMeta.className}>{processingMeta.label}</Badge>
            </div>
          ) : null}
          {isMediaPreview ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge className={processingMeta.className}>{processingMeta.label}</Badge>
            </div>
          ) : null}
          {previewType !== "markdown" ? (
            <div className={isMediaPreview ? "flex shrink-0 flex-wrap items-center gap-1.5" : "flex shrink-0 flex-wrap items-center gap-2"}>
              {canZoomPreview ? (
                <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-full"
                    onClick={decreasePreviewZoom}
                    disabled={previewZoom <= 80}
                    aria-label="Zoom out preview"
                    title="Zoom out"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-full px-2 text-[11px] font-semibold"
                    onClick={resetPreviewZoom}
                    title="Reset zoom"
                  >
                    {previewZoom}%
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-full"
                    onClick={increasePreviewZoom}
                    disabled={previewZoom >= 140}
                    aria-label="Zoom in preview"
                    title="Zoom in"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-full"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen preview" : "Enter fullscreen preview"}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              {documentId ? (
                <DocumentVersionHistory
                  itemId={documentId}
                  onRestore={onVersionRestore}
                  compact={isMediaPreview}
                />
              ) : null}
              {canAddToGallery && onAddToGallery ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full"
                  onClick={() => void onAddToGallery()}
                  disabled={isAddingToGallery}
                  aria-label={t("documentManagement.addToGallery")}
                  title={t("documentManagement.addToGallery")}
                >
                  {isAddingToGallery ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 h-3.5 w-3.5" />
                  )}
                  {t("documentManagement.addToGallery")}
                </Button>
              ) : null}
              {onReplaceFile ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={isMediaPreview ? "h-8 w-8 rounded-full p-0" : "gap-1.5 px-2 sm:px-3"}
                  onClick={() => replaceFileInputRef.current?.click()}
                  disabled={isReplacingFile}
                  aria-label="Upload new version"
                  title="Upload new version"
                >
                  {isReplacingFile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {isMediaPreview ? null : <span className="hidden sm:inline">Upload New Version</span>}
                </Button>
              ) : null}
              {publicShareActions(isMediaPreview)}
              {sourceUrl ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className={isMediaPreview ? "h-8 w-8 rounded-full p-0" : "gap-1.5 px-2 sm:px-3"}
                  aria-label="Download file"
                  title="Download file"
                >
                  <a href={sourceUrl} target="_blank" rel="noreferrer" download>
                    <ExternalLink className="h-4 w-4" />
                    {isMediaPreview ? null : <span className="hidden sm:inline">Download File</span>}
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {previewType === "markdown" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {knowledgeBacklinks.length > 0 ? (
            <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Backlinks
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Notes already pointing to this document.
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full bg-white/90">
                  {knowledgeBacklinks.length}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {knowledgeBacklinks.map((entry, index) => {
                  const badgeLabel =
                    entry.title ?? entry.rawReference ?? `Backlink ${index + 1}`;
                  const badge = (
                    <button
                      key={`${entry.libraryItemId ?? entry.rawReference ?? index}-${index}`}
                      type="button"
                      className={`inline-flex max-w-full items-center rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        entry.libraryItemId && entry.title
                          ? "border-sky-200 bg-white text-sky-800 hover:border-sky-300 hover:bg-sky-50"
                          : "cursor-default border-slate-200 bg-white text-slate-500"
                      }`}
                      onClick={() => {
                        if (entry.libraryItemId && entry.title) {
                          onOpenKnowledgeItem?.(entry.libraryItemId, entry.title);
                        }
                      }}
                      disabled={!entry.libraryItemId || !entry.title}
                    >
                      <span className="truncate">{badgeLabel}</span>
                    </button>
                  );

                  if (entry.libraryItemId && entry.title) {
                    return (
                      <KnowledgeNoteHoverPreview
                        key={`${entry.libraryItemId}-${index}`}
                        itemId={entry.libraryItemId}
                        label={entry.title}
                        logicalPath={entry.logicalPath}
                        onOpenItem={onOpenKnowledgeItem}
                      >
                        {badge}
                      </KnowledgeNoteHoverPreview>
                    );
                  }

                  return badge;
                })}
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={null}>
              <UnifiedDocumentSurface
                initialContent={markdownValue || ""}
                onContentChange={(value) => onMarkdownChange?.(value)}
                onSave={(markdown) => onMarkdownSave?.(markdown)}
                onVersionRestore={onVersionRestore}
                onEnterEditMode={onEnterEditMode}
                updatedAt={markdownUpdatedAt}
                isSaving={isMarkdownSaving}
                errorMessage={markdownError}
                documentId={documentId}
                initialEditorTemplate={initialEditorTemplate}
                surfaceHeaderActions={markdownSurfaceHeaderActions}
                editorHeaderActions={markdownEditorHeaderActions}
                editorUploadMetadata={editorUploadMetadata}
                editorLibraryScope={isPrivateVaultItem ? "private_vault" : "all"}
                onOpenWikiLink={onOpenWikiLink}
              />
            </Suspense>
          </div>
        </div>
      ) : null}

      {previewType === "image" && sourceUrl ? (
        <div
          data-testid="media-preview-body"
          className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border bg-gradient-to-br from-slate-100 via-slate-50 to-sky-100 p-2 shadow-inner"
        >
          <div className="flex h-full min-h-0 flex-col gap-3 p-1.5">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-white/80 bg-white/90 p-2 shadow-sm">
              <AuthenticatedMediaImage
                src={sourceUrl}
                alt={item.title}
                className="max-h-full w-auto max-w-full rounded-md object-contain"
                onError={() => setPreviewLoadError("Image preview failed to load. Try Download File.")}
              />
            </div>
            {previewLoadError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {previewLoadError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {previewType === "video" && sourceUrl ? (
        <div
          data-testid="media-preview-body"
          className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border bg-gradient-to-br from-slate-100 via-slate-50 to-cyan-100 p-2 shadow-inner"
        >
          <div className="flex h-full min-h-0 flex-col gap-3 p-1.5">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-white/80 bg-black/95 p-2 shadow-sm">
              <video
                src={sourceUrl}
                controls
                className="max-h-full w-auto max-w-full rounded-md bg-black object-contain shadow-sm"
                onError={() => setPreviewLoadError("Video preview failed to load. Try Download File.")}
              />
            </div>
            {previewLoadError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {previewLoadError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {previewType === "audio" && sourceUrl ? (
        <div className="flex flex-1 min-h-0 flex-col overflow-auto rounded-xl border bg-gradient-to-r from-slate-50 to-sky-50 p-3">
          <div className="flex min-h-[24vh] items-center">
            <audio src={sourceUrl} controls className="w-full" />
          </div>
        </div>
      ) : null}

      {(previewType === "image" || previewType === "video" || previewType === "audio") && item.description ? (
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Prompt</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 border-indigo-200 bg-white/80 px-2.5 text-xs text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
              onClick={() => {
                navigator.clipboard.writeText(item.description!).then(() => {
                  setPromptCopied(true);
                  setTimeout(() => setPromptCopied(false), 2000);
                });
              }}
            >
              {promptCopied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {promptCopied ? "Copied!" : "Copy Prompt"}
            </Button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{item.description}</p>
        </div>
      ) : null}

      {previewType === "pdf" && sourceUrl ? (
        <div className="space-y-2 rounded-xl border bg-slate-50 p-2 shadow-inner">
          {isPdfLoading ? (
            <div className="flex h-[70vh] items-center justify-center rounded-lg border bg-white text-sm text-muted-foreground">
              Loading PDF preview...
            </div>
          ) : (
            <div style={previewZoomStyle}>
              <iframe
                title={`preview-${item.id}`}
                src={pdfObjectUrl || sourceUrl}
                className="h-[70vh] w-full rounded-lg border bg-white"
                onError={() => setPreviewLoadError("PDF preview failed to load. Try Download File.")}
              />
            </div>
          )}
          {previewLoadError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {previewLoadError}
            </div>
          ) : null}
        </div>
      ) : null}

      {previewType === "excel" && sourceUrl ? (
        <Suspense fallback={null}>
          <ExcelViewer
            fileUrl={sourceUrl}
            fileName={item.title}
          />
        </Suspense>
      ) : null}

      {previewType === "office" && sourceUrl ? (
        <div className="space-y-2 rounded-xl border bg-slate-50 p-2 shadow-inner">
          {canUseOfficeViewer && officeViewerUrl ? (
            <>
              <div style={previewZoomStyle}>
                <iframe
                  title={`office-preview-${item.id}`}
                  src={officeViewerUrl}
                  className="h-[70vh] w-full rounded-lg border bg-white"
                  onError={() => setPreviewLoadError("Office preview failed to load. Try Download File.")}
                />
              </div>
              <div className="px-2 pb-1 text-xs text-muted-foreground">
                Office preview uses Microsoft online viewer. If it cannot render this URL, use Open file.
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed bg-white px-4 py-6 text-sm text-muted-foreground">
              {officeFallbackMessage}
            </div>
          )}
          {previewLoadError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {previewLoadError}
            </div>
          ) : null}
        </div>
      ) : null}

      {previewType === "code" && previewText ? (
        <Suspense fallback={null}>
          <CodeViewer
            code={previewText}
            language=""
            fileName={item.title}
          />
        </Suspense>
      ) : null}

      {previewType === "csv" && previewText ? (
        <Suspense fallback={null}>
          <CSVViewer
            csvData={previewText}
            fileName={item.title}
          />
        </Suspense>
      ) : null}

      {previewType === "json" && previewText ? (
        <Suspense fallback={null}>
          <JSONViewer
            jsonData={previewText}
            fileName={item.title}
          />
        </Suspense>
      ) : null}

      {previewType === "xml" && previewText ? (
        <Suspense fallback={null}>
          <CodeViewer
            code={previewText}
            language="xml"
            fileName={item.title}
          />
        </Suspense>
      ) : null}

      {previewType !== "markdown" &&
      previewType !== "image" &&
      previewType !== "video" &&
      previewType !== "audio" &&
      previewType !== "pdf" &&
      previewType !== "excel" &&
      previewType !== "office" &&
      previewType !== "code" &&
      previewType !== "csv" &&
      previewType !== "json" &&
      previewType !== "xml" ? (
        <div className="space-y-3">
          {previewText ? (
            <pre className="max-h-[70vh] overflow-auto rounded-lg border bg-slate-50/80 p-3 text-xs shadow-inner">
              {previewText}
            </pre>
          ) : (
            <div className="rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground">
              Preview is not available for this file type in-browser. Use Download File instead.
            </div>
          )}
        </div>
      ) : null}

      <ShareDialog
        itemId={item.id}
        itemTitle={item.title}
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
      />

      {/* Hidden file input for replace */}
      {onReplaceFile ? (
        <input
          type="file"
          ref={replaceFileInputRef}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPendingReplaceFile(file);
              setReplaceDescription("");
              setReplaceDialogOpen(true);
            }
            e.target.value = "";
          }}
        />
      ) : null}

      {/* Replace file confirmation dialog */}
      <AlertDialog
        open={replaceDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReplaceDialogOpen(false);
            setPendingReplaceFile(null);
            setReplaceDescription("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload New Version</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  The current file will be archived as a previous version. You can restore it later from Version History.
                </p>
                <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  After upload, the new version will move through parsing and indexing before semantic search is fully updated.
                </div>
                {pendingReplaceFile ? (
                  <>
                    <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-medium">{pendingReplaceFile.name}</span>
                      <span className="ml-2 text-muted-foreground">
                        ({(pendingReplaceFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    {(() => {
                      const metaFileName = typeof item?.metadata?.file_name === "string"
                        ? item.metadata.file_name
                        : "";
                      const currentExt = getFileExtension(
                        metaFileName || item?.title || "",
                      );
                      const newExt = getFileExtension(pendingReplaceFile.name);
                      if (currentExt && newExt && currentExt !== newExt) {
                        return (
                          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                              File type changed from <strong>.{currentExt}</strong> to{" "}
                              <strong>.{newExt}</strong>. The document type will be updated accordingly.
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </>
                ) : null}
                <div>
                  <label
                    htmlFor="replace-description"
                    className="mb-1 block text-sm font-medium text-foreground"
                  >
                    Change description (optional)
                  </label>
                  <Textarea
                    id="replace-description"
                    value={replaceDescription}
                    onChange={(e) => setReplaceDescription(e.target.value)}
                    placeholder="e.g. Updated with latest revisions"
                    maxLength={500}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isReplacingFile}
              onClick={async (e) => {
                e.preventDefault();
                if (!pendingReplaceFile || !onReplaceFile) return;
                try {
                  await onReplaceFile(
                    pendingReplaceFile,
                    replaceDescription.trim() || undefined,
                  );
                  setReplaceDialogOpen(false);
                  setPendingReplaceFile(null);
                  setReplaceDescription("");
                } catch {
                  // Keep dialog open on error so user can retry
                }
              }}
            >
              {isReplacingFile ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1 h-4 w-4" />
              )}
              Upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
