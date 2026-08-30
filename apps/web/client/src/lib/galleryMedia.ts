import { normalizeMediaSourceUrl } from "@/lib/mediaUrl";

export type GalleryMediaVariant = "file" | "thumbnail";

export interface GalleryMediaSource {
  id: number;
  fileKey?: string | null;
  fileUrl?: string | null;
  thumbnailKey?: string | null;
  thumbnailUrl?: string | null;
}

export interface GalleryMediaUrlOptions {
  download?: boolean;
}

const IMAGE_EXTENSION_PATTERN =
  /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;

export function getGalleryMediaUrl(
  item: GalleryMediaSource,
  variant: GalleryMediaVariant,
  options: GalleryMediaUrlOptions = {},
): string {
  const key =
    variant === "thumbnail"
      ? item.thumbnailKey || item.fileKey
      : item.fileKey || item.thumbnailKey;

  if (key) {
    const url = `/api/gallery/media/${item.id}/${variant}`;
    return options.download && variant === "file"
      ? `${url}?download=1`
      : url;
  }

  const source =
    variant === "thumbnail"
      ? item.thumbnailUrl || item.fileUrl
      : item.fileUrl || item.thumbnailUrl;

  const normalizedSource = normalizeMediaSourceUrl(source);
  // Legacy rows may have only the protected storage URL and no separate key.
  // The public route can recover the key from that URL server-side.
  if (normalizedSource.startsWith("/api/storage/files/")) {
    const url = `/api/gallery/media/${item.id}/${variant}`;
    return options.download && variant === "file"
      ? `${url}?download=1`
      : url;
  }

  return normalizedSource;
}

export function isGalleryImageSource(source?: string | null): boolean {
  if (!source) return false;
  return IMAGE_EXTENSION_PATTERN.test(source.split("#", 1)[0]);
}
