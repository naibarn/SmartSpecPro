import { forwardRef, useState } from "react";
import type { ImgHTMLAttributes, ReactNode, VideoHTMLAttributes } from "react";
import { normalizeMediaSourceUrl } from "@/lib/mediaUrl";

type AuthenticatedMediaImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  src?: string | null;
  fallback?: ReactNode;
  loadingLabel?: string;
  errorLabel?: string;
};

type AuthenticatedMediaVideoProps = Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  "src"
> & {
  src?: string | null;
  fallback?: ReactNode;
  loadingLabel?: string;
  errorLabel?: string;
};

export function getAuthenticatedMediaUrl(
  url: string | null | undefined
): string | null {
  const normalized = normalizeMediaSourceUrl(url);
  return normalized || null;
}

export async function fetchAuthenticatedMedia(url: string): Promise<Blob> {
  const resolvedUrl = getAuthenticatedMediaUrl(url);
  if (!resolvedUrl) throw new Error("Media URL is empty");
  const response = await fetch(resolvedUrl, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Media request failed (${response.status})`);
  return response.blob();
}

export async function openAuthenticatedMedia(
  url: string | null | undefined
): Promise<void> {
  if (!url) return;
  const popup = window.open("about:blank", "_blank");
  try {
    const blob = await fetchAuthenticatedMedia(url);
    const objectUrl = URL.createObjectURL(blob);
    if (popup) {
      popup.opener = null;
      popup.location.href = objectUrl;
    } else {
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    popup?.close();
    throw error;
  }
}

export function AuthenticatedMediaImage({
  src,
  alt = "",
  className,
  fallback,
  loadingLabel = "กำลังโหลดภาพ...",
  errorLabel = "ไม่พบภาพ",
  loading = "lazy",
  decoding = "async",
  onError,
  ...imageProps
}: AuthenticatedMediaImageProps) {
  const resolvedSrc = getAuthenticatedMediaUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const loadError = Boolean(resolvedSrc && failedSrc === resolvedSrc);

  const placeholder = fallback ?? (
    <div
      className={`flex items-center justify-center bg-muted text-[10px] text-muted-foreground ${className ?? ""}`}
      role="img"
      aria-label={alt}
      title={loadError ? errorLabel : loadingLabel}
    >
      {loadError ? errorLabel : loadingLabel}
    </div>
  );

  if (!resolvedSrc || loadError) return placeholder;

  const handleImageError: ImgHTMLAttributes<HTMLImageElement>["onError"] =
    event => {
      setFailedSrc(resolvedSrc);
      onError?.(event);
    };

  return (
    <img
      {...imageProps}
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={handleImageError}
    />
  );
}

export const AuthenticatedMediaVideo = forwardRef<
  HTMLVideoElement,
  AuthenticatedMediaVideoProps
>(function AuthenticatedMediaVideo(
  {
    src,
    className,
    fallback,
    loadingLabel = "กำลังโหลดวีดีโอ...",
    errorLabel = "ไม่พบวีดีโอ",
    onError,
    ...videoProps
  },
  ref
) {
  const resolvedSrc = getAuthenticatedMediaUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const loadError = Boolean(resolvedSrc && failedSrc === resolvedSrc);

  const placeholder = fallback ?? (
    <div
      className={`flex items-center justify-center bg-muted text-[10px] text-muted-foreground ${className ?? ""}`}
      role="status"
      aria-label={loadError ? errorLabel : loadingLabel}
      title={loadError ? errorLabel : loadingLabel}
    >
      {loadError ? errorLabel : loadingLabel}
    </div>
  );

  if (!resolvedSrc || loadError) return placeholder;

  const handleVideoError: VideoHTMLAttributes<HTMLVideoElement>["onError"] =
    event => {
      setFailedSrc(resolvedSrc);
      onError?.(event);
    };

  return (
    <video
      {...videoProps}
      ref={ref}
      src={resolvedSrc}
      className={className}
      onError={handleVideoError}
    />
  );
});
