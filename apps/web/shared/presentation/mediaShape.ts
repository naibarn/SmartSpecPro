import type {
  PresentationMediaShape,
  PresentationSlideElement,
} from "./contracts";

export const DEFAULT_PRESENTATION_MEDIA_CORNER_RADIUS = 24;

export interface PresentationMediaShapeStyle {
  borderRadius?: string;
  clipPath?: string;
}

export function presentationMediaShapeRequiresSquare(
  shapeInput: PresentationMediaShape | undefined,
): boolean {
  const shape = normalizePresentationMediaShape(shapeInput);
  return shape === "circle" || shape === "diamond" || shape === "star";
}

export function normalizePresentationMediaShape(
  shape: PresentationMediaShape | undefined,
): PresentationMediaShape {
  return shape ?? "rect";
}

export function resolvePresentationMediaCornerRadius(
  cornerRadius: number | undefined,
): number {
  if (!Number.isFinite(cornerRadius)) {
    return DEFAULT_PRESENTATION_MEDIA_CORNER_RADIUS;
  }
  return Math.max(0, Math.min(1000, Number(cornerRadius)));
}

export function buildPresentationMediaShapeStyle(
  shapeInput: PresentationMediaShape | undefined,
  cornerRadius?: number,
): PresentationMediaShapeStyle {
  const shape = normalizePresentationMediaShape(shapeInput);
  switch (shape) {
    case "rounded":
      return { borderRadius: `${resolvePresentationMediaCornerRadius(cornerRadius)}px` };
    case "circle":
      return { borderRadius: "9999px", clipPath: "circle(50% at 50% 50%)" };
    case "ellipse":
      return { borderRadius: "9999px", clipPath: "ellipse(50% 50% at 50% 50%)" };
    case "diamond":
      return { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" };
    case "star":
      return { clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" };
    case "rect":
    default:
      return {};
  }
}

export function buildPresentationMediaShapeStyleForElement(
  element: Extract<PresentationSlideElement, { type: "image" | "video" }>,
): PresentationMediaShapeStyle {
  return buildPresentationMediaShapeStyle(
    element.mediaShape,
    element.mediaCornerRadius,
  );
}
