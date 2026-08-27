import { normalizeMediaSourceUrl } from "@/lib/mediaUrl";

export type GalleryMediaVariant = "file" | "thumbnail";

export interface GalleryMediaSource {
  id: number;
  fileKey?: string | null;
  fileUrl?: string | null;
  thumbnailKey?: string | null;
  thumbnailUrl?: string | null;
}

const IMAGE_EXTENSION_PATTERN =
  /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;

export function getGalleryMediaUrl(
  item: GalleryMediaSource,
  variant: GalleryMediaVariant
): string {
  const key =
    variant === "thumbnail"
      ? item.thumbnailKey || item.fileKey
      : item.fileKey || item.thumbnailKey;

  if (key) {
    return `/api/gallery/media/${item.id}/${variant}`;
  }

  const source =
    variant === "thumbnail"
      ? item.thumbnailUrl || item.fileUrl
      : item.fileUrl || item.thumbnailUrl;

  const normalizedSource = normalizeMediaSourceUrl(source);
  // Legacy rows may have only the protected storage URL and no separate key.
  // The public route can recover the key from that URL server-side.
  if (normalizedSource.startsWith("/api/storage/files/")) {
    return `/api/gallery/media/${item.id}/${variant}`;
  }

  return normalizedSource;
}

export function isGalleryImageSource(source?: string | null): boolean {
  if (!source) return false;
  return IMAGE_EXTENSION_PATTERN.test(source.split("#", 1)[0]);
}
