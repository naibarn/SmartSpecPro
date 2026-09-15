export type NormalizedCameraPoint = {
  x: number;
  y: number;
};

export type TrackedFaceCandidate = NormalizedCameraPoint & {
  width: number;
  height: number;
  confidence: number;
};

export type TimedFaceDetectionFrame = {
  timeMs: number;
  candidates: ReadonlyArray<TrackedFaceCandidate>;
};

export type TimedTrackedFaceCandidate = TrackedFaceCandidate & {
  timeMs: number;
};

const MIN_CREDIBLE_FACE_AREA = 0.0035;
const MIN_CREDIBLE_FACE_EDGE = 0.05;

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
      right.confidence * 0.35 + areaScore(right) * 0.65
    ) - (
      left.confidence * 0.35 + areaScore(left) * 0.65
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
    const candidates = [...frame.candidates]
      .filter((candidate) => Number.isFinite(candidate.x)
        && Number.isFinite(candidate.y)
        && candidate.width > 0
        && candidate.height > 0
        && candidate.confidence >= 0.3)
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
  const largestMedianArea = Math.max(...ranked.map((entry) => entry.medianArea), MIN_CREDIBLE_FACE_AREA);
  ranked.sort((left, right) => {
    const score = (entry: typeof left) => (
      (entry.medianArea / largestMedianArea) * 0.5
      + entry.coverage * 0.3
      + entry.span * 0.15
      + entry.confidence * 0.05
    );
    return score(right) - score(left);
  });
  return ranked[0]?.track.points ?? [];
}
