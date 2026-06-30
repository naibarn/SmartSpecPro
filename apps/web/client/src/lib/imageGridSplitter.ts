/**
 * Image Grid Splitter Utility
 * Detects grid patterns in images and splits them into individual images
 */

export interface GridDimension {
  rows: number;
  cols: number;
  label: string;
}

export interface SplitResult {
  blob: Blob;
  index: number;
  row: number;
  col: number;
  dataUrl: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  targetAspectRatio?: string;
}

export interface CropRatio {
  value: string;
  label: string;
}

export interface CropResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  ratio: string;
}

export interface CropOptions {
  focusX?: number; // 0..1 (left..right), default 0.5
  focusY?: number; // 0..1 (top..bottom), default 0.5
  scale?: number; // 0.1..1 (crop area size), default 1
}

export interface DetectedGrid {
  rows: number;
  cols: number;
  confidence: number;
  cellWidth: number;
  cellHeight: number;
}

export interface SplitImageOptions {
  targetAspectRatio?: string;
  cropOptions?: CropOptions;
}

const SPLIT_PREVIEW_MAX_EDGE_PX = 1800;
const GRID_DETECTION_ANALYSIS_MAX_EDGE_PX = 480;
const DEFAULT_GRID_MIN_CONFIDENCE = 0.66;
const NON_DEFAULT_GRID_MIN_CONFIDENCE = 0.74;
const NON_DEFAULT_GRID_MIN_MARGIN = 0.06;
const STANDARD_CELL_ASPECTS = [1, 16 / 9, 9 / 16, 4 / 3, 3 / 4, 4 / 5, 5 / 4];
const COMMON_AI_OUTPUT_SIZES = [512, 768, 1024, 1080, 1280, 1344, 1536, 1792, 2048];

function shouldProxyImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const currentOrigin = typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
    return !currentOrigin || parsed.origin !== currentOrigin;
  } catch {
    return false;
  }
}

function getCanvasSafeImageProxyUrl(url: string): string {
  return `/api/media/image-proxy?url=${encodeURIComponent(url)}`;
}

// Common grid patterns used by AI image generators
export const COMMON_GRIDS: GridDimension[] = [
  { rows: 2, cols: 2, label: "2x2 (4 images)" },
  { rows: 2, cols: 3, label: "2x3 (6 images)" },
  { rows: 3, cols: 2, label: "3x2 (6 images)" },
  { rows: 2, cols: 4, label: "2x4 (8 images)" },
  { rows: 4, cols: 2, label: "4x2 (8 images)" },
  { rows: 3, cols: 3, label: "3x3 (9 images)" },
  { rows: 2, cols: 5, label: "2x5 (10 images)" },
  { rows: 5, cols: 2, label: "5x2 (10 images)" },
  { rows: 3, cols: 4, label: "3x4 (12 images)" },
  { rows: 4, cols: 3, label: "4x3 (12 images)" },
  { rows: 4, cols: 4, label: "4x4 (16 images)" },
];

export const DEFAULT_SPLIT_GRID: GridDimension = { rows: 3, cols: 3, label: "3x3 (9 images)" };

export const COMMON_CROP_RATIOS: CropRatio[] = [
  { value: "1:1", label: "1:1" },
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
  { value: "3:4", label: "3:4" },
  { value: "4:3", label: "4:3" },
  { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" },
];

/**
 * Load an image from URL and return as HTMLImageElement
 * Handles CORS issues by trying different loading strategies
 */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  // For data URLs or blob URLs, no CORS needed
  const isLocalUrl = url.startsWith("data:") || url.startsWith("blob:");
  const canUseProxyFallback = !isLocalUrl && shouldProxyImageUrl(url);

  const load = (sourceUrl: string, allowProxyFallback: boolean): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const img = new Image();

    // Only set crossOrigin for remote URLs that need it
    if (!isLocalUrl) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => resolve(img);

    img.onerror = () => {
      if (allowProxyFallback && canUseProxyFallback) {
        load(getCanvasSafeImageProxyUrl(url), false).then(resolve, reject);
        return;
      }
      if (!isLocalUrl) {
        reject(new Error("Failed to load image (CORS blocked or unreachable source)"));
      } else {
        reject(new Error("Failed to load image"));
      }
    };

    img.src = sourceUrl;
  });

  return load(url, true);
}

interface GridLineEvidence {
  available: boolean;
  combined: number;
}

interface GridCandidateScore {
  grid: GridDimension;
  confidence: number;
  cellWidth: number;
  cellHeight: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isDefaultSplitGrid(grid: Pick<GridDimension, "rows" | "cols">): boolean {
  return grid.rows === DEFAULT_SPLIT_GRID.rows && grid.cols === DEFAULT_SPLIT_GRID.cols;
}

function bestAspectScore(aspectRatio: number): number {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return 0;
  const tolerance = Math.log(1.35);
  const bestDistance = STANDARD_CELL_ASPECTS.reduce((best, target) => {
    const distance = Math.abs(Math.log(aspectRatio / target));
    return Math.min(best, distance);
  }, Number.POSITIVE_INFINITY);
  return clamp01(1 - bestDistance / tolerance);
}

function commonCellSizeScore(cellWidth: number, cellHeight: number): number {
  const bestWidthDistance = COMMON_AI_OUTPUT_SIZES.reduce(
    (best, size) => Math.min(best, Math.abs(cellWidth - size)),
    Number.POSITIVE_INFINITY,
  );
  const bestHeightDistance = COMMON_AI_OUTPUT_SIZES.reduce(
    (best, size) => Math.min(best, Math.abs(cellHeight - size)),
    Number.POSITIVE_INFINITY,
  );
  const bestDistance = Math.min(bestWidthDistance, bestHeightDistance);
  return clamp01(1 - bestDistance / 96);
}

function scoreGridPrior(grid: GridDimension): number {
  let score = 0;
  const cells = grid.rows * grid.cols;
  if (isDefaultSplitGrid(grid)) score += 0.14;
  if (grid.rows === grid.cols) score += 0.03;
  if (cells === 9) score += 0.03;
  else if (cells <= 6) score += 0.015;
  else if (cells > 12) score -= 0.03;
  return score;
}

function toDetectedGrid(candidate: GridCandidateScore): DetectedGrid {
  return {
    rows: candidate.grid.rows,
    cols: candidate.grid.cols,
    confidence: Math.round(candidate.confidence * 100) / 100,
    cellWidth: Math.round(candidate.cellWidth),
    cellHeight: Math.round(candidate.cellHeight),
  };
}

export function detectGridFromDimensions(
  width: number,
  height: number,
  lineEvidenceByGrid: Record<string, GridLineEvidence | undefined> = {},
): DetectedGrid | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const candidates = COMMON_GRIDS
    .map((grid): GridCandidateScore | null => {
      const cellWidth = width / grid.cols;
      const cellHeight = height / grid.rows;
      const aspectScore = bestAspectScore(cellWidth / cellHeight);
      if (aspectScore < 0.38) return null;

      const evidence = lineEvidenceByGrid[`${grid.rows}x${grid.cols}`];
      const hasLineEvidence = Boolean(evidence?.available);
      const lineScore = hasLineEvidence ? clamp01(evidence?.combined ?? 0) : 0;
      let confidence = 0.25
        + aspectScore * 0.42
        + commonCellSizeScore(cellWidth, cellHeight) * 0.08
        + scoreGridPrior(grid)
        + lineScore * 0.34;

      if (!hasLineEvidence) {
        confidence = Math.min(confidence, isDefaultSplitGrid(grid) ? 0.68 : 0.67);
      } else if (lineScore < 0.18) {
        confidence = Math.min(confidence, isDefaultSplitGrid(grid) ? 0.65 : 0.64);
      }

      return {
        grid,
        confidence: clamp01(confidence),
        cellWidth,
        cellHeight,
      };
    })
    .filter((candidate): candidate is GridCandidateScore => Boolean(candidate))
    .sort((a, b) => b.confidence - a.confidence);

  const best = candidates[0];
  if (!best) return null;

  const defaultCandidate = candidates.find((candidate) => isDefaultSplitGrid(candidate.grid));
  if (isDefaultSplitGrid(best.grid)) {
    return best.confidence >= DEFAULT_GRID_MIN_CONFIDENCE ? toDetectedGrid(best) : null;
  }

  const second = candidates[1];
  const margin = second ? best.confidence - second.confidence : best.confidence;
  if (best.confidence >= NON_DEFAULT_GRID_MIN_CONFIDENCE && margin >= NON_DEFAULT_GRID_MIN_MARGIN) {
    return toDetectedGrid(best);
  }

  if (
    defaultCandidate
    && defaultCandidate.confidence >= DEFAULT_GRID_MIN_CONFIDENCE
    && best.confidence - defaultCandidate.confidence < 0.12
  ) {
    return null;
  }

  return null;
}

function smoothProfile(profile: number[], radius = 2): number[] {
  return profile.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const value = profile[index + offset];
      if (value !== undefined) {
        total += value;
        count += 1;
      }
    }
    return count > 0 ? total / count : 0;
  });
}

function percentile(values: number[], target: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * target)));
  return sorted[index] ?? 0;
}

function scoreProfileAtPosition(profile: number[], ratio: number): number {
  const center = Math.round(ratio * (profile.length - 1));
  const radius = Math.max(2, Math.round(profile.length * 0.012));
  let best = 0;
  for (let offset = -radius; offset <= radius; offset++) {
    best = Math.max(best, profile[center + offset] ?? 0);
  }
  return best;
}

function scoreGridLineProfile(profile: number[], divisions: number): number {
  if (divisions <= 1 || profile.length < 8) return 0;
  const smoothed = smoothProfile(profile);
  const median = percentile(smoothed, 0.5);
  const high = percentile(smoothed, 0.9);
  const range = Math.max(1, high - median);
  const scores: number[] = [];

  for (let index = 1; index < divisions; index++) {
    const boundaryScore = scoreProfileAtPosition(smoothed, index / divisions);
    scores.push(clamp01((boundaryScore - median) / range));
  }

  if (scores.length === 0) return 0;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function buildGridLineEvidence(
  verticalProfile: number[],
  horizontalProfile: number[],
): Record<string, GridLineEvidence> {
  const evidence: Record<string, GridLineEvidence> = {};
  for (const grid of COMMON_GRIDS) {
    const vertical = scoreGridLineProfile(verticalProfile, grid.cols);
    const horizontal = scoreGridLineProfile(horizontalProfile, grid.rows);
    evidence[`${grid.rows}x${grid.cols}`] = {
      available: true,
      combined: (vertical + horizontal) / 2,
    };
  }
  return evidence;
}

function extractGridLineEvidence(img: HTMLImageElement): Record<string, GridLineEvidence> | null {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const scale = Math.min(1, GRID_DETECTION_ANALYSIS_MAX_EDGE_PX / Math.max(width, height));
  const analysisWidth = Math.max(24, Math.round(width * scale));
  const analysisHeight = Math.max(24, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = analysisWidth;
  canvas.height = analysisHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, analysisWidth, analysisHeight);
  const imageData = ctx.getImageData(0, 0, analysisWidth, analysisHeight).data;
  const luma = new Float32Array(analysisWidth * analysisHeight);

  for (let index = 0; index < luma.length; index++) {
    const source = index * 4;
    luma[index] = (imageData[source] ?? 0) * 0.2126
      + (imageData[source + 1] ?? 0) * 0.7152
      + (imageData[source + 2] ?? 0) * 0.0722;
  }

  const verticalProfile = new Array<number>(analysisWidth).fill(0);
  const horizontalProfile = new Array<number>(analysisHeight).fill(0);

  for (let x = 1; x < analysisWidth - 1; x++) {
    let total = 0;
    for (let y = 0; y < analysisHeight; y++) {
      const rowOffset = y * analysisWidth;
      total += Math.abs(luma[rowOffset + x + 1]! - luma[rowOffset + x - 1]!);
    }
    verticalProfile[x] = total / analysisHeight;
  }

  for (let y = 1; y < analysisHeight - 1; y++) {
    let total = 0;
    const rowOffset = y * analysisWidth;
    const previousRowOffset = (y - 1) * analysisWidth;
    const nextRowOffset = (y + 1) * analysisWidth;
    for (let x = 0; x < analysisWidth; x++) {
      total += Math.abs(luma[nextRowOffset + x]! - luma[previousRowOffset + x]!);
    }
    horizontalProfile[y] = total / analysisWidth;
  }

  return buildGridLineEvidence(verticalProfile, horizontalProfile);
}

/**
 * Detect if an image is likely a grid based on aspect ratio and common patterns
 * Returns detected grid with confidence score
 */
export async function detectGrid(imageUrl: string): Promise<DetectedGrid | null> {
  try {
    const img = await loadImage(imageUrl);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    let lineEvidence: Record<string, GridLineEvidence> | null = null;
    try {
      lineEvidence = extractGridLineEvidence(img);
    } catch {
      lineEvidence = null;
    }

    return detectGridFromDimensions(width, height, lineEvidence ?? undefined);
  } catch (error) {
    console.error("Error detecting grid:", error);
    return null;
  }
}

/**
 * Split an image into grid cells
 */
export async function splitImage(
  imageUrl: string,
  rows: number,
  cols: number,
  outputFormat: "image/png" | "image/jpeg" = "image/jpeg",
  quality: number = 0.92,
  options: SplitImageOptions = {}
): Promise<SplitResult[]> {
  const img = await loadImage(imageUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  const results: SplitResult[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sourceCellX = col * cellWidth;
      const sourceCellY = row * cellHeight;
      const crop = options.targetAspectRatio
        ? getCropRect(cellWidth, cellHeight, options.targetAspectRatio, {
            focusX: options.cropOptions?.focusX ?? 0.5,
            focusY: options.cropOptions?.focusY ?? 0.5,
            scale: options.cropOptions?.scale ?? 1,
          })
        : { x: 0, y: 0, width: Math.round(cellWidth), height: Math.round(cellHeight) };

      const canvas = document.createElement("canvas");
      canvas.width = crop.width;
      canvas.height = crop.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");

      // Draw the cropped portion
      ctx.drawImage(
        img,
        sourceCellX + crop.x,
        sourceCellY + crop.y,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
          outputFormat,
          quality
        );
      });

      // Get data URL for preview
      const dataUrl = canvas.toDataURL(outputFormat, quality);

      results.push({
        blob,
        index: row * cols + col,
        row,
        col,
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        sourceWidth: Math.round(cellWidth),
        sourceHeight: Math.round(cellHeight),
        targetAspectRatio: options.targetAspectRatio,
      });
    }
  }

  return results;
}

/**
 * Create a preview of how the image will be split
 */
export async function createSplitPreview(
  imageUrl: string,
  rows: number,
  cols: number
): Promise<string> {
  const img = await loadImage(imageUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const previewScale = Math.min(1, SPLIT_PREVIEW_MAX_EDGE_PX / Math.max(width, height));
  const previewWidth = Math.max(1, Math.round(width * previewScale));
  const previewHeight = Math.max(1, Math.round(height * previewScale));
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const previewCellWidth = previewWidth / cols;
  const previewCellHeight = previewHeight / rows;

  const canvas = document.createElement("canvas");
  canvas.width = previewWidth;
  canvas.height = previewHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  // Draw the original image
  ctx.drawImage(img, 0, 0, previewWidth, previewHeight);

  // Draw grid lines
  ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
  ctx.lineWidth = 3;

  // Vertical lines
  for (let col = 1; col < cols; col++) {
    const x = col * previewCellWidth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, previewHeight);
    ctx.stroke();
  }

  // Horizontal lines
  for (let row = 1; row < rows; row++) {
    const y = row * previewCellHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(previewWidth, y);
    ctx.stroke();
  }

  // Draw cell numbers - larger and more visible
  const minDimension = Math.min(previewCellWidth, previewCellHeight);
  const fontSize = Math.max(minDimension / 2.0, 44); // Very large font for better readability
  const circleRadius = Math.max(minDimension / 3.0, 30); // Larger circle for label clarity

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * previewCellWidth + previewCellWidth / 2;
      const y = row * previewCellHeight + previewCellHeight / 2;
      const num = row * cols + col + 1;

      // Draw background circle with border
      ctx.beginPath();
      ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw number with shadow for better visibility
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillText(String(num), x + 2, y + 2); // Shadow
      ctx.fillStyle = "white";
      ctx.fillText(String(num), x, y);
    }
  }

  return canvas.toDataURL("image/png");
}

/**
 * Convert Blob to File for upload
 */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}

/**
 * Download a single split result
 */
export function downloadSplitImage(result: SplitResult, baseFilename: string, displayIndex?: number): void {
  const link = document.createElement("a");
  const sequenceNumber = typeof displayIndex === "number" && Number.isFinite(displayIndex)
    ? Math.max(1, Math.floor(displayIndex))
    : result.index + 1;
  link.href = result.dataUrl;
  link.download = `${baseFilename}_${sequenceNumber}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download all split images as a zip (requires JSZip)
 * For now, downloads individually
 */
export async function downloadAllSplitImages(
  results: SplitResult[],
  baseFilename: string
): Promise<void> {
  for (const [position, result] of results.entries()) {
    downloadSplitImage(result, baseFilename, position + 1);
    // Small delay to prevent browser blocking multiple downloads
    await new Promise((r) => setTimeout(r, 200));
  }
}

function parseAspectRatio(aspectRatio: string): { width: number; height: number } {
  const parts = String(aspectRatio).split(":").map((v) => Number(v));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1]) || parts[0] <= 0 || parts[1] <= 0) {
    return { width: 1, height: 1 };
  }
  return { width: parts[0], height: parts[1] };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getCropRect(
  imageWidth: number,
  imageHeight: number,
  aspectRatio: string,
  options: CropOptions = {}
): { x: number; y: number; width: number; height: number } {
  const ratio = parseAspectRatio(aspectRatio);
  const targetAspect = ratio.width / ratio.height;
  const imageAspect = imageWidth / imageHeight;

  let cropWidth = imageWidth;
  let cropHeight = imageHeight;

  if (imageAspect > targetAspect) {
    cropHeight = imageHeight;
    cropWidth = Math.round(cropHeight * targetAspect);
  } else {
    cropWidth = imageWidth;
    cropHeight = Math.round(cropWidth / targetAspect);
  }

  // Allow smaller crop window at fixed aspect ratio
  const safeScale = clamp(options.scale ?? 1, 0.1, 1);
  cropWidth = Math.max(1, Math.round(cropWidth * safeScale));
  cropHeight = Math.max(1, Math.round(cropHeight * safeScale));

  const maxX = Math.max(0, imageWidth - cropWidth);
  const maxY = Math.max(0, imageHeight - cropHeight);
  const safeFocusX = clamp(options.focusX ?? 0.5, 0, 1);
  const safeFocusY = clamp(options.focusY ?? 0.5, 0, 1);

  const centerX = safeFocusX * imageWidth;
  const centerY = safeFocusY * imageHeight;

  const x = Math.round(clamp(centerX - cropWidth / 2, 0, maxX));
  const y = Math.round(clamp(centerY - cropHeight / 2, 0, maxY));

  return { x, y, width: cropWidth, height: cropHeight };
}

export async function createCropPreview(
  imageUrl: string,
  aspectRatio: string,
  options: CropOptions = {}
): Promise<string> {
  const img = await loadImage(imageUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const crop = getCropRect(width, height, aspectRatio, options);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  ctx.drawImage(img, 0, 0, width, height);

  // Darken areas outside crop frame
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    crop.x,
    crop.y,
    crop.width,
    crop.height
  );

  // Crop border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.004));
  ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);

  // Ratio badge
  const badgePaddingX = 10;
  const badgePaddingY = 6;
  const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.025));
  ctx.font = `bold ${fontSize}px sans-serif`;
  const text = `Crop ${aspectRatio}`;
  const textWidth = ctx.measureText(text).width;
  const badgeX = crop.x + 8;
  const badgeY = crop.y + 8;
  const badgeW = textWidth + badgePaddingX * 2;
  const badgeH = fontSize + badgePaddingY * 2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  ctx.fillStyle = "white";
  ctx.textBaseline = "middle";
  ctx.fillText(text, badgeX + badgePaddingX, badgeY + badgeH / 2);

  return canvas.toDataURL("image/png");
}

export async function cropImageToAspect(
  imageUrl: string,
  aspectRatio: string,
  outputFormat: "image/png" | "image/jpeg" = "image/jpeg",
  quality: number = 0.92,
  options: CropOptions = {}
): Promise<CropResult> {
  const img = await loadImage(imageUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const crop = getCropRect(width, height, aspectRatio, options);

  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
      outputFormat,
      quality
    );
  });

  return {
    blob,
    dataUrl: canvas.toDataURL(outputFormat, quality),
    width: crop.width,
    height: crop.height,
    ratio: aspectRatio,
  };
}

export function downloadCroppedImage(result: CropResult, baseFilename: string): void {
  const link = document.createElement("a");
  link.href = result.dataUrl;
  link.download = `${baseFilename}_${result.ratio.replace(":", "x")}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
