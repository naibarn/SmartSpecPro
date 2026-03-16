/**
 * Algorithmic Slide Layout Engine
 *
 * Calculates pixel-perfect element positions from structured content (title, sections, body).
 * Used by: generateLayoutFromNote, repairSlideFromSavedNote, generateAIDraft.
 *
 * Advantages over recipe-based layout:
 * - No slot budget text truncation (preserves all Thai/multilingual text)
 * - Dynamic image sizing based on content density
 * - Varied image placement (top/left/right/bottom, randomized)
 * - Accurate height estimation for Thai characters (1.2x width factor)
 */

import type { SlideStylePreset } from "@shared/presentation/aiTypes";
import type { PresentationSlideContent } from "@shared/presentation/contracts";

// ── Types ──────────────────────────────────────────────────

export interface AlgorithmicLayoutInput {
  /** Slide title text */
  title: string;
  /** Body text lines */
  body: string[];
  /** Structured sections with heading + details */
  sections: Array<{ heading: string; details: string[] }>;
  /** Full notes text (used for language detection) */
  notes: string;
  /** Image URLs from existing slide */
  imageUrls: string[];
  /** Canvas dimensions */
  canvasWidth: number;
  canvasHeight: number;
  /** Style preset for colors and typography */
  stylePreset: SlideStylePreset;
  /** Unique ID prefix for element IDs */
  idPrefix: string;
  /** Existing background to preserve */
  existingBackground?: PresentationSlideContent["background"];
  /** Existing transition to preserve */
  existingTransition?: PresentationSlideContent["transition"];
  /** Existing duration to preserve */
  existingDurationMs?: number;
  /** Canvas preset string (e.g. "9:16") */
  canvasPreset?: string;
}

export interface AlgorithmicLayoutOutput {
  slideContent: PresentationSlideContent;
  warnings: string[];
}

// ── Layout Algorithm ───────────────────────────────────────

type ImageLayout = "top" | "left" | "right" | "bottom" | "none";

export function buildAlgorithmicSlideLayout(input: AlgorithmicLayoutInput): AlgorithmicLayoutOutput {
  const {
    title, body, sections, notes, imageUrls,
    canvasWidth, canvasHeight, stylePreset,
    idPrefix, existingBackground, existingTransition, existingDurationMs, canvasPreset,
  } = input;

  const warnings: string[] = [];
  const pad = Math.round(canvasWidth * 0.05);
  const contentW = canvasWidth - pad * 2;
  let nextId = 0;
  const makeId = () => `${idPrefix}-${++nextId}`;

  const hasImages = imageUrls.length > 0;
  const primaryImageUrl = imageUrls[0] ?? null;

  // Randomize image layout for variety
  const imageLayoutOptions: ImageLayout[] = hasImages
    ? ["top", "left", "right", "bottom"]
    : ["none"];
  const imageLayout = imageLayoutOptions[Math.floor(Math.random() * imageLayoutOptions.length)]!;

  // Language detection for text width estimation
  const isThai = /[\u0E00-\u0E7F]/.test(notes || title);
  const charWidthFactor = isThai ? 0.75 : 0.55;

  function estimateTextH(text: string, fontSize: number, containerW: number, lineH: number): number {
    const charsPerLine = Math.max(1, Math.floor(containerW / (fontSize * charWidthFactor)));
    const effectiveLineH = isThai ? Math.max(1.5, lineH) : lineH;
    const lines = text.split("\n").reduce((total, line) => {
      return total + Math.max(1, Math.ceil(line.length / charsPerLine));
    }, 0);
    // Thai text gets extra padding in the renderer (paddingTop: 0.2em + paddingBottom: 0.48em)
    // so account for that in height estimation to prevent element overlap.
    const thaiPaddingPx = isThai ? Math.round(fontSize * 0.68) : 0;
    return Math.round(lines * fontSize * effectiveLineH) + 8 + thaiPaddingPx;
  }

  // Pre-estimate content height to size image dynamically
  const preBodyFontSize = canvasHeight > 900 ? 16 : 14;
  const preTextW = imageLayout === "left" || imageLayout === "right"
    ? Math.round(contentW * 0.65) : contentW;
  const preTitleH = estimateTextH(title, canvasHeight > 900 ? 36 : 28, preTextW, 1.2);
  const preSectionsH = sections.reduce((s, sec) => {
    return s + estimateTextH(sec.heading, canvasHeight > 900 ? 22 : 18, preTextW, 1.3)
      + estimateTextH(sec.details.join("\n"), preBodyFontSize, preTextW, 1.5) + 24;
  }, 0);
  // Skip body when sections exist — LLM often duplicates content in both
  const bodyText = sections.length > 0 ? "" : body.join("\n");
  const preBodyH = bodyText.trim() ? estimateTextH(bodyText, preBodyFontSize, preTextW, 1.5) : 0;
  const preContentH = preTitleH + preSectionsH + preBodyH + 60;
  const preAvailableForImage = canvasHeight - pad * 2 - preContentH;

  // Image size: fill available space, min 25%, max 55%
  const dynamicImgFraction = Math.min(0.55, Math.max(0.25, preAvailableForImage / canvasHeight));
  const imgW = imageLayout === "left" || imageLayout === "right"
    ? Math.round(contentW * Math.min(0.40, dynamicImgFraction + 0.05))
    : contentW;
  const imgH = imageLayout === "top" || imageLayout === "bottom"
    ? Math.round(canvasHeight * dynamicImgFraction)
    : Math.round(canvasHeight * Math.min(0.55, dynamicImgFraction + 0.1));

  // Calculate text area based on image position
  let textX = pad;
  let textY = pad;
  let textW = contentW;
  let textH = canvasHeight - pad * 2;

  if (hasImages && imageLayout === "top") {
    textY = pad + imgH + pad;
    textH = canvasHeight - imgH - pad * 3;
  } else if (hasImages && imageLayout === "bottom") {
    textH = canvasHeight - imgH - pad * 3;
  } else if (hasImages && imageLayout === "left") {
    textX = pad + imgW + pad;
    textW = contentW - imgW - pad;
  } else if (hasImages && imageLayout === "right") {
    textW = contentW - imgW - pad;
  }

  // Build elements
  const elements: PresentationSlideContent["elements"] = [];

  // Background rect
  elements.push({
    id: makeId(), type: "rect" as const,
    x: 0, y: 0, width: canvasWidth, height: canvasHeight,
    rotation: 0, fill: stylePreset.colors.background,
  });

  // Image elements
  if (hasImages && primaryImageUrl) {
    const imgX = imageLayout === "right" ? pad + textW + pad : pad;
    const imgY = imageLayout === "bottom" ? canvasHeight - imgH - pad : pad;
    elements.push({
      id: makeId(), type: "image" as const,
      x: imgX, y: imgY, width: imgW, height: imgH,
      rotation: 0, src: primaryImageUrl, alt: "Slide image",
      imageFit: "cover" as const, mediaShape: "rounded" as const, mediaCornerRadius: 20,
      imagePositionX: 50, imagePositionY: 50, imageZoom: 1,
    });
    for (let i = 1; i < imageUrls.length && i < 3; i++) {
      const extraSrc = imageUrls[i];
      if (!extraSrc) continue;
      const extraSize = Math.round(Math.min(contentW, canvasHeight) * 0.18);
      elements.push({
        id: makeId(), type: "image" as const,
        x: canvasWidth - pad - extraSize - (i - 1) * (extraSize + 8),
        y: imageLayout === "top" ? imgH - extraSize + pad : canvasHeight - extraSize - pad,
        width: extraSize, height: extraSize,
        rotation: 0, src: extraSrc, alt: `Image ${i + 1}`,
        imageFit: "cover" as const, mediaShape: "rounded" as const, mediaCornerRadius: 12,
        imagePositionX: 50, imagePositionY: 50, imageZoom: 1,
      });
    }
  }

  // Sidebar accent strip — reserve space
  const hasSidebarStrip = imageLayout === "none" || imageLayout === "top" || imageLayout === "bottom";
  if (hasSidebarStrip) {
    textX += Math.round(canvasWidth * 0.03);
    textW -= Math.round(canvasWidth * 0.03);
  }

  // Font sizes — scale with text area width
  const widthRatio = textW / canvasWidth;
  const baseTitleSize = canvasHeight > 900 ? 42 : 32;
  const titleFontSize = Math.round(baseTitleSize * Math.max(0.7, Math.min(1, widthRatio + 0.15)));
  const headingFontSize = Math.round((canvasHeight > 900 ? 22 : 18) * Math.max(0.8, widthRatio + 0.1));
  const bodyFontSize = Math.round((canvasHeight > 900 ? 16 : 14) * Math.max(0.85, widthRatio + 0.05));

  // Calculate total content height
  const titleEstH = estimateTextH(title, titleFontSize, textW, 1.2);
  const sectionEstimates = sections.map((sec) => ({
    headingH: estimateTextH(sec.heading, headingFontSize, textW, 1.3),
    detailH: estimateTextH(sec.details.join("\n"), bodyFontSize, textW - 16, 1.5),
  }));
  const bodyEstH = bodyText.trim() ? estimateTextH(bodyText, bodyFontSize, textW, 1.5) : 0;
  const totalContentH = titleEstH + sectionEstimates.reduce((s, e) => s + e.headingH + e.detailH + 16, 0) + bodyEstH;

  // Scale + gap distribution — fill the entire text area
  const scaleFactor = totalContentH > textH ? textH / totalContentH : 1;
  const extraSpace = Math.max(0, textH - totalContentH);
  const gapSlots = 1 + sections.length + (bodyText.trim() ? 1 : 0);
  // Use ALL extra space as gaps — distribute evenly, no cap
  const gap = totalContentH < textH
    ? Math.round(extraSpace / Math.max(1, gapSlots))
    : Math.round(8 * scaleFactor);
  // Scale up fonts proportionally when extra space is available
  const emptyRatio = textH > 0 ? extraSpace / textH : 0;
  const fillBoost = emptyRatio > 0.7 ? 1.50
    : emptyRatio > 0.5 ? 1.30
    : emptyRatio > 0.3 ? 1.15
    : 1;

  let curY = textY;

  // Title
  const finalTitleH = Math.round(titleEstH * scaleFactor * fillBoost);
  elements.push({
    id: makeId(), type: "text" as const,
    x: textX, y: curY, width: textW, height: finalTitleH,
    rotation: 0, text: title, color: stylePreset.colors.text,
    fontSize: Math.round(titleFontSize * Math.max(0.7, scaleFactor) * fillBoost),
    fontFamily: stylePreset.typography.titleFontFamily,
    fontWeight: "700" as const, textAlign: "left" as const,
    lineHeight: isThai ? 1.5 : 1.2,
  });
  curY += finalTitleH + (isThai ? 12 : 8);

  // Accent line under title
  elements.push({
    id: makeId(), type: "line" as const,
    x: textX, y: curY, width: Math.round(textW * 0.3), height: 3,
    rotation: 0, stroke: stylePreset.colors.primary, strokeWidth: 3,
  });
  curY += 12 + gap;

  // Sections
  for (let si = 0; si < sections.length; si++) {
    const section = sections[si]!;
    const est = sectionEstimates[si]!;
    const secHeadH = Math.round(est.headingH * scaleFactor * fillBoost);
    const secDetailH = Math.round(est.detailH * scaleFactor * fillBoost);

    elements.push({
      id: makeId(), type: "text" as const,
      x: textX, y: curY, width: textW, height: secHeadH,
      rotation: 0, text: section.heading, color: stylePreset.colors.primary,
      fontSize: Math.round(headingFontSize * Math.max(0.75, scaleFactor) * fillBoost),
      fontFamily: stylePreset.typography.titleFontFamily,
      fontWeight: "600" as const, textAlign: "left" as const,
      lineHeight: isThai ? 1.5 : 1.3,
    });
    curY += secHeadH + (isThai ? 8 : 4);

    const detailText = section.details.join("\n");
    elements.push({
      id: makeId(), type: "rect" as const,
      x: textX - 8, y: curY - 4, width: textW + 16, height: secDetailH + 12,
      rotation: 0,
      fill: stylePreset.colors.cardBg[si % 3] ?? stylePreset.colors.backgroundAlt,
      stroke: stylePreset.colors.secondary, strokeWidth: 1,
    });
    elements.push({
      id: makeId(), type: "text" as const,
      x: textX + 4, y: curY, width: textW - 16, height: secDetailH,
      rotation: 0, text: detailText, color: stylePreset.colors.text,
      fontSize: Math.round(bodyFontSize * Math.max(0.8, scaleFactor) * fillBoost),
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "normal" as const, textAlign: "left" as const, lineHeight: 1.5,
    });
    curY += secDetailH + gap + 8;
  }

  // Body text
  if (bodyText.trim()) {
    const bodyRenderedFontSize = Math.round(bodyFontSize * Math.max(0.8, scaleFactor) * fillBoost);
    const bodyEstHeight = estimateTextH(bodyText, bodyRenderedFontSize, textW, 1.5);
    const remainingH = Math.min(bodyEstHeight, Math.max(40, canvasHeight - pad - curY));
    elements.push({
      id: makeId(), type: "text" as const,
      x: textX, y: curY, width: textW, height: remainingH,
      rotation: 0, text: bodyText, color: stylePreset.colors.textMuted,
      fontSize: bodyRenderedFontSize,
      fontFamily: stylePreset.typography.bodyFontFamily,
      fontWeight: "normal" as const, textAlign: "left" as const, lineHeight: 1.5,
    });
    curY += remainingH;
  }

  // Sidebar accent strip (after content for correct height)
  if (hasSidebarStrip) {
    elements.push({
      id: makeId(), type: "rect" as const,
      x: pad, y: textY, width: Math.round(canvasWidth * 0.015), height: curY - textY,
      rotation: 0, fill: stylePreset.colors.primary,
    });
  }

  // Build slide content
  const slideContent: PresentationSlideContent = {
    elements,
    canvas: {
      ...(canvasPreset ? { preset: canvasPreset as PresentationSlideContent["canvas"] extends { preset?: infer P } ? P : never } : {}),
      width: canvasWidth,
      height: canvasHeight,
    },
    background: existingBackground ?? { type: "color", value: stylePreset.colors.background },
    ...(existingTransition ? { transition: existingTransition } : {}),
    ...(existingDurationMs ? { durationMs: existingDurationMs } : {}),
  };

  return { slideContent, warnings };
}
