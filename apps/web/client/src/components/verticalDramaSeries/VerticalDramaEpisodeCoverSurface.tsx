import { useRef, useState } from "react";
import {
  Clapperboard,
  Download,
  Expand,
  ImagePlus,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export function VerticalDramaEpisodeCoverSurface({
  lang,
  episodeNumber,
  title,
  imageUrl,
  fallbackUrl,
  status,
  error,
  readOnly,
  isGenerating,
  isUploading,
  canGenerate,
  onGenerate,
  onRetry,
  onOpen,
  onUpload,
}: {
  lang: "th" | "en";
  episodeNumber: number;
  title?: string | null;
  imageUrl: string | null;
  fallbackUrl: string | null;
  status?: "generating" | "ready" | "failed";
  error?: string | null;
  readOnly?: boolean;
  isGenerating?: boolean;
  isUploading?: boolean;
  canGenerate?: boolean;
  onGenerate?: () => void;
  onRetry?: () => void;
  onOpen?: (url: string) => void;
  onUpload?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const visibleUrl = imageUrl ?? fallbackUrl;
  const busy = Boolean(isGenerating || isUploading);
  const alt =
    lang === "th"
      ? `หน้าปกตอนย่อยที่ ${episodeNumber}${title ? ` · ${title}` : ""}`
      : `Cover for Sub-episode ${episodeNumber}${title ? ` · ${title}` : ""}`;

  const chooseFile = (file: File | undefined) => {
    if (file && file.type.startsWith("image/")) onUpload?.(file);
  };

  return (
    <div className="w-36 shrink-0">
      <div
        className={`group relative aspect-[9/16] w-full overflow-hidden rounded-xl border bg-muted/30 shadow-sm ${
          dragging
            ? "border-primary ring-2 ring-primary/40"
            : "border-border/70"
        }`}
        onDragOver={event => {
          if (readOnly) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => {
          if (readOnly) return;
          event.preventDefault();
          setDragging(false);
          chooseFile(event.dataTransfer.files?.[0]);
        }}
        data-testid={`vd-episode-cover-surface-${episodeNumber}`}
      >
        {visibleUrl ? (
          <img
            src={visibleUrl}
            alt={alt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Clapperboard
              className="h-6 w-6 text-muted-foreground/60"
              aria-hidden="true"
            />
          </div>
        )}
        {status === "generating" || isGenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80 p-2 text-center text-[10px] text-foreground">
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span role="status">
              {lang === "th" ? "กำลังสร้างหน้าปก…" : "Generating cover…"}
            </span>
          </div>
        ) : null}
        {status === "failed" ? (
          <div className="absolute inset-x-0 bottom-0 bg-destructive/90 p-1.5 text-center text-[10px] text-destructive-foreground">
            <span>
              {error ||
                (lang === "th" ? "สร้างไม่สำเร็จ" : "Generation failed")}
            </span>
          </div>
        ) : null}
        {!readOnly && dragging ? (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/15 p-2 text-center text-xs font-medium">
            {lang === "th"
              ? "วางภาพเพื่อแทนที่หน้าปก"
              : "Drop image to replace cover"}
          </div>
        ) : null}
        {visibleUrl && !busy && !dragging && onOpen ? (
          <button
            type="button"
            className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-transparent to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => onOpen(visibleUrl)}
            aria-label={
              lang === "th" ? "ดูหน้าปกเต็มจอ" : "View cover fullscreen"
            }
          >
            <span className="inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-1 text-[10px] text-white">
              <Expand className="h-3 w-3" aria-hidden="true" />
              {lang === "th" ? "ดูเต็มจอ" : "Fullscreen"}
            </span>
          </button>
        ) : null}
      </div>
      {!readOnly ? (
        <div
          className="mt-2 flex flex-wrap justify-center gap-1.5"
          data-testid={`vd-episode-cover-actions-${episodeNumber}`}
        >
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-8 w-8 shadow-sm"
            disabled={busy || !canGenerate}
            onClick={status === "failed" ? onRetry : onGenerate}
            title={
              !canGenerate
                ? lang === "th"
                  ? "เลือกโมเดลภาพก่อน"
                  : "Choose an image model first"
                : status === "failed"
                  ? lang === "th"
                    ? "ลองอีกครั้ง"
                    : "Retry"
                  : lang === "th"
                    ? "สร้างหน้าปก"
                    : "Generate cover"
            }
            aria-label={
              status === "failed"
                ? "Retry cover generation"
                : "Generate episode cover"
            }
          >
            {isGenerating ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : status === "failed" ? (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-8 w-8 shadow-sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            title={lang === "th" ? "อัปโหลดหน้าปก" : "Upload cover"}
            aria-label={lang === "th" ? "อัปโหลดหน้าปก" : "Upload cover"}
          >
            {isUploading ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
          {visibleUrl ? (
            <a
              href={visibleUrl}
              download={`episode-${episodeNumber}-cover`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={lang === "th" ? "ดาวน์โหลดหน้าปก" : "Download cover"}
              aria-label={lang === "th" ? "ดาวน์โหลดหน้าปก" : "Download cover"}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={event => {
              chooseFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
