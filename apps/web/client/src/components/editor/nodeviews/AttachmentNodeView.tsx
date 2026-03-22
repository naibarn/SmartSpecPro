import { useCallback, useMemo, useState } from "react";
import { ExternalLink, File, FileText, Presentation } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { sanitizeMediaUrl } from "./mediaUrlValidator";
import MediaSelectionOverlay from "./MediaSelectionOverlay";

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "odp", "ods"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json", "xml", "html", "htm"]);

function getFileExtensionFromName(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function getAttachmentIcon(extension: string, mimeType: string | null | undefined) {
  if (mimeType?.includes("presentation") || extension === "ppt" || extension === "pptx" || extension === "odp") {
    return Presentation;
  }
  if (mimeType?.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    return FileText;
  }
  if (OFFICE_EXTENSIONS.has(extension)) {
    return FileText;
  }
  return File;
}

function formatSize(sizeBytes: number | null | undefined): string | null {
  if (!sizeBytes || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function AttachmentNodeView({
  node,
  deleteNode,
  editor,
  selected,
}: NodeViewProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const { src, title, fileName, mimeType, assetId, sizeBytes } = node.attrs;
  const safeSrc = sanitizeMediaUrl(src || "");
  const isEditable = editor.isEditable;
  const displayName = title || fileName || "Attachment";
  const extension = getFileExtensionFromName(fileName || displayName);
  const Icon = useMemo(() => getAttachmentIcon(extension, mimeType), [extension, mimeType]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditable) {
        e.preventDefault();
        setShowOverlay(true);
        return;
      }
      if (safeSrc) {
        window.open(safeSrc, "_blank", "noopener,noreferrer");
      }
    },
    [isEditable, safeSrc],
  );

  const handleDismiss = useCallback(() => setShowOverlay(false), []);

  const handleOpen = useCallback(() => {
    if (safeSrc) {
      window.open(safeSrc, "_blank", "noopener,noreferrer");
    }
  }, [safeSrc]);

  const sizeLabel = formatSize(sizeBytes as number | null | undefined);
  const typeLabel = (mimeType || extension || "file").toUpperCase();

  return (
    <NodeViewWrapper
      as="figure"
      className={`relative my-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm transition-shadow ${selected ? "ring-2 ring-blue-500" : ""}`}
      data-testid="attachment-node-view"
      data-file-attachment="true"
    >
      <div
        className="flex items-start gap-3"
        onClick={handleClick}
        role={safeSrc ? "button" : undefined}
        tabIndex={safeSrc ? 0 : undefined}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">
            {displayName}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-white px-2 py-0.5 uppercase tracking-wide">
              {typeLabel}
            </span>
            {sizeLabel ? <span>{sizeLabel}</span> : null}
            {assetId ? <span>Asset #{assetId}</span> : null}
          </div>
        </div>
        {safeSrc ? (
          <button
            type="button"
            className="shrink-0 rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:text-slate-900"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleOpen();
            }}
            aria-label="Open attachment"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isEditable && (
        <MediaSelectionOverlay
          visible={showOverlay}
          onRemove={deleteNode}
          onDismiss={handleDismiss}
        />
      )}
    </NodeViewWrapper>
  );
}

export { AttachmentNodeView };
