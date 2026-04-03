function stripOuterCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:[\w-]+)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function stripJsonEnvelope(raw: string): string {
  const stripped = stripOuterCodeFences(raw).trim();
  if (!stripped) {
    return "";
  }
  const objectStart = stripped.indexOf("{");
  const objectEnd = stripped.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return stripped.slice(objectStart, objectEnd + 1).trim();
  }
  const arrayStart = stripped.indexOf("[");
  const arrayEnd = stripped.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return stripped.slice(arrayStart, arrayEnd + 1).trim();
  }
  return stripped;
}

function safeParseJson(raw: string): unknown {
  const candidate = stripJsonEnvelope(raw);
  if (!candidate) {
    return null;
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inferCanvasRatioFromSummarySpec(value: unknown): "16:9" | "9:16" | "4:5" | "5:4" {
  if (typeof value !== "string") {
    return "16:9";
  }
  const trimmed = value.trim();
  if (trimmed === "16:9" || trimmed === "9:16" || trimmed === "4:5" || trimmed === "5:4") {
    return trimmed;
  }
  if (trimmed === "1080x1920" || trimmed === "720x1280") {
    return "9:16";
  }
  if (trimmed === "1080x1350") {
    return "4:5";
  }
  if (trimmed === "1350x1080") {
    return "5:4";
  }
  if (trimmed === "1920x1080" || trimmed === "1280x720") {
    return "16:9";
  }
  return "16:9";
}

function convertSummarySlidesToSpec(value: Record<string, unknown>): Record<string, unknown> | null {
  const slides = Array.isArray(value.slides) ? value.slides : [];
  const convertedSlides = slides
    .map((slide, index) => {
      if (!isRecord(slide)) {
        return null;
      }
      const headline = typeof slide.headline === "string" ? slide.headline.trim() : "";
      const bodyText = typeof slide.body_text === "string" ? slide.body_text.trim() : "";
      const image = isRecord(slide.image) ? slide.image : null;
      const imageReference = typeof image?.reference === "string" ? image.reference.trim() : "";
      if (!headline && !bodyText && !imageReference) {
        return null;
      }
      const elements: Array<Record<string, unknown>> = [];
      if (headline) {
        elements.push({
          kind: "text",
          role: "title",
          text: headline,
          xPct: 8,
          yPct: 6,
          wPct: 80,
          hPct: 12,
          fontFace: "Noto Serif Thai",
          fontSize: 38,
          color: "#4A332A",
          align: "left",
          bold: true,
        });
      }
      if (imageReference) {
        elements.push({
          kind: "image",
          role: "hero",
          source: imageReference,
          xPct: 8,
          yPct: 26,
          wPct: 84,
          hPct: bodyText ? 30 : 42,
          fit: "cover",
          cornerRadius: 18,
        });
      }
      if (bodyText) {
        elements.push({
          kind: "text",
          role: "body",
          text: bodyText,
          xPct: 10,
          yPct: imageReference ? 60 : 24,
          wPct: 80,
          hPct: imageReference ? 16 : 26,
          fontFace: "Noto Sans Thai",
          fontSize: 20,
          color: "#4A332A",
          align: "left",
        });
      }
      return {
        id: `slide_${String(index + 1).padStart(2, "0")}`,
        background: "#F7F2EC",
        elements,
      };
    })
    .filter((slide): slide is Record<string, unknown> => Boolean(slide));

  if (convertedSlides.length === 0) {
    return null;
  }

  return {
    canvas: {
      ratio: inferCanvasRatioFromSummarySpec(
        typeof value.page_size_or_ratio === "string"
          ? value.page_size_or_ratio
          : (isRecord(value.canvas) && typeof value.canvas.ratio === "string" ? value.canvas.ratio : ""),
      ),
    },
    theme: {
      background: "#F7F2EC",
      text: "#4A332A",
    },
    slides: convertedSlides,
  };
}

function slideHasMeaningfulContent(slide: unknown): boolean {
  if (!isRecord(slide)) {
    return false;
  }

  if (isRecord(slide.slideContent)) {
    return true;
  }

  const elements = Array.isArray(slide.elements) ? slide.elements : [];
  return elements.some((element) => isRecord(element));
}

function renderManifestPageHasMeaningfulContent(page: unknown): boolean {
  if (!isRecord(page)) {
    return false;
  }
  const textBlocks = Array.isArray(page.text_blocks) ? page.text_blocks : [];
  const imageBlocks = Array.isArray(page.image_blocks) ? page.image_blocks : [];
  const legacyBlocks = Array.isArray(page.blocks) ? page.blocks : [];
  return (
    textBlocks.some((block) => isRecord(block))
    || imageBlocks.some((block) => isRecord(block))
    || legacyBlocks.some((block) => isRecord(block))
  );
}

function scoreCandidateSpec(spec: Record<string, unknown>): number {
  if (spec.output_format === "render_manifest_json" && Array.isArray(spec.pages)) {
    return spec.pages.filter((page) => renderManifestPageHasMeaningfulContent(page)).length;
  }
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  return slides.filter((slide) => slideHasMeaningfulContent(slide)).length;
}

function collectSlideSpecCandidates(value: unknown): Record<string, unknown>[] {
  if (typeof value === "string") {
    return collectSlideSpecCandidates(safeParseJson(value));
  }
  if (!isRecord(value)) {
    return [];
  }

  const candidates: Record<string, unknown>[] = [];

  if (value.output_format === "render_manifest_json" && Array.isArray(value.pages)) {
    candidates.push(value);
  }

  if (Array.isArray(value.slides)) {
    candidates.push(value);
    const converted = convertSummarySlidesToSpec(value);
    if (converted) {
      candidates.push(converted);
    }
  }

  const nestedCandidates = [
    value.layoutSpec,
    value.layout_spec,
    value.result,
    value.output,
    value.data,
    value.payload,
  ];

  for (const candidate of nestedCandidates) {
    candidates.push(...collectSlideSpecCandidates(candidate));
  }

  return candidates;
}

function extractSlideSpec(value: unknown): Record<string, unknown> | null {
  const candidates = collectSlideSpecCandidates(value);
  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce<Record<string, unknown> | null>((best, candidate) => {
    if (!best) {
      return candidate;
    }
    return scoreCandidateSpec(candidate) > scoreCandidateSpec(best) ? candidate : best;
  }, null);
}

export type GeneratedSlideImportabilityStatus =
  | "empty"
  | "malformed"
  | "missing-slides"
  | "empty-slides"
  | "importable";

export function inspectGeneratedSlideImportability(value: unknown): {
  status: GeneratedSlideImportabilityStatus;
  totalSlides: number;
  importableSlides: number;
} {
  if (typeof value === "string" && !value.trim()) {
    return {
      status: "empty",
      totalSlides: 0,
      importableSlides: 0,
    };
  }

  const parsed = typeof value === "string" ? safeParseJson(value) : value;
  if (parsed == null) {
    return {
      status: "malformed",
      totalSlides: 0,
      importableSlides: 0,
    };
  }

  const spec = extractSlideSpec(parsed);
  if (!spec) {
    return {
      status: "missing-slides",
      totalSlides: 0,
      importableSlides: 0,
    };
  }

  if (spec.output_format === "render_manifest_json" && Array.isArray(spec.pages)) {
    const totalSlides = spec.pages.length;
    const importableSlides = spec.pages.filter((page) => renderManifestPageHasMeaningfulContent(page)).length;
    return {
      status: importableSlides > 0 ? "importable" : "empty-slides",
      totalSlides,
      importableSlides,
    };
  }

  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  const importableSlides = slides.filter((slide) => slideHasMeaningfulContent(slide)).length;
  return {
    status: importableSlides > 0 ? "importable" : "empty-slides",
    totalSlides: slides.length,
    importableSlides,
  };
}

export function countImportableGeneratedSlides(value: unknown): number {
  return inspectGeneratedSlideImportability(value).importableSlides;
}

export function hasImportableGeneratedSlides(value: unknown): boolean {
  return inspectGeneratedSlideImportability(value).status === "importable";
}
