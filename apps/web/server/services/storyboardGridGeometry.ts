/**
 * Storyboard Grid Geometry Detection
 *
 * Server-side port of the pixel-boundary-detection math used by the client
 * Canvas-based grid tool (client/src/lib/imageGridSplitter.ts), adapted to
 * find the ACTUAL 3x3 divider positions of a generated storyboard grid image
 * instead of assuming blind equal thirds.
 *
 * Unlike the client tool (which only scores confidence near an evenly-spaced
 * expected position to decide "is this a grid at all"), this module also
 * searches a wider window around each expected divider position to locate
 * the real boundary, since AI-generated 3x3 grids are frequently uneven.
 *
 * This module never throws - any failure degrades to `usedFallback: true` so
 * callers can fall back to the existing blind equal-thirds split.
 */

export interface StoryboardGridRect {
  shotNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StoryboardGridDetectionResult {
  rects: StoryboardGridRect[];
  confidence: number;
  usedFallback: boolean;
}

// Matches the client tool's GRID_DETECTION_ANALYSIS_MAX_EDGE_PX.
const GRID_DETECTION_ANALYSIS_MAX_EDGE_PX = 480;

// Matches the client tool's DEFAULT_GRID_MIN_CONFIDENCE.
export const DEFAULT_GRID_MIN_CONFIDENCE = 0.66;

// Wider than the client tool's ~1.2% search radius (which only verifies an
// evenly-spaced position), since here we need to locate the real boundary of
// potentially uneven real-world generated grids.
const BOUNDARY_SEARCH_WINDOW_RATIO = 0.06;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
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
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * target))
  );
  return sorted[index] ?? 0;
}

interface BoundaryDetection {
  position: number;
  confidence: number;
}

function findBestBoundary(
  smoothedProfile: number[],
  median: number,
  range: number,
  expectedRatio: number,
  searchWindowRatio: number
): BoundaryDetection {
  const length = smoothedProfile.length;
  const center = Math.round(expectedRatio * (length - 1));
  const windowRadius = Math.max(2, Math.round(length * searchWindowRatio));
  let bestPosition = center;
  let bestValue = smoothedProfile[center] ?? 0;
  for (let offset = -windowRadius; offset <= windowRadius; offset++) {
    const index = center + offset;
    const value = smoothedProfile[index];
    if (value !== undefined && value > bestValue) {
      bestValue = value;
      bestPosition = index;
    }
  }
  return { position: bestPosition, confidence: clamp01((bestValue - median) / range) };
}

function buildGradientProfiles(
  data: Buffer | Uint8Array,
  analysisWidth: number,
  analysisHeight: number
): { verticalProfile: number[]; horizontalProfile: number[] } {
  const verticalProfile = new Array<number>(analysisWidth).fill(0);
  const horizontalProfile = new Array<number>(analysisHeight).fill(0);

  for (let x = 1; x < analysisWidth - 1; x++) {
    let total = 0;
    for (let y = 0; y < analysisHeight; y++) {
      const rowOffset = y * analysisWidth;
      total += Math.abs(
        (data[rowOffset + x + 1] ?? 0) - (data[rowOffset + x - 1] ?? 0)
      );
    }
    verticalProfile[x] = total / analysisHeight;
  }

  for (let y = 1; y < analysisHeight - 1; y++) {
    let total = 0;
    const previousRowOffset = (y - 1) * analysisWidth;
    const nextRowOffset = (y + 1) * analysisWidth;
    for (let x = 0; x < analysisWidth; x++) {
      total += Math.abs(
        (data[nextRowOffset + x] ?? 0) - (data[previousRowOffset + x] ?? 0)
      );
    }
    horizontalProfile[y] = total / analysisWidth;
  }

  return { verticalProfile, horizontalProfile };
}

function storyboardGridDividerInsetPx(shortestCellSide: number): number {
  if (shortestCellSide <= 0) return 0;
  return Math.max(1, Math.min(4, Math.floor(shortestCellSide * 0.01)));
}

export async function detectStoryboardGridRects(
  buffer: Buffer
): Promise<StoryboardGridDetectionResult> {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const img = sharp(buffer);
    const meta = await img.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 30 || height < 30) {
      return { rects: [], confidence: 0, usedFallback: true };
    }

    const scale = Math.min(1, GRID_DETECTION_ANALYSIS_MAX_EDGE_PX / Math.max(width, height));
    const analysisWidth = Math.max(24, Math.round(width * scale));
    const analysisHeight = Math.max(24, Math.round(height * scale));

    const { data } = await sharp(buffer)
      .resize(analysisWidth, analysisHeight, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { verticalProfile, horizontalProfile } = buildGradientProfiles(
      data,
      analysisWidth,
      analysisHeight
    );
    const smoothedVertical = smoothProfile(verticalProfile);
    const smoothedHorizontal = smoothProfile(horizontalProfile);

    const verticalMedian = percentile(smoothedVertical, 0.5);
    const verticalHigh = percentile(smoothedVertical, 0.9);
    const verticalRange = Math.max(1, verticalHigh - verticalMedian);

    const horizontalMedian = percentile(smoothedHorizontal, 0.5);
    const horizontalHigh = percentile(smoothedHorizontal, 0.9);
    const horizontalRange = Math.max(1, horizontalHigh - horizontalMedian);

    const verticalDivider1 = findBestBoundary(
      smoothedVertical,
      verticalMedian,
      verticalRange,
      1 / 3,
      BOUNDARY_SEARCH_WINDOW_RATIO
    );
    const verticalDivider2 = findBestBoundary(
      smoothedVertical,
      verticalMedian,
      verticalRange,
      2 / 3,
      BOUNDARY_SEARCH_WINDOW_RATIO
    );
    const horizontalDivider1 = findBestBoundary(
      smoothedHorizontal,
      horizontalMedian,
      horizontalRange,
      1 / 3,
      BOUNDARY_SEARCH_WINDOW_RATIO
    );
    const horizontalDivider2 = findBestBoundary(
      smoothedHorizontal,
      horizontalMedian,
      horizontalRange,
      2 / 3,
      BOUNDARY_SEARCH_WINDOW_RATIO
    );

    const overallConfidence =
      (verticalDivider1.confidence +
        verticalDivider2.confidence +
        horizontalDivider1.confidence +
        horizontalDivider2.confidence) /
      4;

    if (overallConfidence < DEFAULT_GRID_MIN_CONFIDENCE) {
      return { rects: [], confidence: overallConfidence, usedFallback: true };
    }
    if (
      verticalDivider1.position >= verticalDivider2.position ||
      horizontalDivider1.position >= horizontalDivider2.position
    ) {
      return { rects: [], confidence: overallConfidence, usedFallback: true };
    }

    const scaleBackX = width / analysisWidth;
    const scaleBackY = height / analysisHeight;
    const x1 = Math.round(verticalDivider1.position * scaleBackX);
    const x2 = Math.round(verticalDivider2.position * scaleBackX);
    const y1 = Math.round(horizontalDivider1.position * scaleBackY);
    const y2 = Math.round(horizontalDivider2.position * scaleBackY);

    const columnBounds = [0, x1, x2, width];
    const rowBounds = [0, y1, y2, height];

    const cellWidths = [
      columnBounds[1] - columnBounds[0],
      columnBounds[2] - columnBounds[1],
      columnBounds[3] - columnBounds[2],
    ];
    const cellHeights = [
      rowBounds[1] - rowBounds[0],
      rowBounds[2] - rowBounds[1],
      rowBounds[3] - rowBounds[2],
    ];
    const shortestCellSide = Math.min(...cellWidths, ...cellHeights);
    if (!Number.isFinite(shortestCellSide) || shortestCellSide <= 0) {
      return { rects: [], confidence: overallConfidence, usedFallback: true };
    }
    const inset = storyboardGridDividerInsetPx(shortestCellSide);

    const rects: StoryboardGridRect[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const shotNumber = row * 3 + col + 1;
        const rawLeft = columnBounds[col];
        const rawTop = rowBounds[row];
        const rawRight = columnBounds[col + 1];
        const rawBottom = rowBounds[row + 1];
        // Only inset the sides that border a real internal divider, never
        // the image's outer edges.
        const insetLeft = col > 0 ? inset : 0;
        const insetTop = row > 0 ? inset : 0;
        const insetRight = col < 2 ? inset : 0;
        const insetBottom = row < 2 ? inset : 0;
        const left = rawLeft + insetLeft;
        const top = rawTop + insetTop;
        const rectWidth = Math.max(1, rawRight - insetRight - left);
        const rectHeight = Math.max(1, rawBottom - insetBottom - top);
        rects.push({ shotNumber, left, top, width: rectWidth, height: rectHeight });
      }
    }

    return { rects, confidence: overallConfidence, usedFallback: false };
  } catch {
    return { rects: [], confidence: 0, usedFallback: true };
  }
}
