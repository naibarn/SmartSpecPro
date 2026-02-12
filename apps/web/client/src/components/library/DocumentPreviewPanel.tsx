import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocumentLibraryItem, DocumentPreviewType } from "@/lib/documentManagementUi";
import { getOfficePreviewDecision } from "@/lib/previewHostSafety";
import { Check, ExternalLink, Pencil, X } from "lucide-react";
import MarkdownFileEditor from "./MarkdownFileEditor";
import CodeViewer from "./CodeViewer";
import CSVViewer from "./CSVViewer";
import JSONViewer from "./JSONViewer";
import ExcelViewer from "./ExcelViewer";

interface DocumentPreviewPanelProps {
  item: DocumentLibraryItem | null;
  previewType: DocumentPreviewType;
  previewText?: string;
  markdownValue?: string;
  markdownUpdatedAt?: string;
  markdownError?: string;
  isMarkdownSaving?: boolean;
  markdownFullHeight?: boolean;
  markdownEditorOnly?: boolean;
  isRenamingTitle?: boolean;
  markdownImageItems?: Array<{
    id: number;
    title: string;
    source_url: string | null;
  }>;
  onMarkdownChange?: (value: string) => void;
  onMarkdownSave?: () => void;
  onRenameTitle?: (title: string) => Promise<void> | void;
}

export default function DocumentPreviewPanel({
  item,
  previewType,
  previewText,
  markdownValue,
  markdownUpdatedAt,
  markdownError,
  isMarkdownSaving,
  markdownFullHeight,
  markdownEditorOnly,
  isRenamingTitle,
  markdownImageItems,
  onMarkdownChange,
  onMarkdownSave,
  onRenameTitle,
}: DocumentPreviewPanelProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [previewLoadError, setPreviewLoadError] = useState<string | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  useEffect(() => {
    setTitleDraft(item?.title || "");
    setIsEditingTitle(false);
  }, [item?.id, item?.title]);

  useEffect(() => {
    setPreviewLoadError(null);
  }, [item?.id, item?.source_url, previewType]);

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

  return (
    <div className="space-y-4 rounded-xl border bg-background/90 p-4 shadow-sm">
      <div className="rounded-lg border bg-gradient-to-r from-slate-50 via-sky-50 to-cyan-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
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
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-white/70">{item.item_type}</Badge>
              <Badge variant="outline">{item.status}</Badge>
            </div>
          </div>
          {sourceUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={sourceUrl} target="_blank" rel="noreferrer" download>
                <ExternalLink className="mr-1 h-4 w-4" />
                Download File
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {previewType === "markdown" ? (
        <MarkdownFileEditor
          value={markdownValue || ""}
          onChange={(value) => onMarkdownChange?.(value)}
          onSave={() => onMarkdownSave?.()}
          updatedAt={markdownUpdatedAt}
          isSaving={isMarkdownSaving}
          errorMessage={markdownError}
          fullHeight={markdownFullHeight}
          editorOnly={markdownEditorOnly}
          imageLibraryItems={markdownImageItems}
        />
      ) : null}

      {previewType === "image" && sourceUrl ? (
        <div className="space-y-2 rounded-xl border bg-gradient-to-br from-slate-100 via-slate-50 to-sky-100 p-3 shadow-inner">
          <img
            src={sourceUrl}
            alt={item.title}
            className="max-h-[70vh] w-full rounded-lg border border-white/80 bg-white object-contain shadow-sm"
            onError={() => setPreviewLoadError("Image preview failed to load. Try Download File.")}
          />
          {previewLoadError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {previewLoadError}
            </div>
          ) : null}
        </div>
      ) : null}

      {previewType === "video" && sourceUrl ? (
        <div className="space-y-2 rounded-xl border bg-gradient-to-br from-slate-100 via-slate-50 to-cyan-100 p-3 shadow-inner">
          <video
            src={sourceUrl}
            controls
            className="max-h-[70vh] w-full rounded-lg border border-white/80 bg-black shadow-sm"
            onError={() => setPreviewLoadError("Video preview failed to load. Try Download File.")}
          />
          {previewLoadError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {previewLoadError}
            </div>
          ) : null}
        </div>
      ) : null}

      {previewType === "audio" && sourceUrl ? (
        <div className="rounded-xl border bg-gradient-to-r from-slate-50 to-sky-50 p-4">
          <audio src={sourceUrl} controls className="w-full" />
        </div>
      ) : null}

      {previewType === "pdf" && sourceUrl ? (
        <div className="space-y-2 rounded-xl border bg-slate-50 p-2 shadow-inner">
          {isPdfLoading ? (
            <div className="flex h-[70vh] items-center justify-center rounded-lg border bg-white text-sm text-muted-foreground">
              Loading PDF preview...
            </div>
          ) : (
            <iframe
              title={`preview-${item.id}`}
              src={pdfObjectUrl || sourceUrl}
              className="h-[70vh] w-full rounded-lg border bg-white"
              onError={() => setPreviewLoadError("PDF preview failed to load. Try Download File.")}
            />
          )}
          {previewLoadError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {previewLoadError}
            </div>
          ) : null}
        </div>
      ) : null}

      {previewType === "excel" && sourceUrl ? (
        <ExcelViewer
          fileUrl={sourceUrl}
          fileName={item.title}
        />
      ) : null}

      {previewType === "office" && sourceUrl ? (
        <div className="space-y-2 rounded-xl border bg-slate-50 p-2 shadow-inner">
          {canUseOfficeViewer && officeViewerUrl ? (
            <>
              <iframe
                title={`office-preview-${item.id}`}
                src={officeViewerUrl}
                className="h-[70vh] w-full rounded-lg border bg-white"
                onError={() => setPreviewLoadError("Office preview failed to load. Try Download File.")}
              />
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
        <CodeViewer
          code={previewText}
          language=""
          fileName={item.title}
        />
      ) : null}

      {previewType === "csv" && previewText ? (
        <CSVViewer
          csvData={previewText}
          fileName={item.title}
        />
      ) : null}

      {previewType === "json" && previewText ? (
        <JSONViewer
          jsonData={previewText}
          fileName={item.title}
        />
      ) : null}

      {previewType === "xml" && previewText ? (
        <CodeViewer
          code={previewText}
          language="xml"
          fileName={item.title}
        />
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
    </div>
  );
}
