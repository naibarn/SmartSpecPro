import type { CameraMotionPlan } from "@smartspec/shared";

export type NormalizedCameraPoint = {
  x: number;
  y: number;
};

// BlazeFace provides six observed keypoints (eyes, nose, mouth and ears).
// A box without at least five real, normalized points is not sufficient
// evidence for an automatic Face + Activity camera plan. Do not require a
// particular model index: one keypoint can be absent while the other five are
// still valid and visibly marked on the frame.
export function observedFaceLandmarks(
  points: ReadonlyArray<NormalizedCameraPoint> | undefined,
): NormalizedCameraPoint[] | null {
  if (!points || points.length < 5) return null;
  const valid = (point: NormalizedCameraPoint) =>
    Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1
    && point.y >= 0 && point.y <= 1;
  const validPoints = points.filter(valid);
  return validPoints.length >= 5 ? validPoints : null;
}

export function hasRenderableFaceScanCoverage(
  faceSamples: number,
  faceSpanMs: number,
  durationMs: number,
): boolean {
  const requiredSpanMs = Math.min(15_000, Math.max(1_000, Math.round(durationMs * 0.45)));
  return faceSamples >= 5 && faceSpanMs >= requiredSpanMs;
}

/** A sparse face track is still safer than a centre crop for face-focused render. */
export function hasFaceRenderEvidence(
  trackPoints: ReadonlyArray<{ kind: string }>,
): boolean {
  return trackPoints.some((point) => point.kind === "face");
}

/**
 * Render must have the same concrete plan that preview/full scan evaluated.
 * A target-track marker alone is not enough: an empty keyframe list would
 * make native code fall back to a static crop while the UI still reports a
 * detected face.
 */
export function hasRenderableFaceCameraPlan(
  plan: CameraMotionPlan | null | undefined,
): plan is CameraMotionPlan {
  return Boolean(
    plan
    && plan.keyframes.length > 0
    && hasFaceRenderEvidence(plan.targetTracks ?? [])
    && plan.analysisMode === "full_scan",
  );
}

/**
 * A repeated render must not become unusable just because its refresh scan
 * returned no plan. Prefer fresh evidence, otherwise retain the last
 * validated Full Scan plan for the same source session. Quick/provisional
 * plans are deliberately rejected by hasRenderableFaceCameraPlan().
 */
export function selectFreshOrPreviousCameraPlan(
  freshPlan: CameraMotionPlan | null | undefined,
  previousPlan: CameraMotionPlan | null | undefined,
): CameraMotionPlan | null {
  if (hasRenderableFaceCameraPlan(freshPlan)) return freshPlan;
  if (hasRenderableFaceCameraPlan(previousPlan)) return previousPlan;
  return null;
}

/**
 * A completed full scan owns the face evidence used by preview and render.
 * Running a second live probe immediately after the seek-back can race the
 * decoder and overwrite a valid tracking state with a transient error.
 */
export function shouldResumeLiveFaceProbeAfterFullScan(
  scanStatus: string,
): boolean {
  return scanStatus !== "approved" && scanStatus !== "degraded";
}

export type TrackedFaceCandidate = NormalizedCameraPoint & {
  width: number;
  height: number;
  confidence: number;
};

export type TimedFaceDetectionFrame = {
  timeMs: number;
  candidates: ReadonlyArray<TrackedFaceCandidate>;
  /** Box/keypoint detections retained for degraded face-first fallback. */
  fallbackCandidates?: ReadonlyArray<TrackedFaceCandidate>;
};

export type TimedTrackedFaceCandidate = TrackedFaceCandidate & {
  timeMs: number;
};

export type MotionFramePixels = {
  timeMs: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

export type AttachedMotionPoint = NormalizedCameraPoint & {
  confidence: number;
  width: number;
  height: number;
  energy: number;
};

// The presenter can occupy only a few percent of a wide source frame while
// still being the correct subject for a 9:16 crop. Keep a minimum area so
// printed faces/logos remain rejected, but do not reject a real long-shot
// face solely because its bounding box is narrower than 5% of the frame.
const MIN_CREDIBLE_FACE_AREA = 0.0025;
const MIN_CREDIBLE_FACE_EDGE = 0.035;

function isCredibleFace(candidate: TrackedFaceCandidate): boolean {
  return candidate.width >= MIN_CREDIBLE_FACE_EDGE
    && candidate.height >= MIN_CREDIBLE_FACE_EDGE
    && candidate.width * candidate.height >= MIN_CREDIBLE_FACE_AREA;
}

/**
 * MediaPipe Tasks returns NormalizedKeypoint coordinates in the 0..1 image
 * space. Keep this conversion in one place so detector coordinates are not
 * divided by the video dimensions a second time before they reach the camera
 * planner and the native FFmpeg renderer.
 */
export function normalizedKeypointCenter(
  points: ReadonlyArray<NormalizedCameraPoint>,
  fallback: NormalizedCameraPoint,
): NormalizedCameraPoint {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length === 0) return fallback;
  const center = valid.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  return {
    x: Math.max(0, Math.min(1, center.x / valid.length)),
    y: Math.max(0, Math.min(1, center.y / valid.length)),
  };
}

/**
 * Bounding boxes are substantially steadier than individual eye/nose/mouth
 * landmarks while a person talks. Keep a small landmark contribution for
 * composition accuracy without letting expressions steer the rendered crop.
 */
export function stableFaceCenter(
  points: ReadonlyArray<NormalizedCameraPoint>,
  boxCenter: NormalizedCameraPoint,
): NormalizedCameraPoint {
  const landmarkCenter = normalizedKeypointCenter(points, boxCenter);
  return {
    x: Math.max(0, Math.min(1, boxCenter.x * 0.8 + landmarkCenter.x * 0.2)),
    y: Math.max(0, Math.min(1, boxCenter.y * 0.8 + landmarkCenter.y * 0.2)),
  };
}

/**
 * Select one continuous face track for a scan. The first frame favours the
 * largest credible face, then later frames may only continue near that same
 * subject. This prevents printed/cartoon faces on products from taking over
 * the camera merely because one detection has a higher confidence score.
 */
export function selectTrackedFaceCandidate(
  candidates: ReadonlyArray<TrackedFaceCandidate>,
  previous: TrackedFaceCandidate | null,
): TrackedFaceCandidate | null {
  const valid = candidates.filter((candidate) => (
    Number.isFinite(candidate.x)
    && Number.isFinite(candidate.y)
    && Number.isFinite(candidate.width)
    && Number.isFinite(candidate.height)
    && Number.isFinite(candidate.confidence)
    && candidate.width > 0
    && candidate.height > 0
    && candidate.confidence >= 0.3
  ));
  if (valid.length === 0) return null;

  const areaScore = (candidate: TrackedFaceCandidate) => Math.min(1, candidate.width * candidate.height * 35);
  if (!previous) {
    const credible = valid.filter(isCredibleFace);
    return [...credible].sort((left, right) => (
      right.confidence * 0.6 + areaScore(right) * 0.4
    ) - (
      left.confidence * 0.6 + areaScore(left) * 0.4
    ))[0] ?? null;
  }

  const continuityRadius = Math.max(0.12, Math.min(0.18, Math.max(previous.width, previous.height)));
  const previousArea = Math.max(0.0001, previous.width * previous.height);
  const continuous = valid.filter((candidate) => (
    Math.hypot(candidate.x - previous.x, candidate.y - previous.y) <= continuityRadius
    && Math.min(previousArea, candidate.width * candidate.height)
      / Math.max(previousArea, candidate.width * candidate.height) >= 0.35
  ));
  if (continuous.length === 0) return null;

  return [...continuous].sort((left, right) => {
    const score = (candidate: TrackedFaceCandidate) => {
      const distance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
      const continuity = Math.exp(-Math.pow(distance / Math.max(0.01, continuityRadius * 0.55), 2));
      const candidateArea = Math.max(0.0001, candidate.width * candidate.height);
      const sizeContinuity = Math.min(previousArea, candidateArea) / Math.max(previousArea, candidateArea);
      return continuity * 0.55
        + candidate.confidence * 0.2
        + areaScore(candidate) * 0.15
        + sizeContinuity * 0.1;
    };
    return score(right) - score(left);
  })[0] ?? null;
}

function faceBoxIoU(
  left: TrackedFaceCandidate,
  right: TrackedFaceCandidate,
): number {
  const leftMinX = left.x - left.width / 2;
  const leftMaxX = left.x + left.width / 2;
  const leftMinY = left.y - left.height / 2;
  const leftMaxY = left.y + left.height / 2;
  const rightMinX = right.x - right.width / 2;
  const rightMaxX = right.x + right.width / 2;
  const rightMinY = right.y - right.height / 2;
  const rightMaxY = right.y + right.height / 2;
  const intersectionWidth = Math.max(0, Math.min(leftMaxX, rightMaxX) - Math.max(leftMinX, rightMinX));
  const intersectionHeight = Math.max(0, Math.min(leftMaxY, rightMaxY) - Math.max(leftMinY, rightMinY));
  const intersection = intersectionWidth * intersectionHeight;
  const union = left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * MediaPipe can emit two overlapping boxes for the same face on a seeked
 * frame. If both enter the tracker, one physical presenter is split into
 * several short tracks and a persistent false face can win on coverage.
 * Keep the strongest overlapping detection once per frame before tracking.
 */
export function deduplicateFaceCandidates(
  candidates: ReadonlyArray<TrackedFaceCandidate>,
): TrackedFaceCandidate[] {
  const valid = candidates
    .filter((candidate) => (
      Number.isFinite(candidate.x)
      && Number.isFinite(candidate.y)
      && Number.isFinite(candidate.width)
      && Number.isFinite(candidate.height)
      && Number.isFinite(candidate.confidence)
      && candidate.width > 0
      && candidate.height > 0
      && candidate.confidence >= 0.3
    ))
    .sort((left, right) => (
      right.confidence - left.confidence
      || right.width * right.height - left.width * left.height
    ));
  const kept: TrackedFaceCandidate[] = [];
  for (const candidate of valid) {
    const isDuplicate = kept.some((existing) => {
      const areaRatio = Math.min(
        candidate.width * candidate.height,
        existing.width * existing.height,
      ) / Math.max(
        candidate.width * candidate.height,
        existing.width * existing.height,
      );
      const centerDistance = Math.hypot(candidate.x - existing.x, candidate.y - existing.y);
      const nearSameFace = centerDistance <= Math.max(
        0.025,
        Math.max(candidate.width, candidate.height, existing.width, existing.height) * 0.55,
      ) && areaRatio >= 0.45;
      return faceBoxIoU(candidate, existing) >= 0.35 || nearSameFace;
    });
    if (!isDuplicate) kept.push(candidate);
  }
  return kept;
}

/**
 * Select a face when the strict subject gates are inconclusive. This path is
 * deliberately explicit and is only used as a degraded face-first fallback;
 * the normal selector above still rejects tiny/low-confidence false faces.
 */
export function selectFallbackFaceCandidate(
  candidates: ReadonlyArray<TrackedFaceCandidate>,
  previous: TrackedFaceCandidate | null,
): TrackedFaceCandidate | null {
  const valid = candidates.filter((candidate) => (
    Number.isFinite(candidate.x)
    && Number.isFinite(candidate.y)
    && Number.isFinite(candidate.width)
    && Number.isFinite(candidate.height)
    && Number.isFinite(candidate.confidence)
    && candidate.width > 0
    && candidate.height > 0
  ));
  if (valid.length === 0) return null;
  if (!previous) {
    return [...valid].sort((left, right) => (
      right.width * right.height * 0.7 + right.confidence * 0.3
      - (left.width * left.height * 0.7 + left.confidence * 0.3)
    ))[0] ?? null;
  }
  return [...valid].sort((left, right) => {
    const score = (candidate: TrackedFaceCandidate) => {
      const distance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
      const distanceScore = Math.exp(-Math.pow(distance / 0.28, 2));
      const area = candidate.width * candidate.height;
      return distanceScore * 0.55 + Math.min(1, area * 35) * 0.25 + candidate.confidence * 0.2;
    };
    return score(right) - score(left);
  })[0] ?? null;
}

/**
 * Builds every plausible face track before choosing the subject. A Full Scan
 * must not permanently lock onto the first detection because logos, printed
 * faces, or background patterns can be detected before the real presenter.
 * The winning track must be persistent and have a credible median face size.
 */
export function buildDominantFaceTrack(
  frames: ReadonlyArray<TimedFaceDetectionFrame>,
): TimedTrackedFaceCandidate[] {
  type FaceTrack = {
    points: TimedTrackedFaceCandidate[];
    lastFrameIndex: number;
  };

  const orderedFrames = [...frames]
    .filter((frame) => Number.isFinite(frame.timeMs))
    .sort((left, right) => left.timeMs - right.timeMs);
  const tracks: FaceTrack[] = [];

  orderedFrames.forEach((frame, frameIndex) => {
    const assignedTracks = new Set<number>();
    const candidates = deduplicateFaceCandidates(frame.candidates)
      .sort((left, right) => right.width * right.height - left.width * left.height);

    for (const candidate of candidates) {
      let bestTrackIndex = -1;
      let bestCost = Number.POSITIVE_INFINITY;
      tracks.forEach((track, trackIndex) => {
        if (assignedTracks.has(trackIndex) || frameIndex - track.lastFrameIndex > 8) return;
        const previous = track.points[track.points.length - 1];
        const previousArea = Math.max(0.0001, previous.width * previous.height);
        const candidateArea = Math.max(0.0001, candidate.width * candidate.height);
        const sizeRatio = Math.min(previousArea, candidateArea) / Math.max(previousArea, candidateArea);
        const distance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
        const radius = Math.max(0.1, Math.min(0.24, Math.max(previous.width, previous.height) * 1.4 + 0.05));
        if (sizeRatio < 0.3 || distance > radius) return;
        const cost = distance / radius + (1 - sizeRatio) * 0.35;
        if (cost < bestCost) {
          bestCost = cost;
          bestTrackIndex = trackIndex;
        }
      });

      const point = { ...candidate, timeMs: Math.max(0, Math.round(frame.timeMs)) };
      if (bestTrackIndex >= 0) {
        tracks[bestTrackIndex].points.push(point);
        tracks[bestTrackIndex].lastFrameIndex = frameIndex;
        assignedTracks.add(bestTrackIndex);
      } else {
        tracks.push({ points: [point], lastFrameIndex: frameIndex });
        assignedTracks.add(tracks.length - 1);
      }
    }
  });

  const minimumSamples = Math.min(3, orderedFrames.length);
  const eligible = tracks.filter((track) => track.points.length >= minimumSamples);
  if (eligible.length === 0) return [];
  const durationMs = Math.max(1, orderedFrames.at(-1)!.timeMs - orderedFrames[0].timeMs);
  const ranked = eligible
    .map((track) => {
      const areas = track.points
        .map((point) => point.width * point.height)
        .sort((left, right) => left - right);
      const medianArea = areas[Math.floor(areas.length / 2)] ?? 0;
      const coverage = track.points.length / Math.max(1, orderedFrames.length);
      const span = (track.points.at(-1)!.timeMs - track.points[0].timeMs) / durationMs;
      const confidence = track.points.reduce((sum, point) => sum + point.confidence, 0) / track.points.length;
      return {
        track,
        medianArea,
        coverage,
        span,
        confidence,
      };
    })
    .filter((entry) => entry.medianArea >= MIN_CREDIBLE_FACE_AREA);
  if (ranked.length === 0) return [];
  ranked.sort((left, right) => {
    // Face size alone is not a reliable subject signal: a printed/cartoon
    // face can be larger and visible for the whole clip while the real
    // presenter is smaller but has a materially stronger detector score.
    // Prefer detector confidence first, then temporal persistence; keep area
    // as a bounded tie-breaker so long-shot presenters remain eligible.
    const score = (entry: typeof left) => (
      entry.confidence * 0.45
      + entry.coverage * 0.25
      + entry.span * 0.15
      + Math.min(1, entry.medianArea * 35) * 0.15
    );
    return score(right) - score(left);
  });
  return ranked[0]?.track.points ?? [];
}

/**
 * Build a best-effort face track for rendering when strict evidence is too
 * sparse or the face is smaller/lower-confidence than the normal gates. The
 * caller must mark the resulting plan degraded; this track exists to keep the
 * camera on the detected person instead of silently reverting to centre.
 */
export function buildFallbackFaceTrack(
  frames: ReadonlyArray<TimedFaceDetectionFrame>,
): TimedTrackedFaceCandidate[] {
  const orderedFrames = [...frames]
    .filter((frame) => Number.isFinite(frame.timeMs))
    .sort((left, right) => left.timeMs - right.timeMs);
  const track: TimedTrackedFaceCandidate[] = [];
  let previous: TrackedFaceCandidate | null = null;
  for (const frame of orderedFrames) {
    const candidate = selectFallbackFaceCandidate(
      frame.fallbackCandidates ?? frame.candidates,
      previous,
    );
    if (!candidate) continue;
    const point = { ...candidate, timeMs: Math.max(0, Math.round(frame.timeMs)) };
    track.push(point);
    previous = candidate;
  }
  return track;
}

/**
 * Finds a moving patch in the presenter neighbourhood. This is deliberately
 * a small, deterministic pixel-difference detector rather than a second
 * object model: it catches a hand-held toy or product while ignoring most of
 * the distant background and the face itself. The camera planner later
 * constrains the resulting anchor so the face remains inside the crop.
 */
export function detectAttachedMotionPoint(
  previous: MotionFramePixels,
  current: MotionFramePixels,
  face: TrackedFaceCandidate,
): AttachedMotionPoint | null {
  if (previous.width !== current.width || previous.height !== current.height
    || previous.width <= 0 || previous.height <= 0
    || previous.pixels.length !== current.pixels.length) return null;
  const width = current.width;
  const height = current.height;
  const roiMinX = Math.max(0, Math.floor((face.x - 0.3) * width));
  const roiMaxX = Math.min(width - 1, Math.ceil((face.x + 0.62) * width));
  const roiMinY = Math.max(0, Math.floor((face.y - 0.25) * height));
  const roiMaxY = Math.min(height - 1, Math.ceil((face.y + 0.7) * height));
  const faceMinX = (face.x - Math.max(face.width * 1.45, 0.045)) * width;
  const faceMaxX = (face.x + Math.max(face.width * 1.45, 0.045)) * width;
  const faceMinY = (face.y - Math.max(face.height * 1.55, 0.065)) * height;
  const faceMaxY = (face.y + Math.max(face.height * 1.55, 0.065)) * height;
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;
  let changedPixels = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = roiMinY; y <= roiMaxY; y += 1) {
    for (let x = roiMinX; x <= roiMaxX; x += 1) {
      if (x >= faceMinX && x <= faceMaxX && y >= faceMinY && y <= faceMaxY) continue;
      const index = (y * width + x) * 4;
      const previousLuma = previous.pixels[index] * 0.299
        + previous.pixels[index + 1] * 0.587
        + previous.pixels[index + 2] * 0.114;
      const currentLuma = current.pixels[index] * 0.299
        + current.pixels[index + 1] * 0.587
        + current.pixels[index + 2] * 0.114;
      const difference = Math.abs(currentLuma - previousLuma);
      if (difference < 18) continue;
      const weight = difference - 17;
      weightedX += x * weight;
      weightedY += y * weight;
      totalWeight += weight;
      changedPixels += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (changedPixels < 6 || totalWeight < 280) return null;
  const confidence = Math.max(
    0.3,
    Math.min(1, totalWeight / 3_500 + changedPixels / 700),
  );
  return {
    x: Math.max(0, Math.min(1, weightedX / totalWeight / width)),
    y: Math.max(0, Math.min(1, weightedY / totalWeight / height)),
    width: Math.max(0.025, Math.min(0.5, (maxX - minX + 1) / width)),
    height: Math.max(0.025, Math.min(0.5, (maxY - minY + 1) / height)),
    confidence,
    energy: Math.max(0, Math.min(1, totalWeight / 5_000)),
  };
}

/**
 * Finds a persistent-looking moving region anywhere in the frame. This is a
 * deliberately conservative fallback for events such as a dog entering the
 * shot or a hand reaching to a distant object; the attached detector above
 * only searches near the verified face. Concentrating changed pixels in one
 * coarse grid cell rejects most global exposure/camera noise.
 */
export function detectGlobalMotionPoint(
  previous: MotionFramePixels,
  current: MotionFramePixels,
  face?: TrackedFaceCandidate,
): AttachedMotionPoint | null {
  if (previous.width !== current.width || previous.height !== current.height
    || previous.width <= 0 || previous.height <= 0
    || previous.pixels.length !== current.pixels.length) return null;
  const width = current.width;
  const height = current.height;
  const gridWidth = 8;
  const gridHeight = 5;
  const gridWeights = new Float64Array(gridWidth * gridHeight);
  const gridCounts = new Uint32Array(gridWidth * gridHeight);
  const faceMinX = face ? (face.x - Math.max(face.width * 1.8, 0.06)) * width : -1;
  const faceMaxX = face ? (face.x + Math.max(face.width * 1.8, 0.06)) * width : -1;
  const faceMinY = face ? (face.y - Math.max(face.height * 1.8, 0.08)) * height : -1;
  const faceMaxY = face ? (face.y + Math.max(face.height * 1.8, 0.08)) * height : -1;
  let totalWeight = 0;
  let changedPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (face && x >= faceMinX && x <= faceMaxX && y >= faceMinY && y <= faceMaxY) continue;
      const index = (y * width + x) * 4;
      const previousLuma = previous.pixels[index] * 0.299
        + previous.pixels[index + 1] * 0.587
        + previous.pixels[index + 2] * 0.114;
      const currentLuma = current.pixels[index] * 0.299
        + current.pixels[index + 1] * 0.587
        + current.pixels[index + 2] * 0.114;
      const difference = Math.abs(currentLuma - previousLuma);
      if (difference < 24) continue;
      const weight = difference - 23;
      const gridX = Math.min(gridWidth - 1, Math.floor((x / width) * gridWidth));
      const gridY = Math.min(gridHeight - 1, Math.floor((y / height) * gridHeight));
      const gridIndex = gridY * gridWidth + gridX;
      gridWeights[gridIndex] += weight;
      gridCounts[gridIndex] += 1;
      totalWeight += weight;
      changedPixels += 1;
    }
  }

  if (changedPixels < 12 || totalWeight < 500) return null;
  let strongestGridIndex = 0;
  for (let index = 1; index < gridWeights.length; index += 1) {
    if (gridWeights[index] > gridWeights[strongestGridIndex]) strongestGridIndex = index;
  }
  const strongestWeight = gridWeights[strongestGridIndex];
  // A moving subject produces both an old and a new silhouette, so its
  // changed pixels can span a few adjacent cells. Keep the concentration
  // threshold above uniform exposure/camera noise without requiring the
  // subject to fit inside one grid cell.
  if (strongestWeight / totalWeight < 0.07 || gridCounts[strongestGridIndex] < 6) return null;

  const strongestGridX = strongestGridIndex % gridWidth;
  const strongestGridY = Math.floor(strongestGridIndex / gridWidth);
  const minPixelX = Math.floor((strongestGridX / gridWidth) * width);
  const maxPixelX = Math.min(width - 1, Math.ceil(((strongestGridX + 1) / gridWidth) * width) - 1);
  const minPixelY = Math.floor((strongestGridY / gridHeight) * height);
  const maxPixelY = Math.min(height - 1, Math.ceil(((strongestGridY + 1) / gridHeight) * height) - 1);
  let weightedX = 0;
  let weightedY = 0;
  let localWeight = 0;
  let localChangedPixels = 0;
  let localMinX = width;
  let localMaxX = -1;
  let localMinY = height;
  let localMaxY = -1;
  for (let y = minPixelY; y <= maxPixelY; y += 1) {
    for (let x = minPixelX; x <= maxPixelX; x += 1) {
      if (face && x >= faceMinX && x <= faceMaxX && y >= faceMinY && y <= faceMaxY) continue;
      const index = (y * width + x) * 4;
      const previousLuma = previous.pixels[index] * 0.299
        + previous.pixels[index + 1] * 0.587
        + previous.pixels[index + 2] * 0.114;
      const currentLuma = current.pixels[index] * 0.299
        + current.pixels[index + 1] * 0.587
        + current.pixels[index + 2] * 0.114;
      const difference = Math.abs(currentLuma - previousLuma);
      if (difference < 24) continue;
      const weight = difference - 23;
      weightedX += x * weight;
      weightedY += y * weight;
      localWeight += weight;
      localChangedPixels += 1;
      localMinX = Math.min(localMinX, x);
      localMaxX = Math.max(localMaxX, x);
      localMinY = Math.min(localMinY, y);
      localMaxY = Math.max(localMaxY, y);
    }
  }
  if (localWeight <= 0) return null;
  return {
    x: Math.max(0, Math.min(1, weightedX / localWeight / width)),
    y: Math.max(0, Math.min(1, weightedY / localWeight / height)),
    width: Math.max(0.04, Math.min(0.6, (localMaxX - localMinX + 1) / width)),
    height: Math.max(0.04, Math.min(0.6, (localMaxY - localMinY + 1) / height)),
    confidence: Math.max(
      0.3,
      Math.min(1, strongestWeight / 3_500 + localChangedPixels / 500),
    ),
    energy: Math.max(0, Math.min(1, strongestWeight / 5_000)),
  };
}
