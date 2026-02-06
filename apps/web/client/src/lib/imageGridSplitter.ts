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
}

export interface DetectedGrid {
  rows: number;
  cols: number;
  confidence: number;
  cellWidth: number;
  cellHeight: number;
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

/**
 * Load an image from URL and return as HTMLImageElement
 * Handles CORS issues by trying different loading strategies
 */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  // For data URLs or blob URLs, no CORS needed
  const isLocalUrl = url.startsWith("data:") || url.startsWith("blob:");

  return new Promise((resolve, reject) => {
    const img = new Image();

    // Only set crossOrigin for remote URLs that need it
    if (!isLocalUrl) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => resolve(img);

    img.onerror = () => {
      // If CORS failed, try without crossOrigin as fallback
      if (!isLocalUrl && img.crossOrigin) {
        const retryImg = new Image();
        retryImg.onload = () => resolve(retryImg);
        retryImg.onerror = () => reject(new Error("Failed to load image"));
        retryImg.src = url;
      } else {
        reject(new Error("Failed to load image"));
      }
    };

    img.src = url;
  });
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
    const aspectRatio = width / height;

    // Common AI generator output sizes
    const commonSizes = [512, 768, 1024, 1080, 1280, 1344, 1536, 1792, 2048];

    let bestMatch: DetectedGrid | null = null;
    let highestConfidence = 0;

    for (const grid of COMMON_GRIDS) {
      // Calculate expected cell dimensions
      const cellWidth = width / grid.cols;
      const cellHeight = height / grid.rows;
      const cellAspect = cellWidth / cellHeight;

      // Check if cells are roughly square or standard aspect ratios
      const isSquareCell = Math.abs(cellAspect - 1) < 0.15;
      const is16x9Cell = Math.abs(cellAspect - 16/9) < 0.15;
      const is9x16Cell = Math.abs(cellAspect - 9/16) < 0.15;
      const is4x3Cell = Math.abs(cellAspect - 4/3) < 0.15;
      const is3x4Cell = Math.abs(cellAspect - 3/4) < 0.15;

      if (isSquareCell || is16x9Cell || is9x16Cell || is4x3Cell || is3x4Cell) {
        // Check if cell dimensions are close to common sizes
        const isCommonWidth = commonSizes.some(s => Math.abs(cellWidth - s) < 50);
        const isCommonHeight = commonSizes.some(s => Math.abs(cellHeight - s) < 50);

        let confidence = 0.5; // Base confidence for matching aspect ratio

        if (isSquareCell) confidence += 0.2;
        if (isCommonWidth) confidence += 0.15;
        if (isCommonHeight) confidence += 0.15;

        // Prefer smaller grids (more likely to be AI-generated)
        if (grid.rows * grid.cols <= 4) confidence += 0.1;
        else if (grid.rows * grid.cols <= 9) confidence += 0.05;

        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = {
            rows: grid.rows,
            cols: grid.cols,
            confidence,
            cellWidth: Math.round(cellWidth),
            cellHeight: Math.round(cellHeight),
          };
        }
      }
    }

    // Only return if confidence is above threshold
    return highestConfidence >= 0.6 ? bestMatch : null;
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
  quality: number = 0.92
): Promise<SplitResult[]> {
  const img = await loadImage(imageUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  const results: SplitResult[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(cellWidth);
      canvas.height = Math.round(cellHeight);

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");

      // Draw the cropped portion
      ctx.drawImage(
        img,
        col * cellWidth,
        row * cellHeight,
        cellWidth,
        cellHeight,
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
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  // Draw the original image
  ctx.drawImage(img, 0, 0);

  // Draw grid lines
  ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
  ctx.lineWidth = 3;

  // Vertical lines
  for (let col = 1; col < cols; col++) {
    const x = col * cellWidth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Horizontal lines
  for (let row = 1; row < rows; row++) {
    const y = row * cellHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Draw cell numbers - larger and more visible
  const minDimension = Math.min(cellWidth, cellHeight);
  const fontSize = Math.max(minDimension / 2.5, 32); // Larger font, minimum 32px
  const circleRadius = Math.max(minDimension / 3.5, 24); // Larger circle, minimum 24px

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellWidth + cellWidth / 2;
      const y = row * cellHeight + cellHeight / 2;
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
export function downloadSplitImage(result: SplitResult, baseFilename: string): void {
  const link = document.createElement("a");
  link.href = result.dataUrl;
  link.download = `${baseFilename}_${result.index + 1}.jpg`;
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
  for (const result of results) {
    downloadSplitImage(result, baseFilename);
    // Small delay to prevent browser blocking multiple downloads
    await new Promise((r) => setTimeout(r, 200));
  }
}
