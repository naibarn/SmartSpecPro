import {
  presentationSlideContentSchema,
  type PresentationComponentInstance,
  type PresentationSlideContent,
  type PresentationSlideElement,
} from "./contracts";

function normalizeElement(element: PresentationSlideElement): PresentationSlideElement {
  if (element.type === "text") {
    return {
      id: element.id,
      type: "text",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      opacity: element.opacity,
      rotation: element.rotation,
      text: element.text,
      color: element.color,
      fontSize: element.fontSize,
      fontFamily: element.fontFamily,
      fontWeight: element.fontWeight,
      fontStyle: element.fontStyle,
      textDecoration: element.textDecoration,
      textAlign: element.textAlign,
      lineHeight: element.lineHeight,
      letterSpacing: element.letterSpacing,
      backgroundColor: element.backgroundColor,
    };
  }

  if (element.type === "image") {
    return {
      id: element.id,
      type: "image",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      opacity: element.opacity,
      rotation: element.rotation,
      src: element.src,
      alt: element.alt,
      imageFit: element.imageFit,
      mediaShape: element.mediaShape,
      mediaCornerRadius: element.mediaCornerRadius,
      imagePositionX: element.imagePositionX,
      imagePositionY: element.imagePositionY,
      imageZoom: element.imageZoom,
      imagePrompt: element.imagePrompt,
      imageModelId: element.imageModelId,
      imageReferenceUrls: element.imageReferenceUrls,
      imageExtraParams: element.imageExtraParams,
      svgContent: element.svgContent,
      svgColor: element.svgColor,
      mediaMotion: element.mediaMotion,
    };
  }

  if (element.type === "video") {
    return {
      id: element.id,
      type: "video",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      opacity: element.opacity,
      rotation: element.rotation,
      src: element.src,
      poster: element.poster,
      title: element.title,
      muted: element.muted,
      loop: element.loop,
      videoFit: element.videoFit,
      mediaShape: element.mediaShape,
      mediaCornerRadius: element.mediaCornerRadius,
      videoPositionX: element.videoPositionX,
      videoPositionY: element.videoPositionY,
      videoZoom: element.videoZoom,
      videoPrompt: element.videoPrompt,
      videoModelId: element.videoModelId,
      videoReferenceUrls: element.videoReferenceUrls,
      videoExtraParams: element.videoExtraParams,
      mediaMotion: element.mediaMotion,
    };
  }

  if (element.type === "rect") {
    return {
      id: element.id,
      type: "rect",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      opacity: element.opacity,
      rotation: element.rotation,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
    };
  }

  return {
    id: element.id,
    type: "line",
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    opacity: element.opacity,
    rotation: element.rotation,
    fill: element.fill,
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
  };
}

function normalizeComponent(component: PresentationComponentInstance): PresentationComponentInstance {
  return {
    id: component.id,
    componentId: component.componentId,
    componentType: component.componentType,
    definitionRevision: component.definitionRevision,
    slotBindings: component.slotBindings.map((binding) => ({ ...binding })),
    fallbackElements: component.fallbackElements.map((element) => normalizeElement(element)),
    preview: component.preview
      ? {
        previewHash: component.preview.previewHash,
        target: component.preview.target,
        status: component.preview.status,
        artifactUri: component.preview.artifactUri,
        rendererVersion: component.preview.rendererVersion,
        fontCatalogVersion: component.preview.fontCatalogVersion,
        definitionRevision: component.preview.definitionRevision,
        staleReason: component.preview.staleReason,
        createdAt: component.preview.createdAt,
        updatedAt: component.preview.updatedAt,
        attemptCount: component.preview.attemptCount,
      }
      : undefined,
  };
}

export function normalizePresentationSlideContent(input: unknown): PresentationSlideContent {
  const parsed = presentationSlideContentSchema.parse(input);

  return {
    elements: parsed.elements.map((element) => normalizeElement(element)),
    components: parsed.components?.map((component) => normalizeComponent(component)),
    renderOrder: parsed.renderOrder ? [...parsed.renderOrder] : undefined,
    canvas: parsed.canvas
      ? {
        preset: parsed.canvas.preset,
        width: parsed.canvas.width,
        height: parsed.canvas.height,
      }
      : undefined,
    transition: parsed.transition,
    durationMs: parsed.durationMs,
    pendingMediaJobs: parsed.pendingMediaJobs?.map((job) => ({ ...job })),
    background: parsed.background ? { ...parsed.background } : undefined,
    visualOnly: parsed.visualOnly,
    aiDesign: parsed.aiDesign
      ? {
        ...parsed.aiDesign,
        candidateModes: parsed.aiDesign.candidateModes?.map((candidate) => ({ ...candidate })),
        candidateRecipes: parsed.aiDesign.candidateRecipes?.map((candidate) => ({ ...candidate })),
        overrideHistory: parsed.aiDesign.overrideHistory?.map((entry) => ({ ...entry })),
        fitScore: parsed.aiDesign.fitScore ? { ...parsed.aiDesign.fitScore } : undefined,
        narrative: parsed.aiDesign.narrative
          ? {
            ...parsed.aiDesign.narrative,
            body: [...parsed.aiDesign.narrative.body],
            sections: parsed.aiDesign.narrative.sections?.map((section) => ({
              heading: section.heading,
              details: [...section.details],
            })),
            mediaPlan: parsed.aiDesign.narrative.mediaPlan?.map((entry) => ({
              slotId: entry.slotId,
              prompt: entry.prompt,
            })),
          }
          : undefined,
        sourceTrace: parsed.aiDesign.sourceTrace?.map((entry) => ({ ...entry })),
        fallbackHistory: parsed.aiDesign.fallbackHistory?.map((entry) => ({ ...entry })),
        layoutExecution: parsed.aiDesign.layoutExecution
          ? { ...parsed.aiDesign.layoutExecution }
          : undefined,
        mediaModeMetadata: parsed.aiDesign.mediaModeMetadata
          ? { ...parsed.aiDesign.mediaModeMetadata }
          : undefined,
      }
      : undefined,
  };
}
