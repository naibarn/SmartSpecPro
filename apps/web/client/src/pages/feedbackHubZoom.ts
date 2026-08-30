export const FEEDBACK_LIGHTBOX_ZOOM_MIN = 1;
export const FEEDBACK_LIGHTBOX_ZOOM_MAX = 4;
export const FEEDBACK_LIGHTBOX_ZOOM_STEP = 0.25;

export function clampFeedbackLightboxZoom(scale: number): number {
  if (!Number.isFinite(scale)) return FEEDBACK_LIGHTBOX_ZOOM_MIN;
  return Math.min(
    FEEDBACK_LIGHTBOX_ZOOM_MAX,
    Math.max(FEEDBACK_LIGHTBOX_ZOOM_MIN, scale)
  );
}

export function getFeedbackLightboxZoomPercent(scale: number): number {
  return Math.round(scale * 100);
}

export function getFeedbackLightboxImageStyle(
  scale: number,
  imageSize: { width: number; height: number } | null
): { width: string; height: string } | undefined {
  const zoomedScale = clampFeedbackLightboxZoom(scale);
  if (zoomedScale === FEEDBACK_LIGHTBOX_ZOOM_MIN) return undefined;

  if (
    imageSize &&
    Number.isFinite(imageSize.width) &&
    Number.isFinite(imageSize.height)
  ) {
    return {
      width: `${imageSize.width * zoomedScale}px`,
      height: `${imageSize.height * zoomedScale}px`,
    };
  }

  return {
    width: `${zoomedScale * 100}%`,
    height: `${zoomedScale * 100}%`,
  };
}
