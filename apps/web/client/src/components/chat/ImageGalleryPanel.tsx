import { useState } from "react";
import { X, Pin, Trash2, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

export interface GalleryImage {
  assetId: number;
  fileUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  tags?: string[];
  role: "memory" | "current";
}

export interface ImageGalleryPanelProps {
  images: GalleryImage[];
  conversationId: number;
  open: boolean;
  onToggle: () => void;
  onImageRemoved?: (assetId: number) => void;
}

/**
 * Expandable side panel showing images referenced in the current LLM response.
 * Provides pin and remove-from-memory actions per image.
 */
export function ImageGalleryPanel({
  images,
  conversationId,
  open,
  onToggle,
  onImageRemoved,
}: ImageGalleryPanelProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const deleteMutation = trpc.memory.deleteImageFromMemory.useMutation({
    onSuccess: (_data, variables) => {
      onImageRemoved?.(variables.assetId);
    },
  });

  const pinMutation = trpc.memory.pinImageToMemory.useMutation();

  if (images.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-col border-l bg-card transition-all duration-200",
        open ? "w-80" : "w-0 overflow-hidden"
      )}
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium text-foreground">Image Context</span>
            <button
              onClick={onToggle}
              className="rounded p-1 hover:bg-muted"
              title="Close gallery"
              aria-label="Close gallery"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Image list */}
          <div className="flex-1 overflow-y-auto">
            {images.map((image, idx) => (
              <div key={image.assetId} className="border-b p-3 last:border-b-0">
                {/* Thumbnail */}
                <div className="relative mb-2">
                  <img
                    src={image.thumbnailUrl || image.fileUrl}
                    alt={image.caption || `Image ${image.assetId}`}
                    className="h-24 w-full cursor-pointer rounded object-cover"
                    onClick={() => setLightboxIndex(idx)}
                  />
                  {image.role === "memory" && (
                    <span className="absolute left-1 top-1 rounded bg-black/50 p-0.5">
                      <Brain className="h-3 w-3 text-white" />
                    </span>
                  )}
                </div>

                {/* Caption */}
                {image.caption && (
                  <p className="mb-1.5 line-clamp-2 text-xs text-muted-foreground">
                    {image.caption}
                  </p>
                )}

                {/* Tags */}
                {image.tags && image.tags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {image.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1">
                  <button
                    onClick={() => pinMutation.mutate({ assetId: image.assetId })}
                    disabled={pinMutation.isPending}
                    title="Pin to memory"
                    aria-label="Pin to memory"
                    type="button"
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    <Pin className="h-3 w-3" />
                    Pin
                  </button>
                  <button
                    onClick={() =>
                      deleteMutation.mutate({ assetId: image.assetId })
                    }
                    disabled={deleteMutation.isPending}
                    title="Remove from memory"
                    aria-label="Remove from memory"
                    type="button"
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
