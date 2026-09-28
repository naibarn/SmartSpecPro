/** Shared, runtime-neutral evidence contract for browser and Worker camera analysis. */
export const CAMERA_EVIDENCE_VERSION = "camera.evidence.v1" as const;

export const FACE_LANDMARK_NAMES = [
  "left_eye",
  "right_eye",
  "nose_tip",
  "left_mouth",
  "right_mouth",
] as const;
export type FaceLandmarkName = (typeof FACE_LANDMARK_NAMES)[number];

export type NormalizedFaceLandmark = {
  x: number;
  y: number;
  confidence: number;
  visible: boolean;
};

export type FaceRoi = {
  x: number;
  y: number;
  width: number;
  height: number;
  roll: number;
  confidence: number;
  visible: boolean;
};

export type FivePointFaceEvidence = {
  version: typeof CAMERA_EVIDENCE_VERSION;
  trackId: string;
  timeMs: number;
  /** Detector/model identity for cross-runtime parity and stale-result checks. */
  modelFingerprint?: string;
  points: Record<FaceLandmarkName, NormalizedFaceLandmark>;
  roi: FaceRoi;
};

export type AttachedActivityEvidence = {
  trackId: string;
  associatedFaceTrackId: string;
  timeMs: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  visible: boolean;
  freshnessMs: number;
  kind: "hand" | "object" | "activity";
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function normalizeFaceLandmark(
  value: unknown,
  fallback?: NormalizedFaceLandmark,
): NormalizedFaceLandmark {
  const point =
    value && typeof value === "object"
      ? (value as Partial<NormalizedFaceLandmark>)
      : {};
  return {
    x: clamp(finite(point.x) ? point.x : (fallback?.x ?? 0.5), 0, 1),
    y: clamp(finite(point.y) ? point.y : (fallback?.y ?? 0.5), 0, 1),
    confidence: clamp(
      finite(point.confidence) ? point.confidence : (fallback?.confidence ?? 0),
      0,
      1,
    ),
    visible: point.visible !== false && (fallback?.visible ?? true),
  };
}

export function normalizeFivePointFace(
  points:
    | Partial<Record<FaceLandmarkName, Partial<NormalizedFaceLandmark>>>
    | undefined,
  input: {
    trackId: string;
    timeMs: number;
    roi: Partial<FaceRoi>;
    modelFingerprint?: string;
  },
): FivePointFaceEvidence {
  const roi = input.roi;
  const center: NormalizedFaceLandmark = {
    x: clamp(
      finite(roi.x) && finite(roi.width) ? roi.x + roi.width / 2 : 0.5,
      0,
      1,
    ),
    y: clamp(
      finite(roi.y) && finite(roi.height) ? roi.y + roi.height / 2 : 0.5,
      0,
      1,
    ),
    confidence: finite(roi.confidence) ? roi.confidence : 0,
    visible: roi.visible !== false,
  };
  const normalized = {} as Record<FaceLandmarkName, NormalizedFaceLandmark>;
  for (const name of FACE_LANDMARK_NAMES)
    normalized[name] = normalizeFaceLandmark(points?.[name], center);
  return {
    version: CAMERA_EVIDENCE_VERSION,
    trackId: input.trackId,
    timeMs: Math.max(0, Math.round(finite(input.timeMs) ? input.timeMs : 0)),
    ...(input.modelFingerprint ? { modelFingerprint: input.modelFingerprint.slice(0, 160) } : {}),
    points: normalized,
    roi: {
      x: clamp(
        finite(roi.x)
          ? roi.x
          : center.x - (finite(roi.width) ? roi.width / 2 : 0.1),
        0,
        1,
      ),
      y: clamp(
        finite(roi.y)
          ? roi.y
          : center.y - (finite(roi.height) ? roi.height / 2 : 0.1),
        0,
        1,
      ),
      width: clamp(finite(roi.width) ? roi.width : 0.2, 0.001, 1),
      height: clamp(finite(roi.height) ? roi.height : 0.2, 0.001, 1),
      roll: clamp(finite(roi.roll) ? roi.roll : 0, -Math.PI, Math.PI),
      confidence: clamp(finite(roi.confidence) ? roi.confidence : 0, 0, 1),
      visible: roi.visible !== false,
    },
  };
}

export function faceRoiFromFivePointEvidence(
  evidence: FivePointFaceEvidence,
): FaceRoi {
  const points = FACE_LANDMARK_NAMES.map(
    (name) => evidence.points[name],
  ).filter((point) => point.visible);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  if (xs.length === 0) return evidence.roi;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(0.001, Math.max(...xs) - x);
  const height = Math.max(0.001, Math.max(...ys) - y);
  return {
    ...evidence.roi,
    x: clamp(x - width * 0.75, 0, 1),
    y: clamp(y - height * 0.95, 0, 1),
    width: clamp(width * 2.5, 0.001, 1),
    height: clamp(height * 2.9, 0.001, 1),
  };
}

export function isActivityAssociated(
  activity: Pick<
    AttachedActivityEvidence,
    | "associatedFaceTrackId"
    | "timeMs"
    | "freshnessMs"
    | "confidence"
    | "visible"
  >,
  faceTracks: ReadonlySet<string>,
  maxAgeMs = 2500,
): boolean {
  return (
    faceTracks.has(activity.associatedFaceTrackId) &&
    Number.isFinite(activity.timeMs) &&
    Number.isFinite(activity.freshnessMs) &&
    activity.freshnessMs >= 0 &&
    activity.freshnessMs <= maxAgeMs &&
    activity.visible !== false &&
    activity.confidence >= 0.3
  );
}

export function validateFivePointFaceEvidence(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return ["face_evidence_invalid"];
  const evidence = value as Partial<FivePointFaceEvidence>;
  const errors: string[] = [];
  if (evidence.version !== CAMERA_EVIDENCE_VERSION)
    errors.push("face_evidence_version_invalid");
  if (
    typeof evidence.trackId !== "string" ||
    evidence.trackId.length < 1 ||
    evidence.trackId.length > 128
  )
    errors.push("face_track_id_invalid");
  if (
    evidence.modelFingerprint !== undefined &&
    (typeof evidence.modelFingerprint !== "string" ||
      evidence.modelFingerprint.length < 1 ||
      evidence.modelFingerprint.length > 160)
  )
    errors.push("face_model_fingerprint_invalid");
  if (!Number.isFinite(evidence.timeMs) || (evidence.timeMs ?? -1) < 0)
    errors.push("face_evidence_time_invalid");
  if (
    !evidence.points ||
    FACE_LANDMARK_NAMES.some((name) => !evidence.points?.[name])
  )
    errors.push("face_landmarks_missing");
  if (evidence.points) {
    for (const name of FACE_LANDMARK_NAMES) {
      const point = evidence.points[name];
      if (
        !point ||
        ![point.x, point.y, point.confidence].every(finite) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1 ||
        point.confidence < 0 ||
        point.confidence > 1
      ) {
        errors.push(`face_landmark_invalid:${name}`);
      }
    }
  }
  const roi = evidence.roi;
  if (
    !roi ||
    ![roi.x, roi.y, roi.width, roi.height, roi.roll, roi.confidence].every(
      finite,
    ) ||
    roi.x < 0 ||
    roi.y < 0 ||
    roi.width <= 0 ||
    roi.height <= 0 ||
    roi.x > 1 ||
    roi.y > 1 ||
    roi.width > 1 ||
    roi.height > 1 ||
    roi.confidence < 0 ||
    roi.confidence > 1
  )
    errors.push("face_roi_invalid");
  return [...new Set(errors)];
}
