export type CropResizeHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CropResizeBounds {
  width: number;
  height: number;
  minWidth?: number;
  maxWidth?: number;
}

/**
 * Resizes a crop rectangle from a corner while keeping the render aspect
 * ratio exact. The opposite corner stays fixed and the result is contained
 * within the preview stage.
 */
export function resizeAspectLockedCropRect(
  start: CropRect,
  deltaX: number,
  deltaY: number,
  handle: CropResizeHandle,
  aspectRatio: number,
  bounds: CropResizeBounds,
): CropRect {
  if (
    !Number.isFinite(aspectRatio) || aspectRatio <= 0 ||
    !Number.isFinite(bounds.width) || bounds.width <= 0 ||
    !Number.isFinite(bounds.height) || bounds.height <= 0
  ) {
    return start;
  }

  const right = start.left + start.width;
  const bottom = start.top + start.height;
  const growsRight = handle === "top-right" || handle === "bottom-right";
  const growsDown = handle === "bottom-left" || handle === "bottom-right";
  const widthDelta = Math.max(
    growsRight ? deltaX : -deltaX,
    (growsDown ? deltaY : -deltaY) * aspectRatio,
  );
  const minimumWidth = Math.max(1, bounds.minWidth ?? 1);
  const maximumWidth = Math.max(minimumWidth, bounds.maxWidth ?? Number.POSITIVE_INFINITY);

  let width = Math.max(minimumWidth, Math.min(maximumWidth, start.width + widthDelta));
  const anchorLeft = growsRight ? start.left : right;
  const anchorTop = growsDown ? start.top : bottom;

  // Keep the fixed corner in the stage and ensure the new height also fits.
  const maxWidthFromStage = Math.min(
    growsRight ? bounds.width - anchorLeft : anchorLeft,
    (growsDown ? bounds.height - anchorTop : anchorTop) * aspectRatio,
  );
  width = Math.min(width, Math.max(minimumWidth, maxWidthFromStage));

  const height = width / aspectRatio;
  const left = growsRight ? anchorLeft : anchorLeft - width;
  const top = growsDown ? anchorTop : anchorTop - height;

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    width,
    height,
  };
}
