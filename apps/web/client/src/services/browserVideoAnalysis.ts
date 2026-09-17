import {
  normalizeFivePointFace,
  type AttachedActivityEvidence,
  type FaceLandmarkName,
  type FivePointFaceEvidence,
} from "@smartspec/shared";

export type BrowserAnalysisStatus =
  "browser_ready" | "browser_degraded" | "unsupported" | "stale";
export type BrowserCapabilityProfile = {
  status: BrowserAnalysisStatus;
  faceRuntime: "mediapipe_tasks_vision" | "none";
  audioRuntime: "webaudio" | "none";
  worker: boolean;
  modelFingerprint: string;
  capabilityFingerprint: string;
  warnings: string[];
};

export type BrowserFaceAnalysisResult = {
  status: BrowserAnalysisStatus;
  sourceFingerprint: string;
  points: FivePointFaceEvidence[];
  activity: AttachedActivityEvidence[];
  capability: BrowserCapabilityProfile;
  warnings: string[];
};

export type BrowserSilenceAnalysisResult = {
  status: BrowserAnalysisStatus;
  sourceDurationMs: number;
  ranges: Array<{ startMs: number; endMs: number }>;
  audioStreamIndex: number | null;
  capability: BrowserCapabilityProfile;
  warnings: string[];
};

const MODEL_PATH = "/models/blaze_face_full_range.tflite";
const WASM_PATH = "/mediapipe/wasm/";
const MODEL_FINGERPRINT = "mediapipe-tasks-vision:1.0.1:blaze_face_full_range";
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function capabilityFingerprint(
  input: Pick<
    BrowserCapabilityProfile,
    "faceRuntime" | "audioRuntime" | "worker" | "modelFingerprint"
  >
): string {
  return [
    input.faceRuntime,
    input.audioRuntime,
    input.worker ? "worker" : "main",
    input.modelFingerprint,
  ].join(":");
}

export function probeBrowserVideoAnalysis(): BrowserCapabilityProfile {
  const hasWorker = typeof Worker !== "undefined";
  const hasAudio =
    typeof AudioContext !== "undefined" ||
    typeof (globalThis as { webkitAudioContext?: unknown })
      .webkitAudioContext !== "undefined";
  const hasVideo = typeof HTMLVideoElement !== "undefined";
  const faceRuntime = hasVideo ? "mediapipe_tasks_vision" : "none";
  const audioRuntime = hasAudio ? "webaudio" : "none";
  const status: BrowserAnalysisStatus =
    faceRuntime === "none" && audioRuntime === "none"
      ? "unsupported"
      : faceRuntime === "none" || audioRuntime === "none"
        ? "browser_degraded"
        : "browser_ready";
  const warnings = [
    ...(faceRuntime === "none" ? ["face_runtime_unavailable"] : []),
    ...(audioRuntime === "none" ? ["audio_runtime_unavailable"] : []),
  ];
  return {
    status,
    faceRuntime,
    audioRuntime,
    worker: hasWorker,
    modelFingerprint: MODEL_FINGERPRINT,
    capabilityFingerprint: capabilityFingerprint({
      faceRuntime,
      audioRuntime,
      worker: hasWorker,
      modelFingerprint: MODEL_FINGERPRINT,
    }),
    warnings,
  };
}

type NativeKeypoint = { x: number; y: number };
type NativeDetection = {
  boundingBox?: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
  keypoints?: NativeKeypoint[];
  categories?: Array<{ score?: number }>;
};

type MotionSample = { pixels: Uint8ClampedArray; width: number; height: number };

function captureMotionSample(video: HTMLVideoElement): MotionSample | null {
  if (typeof document === "undefined" || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = Math.max(1, Math.round(64 * video.videoHeight / video.videoWidth));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { pixels: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

function detectMotionRegion(previous: MotionSample | null, current: MotionSample | null): { x: number; y: number; width: number; height: number; score: number } | null {
  if (!previous || !current || previous.width !== current.width || previous.height !== current.height) return null;
  let changed = 0;
  let minX = current.width;
  let minY = current.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < current.height; y += 1) {
    for (let x = 0; x < current.width; x += 1) {
      const offset = (y * current.width + x) * 4;
      const delta = Math.abs(current.pixels[offset] - previous.pixels[offset]) + Math.abs(current.pixels[offset + 1] - previous.pixels[offset + 1]) + Math.abs(current.pixels[offset + 2] - previous.pixels[offset + 2]);
      if (delta < 72) continue;
      changed += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  const score = changed / (current.width * current.height);
  if (changed < 4 || score < 0.002 || maxX < minX || maxY < minY) return null;
  const padX = Math.max(2, Math.round((maxX - minX + 1) * 0.2));
  const padY = Math.max(2, Math.round((maxY - minY + 1) * 0.2));
  return {
    x: clamp((minX - padX) / current.width, 0, 1),
    y: clamp((minY - padY) / current.height, 0, 1),
    width: clamp((maxX - minX + 1 + padX * 2) / current.width, 0.02, 1),
    height: clamp((maxY - minY + 1 + padY * 2) / current.height, 0.02, 1),
    score,
  };
}

function isMotionAttachedToFace(
  motion: { x: number; y: number; width: number; height: number },
  face: FivePointFaceEvidence,
): boolean {
  const faceLeft = Math.max(0, face.roi.x - face.roi.width * 0.55);
  const faceTop = Math.max(0, face.roi.y - face.roi.height * 0.7);
  const faceRight = Math.min(1, face.roi.x + face.roi.width * 1.55);
  const faceBottom = Math.min(1, face.roi.y + face.roi.height * 2.1);
  const motionRight = motion.x + motion.width;
  const motionBottom = motion.y + motion.height;
  if (motion.x <= faceRight && motionRight >= faceLeft && motion.y <= faceBottom && motionBottom >= faceTop) return true;
  const motionCenterX = motion.x + motion.width / 2;
  const motionCenterY = motion.y + motion.height / 2;
  const faceCenterX = face.roi.x + face.roi.width / 2;
  const faceCenterY = face.roi.y + face.roi.height / 2;
  return Math.hypot(motionCenterX - faceCenterX, motionCenterY - faceCenterY) <= 0.45;
}

/** Maps MediaPipe's detector output to the stable five-point contract. */
export function mapMediaPipeKeypoints(
  keypoints: ReadonlyArray<NativeKeypoint>,
  boxCenter: { x: number; y: number },
  confidence: number,
  trackId: string,
  timeMs: number,
  box: { x: number; y: number; width: number; height: number },
  modelFingerprint = MODEL_FINGERPRINT,
): FivePointFaceEvidence {
  const valid = keypoints.filter(
    point => Number.isFinite(point.x) && Number.isFinite(point.y)
  );
  const leftEye = valid[0] ?? boxCenter;
  const rightEye = valid[1] ?? boxCenter;
  const nose = valid[2] ?? boxCenter;
  const mouth = valid[3] ?? {
    x: boxCenter.x,
    y: boxCenter.y + box.height * 0.18,
  };
  const points: Partial<
    Record<
      FaceLandmarkName,
      { x: number; y: number; confidence: number; visible: boolean }
    >
  > = {
    left_eye: { ...leftEye, confidence, visible: true },
    right_eye: { ...rightEye, confidence, visible: true },
    nose_tip: { ...nose, confidence, visible: true },
    left_mouth: {
      x: clamp(mouth.x - box.width * 0.06, 0, 1),
      y: mouth.y,
      confidence: confidence * 0.9,
      visible: true,
    },
    right_mouth: {
      x: clamp(mouth.x + box.width * 0.06, 0, 1),
      y: mouth.y,
      confidence: confidence * 0.9,
      visible: true,
    },
  };
  return normalizeFivePointFace(points, {
    trackId,
    timeMs,
    modelFingerprint,
    roi: { ...box, roll: 0, confidence, visible: true },
  });
}

/** Clamp a requested source-time analysis window and keep evidence clip-relative. */
export function resolveAnalysisWindow(
  durationMs: number,
  startTimeMs = 0,
  endTimeMs = durationMs,
): { startTimeMs: number; endTimeMs: number } {
  const sourceDurationMs = Math.max(0, Math.round(Number.isFinite(durationMs) ? durationMs : 0));
  const requestedStart = Number.isFinite(startTimeMs) ? startTimeMs : 0;
  const start = Math.max(0, Math.min(sourceDurationMs, Math.round(requestedStart)));
  const requestedEnd = Math.round(Number.isFinite(endTimeMs) ? endTimeMs : sourceDurationMs);
  const boundedEnd = Math.min(sourceDurationMs || requestedEnd, requestedEnd);
  return { startTimeMs: start, endTimeMs: Math.max(start, boundedEnd) };
}

export async function analyzeFaceFrame(
  video: HTMLVideoElement,
  options: {
    sourceFingerprint: string;
    timeMs?: number;
    signal?: AbortSignal;
    trackId?: string;
  }
): Promise<BrowserFaceAnalysisResult> {
  const capability = probeBrowserVideoAnalysis();
  if (options.signal?.aborted)
    return {
      status: "stale",
      sourceFingerprint: options.sourceFingerprint,
      points: [],
      activity: [],
      capability,
      warnings: ["analysis_cancelled"],
    };
  if (
    capability.faceRuntime === "none" ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  )
    return {
      status: "browser_degraded",
      sourceFingerprint: options.sourceFingerprint,
      points: [],
      activity: [],
      capability,
      warnings: [...capability.warnings, "video_not_ready"],
    };
  try {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
    let detector;
    try {
      detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.45,
        minSuppressionThreshold: 0.3,
      });
    } catch {
      detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.45,
        minSuppressionThreshold: 0.3,
      });
    }
    const result = detector.detectForVideo(
      video,
      Math.max(1, Math.round(options.timeMs ?? video.currentTime * 1000))
    );
    const detection = result.detections?.[0] as NativeDetection | undefined;
    const box = detection?.boundingBox;
    if (!box) {
      detector.close();
      return {
        status: "browser_degraded",
        sourceFingerprint: options.sourceFingerprint,
        points: [],
        activity: [],
        capability,
        warnings: ["face_not_found"],
      };
    }
    const normalizedBox = {
      x: clamp((box.originX ?? 0) / video.videoWidth, 0, 1),
      y: clamp((box.originY ?? 0) / video.videoHeight, 0, 1),
      width: clamp(box.width / video.videoWidth, 0.001, 1),
      height: clamp(box.height / video.videoHeight, 0.001, 1),
    };
    const center = {
      x: normalizedBox.x + normalizedBox.width / 2,
      y: normalizedBox.y + normalizedBox.height / 2,
    };
    const confidence = clamp(detection?.categories?.[0]?.score ?? 0, 0, 1);
    const point = mapMediaPipeKeypoints(
      detection?.keypoints ?? [],
      center,
      confidence,
      options.trackId ?? "web-face-quick",
      options.timeMs ?? Math.round(video.currentTime * 1000),
      normalizedBox
    );
    detector.close();
    return {
      status: "browser_ready",
      sourceFingerprint: options.sourceFingerprint,
      points: [point],
      activity: [],
      capability,
      warnings: [],
    };
  } catch (error) {
    return {
      status: "browser_degraded",
      sourceFingerprint: options.sourceFingerprint,
      points: [],
      activity: [],
      capability,
      warnings: [
        error instanceof Error
          ? `face_runtime_error:${error.message.slice(0, 80)}`
          : "face_runtime_error",
      ],
    };
  }
}

export async function analyzeFaceAndActivity(
  video: HTMLVideoElement,
  options: {
    sourceFingerprint: string;
    signal?: AbortSignal;
    maxSamples?: number;
    /** Source-time window to analyse. Returned evidence is relative to startTimeMs. */
    startTimeMs?: number;
    endTimeMs?: number;
  }
): Promise<BrowserFaceAnalysisResult> {
  const sampleCount = Math.max(2, Math.min(8, options.maxSamples ?? 4));
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const sourceDurationMs = Math.max(0, Math.round(duration * 1000));
  const analysisWindow = resolveAnalysisWindow(
    sourceDurationMs,
    options.startTimeMs,
    options.endTimeMs,
  );
  const startTimeMs = analysisWindow.startTimeMs;
  const endTimeMs = analysisWindow.endTimeMs;
  const windowDurationMs = Math.max(0, endTimeMs - startTimeMs);
  const points: FivePointFaceEvidence[] = [];
  const activity: AttachedActivityEvidence[] = [];
  let capability = probeBrowserVideoAnalysis();
  const originalTime = video.currentTime;
  let previousMotion: MotionSample | null = null;
  try {
    for (let index = 0; index < sampleCount; index += 1) {
      if (options.signal?.aborted)
        return {
          status: "stale",
          sourceFingerprint: options.sourceFingerprint,
          points,
          activity,
          capability,
          warnings: ["analysis_cancelled"],
        };
      const sourceTimeMs =
        windowDurationMs > 0
          ? startTimeMs + (windowDurationMs * index) / (sampleCount - 1)
          : startTimeMs;
      const time = sourceTimeMs / 1000;
      if (duration > 0 && Math.abs(video.currentTime - time) > 0.01) {
        await new Promise<void>(resolve => {
          const done = () => resolve();
          video.addEventListener("seeked", done, { once: true });
          video.currentTime = time;
          window.setTimeout(resolve, 500);
        });
      }
      // Yield between samples so a short Quick analysis cannot starve the
      // editor's playback/input loop. Full Scan remains the Worker path.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const frame = await analyzeFaceFrame(video, {
        sourceFingerprint: options.sourceFingerprint,
        timeMs: Math.round(sourceTimeMs),
        trackId: "web-face-quick",
        signal: options.signal,
      });
      capability = frame.capability;
      const face = frame.points[0];
      const currentMotion = captureMotionSample(video);
      const motionRegion = detectMotionRegion(previousMotion, currentMotion);
      previousMotion = currentMotion;
      if (!face) continue;
      const localTimeMs = Math.max(0, Math.round(sourceTimeMs - startTimeMs));
      const localFace = { ...face, timeMs: localTimeMs };
      points.push(localFace);
      if (motionRegion && isMotionAttachedToFace(motionRegion, face)) activity.push({ trackId: `activity-${localTimeMs}`, associatedFaceTrackId: face.trackId, timeMs: localTimeMs, ...motionRegion, confidence: clamp(face.roi.confidence * Math.min(1, motionRegion.score * 12), 0, 1), visible: true, freshnessMs: 0, kind: "activity" });
    }
    return {
      status: points.length > 0 ? "browser_ready" : "browser_degraded",
      sourceFingerprint: options.sourceFingerprint,
      points,
      activity,
      capability,
      warnings: points.length > 0
        ? (activity.length > 0 ? [] : ["activity_unavailable"])
        : ["face_not_found"],
    };
  } finally {
    if (duration > 0 && Number.isFinite(originalTime))
      video.currentTime = originalTime;
  }
}

export async function analyzeSilenceQuick(
  blob: Blob,
  options: {
    sourceFingerprint: string;
    thresholdDb?: number;
    minSilenceMs?: number;
    paddingMs?: number;
    audioStreamIndex?: number | null;
    signal?: AbortSignal;
  }
): Promise<BrowserSilenceAnalysisResult> {
  const capability = probeBrowserVideoAnalysis();
  if (options.signal?.aborted)
    return {
      status: "stale",
      sourceDurationMs: 0,
      ranges: [],
      audioStreamIndex: options.audioStreamIndex ?? null,
      capability,
      warnings: ["analysis_cancelled"],
    };
  if (capability.audioRuntime === "none")
    return {
      status: "unsupported",
      sourceDurationMs: 0,
      ranges: [],
      audioStreamIndex: options.audioStreamIndex ?? null,
      capability,
      warnings: ["audio_runtime_unavailable"],
    };
  const Context = (globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext)!;
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const threshold = Math.pow(10, (options.thresholdDb ?? -40) / 20);
    const windowSamples = Math.max(1, Math.round(buffer.sampleRate * 0.05));
    const minSamples = Math.max(
      1,
      Math.round(((options.minSilenceMs ?? 500) / 1000) * buffer.sampleRate)
    );
    const ranges: Array<{ startMs: number; endMs: number }> = [];
    let silentStart = -1;
    for (let offset = 0; offset < buffer.length; offset += windowSamples) {
      let sum = 0;
      for (
        let i = offset;
        i < Math.min(buffer.length, offset + windowSamples);
        i += 1
      )
        sum += Math.abs(buffer.getChannelData(0)[i] ?? 0);
      const silent =
        sum / Math.min(windowSamples, buffer.length - offset) <= threshold;
      if (silent && silentStart < 0) silentStart = offset;
      if (
        (!silent || offset + windowSamples >= buffer.length) &&
        silentStart >= 0
      ) {
        const end = silent ? buffer.length : offset;
        if (end - silentStart >= minSamples)
          ranges.push({
            startMs: Math.max(
              0,
              Math.round((silentStart / buffer.sampleRate) * 1000) -
                (options.paddingMs ?? 0)
            ),
            endMs: Math.min(
              Math.round(buffer.duration * 1000),
              Math.round((end / buffer.sampleRate) * 1000) +
                (options.paddingMs ?? 0)
            ),
          });
        silentStart = -1;
      }
    }
    return {
      status: "browser_ready",
      sourceDurationMs: Math.round(buffer.duration * 1000),
      ranges,
      audioStreamIndex: options.audioStreamIndex ?? 0,
      capability,
      warnings: [],
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}
