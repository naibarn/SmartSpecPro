import { forwardRef, useEffect, useRef, useState } from "react";
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
  retryLabel?: string;
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

const IMAGE_RETRY_DELAYS_MS = [500, 1_500, 4_000] as const;
const VIDEO_RETRY_DELAYS_MS = [500, 1_500, 4_000] as const;
const VIDEO_STALL_RETRY_MS = 10_000;

function addMediaRetryParam(url: string, retryVersion: number): string {
  if (
    retryVersion === 0 ||
    !(url.startsWith("/api/storage/files/") || url.startsWith("/uploads/"))
  ) {
    return url;
  }
  const retryKey = `${Date.now()}-${retryVersion}`;
  return `${url}${url.includes("?") ? "&" : "?"}mediaRetry=${retryKey}`;
}

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
  retryLabel = "ลองโหลดใหม่",
  loading = "lazy",
  decoding = "async",
  onError,
  ...imageProps
}: AuthenticatedMediaImageProps) {
  const resolvedSrc = getAuthenticatedMediaUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryTimerRef = useRef<number | null>(null);
  const loadError = Boolean(
    resolvedSrc && failedSrc === resolvedSrc && !isRetrying
  );

  useEffect(() => {
    setFailedSrc(null);
    setRetryAttempt(0);
    setRetryVersion(0);
    setIsRetrying(false);
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [resolvedSrc]);

  const retryImage = () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setFailedSrc(null);
    setRetryAttempt(0);
    setRetryVersion(version => version + 1);
    setIsRetrying(false);
  };

  const placeholder = fallback ?? (
    <div
      className={`flex items-center justify-center bg-muted text-[10px] text-muted-foreground ${className ?? ""}`}
      role="img"
      aria-label={alt}
      title={loadError ? errorLabel : loadingLabel}
    >
      <span>{loadError ? errorLabel : loadingLabel}</span>
      {loadError && (
        <button type="button" onClick={retryImage}>
          {retryLabel}
        </button>
      )}
    </div>
  );

  if (!resolvedSrc || loadError || isRetrying) return placeholder;

  const handleImageError: ImgHTMLAttributes<HTMLImageElement>["onError"] =
    event => {
      onError?.(event);
      if (retryAttempt < IMAGE_RETRY_DELAYS_MS.length) {
        setIsRetrying(true);
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          setRetryAttempt(attempt => attempt + 1);
          setRetryVersion(version => version + 1);
          setIsRetrying(false);
        }, IMAGE_RETRY_DELAYS_MS[retryAttempt]);
        return;
      }
      setFailedSrc(resolvedSrc);
    };

  return (
    <img
      {...imageProps}
      src={addMediaRetryParam(resolvedSrc, retryVersion)}
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
    poster,
    className,
    fallback,
    loadingLabel = "กำลังโหลดวีดีโอ...",
    errorLabel = "ไม่พบวีดีโอ",
    onError,
    onStalled,
    onCanPlay,
    onPlaying,
    ...videoProps
  },
  ref
) {
  const resolvedSrc = getAuthenticatedMediaUrl(src);
  const resolvedPoster = getAuthenticatedMediaUrl(poster);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const loadError = Boolean(
    resolvedSrc && failedSrc === resolvedSrc && !isRetrying
  );

  useEffect(() => {
    setFailedSrc(null);
    setRetryAttempt(0);
    setRetryVersion(0);
    setIsRetrying(false);
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }

    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };
  }, [resolvedSrc, resolvedPoster]);

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

  if (!resolvedSrc || loadError || isRetrying) return placeholder;

  const retryVideo = () => {
    if (retryTimerRef.current !== null) return;
    if (retryAttempt < VIDEO_RETRY_DELAYS_MS.length) {
      setIsRetrying(true);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setRetryAttempt(attempt => attempt + 1);
        setRetryVersion(version => version + 1);
        setIsRetrying(false);
      }, VIDEO_RETRY_DELAYS_MS[retryAttempt]);
      return;
    }
    setFailedSrc(resolvedSrc);
  };

  const handleVideoError: VideoHTMLAttributes<HTMLVideoElement>["onError"] =
    event => {
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      onError?.(event);
      retryVideo();
    };
  const handleVideoStalled: VideoHTMLAttributes<HTMLVideoElement>["onStalled"] =
    event => {
      onStalled?.(event);
      if (stallTimerRef.current !== null) return;
      stallTimerRef.current = window.setTimeout(() => {
        stallTimerRef.current = null;
        retryVideo();
      }, VIDEO_STALL_RETRY_MS);
    };
  const handleVideoCanPlay: VideoHTMLAttributes<HTMLVideoElement>["onCanPlay"] =
    event => {
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      onCanPlay?.(event);
    };
  const handleVideoPlaying: VideoHTMLAttributes<HTMLVideoElement>["onPlaying"] =
    event => {
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      onPlaying?.(event);
    };

  return (
    <video
      {...videoProps}
      ref={ref}
      src={addMediaRetryParam(resolvedSrc, retryVersion)}
      poster={
        resolvedPoster
          ? addMediaRetryParam(resolvedPoster, retryVersion)
          : undefined
      }
      className={className}
      onError={handleVideoError}
      onStalled={handleVideoStalled}
      onCanPlay={handleVideoCanPlay}
      onPlaying={handleVideoPlaying}
    />
  );
});
