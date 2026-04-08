import path from "node:path";
import { RATIO_PRESETS, STYLE_PALETTES } from "./constants.mjs";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeRequest(raw) {
  const request = raw?.request ?? {};
  const ratio = request.canvasRatio ?? "16:9";
  const ratioInfo = RATIO_PRESETS[ratio];
  if (!ratioInfo) throw new Error(`Unsupported canvasRatio: ${ratio}`);

  const designStyle = request.designStyle && request.designStyle !== "auto"
    ? request.designStyle
    : inferDefaultStyle(request);
  const stylePreset = STYLE_PALETTES[designStyle] ?? STYLE_PALETTES["luxury-editorial"];
  const theme = {
    ...stylePreset,
    ...(request.theme ?? {})
  };

  const normalized = {
    request,
    projectTitle: request.projectTitle ?? "Untitled Project",
    language: request.language ?? "th",
    canvasRatio: ratio,
    ratioInfo,
    compositionMode: request.compositionMode ?? "auto",
    designStyle,
    density: request.density ?? "balanced",
    outputFormats: request.outputFormats ?? ["json", "pptx"],
    randomizeLayouts: request.randomizeLayouts !== false,
    seed: request.seed ?? "default-seed",
    pageLimit: {
      maxPages: request.pagination?.maxPages ?? request.maxSlides ?? 5,
      allowFewerPages: request.pagination?.allowFewerPages !== false,
      overflowStrategy: request.pagination?.overflowStrategy ?? "condense"
    },
    theme,
    brand: request.brand ?? {},
    llm: {
      planningMode: request.llm?.planningMode ?? "skill-agent",
      externalLayoutSpecPath: request.llm?.externalLayoutSpecPath ?? null,
      preservePromptArtifacts: request.llm?.preservePromptArtifacts ?? false
    },
    renderOptions: {
      pptxFileName: request.renderOptions?.pptxFileName ?? "slides.pptx",
      jsonFileName: request.renderOptions?.jsonFileName ?? "layout-spec.json",
      mdFileName: request.renderOptions?.mdFileName ?? "slides.md",
      pdfFileName: request.renderOptions?.pdfFileName ?? "slides.pdf",
      pdfEngine: request.renderOptions?.pdfEngine ?? "libreoffice"
    }
  };

  const content = request.content ?? {};
  if (Array.isArray(content.pages)) {
    normalized.contentMode = "manual-pages";
    normalized.sharedImagePool = normalizeImagePool(content.sharedImagePool ?? null);
    normalized.pages = content.pages.map((page, idx) => ({
      id: `page_${String(idx + 1).padStart(2, "0")}`,
      titleHint: page.titleHint ?? "",
      text: cleanText(page.text ?? ""),
      pageIntentHint: page.pageIntentHint ?? "auto",
      forceArchetype: page.forceArchetype ?? "auto",
      images: normalizeImages(page.images).slice(0, 3),
      imageRefs: toArray(page.imageRefs).slice(0, 3),
      imageSelectionMode: page.imageSelectionMode ?? "manual-only",
      maxImagesOverride: page.maxImagesOverride ?? null
    }));
  } else {
    normalized.contentMode = "auto-split";
    normalized.rawText = cleanText(content.rawText ?? "");
    normalized.titleHint = content.titleHint ?? "";
    normalized.pageIntentHint = content.pageIntentHint ?? "auto";
    normalized.globalImagePool = normalizeImagePool(content.imagePool ?? {
      images: content.images ?? [],
      reusePolicy: content.imageReusePolicy ?? "avoid-repeat-until-used"
    });
  }

  return normalized;
}

function normalizeImagePool(pool) {
  if (!pool) {
    return {
      images: [],
      maxImagesPerPage: 3,
      minImagesPerPage: 0,
      reusePolicy: "avoid-repeat-until-used",
      selectionStrategy: "auto-diverse",
      coverPageImagePolicy: "auto",
      allowUnusedImages: true
    };
  }
  const imageList = normalizeImages(pool.images ?? pool);
  return {
    images: imageList,
    maxImagesPerPage: clampInt(pool.maxImagesPerPage ?? 3, 0, 3),
    minImagesPerPage: clampInt(pool.minImagesPerPage ?? 0, 0, 3),
    reusePolicy: pool.reusePolicy ?? "avoid-repeat-until-used",
    selectionStrategy: pool.selectionStrategy ?? "auto-diverse",
    coverPageImagePolicy: pool.coverPageImagePolicy ?? "auto",
    allowUnusedImages: pool.allowUnusedImages !== false
  };
}

function normalizeImages(items) {
  return toArray(items)
    .filter(Boolean)
    .map((img, index) => ({
      id: img.id ?? slugify(img.source || `image-${index + 1}`),
      source: img.source ?? "",
      alt: img.alt ?? "",
      caption: img.caption ?? "",
      tags: toArray(img.tags).map(String).filter(Boolean).slice(0, 12),
      roleHint: img.roleHint ?? "auto",
      priority: clampInt(img.priority ?? 3, 1, 5),
      focalPoint: img.focalPoint ?? null
    }))
    .filter((img) => img.source);
}

function clampInt(value, min, max) {
  const n = Number.isFinite(Number(value)) ? Number(value) : min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function inferDefaultStyle(request) {
  const language = String(request.language ?? "").toLowerCase();
  const ratio = request.canvasRatio ?? "16:9";
  if (language === "th" || ratio === "9:16") return "family-editorial";
  if (ratio === "5:4") return "premium-folio";
  return "heritage-editorial";
}

export function cleanText(text) {
  return String(text ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function slugify(input) {
  return String(input ?? "output")
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "output";
}

export function resolveImagePath(sourcePath, inputFilePath = process.cwd()) {
  if (!sourcePath) return "";
  if (/^https?:\/\//i.test(sourcePath)) return sourcePath;
  if (path.isAbsolute(sourcePath)) return sourcePath;
  return path.resolve(path.dirname(inputFilePath), sourcePath);
}
