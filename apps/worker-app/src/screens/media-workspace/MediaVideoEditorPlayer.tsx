import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties, type SetStateAction } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  createCameraMotionPlan,
  evaluateCameraMotionPlan,
  reduceCameraMotionTrackPoints,
  type CameraMotionPlan,
  type CameraMotionTrackPoint,
  type CameraMotionActivityInterval,
} from "@smartspec/shared";
import type { Detection, FaceDetector as MediaPipeFaceDetector } from "@mediapipe/tasks-vision";
import type { DirectoryEntry } from "./MediaExplorerView";
import type { SmartSpecProjectDraft, NleClip, ProjectAsset, NleCanvas, NleTrack, PreviewAspectRatio } from "../../types/nleProject";
import { createDefaultProjectDraft, getPreviewCanvasProfile, normalizePreviewAspectRatio } from "../../types/nleProject";
import { applyGlobalTimelineCuts, preserveLockedClips } from "./timelineEdits";
import { useProjectAutosave } from "./useProjectAutosave";
import { parseProjectDraft, saveNleProject, saveCapCutDraft, isProjectFilePath, safeConvertFileSrc } from "./projectPersistence";
import { MultiTrackTimeline } from "./MultiTrackTimeline";
import { SandboxedOverlayViewer } from "./SandboxedOverlayViewer";
import { AutoSubtitleModal } from "./AutoSubtitleModal";
import { VoiceGuidedVisualMatchModal } from "./VoiceGuidedVisualMatchModal";
import { CodeOverlayModal } from "./CodeOverlayModal";
import { AssetDrawerPanel } from "./AssetDrawerPanel";
import { AutoAudioScoringModal } from "./AutoAudioScoringModal";
import { ProjectSettingsModal } from "./ProjectSettingsModal";
import {
  resizeAspectLockedCropRect,
  type CropRect,
  type CropResizeHandle,
} from "./cropResize";
import { TextOverlayModal } from "./TextOverlayModal";
import { StockSvgModal } from "./StockSvgModal";
import { BlurOverlayModal } from "./BlurOverlayModal";
import { VoiceoverRecordModal } from "./VoiceoverRecordModal";
import { AiMediaStudioModal } from "./AiMediaStudioModal";
import {
  buildDominantFaceTrack,
  buildFallbackFaceTrack,
  detectAttachedMotionPoint,
  detectGlobalMotionPoint,
  hasFaceRenderEvidence,
  hasRenderableFaceCameraPlan,
  hasRenderableFaceScanCoverage,
  observedFaceLandmarks,
  selectFallbackFaceCandidate,
  selectFreshOrPreviousCameraPlan,
  selectTrackedFaceCandidate,
  shouldResumeLiveFaceProbeAfterFullScan,
  stableFaceCenter,
  type TimedFaceDetectionFrame,
  type MotionFramePixels,
  type TrackedFaceCandidate,
} from "./cameraTracking";
import { useWorkerLocale } from "../../app/workerContext";
import { applyVoiceGuidedVisualPlan } from "./voiceGuidedVisualMatch";
import { normalizeDisplayPath } from "./sourcePath";
import {
  applySourceGeometryDecision,
  evaluateSourceGeometry,
  normalizeSourceGeometry,
  type SourceVideoGeometry,
} from "./sourceGeometry";
import {
  advancePlayableTimeMs,
  chooseAudioTrackIndex,
  chooseRenderSourcePath,
  getPlaybackSilenceRanges,
  getTimelineVideoSources,
  getPlayableTimeMs,
  getAudioTrackLabel,
  normalizeTimelineDropAsset,
  normalizeWaveformBinsForDisplay,
  getDeadAirCutFingerprint,
  getNoiseThresholdDb,
  getWaveformThresholdTopPercent,
  normalizeSilenceRanges,
  type AudioTrackInfo,
  type DeadAirRenderSelection,
  type WaveformBin,
} from "./mediaWorkspaceTimeline";

export interface MediaVideoEditorPlayerProps {
  videoFile: DirectoryEntry | null;
  onSelectVideoFile?: (entry: DirectoryEntry) => void;
  onOpenProjectFile?: (entry: DirectoryEntry) => void;
  workspacePath?: string;
  seriesId?: string | null;
  onClose?: () => void;
  onUploadSuccess?: (libraryItemId: string) => void;
  reframe9x16?: boolean;
  onReframe9x16Change?: (enabled: boolean) => void;
  focusX?: number;
  onFocusXChange?: (x: number) => void;
  focusY?: number;
  onFocusYChange?: (y: number) => void;
  focusMode?: string;
  onFocusModeChange?: (mode: "auto_person" | "auto_object" | "manual_region") => void;
  removeDeadAir?: boolean;
  onRemoveDeadAirChange?: (enabled: boolean) => void;
  onOpenIntentSettings?: () => void;
  openAutoSubtitleRequest?: number;
  plan?: {
    planId: string;
    trimEndMs: number;
    outputRelativeName: string;
  } | null;
  onBuildPlan?: (deadAir?: DeadAirRenderSelection) => void;
  onSubmitJob?: (deadAir?: DeadAirRenderSelection) => void;
  canSubmitJob?: boolean;
  isBusy?: boolean;
  loadedProjectDraft?: SmartSpecProjectDraft | null;
  onProjectDraftChange?: (draft: SmartSpecProjectDraft | null) => void;
  onTimelineProjectChange?: (draft: SmartSpecProjectDraft | null) => void;
  importedAsset?: ProjectAsset | null;
}

interface LocalMediaAnalysisSegment {
  startMs: number;
  endMs?: number | null;
  kind?: string;
  confidence?: number;
  classification?: string;
}

interface CustomSilenceDetectionResult {
  durationMs: number;
  silenceSegments: LocalMediaAnalysisSegment[];
  waveformPeaks: number[];
  waveformBins?: WaveformBin[];
  audioTracks?: AudioTrackInfo[];
  selectedAudioStreamIndex?: number | null;
  cutCount: number;
  timeSavedMs: number;
  noiseThresholdDb: number;
  minDurationS: number;
  softeningBufferS: number;
  firstSpeechMs?: number;
  lastSpeechMs?: number;
}

type FaceDetectorStatus = "idle" | "loading" | "ready" | "tracking" | "not_found" | "error";

type FaceFrameDiagnostic = {
  timeMs: number;
  status: "found" | "no_face" | "landmarks_missing" | "unselected";
  detectionCount: number;
  landmarkCount: number;
  box?: { x: number; y: number; width: number; height: number };
  landmarks: Array<{ x: number; y: number }>;
  confidence?: number;
};

type FaceScanSummary = {
  sampledFrames: number;
  detectedFrames: number;
  landmarkFrames: number;
  selectedFrames: number;
  faceSpanMs: number;
  usedFallbackFaceTrack: boolean;
};

type FullCameraScanResult = {
  points: CameraMotionTrackPoint[];
  activityIntervals: CameraMotionActivityInterval[];
  summary: FaceScanSummary | null;
  cameraMotionPlan: CameraMotionPlan | null;
};

const EMPTY_CAMERA_SCAN_RESULT: FullCameraScanResult = {
  points: [],
  activityIntervals: [],
  summary: null,
  cameraMotionPlan: null,
};

interface InteractiveProcessResult {
  outputPath: string;
  outputRelativeName: string;
  fileName: string;
  durationMs: number;
  sizeBytes: number;
  width: number;
  height: number;
  checksum: string;
  silenceCutCount: number;
  timeSavedMs: number;
  cameraPlanApplied?: boolean;
  cameraPlanKeyframes?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceRotationDegrees?: number;
  mediaDebugLogPath?: string;
}

export interface VideoMarkPin {
  id: string;
  name: string;
  time: number;
  x: number;
  y: number;
  pixelX: number;
  pixelY: number;
  scale?: number;
}

interface LibraryUploadResult {
  success: boolean;
  libraryItemId?: string | null;
  title: string;
  message: string;
  seriesAssetId?: string | null;
}

function formatSmpteTime(seconds: number, fps = 30): string {
  if (isNaN(seconds) || seconds < 0) return "00:00:00:00";
  const totalFrames = Math.floor(seconds * fps);
  const frames = totalFrames % fps;
  const totalSecs = Math.floor(seconds);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60) % 60;
  const hours = Math.floor(totalSecs / 3600);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
}

function formatSeconds(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function AudioClipElement({
  src,
  offsetSec,
  isPlaying,
  volume,
  isMuted,
}: {
  src: string;
  offsetSec: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (Math.abs(el.currentTime - offsetSec) > 0.25) {
      el.currentTime = offsetSec;
    }
  }, [offsetSec]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      if (el.paused) el.play().catch(() => {});
    } else {
      if (!el.paused) el.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = isMuted;
  }, [volume, isMuted]);

  return <audio ref={audioRef} src={src} style={{ display: "none" }} preload="auto" />;
}

function MultiTrackAudioSync({
  project,
  currentTime,
  isPlaying,
  masterVolume = 1.0,
  isMasterMuted = false,
}: {
  project: SmartSpecProjectDraft | null;
  currentTime: number;
  isPlaying: boolean;
  masterVolume?: number;
  isMasterMuted?: boolean;
}) {
  if (!project) return null;
  const curMs = currentTime * 1000;
  const activeAudioClips: { clip: NleClip; track: NleTrack }[] = [];

  for (const track of project.tracks) {
    if (track.muted || !track.id.startsWith("track_a")) continue;
    for (const clip of track.clips) {
      if (curMs >= clip.timelineStartMs && curMs <= clip.timelineStartMs + clip.durationMs) {
        activeAudioClips.push({ clip, track });
      }
    }
  }

  return (
    <>
      {activeAudioClips.map(({ clip, track }) => {
        const path = clip.sourcePath || clip.sourceUrl || "";
        if (!path) return null;
        const src = safeConvertFileSrc(path);
        const clipOffsetSec = Math.max(0, (curMs - clip.timelineStartMs) / 1000);
        const trackVol = track.volume ?? 1.0;
        const clipVol = clip.volume ?? 1.0;
        const effectiveVol = Math.min(1.0, Math.max(0, masterVolume * trackVol * clipVol));
        return (
          <AudioClipElement
            key={clip.id}
            src={src}
            offsetSec={clipOffsetSec}
            isPlaying={isPlaying}
            volume={effectiveVol}
            isMuted={isMasterMuted}
          />
        );
      })}
    </>
  );
}

export function MediaVideoEditorPlayer({
  videoFile,
  onSelectVideoFile,
  onOpenProjectFile,
  seriesId,
  onClose,
  workspacePath,
  onUploadSuccess,
  reframe9x16: propsReframe9x16,
  onReframe9x16Change,
  focusX: propsFocusX,
  onFocusXChange,
  focusY: propsFocusY,
  onFocusYChange,
  focusMode: propsFocusMode,
  onFocusModeChange,
  removeDeadAir: _propsRemoveDeadAir,
  onRemoveDeadAirChange: _onRemoveDeadAirChange,
  onOpenIntentSettings,
  openAutoSubtitleRequest,
  plan,
  onBuildPlan,
  onSubmitJob,
  canSubmitJob,
  isBusy,
  loadedProjectDraft,
  onProjectDraftChange,
  onTimelineProjectChange,
  importedAsset,
}: MediaVideoEditorPlayerProps) {
  const locale = useWorkerLocale();
  const t = (th: string, en: string) => locale === "th" ? th : en;
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoViewportRef = useRef<HTMLDivElement>(null);
  const skipSeekTargetRef = useRef<number | null>(null);

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Speech Trim states (in seconds)
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);

  // Silence Detection (Dead Air) Settings (Matching Reference UI)
  const [volumeThreshold, setVolumeThreshold] = useState<number>(25); // 1 - 100%
  const [minDuration, setMinDuration] = useState<number>(0.5); // 0.1 - 2.0s
  const [softeningBuffer, setSofteningBuffer] = useState<number>(0.2); // 0.05 - 0.5s

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzedDeadAir, setHasAnalyzedDeadAir] = useState(false);
  const [silenceSegments, setSilenceSegments] = useState<LocalMediaAnalysisSegment[]>([]);
  const [waveformBins, setWaveformBins] = useState<WaveformBin[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [selectedAudioStreamIndex, setSelectedAudioStreamIndex] = useState<number | null>(null);
  const [selectedAnalysisTrackId, setSelectedAnalysisTrackId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const analysisRequestIdRef = useRef(0);
  // A cut removes source-time content, so switching tracks must reapply the
  // new map from the original project rather than trying to expand a cut clip.
  const deadAirAnalysisBaseProjectRef = useRef<SmartSpecProjectDraft | null>(null);
  const deadAirAnalysisBaseVideoPathRef = useRef<string | null>(null);
  const [detectedCutCount, setCutCount] = useState<number>(0);
  const [timeSavedMs, setTimeSavedMs] = useState<number>(0);
  const playbackSilenceSegments = useMemo(
    () => getPlaybackSilenceRanges(
      silenceSegments.map((segment) => ({
        startMs: segment.startMs,
        endMs: segment.endMs ?? null,
        isManual: segment.classification === "manual",
      })),
      hasAnalyzedDeadAir,
    ),
    [hasAnalyzedDeadAir, silenceSegments],
  );

  // Timeline view controls
  const [timelineZoom, setTimelineZoom] = useState<number>(1); // 1x to 3x
  const [showSilenceOverlay, setShowSilenceOverlay] = useState<boolean>(true);
  const [manualCutDraft, setManualCutDraft] = useState<{ startMs: number; endMs: number } | null>(null);
  const waveformTrackRef = useRef<HTMLDivElement>(null);
  const manualCutDragRef = useRef<{
    pointerId: number;
    startMs: number;
    currentMs: number;
    startClientX: number;
  } | null>(null);

  // Aspect Ratio & Person Focus
  const [aspectRatio, setAspectRatio] = useState<PreviewAspectRatio>(
    propsReframe9x16 === false ? "source" : "9:16"
  );
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  // Keep the dimensions tied to the media element's current source. A draft
  // can legitimately retain the job's original geometry after another clip
  // is loaded, but camera coordinates must be interpreted in the active file's
  // coordinate space for preview, Full Scan, and native render alike.
  const loadedSourceGeometryRef = useRef<SourceVideoGeometry | null>(null);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState<boolean>(false);
  const [isRenderModalOpen, setIsRenderModalOpen] = useState<boolean>(false);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const [focusMode, setFocusMode] = useState<"auto_person" | "auto_object" | "manual_region">(() => {
    if (propsFocusMode === "manual_region") return "manual_region";
    return "auto_person";
  });
  const [focusX, setFocusX] = useState<number>(() => {
    if (propsFocusX !== undefined) return propsFocusX;
    try {
      const key = videoFile ? `smartspec_person_focus_v2_${videoFile.name}` : null;
      if (key) {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed?.x === "number") return parsed.x;
        }
      }
    } catch {}
    return 0.5;
  });
  const [focusY, setFocusY] = useState<number>(() => {
    if (propsFocusY !== undefined) return propsFocusY;
    try {
      const key = videoFile ? `smartspec_person_focus_v2_${videoFile.name}` : null;
      if (key) {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed?.y === "number") return parsed.y;
        }
      }
    } catch {}
    return 0.5;
  });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const isDraggingCropRef = useRef(false);
  const cropDragStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);
  const cropResizeRef = useRef<{
    handle: CropResizeHandle;
    startClientX: number;
    startClientY: number;
    startRect: CropRect;
    stageWidth: number;
    stageHeight: number;
    baseWidth: number;
  } | null>(null);
  const personAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const trackedFaceCandidateRef = useRef<TrackedFaceCandidate | null>(null);
  // A source change starts a fresh composition. Keep this separate from the
  // persisted focus value: a saved anchor must not make the first detector
  // result use the normal safe-zone deadband before the face reaches center.
  const startupPersonLockRef = useRef(true);
  const focusXRef = useRef(focusX);
  const focusYRef = useRef(focusY);
  const videoFileNameRef = useRef(videoFile?.name);
  const mediaPipeFaceDetectorRef = useRef<MediaPipeFaceDetector | null>(null);
  const mediaPipeFaceDetectorInitRef = useRef<Promise<MediaPipeFaceDetector | null> | null>(null);
  const mediaPipeLastTimestampRef = useRef(-1);
  const faceTrackingConfigRef = useRef<{ aspectRatio: PreviewAspectRatio; scale: number; targetRatio: number | null }>({
    aspectRatio: propsReframe9x16 === false ? "source" : "9:16",
    scale: 1,
    targetRatio: propsReframe9x16 === false ? null : 9 / 16,
  });
  const mountedRef = useRef(true);
  const [faceDetectorStatus, setFaceDetectorStatus] = useState<FaceDetectorStatus>("idle");
  const [faceFrameDiagnostic, setFaceFrameDiagnostic] = useState<FaceFrameDiagnostic | null>(null);
  const [faceScanSummary, setFaceScanSummary] = useState<FaceScanSummary | null>(null);
  const faceProbePendingRef = useRef(false);
  const faceDetectorStatusIcon = faceDetectorStatus === "tracking"
    ? "🟢"
    : faceDetectorStatus === "loading"
      ? "⏳"
      : faceDetectorStatus === "not_found"
        ? "🟡"
        : faceDetectorStatus === "error"
          ? "🔴"
          : "⚪";
  const faceDetectorStatusLabel = faceDetectorStatus === "tracking"
    ? t("กำลังติดตามใบหน้า", "Tracking face")
    : faceDetectorStatus === "loading"
      ? t("กำลังโหลดตัวตรวจจับ", "Loading detector")
      : faceDetectorStatus === "not_found"
        ? t("ยังไม่พบใบหน้า", "Face not found")
        : faceDetectorStatus === "error"
          ? t("ตัวตรวจจับขัดข้อง", "Detector error")
          : t("พร้อมตรวจจับ", "Ready to detect");

  useEffect(() => {
    focusXRef.current = focusX;
  }, [focusX]);

  useEffect(() => {
    focusYRef.current = focusY;
  }, [focusY]);

  useEffect(() => {
    videoFileNameRef.current = videoFile?.name;
    personAnchorRef.current = null;
    trackedFaceCandidateRef.current = null;
    startupPersonLockRef.current = true;
    mediaPipeLastTimestampRef.current = -1;
    setFaceFrameDiagnostic(null);
    setFaceScanSummary(null);
    if (mediaPipeFaceDetectorRef.current) setFaceDetectorStatus("ready");
  }, [videoFile?.name, videoFile?.path]);

  // Apply the detected anchor atomically. Detection resolves asynchronously,
  // so refs keep the tracking source current between React renders.
  const applyPersonAnchor = useCallback((targetX: number, targetY: number, immediate: boolean, centerTarget = false) => {
    const safeX = Math.max(0.05, Math.min(0.95, targetX));
    const safeY = Math.max(0.05, Math.min(0.95, targetY));
    const current = personAnchorRef.current ?? {
      x: focusXRef.current ?? 0.5,
      y: focusYRef.current ?? 0.5,
    };

    // The first detection is a startup lock: bring the subject into the
    // opening frame immediately. Once an anchor exists, keep the face inside
    // the safe zone and move only a small amount per sample so the camera
    // glides toward the face instead of oscillating around it.
    const isStartupLock = immediate && startupPersonLockRef.current;
    const maxStep = isStartupLock || centerTarget ? 1 : 0.035;
    // During playback, detector noise and small natural head motion must not
    // create visible camera oscillation. Keep the current frame until the
    // face has materially left centre; startup still uses the full target.
    const deadband = centerTarget ? 0.035 : 0.018;
    const nextX = Math.abs(safeX - current.x) <= deadband
      ? current.x
      : current.x + Math.max(-maxStep, Math.min(maxStep, safeX - current.x));
    const nextY = Math.abs(safeY - current.y) <= deadband
      ? current.y
      : current.y + Math.max(-maxStep, Math.min(maxStep, safeY - current.y));

    const next = { x: nextX, y: nextY };
    personAnchorRef.current = next;
    if (isStartupLock || centerTarget) startupPersonLockRef.current = false;
    focusXRef.current = nextX;
    focusYRef.current = nextY;
    setFocusX(nextX);
    setFocusY(nextY);
    onFocusXChange?.(nextX);
    onFocusYChange?.(nextY);

    try {
      if (videoFileNameRef.current) {
        localStorage.setItem(
          `smartspec_person_focus_v2_${videoFileNameRef.current}`,
          JSON.stringify(next)
        );
      }
    } catch {}
  }, [onFocusXChange, onFocusYChange]);

  // MediaPipe is bundled locally so the Worker can detect faces without a
  // network request. GPU is preferred, but CPU remains a reliable fallback
  // for WebViews whose WebGL delegate is unavailable.
  const initializeMediaPipeFaceDetector = useCallback(async (): Promise<MediaPipeFaceDetector | null> => {
    if (mediaPipeFaceDetectorRef.current) return mediaPipeFaceDetectorRef.current;
    if (mediaPipeFaceDetectorInitRef.current) return mediaPipeFaceDetectorInitRef.current;

    setFaceDetectorStatus("loading");
    const initPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const wasmRoot = "/mediapipe/wasm/";
      const modelPath = "/models/blaze_face_full_range.tflite";
      const wasmFileset = await FilesetResolver.forVisionTasks(wasmRoot);
      const options = {
        baseOptions: { modelAssetPath: modelPath, delegate: "GPU" as const },
        runningMode: "VIDEO" as const,
        // Long-shot faces in a 16:9 source can be low-contrast after seeking
        // and downsampling. Persistent-track and area guards below still
        // reject isolated background/printed-face detections.
        minDetectionConfidence: 0.35,
        minSuppressionThreshold: 0.3,
      };

      let detector: MediaPipeFaceDetector;
      try {
        detector = await FaceDetector.createFromOptions(wasmFileset, options);
      } catch (gpuError) {
        console.warn("MediaPipe GPU delegate unavailable; retrying with CPU:", gpuError);
        detector = await FaceDetector.createFromOptions(wasmFileset, {
          ...options,
          baseOptions: { modelAssetPath: modelPath, delegate: "CPU" },
        });
      }

      if (!mountedRef.current) {
        detector.close();
        return null;
      }
      mediaPipeFaceDetectorRef.current = detector;
      setFaceDetectorStatus("ready");
      return detector;
    })()
      .catch((error) => {
        console.error("MediaPipe Face Detector initialization failed:", error);
        setFaceDetectorStatus("error");
        return null;
      });

    mediaPipeFaceDetectorInitRef.current = initPromise;
    void initPromise.then((detector) => {
      if (!detector && mediaPipeFaceDetectorInitRef.current === initPromise) {
        mediaPipeFaceDetectorInitRef.current = null;
      }
    });
    return initPromise;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mediaPipeFaceDetectorRef.current?.close();
      mediaPipeFaceDetectorRef.current = null;
      mediaPipeFaceDetectorInitRef.current = null;
    };
  }, []);

  // Restore cached person coordinates immediately when switching video files
  useEffect(() => {
    if (!videoFile?.name) return;
    try {
      const saved = localStorage.getItem(`smartspec_person_focus_v2_${videoFile.name}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === "number") {
          focusXRef.current = parsed.x;
          setFocusX(parsed.x);
          onFocusXChange?.(parsed.x);
        }
        if (typeof parsed?.y === "number") {
          focusYRef.current = parsed.y;
          setFocusY(parsed.y);
          onFocusYChange?.(parsed.y);
        }
      }
    } catch {}
  }, [videoFile?.name, onFocusXChange, onFocusYChange]);

  // Two-way synchronization with parent AI Intent state (only when in manual focus mode)
  useEffect(() => {
    if (propsFocusX !== undefined && Math.abs(propsFocusX - focusX) > 0.005) {
      if (focusMode === "manual_region") {
        setFocusX(propsFocusX);
      }
    }
  }, [propsFocusX, focusMode]);

  useEffect(() => {
    if (propsFocusY !== undefined && Math.abs(propsFocusY - focusY) > 0.005) {
      if (focusMode === "manual_region") {
        setFocusY(propsFocusY);
      }
    }
  }, [propsFocusY, focusMode]);

  useEffect(() => {
    if (propsReframe9x16 !== undefined) {
      if (propsReframe9x16 && aspectRatio !== "9:16") {
        setAspectRatio("9:16");
      } else if (!propsReframe9x16 && aspectRatio === "9:16") {
        setAspectRatio("source");
      }
    }
  }, [propsReframe9x16]);

  useEffect(() => {
    if (propsFocusMode) {
      const normalized = propsFocusMode === "manual_region" ? "manual_region" : "auto_person";
      if (normalized !== focusMode) {
        setFocusMode(normalized);
      }
    }
  }, [propsFocusMode]);

  // Processing & Export states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<InteractiveProcessResult | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [lastRenderHadDeadAirCut, setLastRenderHadDeadAirCut] = useState<boolean>(true);

  // Upload to smartaihub.app Library states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<LibraryUploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState("");

  // Pro Multi-Track NLE Studio states
  const [editorMode, setEditorMode] = useState<"multitrack" | "basic">("multitrack");
  const [nleProject, setProjectState] = useState<SmartSpecProjectDraft | null>(() => loadedProjectDraft || null);
  const setNleProject = useCallback((update: SetStateAction<SmartSpecProjectDraft | null>) => {
    setProjectState((previous) => preserveLockedClips(previous, typeof update === "function" ? update(previous) : update));
  }, []);

  // Expose the live timeline to workspace tools (speaker analysis, export,
  // and source selectors) without making the project loader authoritative.
  useEffect(() => {
    onTimelineProjectChange?.(nleProject);
  }, [nleProject, onTimelineProjectChange]);

  useEffect(() => {
    if (selectedAudioStreamIndex === null) return;
    setProjectState((current) => {
      if (!current || current.metadata?.deadAirAudioStreamIndex === selectedAudioStreamIndex) return current;
      return {
        ...current,
        metadata: {
          ...current.metadata,
          deadAirAudioStreamIndex: selectedAudioStreamIndex,
        },
      };
    });
  }, [selectedAudioStreamIndex]);

  // A loaded draft is authoritative for the preview canvas. Sync each persisted profile
  // once so external draft updates are reflected without fighting live toolbar changes.
  const syncedProjectAspectRef = useRef<string | null>(null);
  useEffect(() => {
    const project = nleProject || loadedProjectDraft;
    if (!project) {
      syncedProjectAspectRef.current = null;
      return;
    }
    const projectAspectKey = `${project.projectId}:${project.canvas?.aspectRatio ?? ""}`;
    if (syncedProjectAspectRef.current === projectAspectKey) return;
    syncedProjectAspectRef.current = projectAspectKey;
    const persistedRatio = normalizePreviewAspectRatio(project.canvas?.aspectRatio, "source");
    setAspectRatio(persistedRatio);
    onReframe9x16Change?.(persistedRatio === "9:16");
  }, [loadedProjectDraft, nleProject?.projectId, nleProject?.canvas?.aspectRatio, onReframe9x16Change]);

  const handleAspectRatioChange = useCallback((next: PreviewAspectRatio) => {
    setAspectRatio(next);
    onReframe9x16Change?.(next === "9:16");
    setNleProject((previous) => {
      if (!previous || next === "source") return previous;
      const profile = getPreviewCanvasProfile(next);
      return {
        ...previous,
        updatedAt: new Date().toISOString(),
        canvas: {
          ...previous.canvas,
          aspectRatio: profile.aspectRatio,
          width: profile.width,
          height: profile.height,
        },
      };
    });
  }, [onReframe9x16Change, setNleProject]);

  // Derive maximum timeline span from all tracks & clips
  const timelineMaxDurationSec = useMemo(() => {
    if (!nleProject) return 0;
    let maxMs = nleProject.canvas?.durationMs || 0;
    for (const track of nleProject.tracks) {
      for (const clip of track.clips) {
        const endMs = clip.timelineStartMs + clip.durationMs;
        if (endMs > maxMs) maxMs = endMs;
      }
    }
    return maxMs > 0 ? maxMs / 1000 : 0;
  }, [nleProject]);

  const effectiveDuration = useMemo(() => {
    return Math.max(duration, timelineMaxDurationSec);
  }, [duration, timelineMaxDurationSec]);

  const analysisVideoSources = useMemo(
    () => getTimelineVideoSources(nleProject),
    [nleProject],
  );

  const selectedAnalysisSource = useMemo(
    () => analysisVideoSources.find((source) => source.trackId === selectedAnalysisTrackId)
      ?? analysisVideoSources[0]
      ?? null,
    [analysisVideoSources, selectedAnalysisTrackId],
  );

  // A loaded project can remain in `videoFile` as a .videoproject.json while
  // preview correctly resolves the real media from project metadata, tracks,
  // or the media pool. Keep those same real-media candidates available to the
  // native render boundary; otherwise the render guard sees only the project
  // file and returns before sending any command.
  const projectSourceFallbackPaths = useMemo(() => [
    nleProject?.metadata?.originalSourceVideo ?? "",
    ...(nleProject?.tracks ?? []).flatMap((track) => (
      track.id === "track_v1"
      || track.id === "track_v2"
      || track.type === "video_main"
      || track.type === "video_broll"
        ? track.clips.flatMap((clip) => [clip.sourcePath ?? "", clip.sourceUrl ?? ""])
        : []
    )),
    ...(nleProject?.mediaPool ?? [])
      .filter((asset) => asset.mediaType === "video")
      .map((asset) => asset.filePath),
  ], [nleProject]);

  // When a project contains only a V2/B-roll video, use that clip as the
  // analysis source instead of continuing to probe the old V1/videoFile path.
  // Project files are deliberately skipped so preview, Full Scan, and native
  // Render all consume the same actual media path.
  const analysisSourcePath = useMemo(() => chooseRenderSourcePath(
    selectedAnalysisSource?.path ?? "",
    videoFile?.path ?? "",
    projectSourceFallbackPaths,
  ), [projectSourceFallbackPaths, selectedAnalysisSource?.path, videoFile?.path]);

  // Packaged Worker builds do not provide a dependable DevTools console. Keep
  // one bounded native JSONL trace for the actual media boundary so a failed
  // render can be compared with the Full Scan that produced its plan.
  const mediaDebugSessionIdRef = useRef(`media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const mediaDebugLogPathRef = useRef<string | null>(null);
  const writeMediaDebugEvent = useCallback((event: string, details: Record<string, unknown>) => {
    const payload = {
      debugSessionId: mediaDebugSessionIdRef.current,
      component: "MediaVideoEditorPlayer",
      ...details,
    };
    void invoke<string>("worker_app_append_media_debug_event", { event, details: payload })
      .then((path) => {
        mediaDebugLogPathRef.current = path;
      })
      .catch((error) => {
        console.warn("Media debug event could not be persisted:", error);
      });
  }, []);

  // Full Scan and native FFmpeg must receive the exact same source path.
  const renderSourcePath = analysisSourcePath;

  // Source geometry is the coordinate space shared by preview, Full Scan, and
  // native render. It must never be replaced by the output canvas dimensions.
  const canonicalSourceGeometry = nleProject?.metadata?.sourceGeometry ?? null;
  const loadedSourceGeometry = loadedSourceGeometryRef.current;
  const activeSourceGeometry = loadedSourceGeometry
    && loadedSourceGeometry.sourcePath === analysisSourcePath
    ? loadedSourceGeometry
    : canonicalSourceGeometry;
  const activeSourceDimensions = activeSourceGeometry
    ? { width: activeSourceGeometry.width, height: activeSourceGeometry.height }
    : videoDimensions;

  const displayedWaveformBins = useMemo(
    () => waveformBins.length > 0
      ? normalizeWaveformBinsForDisplay(waveformBins, 200, getNoiseThresholdDb(volumeThreshold))
      : audioTracks.length > 0
        ? normalizeWaveformBinsForDisplay([], 200, getNoiseThresholdDb(volumeThreshold))
        : [],
    [audioTracks.length, volumeThreshold, waveformBins],
  );

  useEffect(() => {
    if (analysisVideoSources.length === 0) {
      setSelectedAnalysisTrackId(null);
      return;
    }
    if (!analysisVideoSources.some((source) => source.trackId === selectedAnalysisTrackId)) {
      setSelectedAnalysisTrackId(analysisVideoSources[0].trackId);
    }
  }, [analysisVideoSources, selectedAnalysisTrackId]);

  useEffect(() => {
    setAudioTracks([]);
    setSelectedAudioStreamIndex(null);
    setWaveformBins([]);
    setSilenceSegments([]);
    setHasAnalyzedDeadAir(false);
    setAnalysisError(null);
  }, [analysisSourcePath]);
  const [isAutoSubModalOpen, setIsAutoSubModalOpen] = useState(false);
  const [isVoiceGuidedVisualMatchOpen, setIsVoiceGuidedVisualMatchOpen] = useState(false);
  const [visualMatchUndoProject, setVisualMatchUndoProject] = useState<SmartSpecProjectDraft | null>(null);
  const lastAutoSubtitleRequestRef = useRef(openAutoSubtitleRequest ?? 0);
  const [isCodeOverlayModalOpen, setIsCodeOverlayModalOpen] = useState(false);
  const [isAssetDrawerOpen, setIsAssetDrawerOpen] = useState(false);
  const [isMediaBinOpen, setIsMediaBinOpen] = useState(true);
  const [isAudioScoringModalOpen, setIsAudioScoringModalOpen] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [isSvgModalOpen, setIsSvgModalOpen] = useState(false);
  const [isBlurModalOpen, setIsBlurModalOpen] = useState(false);
  const [isVoiceoverModalOpen, setIsVoiceoverModalOpen] = useState(false);
  const [isAiStudioModalOpen, setIsAiStudioModalOpen] = useState(false);
  const [projectStatusMsg, setProjectStatusMsg] = useState<string | null>(null);
  const [isDuckingActive, setIsDuckingActive] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [isRenderPanelCollapsed, setIsRenderPanelCollapsed] = useState(true);
  const [activeProjectFilePath, setActiveProjectFilePath] = useState<string | null>(() => {
    if (videoFile && isProjectFilePath(videoFile.path)) {
      return videoFile.path;
    }
    return null;
  });

  useEffect(() => {
    if (!openAutoSubtitleRequest || openAutoSubtitleRequest <= lastAutoSubtitleRequestRef.current) return;
    lastAutoSubtitleRequestRef.current = openAutoSubtitleRequest;
    if (videoFile && !isProjectFilePath(videoFile.path)) {
      setIsAutoSubModalOpen(true);
    } else {
      setProjectStatusMsg(t("กรุณาเปิด source video ก่อนสร้าง Subtitle", "Open a source video before creating subtitles."));
    }
  }, [openAutoSubtitleRequest, videoFile, locale]);

  useEffect(() => {
    setIsRenderPanelCollapsed(true);
  }, [loadedProjectDraft?.projectId, videoFile?.path]);

  useEffect(() => {
    if (videoFile && isProjectFilePath(videoFile.path)) {
      setActiveProjectFilePath(videoFile.path);
    }
  }, [videoFile]);

  // Smart AI Director & Dynamic Camera Motion states
  const [smartDirectorMode, setSmartDirectorMode] = useState<"off" | "auto" | "product_focus" | "face_focus" | "face_activity">("off");
  const smartDirectorModeRef = useRef(smartDirectorMode);
  useEffect(() => {
    smartDirectorModeRef.current = smartDirectorMode;
  }, [smartDirectorMode]);
  const [cameraAnalysisMode, setCameraAnalysisMode] = useState<"quick" | "full_scan">("quick");
  const [cameraScanStatus, setCameraScanStatus] = useState<"idle" | "quick" | "scanning" | "approved" | "degraded" | "stale">("idle");
  const [cameraTrackPoints, setCameraTrackPoints] = useState<CameraMotionTrackPoint[]>([]);
  const [cameraActivityIntervals, setCameraActivityIntervals] = useState<CameraMotionActivityInterval[]>([]);
  const cameraScanPromiseRef = useRef<Promise<FullCameraScanResult> | null>(null);
  // Keeps the just-completed scan available synchronously for the preview
  // during the same render turn in which React is still committing the
  // evidence arrays. Render requests also use this exact object directly.
  const authoritativeCameraPlanRef = useRef<CameraMotionPlan | null>(null);
  const cameraScanGenerationRef = useRef(0);
  const cameraSourceKey = [
    videoFile?.path ?? "",
    analysisSourcePath,
    nleProject?.metadata?.originalSourceVideo ?? "",
    videoFile ? `${videoFile.sizeBytes}:${videoFile.modifiedUnixMs}` : "",
  ].join("|");
  const cameraSourceKeyRef = useRef(cameraSourceKey);
  const cameraAnalysisModeRef = useRef(cameraAnalysisMode);
  const cameraScanStatusRef = useRef(cameraScanStatus);
  useEffect(() => {
    cameraSourceKeyRef.current = cameraSourceKey;
    cameraScanGenerationRef.current += 1;
    // An old scan cannot be cancelled while MediaPipe is seeking the native
    // video element. Drop its promise here; the generation guard below makes
    // its eventual result harmless when it resolves.
    cameraScanPromiseRef.current = null;
    authoritativeCameraPlanRef.current = null;
    setCameraTrackPoints([]);
    setCameraActivityIntervals([]);
    setFaceScanSummary(null);
    setCameraAnalysisMode("quick");
    setCameraScanStatus("idle");
  }, [cameraSourceKey]);
  useEffect(() => {
    cameraAnalysisModeRef.current = cameraAnalysisMode;
    cameraScanStatusRef.current = cameraScanStatus;
  }, [cameraAnalysisMode, cameraScanStatus]);
  useEffect(() => {
    authoritativeCameraPlanRef.current = null;
  }, [aspectRatio, cameraSourceKey, smartDirectorMode]);
  const cameraMarkRevisionStorageKey = videoFile ? `smartspec_camera_mark_revision_v1_${videoFile.path}` : null;
  const [cameraMarkRevision, setCameraMarkRevision] = useState(() => {
    try {
      const stored = cameraMarkRevisionStorageKey ? Number(localStorage.getItem(cameraMarkRevisionStorageKey)) : 0;
      return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
    } catch {
      return 0;
    }
  });

  // Keyframed Mark Pins (Supports 2 points for Smooth Pan & Zoom with pixel coordinates and auto-freeze)
  const [productPins, setProductPins] = useState<VideoMarkPin[]>(() => {
    try {
      const key = videoFile ? `smartspec_pins_v2_${videoFile.name}` : "smartspec_pins_v2_default";
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
      // Fallback check old single pin
      const oldKey = videoFile ? `smartspec_pin_${videoFile.name}` : "smartspec_pin_default";
      const oldSaved = localStorage.getItem(oldKey);
      if (oldSaved) {
        const p = JSON.parse(oldSaved);
        if (p && typeof p.x === "number") {
          return [{
            id: "pin_1",
            name: "จุดที่ 1",
            time: 0,
            x: p.x,
            y: p.y,
            pixelX: Math.round(p.x * 1920),
            pixelY: Math.round(p.y * 1080),
          }];
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  const productPinsFingerprint = useMemo(
    () => JSON.stringify(productPins.map((pin) => ({
      id: pin.id,
      time: pin.time,
      x: pin.x,
      y: pin.y,
      scale: pin.scale,
    }))),
    [productPins],
  );
  const cameraMarkRevisionRef = useRef(productPinsFingerprint);

  const productPin = useMemo(() => {
    return productPins[0] ? { x: productPins[0].x, y: productPins[0].y } : null;
  }, [productPins]);

  const setProductPin = useCallback((pin: { x: number; y: number } | null) => {
    if (!pin) {
      setProductPins([]);
    } else {
      const vidW = videoDimensions.width || 1920;
      const vidH = videoDimensions.height || 1080;
      setProductPins([
        {
          id: `pin_${Date.now()}`,
          name: "จุดที่ 1",
          time: currentTime,
          x: pin.x,
          y: pin.y,
          pixelX: Math.round(pin.x * vidW),
          pixelY: Math.round(pin.y * vidH),
        },
      ]);
    }
  }, [currentTime, videoDimensions]);

  const [isPinningActive, setIsPinningActive] = useState<boolean>(false);
  const [showPinMarkers, setShowPinMarkers] = useState<boolean>(true);
  const [hidePinsOnPreview, setHidePinsOnPreview] = useState<boolean>(false);
  const [manualScale, setManualScale] = useState<number>(1.0);

  const renderAspectRatio = useMemo(() => {
    if (aspectRatio === "source") return null;
    const projectWidth = nleProject?.canvas?.width;
    const projectHeight = nleProject?.canvas?.height;
    if (projectWidth && projectHeight && projectWidth > 0 && projectHeight > 0) {
      return projectWidth / projectHeight;
    }
    const profile = getPreviewCanvasProfile(aspectRatio);
    return profile.width / profile.height;
  }, [aspectRatio, nleProject?.canvas?.height, nleProject?.canvas?.width]);

  const cameraMotionPlan = useMemo<CameraMotionPlan | null>(() => {
    if (smartDirectorMode === "off" || aspectRatio === "source" || effectiveDuration <= 0) return null;
    const plannerMode = smartDirectorMode === "auto" ? "face_activity" : smartDirectorMode;
    return createCameraMotionPlan({
      durationMs: Math.round(effectiveDuration * 1000),
      mode: plannerMode,
      focusX,
      focusY,
      baseScale: smartDirectorMode === "face_focus"
        ? 1.18
        : smartDirectorMode === "product_focus"
          ? Math.max(1, manualScale || 1.18)
          : 1.16,
      marks: productPins,
      analysisMode: cameraAnalysisMode,
      trackPoints: cameraTrackPoints,
      activityIntervals: cameraActivityIntervals,
      evidence: {
        analysisMode: cameraAnalysisMode,
        status: cameraScanStatus === "approved" ? "approved" : cameraAnalysisMode === "full_scan" ? "degraded" : "provisional",
        sourceFingerprint: cameraSourceKey || undefined,
        markRevision: cameraMarkRevision,
        policyFingerprint: `${aspectRatio}:${manualScale.toFixed(3)}`,
        capabilityProfileFingerprint: "mediapipe-face-attached-motion",
      },
      outputAspectRatio: renderAspectRatio ?? undefined,
      sourceAspectRatio: activeSourceDimensions.width > 0 && activeSourceDimensions.height > 0
        ? activeSourceDimensions.width / activeSourceDimensions.height
        : undefined,
    });
  }, [activeSourceDimensions.height, activeSourceDimensions.width, aspectRatio, cameraActivityIntervals, cameraAnalysisMode, cameraMarkRevision, cameraScanStatus, cameraSourceKey, cameraTrackPoints, effectiveDuration, focusX, focusY, manualScale, productPins, renderAspectRatio, smartDirectorMode]);

  // Full Scan is the single source of truth for Face + Activity. Build the
  // plan once from its evidence and share that exact object with preview and
  // every render path; render must never create a second plan or use a live
  // face fallback that was not part of the scan.
  const createFullScanCameraPlan = useCallback((
    scan: Pick<FullCameraScanResult, "points" | "activityIntervals">,
    sourceDurationMs: number,
  ): CameraMotionPlan | null => {
    if (!hasFaceRenderEvidence(scan.points)) return null;
    const plan = createCameraMotionPlan({
      durationMs: Math.max(0, Math.round(sourceDurationMs)),
      mode: smartDirectorMode === "face_focus" ? "face_focus" : "face_activity",
      focusX,
      focusY,
      baseScale: 1.16,
      marks: productPins,
      analysisMode: "full_scan",
      trackPoints: scan.points,
      activityIntervals: scan.activityIntervals,
      evidence: {
        analysisMode: "full_scan",
        status: scan.activityIntervals.length > 0 ? "approved" : "degraded",
        sourceFingerprint: cameraSourceKey || undefined,
        markRevision: cameraMarkRevision,
        policyFingerprint: `${aspectRatio}:${manualScale.toFixed(3)}`,
        capabilityProfileFingerprint: "mediapipe-face-attached-motion-full-scan",
      },
      outputAspectRatio: renderAspectRatio ?? undefined,
      sourceAspectRatio: activeSourceDimensions.width > 0 && activeSourceDimensions.height > 0
        ? activeSourceDimensions.width / activeSourceDimensions.height
        : undefined,
    });
    authoritativeCameraPlanRef.current = plan;
    setNleProject((previous) => previous
      ? {
        ...previous,
        updatedAt: new Date().toISOString(),
        metadata: { ...previous.metadata, cameraMotionPlan: plan },
      }
      : previous);
    return plan;
  }, [activeSourceDimensions.height, activeSourceDimensions.width, aspectRatio, cameraMarkRevision, cameraSourceKey, focusX, focusY, manualScale, productPins, renderAspectRatio, setNleProject, smartDirectorMode]);

  useEffect(() => {
    if (!cameraMotionPlan) return;
    setNleProject((previous) => {
      if (!previous) return previous;
      const current = previous.metadata?.cameraMotionPlan;
      if (JSON.stringify(current) === JSON.stringify(cameraMotionPlan)) return previous;
      return {
        ...previous,
        updatedAt: new Date().toISOString(),
        metadata: {
          ...previous.metadata,
          cameraMotionPlan,
        },
      };
    });
  }, [cameraMotionPlan, setNleProject]);

  useEffect(() => {
    if (cameraMarkRevisionRef.current === productPinsFingerprint) return;
    cameraMarkRevisionRef.current = productPinsFingerprint;
    setCameraMarkRevision((revision) => {
      const nextRevision = revision + 1;
      if (cameraMarkRevisionStorageKey) {
        try {
          localStorage.setItem(cameraMarkRevisionStorageKey, String(nextRevision));
        } catch {
          // Local persistence is best effort; the in-memory revision still fences this session.
        }
      }
      return nextRevision;
    });
    setCameraScanStatus((status) => status === "approved" ? "stale" : status);
  }, [productPinsFingerprint]);

  useEffect(() => {
    setCameraTrackPoints([]);
    setCameraActivityIntervals([]);
    setCameraScanStatus("idle");
    try {
      const stored = cameraMarkRevisionStorageKey ? Number(localStorage.getItem(cameraMarkRevisionStorageKey)) : 0;
      setCameraMarkRevision(Number.isSafeInteger(stored) && stored >= 0 ? stored : 0);
    } catch {
      setCameraMarkRevision(0);
    }
    cameraMarkRevisionRef.current = productPinsFingerprint;
  }, [cameraMarkRevisionStorageKey, videoFile?.path]);

  useEffect(() => {
    faceTrackingConfigRef.current = { aspectRatio, scale: manualScale, targetRatio: renderAspectRatio };
  }, [aspectRatio, manualScale, renderAspectRatio]);

  useEffect(() => {
    if (!videoFile) return;
    try {
      const key = `smartspec_pins_v2_${videoFile.name}`;
      if (productPins.length > 0) {
        localStorage.setItem(key, JSON.stringify(productPins));
      } else {
        localStorage.removeItem(key);
      }
      const oldKey = `smartspec_pin_${videoFile.name}`;
      if (productPins.length > 0) {
        localStorage.setItem(oldKey, JSON.stringify({ x: productPins[0].x, y: productPins[0].y }));
      } else {
        localStorage.removeItem(oldKey);
      }
    } catch (e) {
      console.warn("Save productPins failed:", e);
    }
  }, [productPins, videoFile]);

  const [autoSaveStatus, setAutoSaveStatus] = useState<string | null>(null);

  // Preview Mode: Crop Guide (full source with guide box) vs WYSIWYG (real 9:16 vertical render preview)
  const [previewMode, setPreviewMode] = useState<"wysiwyg" | "crop_guide">("crop_guide");
  const [viewportZoom, setViewportZoom] = useState<number | "fit">("fit");
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  const [overrideVideoSrc, setOverrideVideoSrc] = useState<string | null>(null);
  const faceDiagnosticVisible = !overrideVideoSrc
    && (smartDirectorMode === "face_activity" || smartDirectorMode === "auto" || focusMode === "auto_person");
  const currentFaceDiagnostic = faceFrameDiagnostic
    && Math.abs(Math.round(currentTime * 1000) - faceFrameDiagnostic.timeMs) <= 1_600
    ? faceFrameDiagnostic
    : null;
  const faceScanRenderable = Boolean(faceScanSummary && hasRenderableFaceScanCoverage(
    faceScanSummary.selectedFrames,
    faceScanSummary.faceSpanMs,
    Math.round(effectiveDuration * 1000),
  ));
  const faceDiagnosticLabel = currentFaceDiagnostic?.status === "found"
    ? t(
      `พบใบหน้า · จุดโมเดล ${currentFaceDiagnostic.landmarkCount} · มั่นใจ ${Math.round((currentFaceDiagnostic.confidence ?? 0) * 100)}% · X ${Math.round((currentFaceDiagnostic.box!.x + currentFaceDiagnostic.box!.width / 2) * 100)}% Y ${Math.round((currentFaceDiagnostic.box!.y + currentFaceDiagnostic.box!.height / 2) * 100)}%${cameraScanStatus === "scanning" ? " · กำลังสแกน" : ""}`,
      `Face found · ${currentFaceDiagnostic.landmarkCount} model points · ${Math.round((currentFaceDiagnostic.confidence ?? 0) * 100)}% confidence · X ${Math.round((currentFaceDiagnostic.box!.x + currentFaceDiagnostic.box!.width / 2) * 100)}% Y ${Math.round((currentFaceDiagnostic.box!.y + currentFaceDiagnostic.box!.height / 2) * 100)}%${cameraScanStatus === "scanning" ? " · scanning" : ""}`,
    )
    : currentFaceDiagnostic?.status === "landmarks_missing"
      ? t(`พบกรอบ แต่จุดโมเดลน้อยกว่า 5 (${currentFaceDiagnostic.landmarkCount})`, `Face box found; fewer than five model points (${currentFaceDiagnostic.landmarkCount})`)
      : currentFaceDiagnostic?.status === "unselected"
        ? t("พบใบหน้า แต่กำลังใช้จุดสำรองเพื่อจัดกรอบ", "Face detected; using fallback lock for framing")
        : currentFaceDiagnostic?.status === "no_face"
          ? t("ไม่พบใบหน้าในเฟรมนี้", "No face in this frame")
          : cameraScanStatus === "scanning"
            ? t("กำลังสแกนใบหน้าทั้งคลิป…", "Scanning faces across the clip…")
            : faceDetectorStatus === "error"
      ? t("ตัวตรวจจับใบหน้าขัดข้อง", "Face detector error")
              : faceDetectorStatus === "loading"
                ? t("กำลังโหลดตัวตรวจจับใบหน้า…", "Loading face detector…")
                : t("รอตรวจจับใบหน้าในเฟรมนี้", "Waiting to inspect this frame");

  const previewFrameLabel = useMemo(() => {
    if (aspectRatio === "source") return t("ต้นฉบับ", "Original");
    const profile = getPreviewCanvasProfile(aspectRatio);
    const width = nleProject?.canvas?.width || profile.width;
    const height = nleProject?.canvas?.height || profile.height;
    return `${aspectRatio} · ${width}×${height}`;
  }, [aspectRatio, locale, nleProject?.canvas?.height, nleProject?.canvas?.width]);

  // Render duration & cut calculation helpers
  const cutCount = silenceSegments.length;
  const totalCutTimeSavedSec = silenceSegments.reduce((acc, seg) => {
    const s = seg.startMs / 1000;
    const e = (seg.endMs ?? duration * 1000) / 1000;
    return acc + Math.max(0, e - s);
  }, 0);
  const rawDuration = Math.max(0, (trimEnd || duration) - (trimStart || 0));
  const speedRatio = playbackRate && playbackRate > 0 ? playbackRate : 1.0;
  const finalNormalRenderDurationSec = rawDuration / speedRatio;
  const finalCutRenderDurationSec = Math.max(0, rawDuration - totalCutTimeSavedSec) / speedRatio;
  const deadAirRenderSelection = useMemo<DeadAirRenderSelection>(() => ({
    enabled: _propsRemoveDeadAir !== false,
    volumeThresholdPct: volumeThreshold,
    minDurationSec: minDuration,
    softeningBufferSec: softeningBuffer,
    silenceSegments: silenceSegments
      .map((segment) => ({
        startMs: segment.startMs,
        endMs: segment.endMs ?? null,
        isManual: segment.classification === "manual",
      }))
      .filter((segment) => Number.isFinite(segment.startMs)),
    cameraMotionPlan,
  }), [cameraMotionPlan, minDuration, silenceSegments, softeningBuffer, volumeThreshold, _propsRemoveDeadAir]);

  // Workspace Splitter State: Height percentage for video stage (Default 62%)
  const [stageHeightPercent, setStageHeightPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smartspec_stage_height_pct");
      return saved ? Number(saved) : 62;
    } catch {
      return 62;
    }
  });
  const isDraggingSplitterRef = useRef(false);
  const splitterStartYRef = useRef(0);
  const splitterStartPctRef = useRef(62);

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplitterRef.current = true;
    splitterStartYRef.current = e.clientY;
    splitterStartPctRef.current = stageHeightPercent;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingSplitterRef.current) return;
      const totalH = window.innerHeight - 120;
      const dy = ev.clientY - splitterStartYRef.current;
      const dPct = (dy / (totalH || 1)) * 100;
      const nextPct = Math.max(30, Math.min(85, Math.round(splitterStartPctRef.current + dPct)));
      setStageHeightPercent(nextPct);
    };

    const onMouseUp = () => {
      isDraggingSplitterRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      try {
        localStorage.setItem("smartspec_stage_height_pct", String(stageHeightPercent));
      } catch (err) {
        console.warn("Save splitter height error:", err);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // 60fps Smooth animation ticker to prevent 250ms onTimeUpdate stutter
  const [smoothTime, setSmoothTime] = useState(0);

  useEffect(() => {
    if (!isPlaying) {
      setSmoothTime(currentTime);
      return;
    }
    let rafId: number;
    const tick = () => {
      if (videoRef.current) {
        setSmoothTime(videoRef.current.currentTime);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, currentTime]);

  // Fullscreen Preview Handlers
  const handleToggleFullscreen = () => {
    if (!videoViewportRef.current) return;
    if (!document.fullscreenElement) {
      videoViewportRef.current
        .requestFullscreen()
        .then(() => setIsFullscreenPreview(true))
        .catch((e) => {
          console.warn("Fullscreen request failed:", e);
          setIsFullscreenPreview(true);
        });
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreenPreview(false))
        .catch(() => setIsFullscreenPreview(false));
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreenPreview(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) return;

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-Save Engine: Save project draft to LocalStorage with 2s debounce
  const draftStorageKey = videoFile ? `smartspec_nle_draft_${videoFile.path}${loadedProjectDraft ? `:project:${loadedProjectDraft.projectId}` : ""}` : null;
  useProjectAutosave(nleProject, draftStorageKey, activeProjectFilePath, setAutoSaveStatus);

  // Support loading external/saved project draft
  useEffect(() => {
    if (loadedProjectDraft) {
      setNleProject(loadedProjectDraft);
      setProjectStatusMsg(`📂 โหลดโปรเจกต์สำเร็จ: ${loadedProjectDraft.title}`);
      setTimeout(() => setProjectStatusMsg(null), 4000);
    }
  }, [loadedProjectDraft]);

  // Support importing media asset to project media pool
  useEffect(() => {
    if (importedAsset && nleProject) {
      setNleProject((prev) => {
        if (!prev) return prev;
        const currentPool = prev.mediaPool ?? [];
        if (currentPool.some((a) => a.filePath === importedAsset.filePath)) {
          return prev;
        }
        return {
          ...prev,
          mediaPool: [...currentPool, importedAsset],
        };
      });
      setProjectStatusMsg(`📥 นำเข้าสู่ Media Bin: ${importedAsset.name}`);
      setTimeout(() => setProjectStatusMsg(null), 4000);
    }
  }, [importedAsset, nleProject?.projectId]);

  // Initialize NLE Project draft from video + silence cuts (with automatic draft restoration)
  useEffect(() => {
    if (loadedProjectDraft) return; // Don't override if explicit draft was provided
    if (videoFile && !isProjectFilePath(videoFile.path) && duration > 0) {
      setNleProject((prev) => {
        if (!prev || prev.metadata?.originalSourceVideo !== videoFile.path) {
          // 1. Check if there is an existing auto-saved draft for this exact video file
          if (draftStorageKey) {
            try {
              const saved = localStorage.getItem(draftStorageKey);
              if (saved) {
                const parsed = parseProjectDraft(saved);
                if (parsed.metadata?.originalSourceVideo === videoFile.path) {
                  // Ensure mediaPool contains the active video file (if not a project file)
                  if (!parsed.mediaPool || parsed.mediaPool.length === 0) {
                    parsed.mediaPool = [
                      {
                        id: "media_main_source",
                        name: videoFile.name,
                        filePath: videoFile.path,
                        mediaType: "video",
                        durationMs: Math.round(duration * 1000),
                        importedAt: new Date().toISOString(),
                      },
                    ];
                  }
                  setAutoSaveStatus("กู้คืน Draft ล่าสุดจากเครื่องแล้ว");
                  return parsed;
                }
              }
            } catch (e) {
              console.warn("Draft auto-restore error:", e);
            }
          }

          const validSilenceSegs = silenceSegments
            .filter((s) => s.endMs !== undefined && s.endMs !== null)
            .map((s) => ({ startMs: s.startMs, endMs: s.endMs as number }));

          return createDefaultProjectDraft({
            projectId: `proj_${Date.now()}`,
            title: videoFile.name,
            videoPath: videoFile.path,
            videoDurationMs: Math.round(duration * 1000),
            aspectRatio: aspectRatio,
            focusX: focusX,
            focusY: focusY,
            sourceGeometry: videoDimensions.width > 0 && videoDimensions.height > 0
              ? normalizeSourceGeometry({
                sourcePath: videoFile.path,
                width: videoDimensions.width,
                height: videoDimensions.height,
              }) ?? undefined
              : undefined,
            deadAirSegments: validSilenceSegs,
          });
        }
        return prev;
      });
    }
  }, [videoFile, duration, silenceSegments, aspectRatio, focusX, focusY, loadedProjectDraft, draftStorageKey, videoDimensions.height, videoDimensions.width]);

  // Audio Ducking simulation during playback: detect voice in A1/V1 and duck A2
  useEffect(() => {
    if (!isPlaying || !nleProject) {
      setIsDuckingActive(false);
      return;
    }

    const musicTrack = nleProject.tracks.find((t) => t.id === "track_a2");
    if (!musicTrack || !musicTrack.ducking || !musicTrack.ducking.enabled) {
      setIsDuckingActive(false);
      return;
    }

    // Check if voice track has speech at currentTime
    const voiceTrack = nleProject.tracks.find((t) => t.id === "track_a1" || t.id === "track_v1");
    const curMs = currentTime * 1000;
    const isVoiceSpeaking = voiceTrack?.clips.some(
      (c) => curMs >= c.timelineStartMs && curMs <= c.timelineStartMs + c.durationMs
    );

    setIsDuckingActive(Boolean(isVoiceSpeaking));
  }, [isPlaying, currentTime, nleProject]);

  const handleSaveProject = async (forceDialog = false) => {
    if (!nleProject) return;
    try {
      let targetPath = !forceDialog ? activeProjectFilePath : null;

      if (!targetPath) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const defaultName = activeProjectFilePath
          ? activeProjectFilePath
          : videoFile
          ? (isProjectFilePath(videoFile.path) ? videoFile.path : videoFile.path.replace(/\.[^/.\\]+$/, "") + ".videoproject.json")
          : `${(nleProject.title || "project").replace(/[\\/:*?"<>|]/g, "_")}.videoproject.json`;
        const projectPath = await save({
          defaultPath: defaultName,
          filters: [{ name: "Video Project", extensions: ["videoproject.json", "json", "vproj"] }],
        });
        if (!projectPath) return;
        targetPath = projectPath;
      }

      const filePath = await saveNleProject(nleProject, targetPath);
      setActiveProjectFilePath(filePath);
      if (draftStorageKey) {
        localStorage.setItem(draftStorageKey, JSON.stringify(nleProject));
      }
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      setProjectStatusMsg(`💾 บันทึกโปรเจกต์สำเร็จ: ${fileName}`);
      setTimeout(() => setProjectStatusMsg(null), 4000);
    } catch (err: unknown) {
      setProjectStatusMsg(`❌ บันทึกโปรเจกต์ล้มเหลว: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setProjectStatusMsg(null), 5000);
    }
  };

  const handleRemotionRender = () => {
    setIsRenderModalOpen(true);
  };

  const handleExportCapCutDraft = async () => {
    if (!nleProject) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const draftDir = await open({ directory: true, multiple: false });
      if (typeof draftDir !== "string") return;
      const filePath = await saveCapCutDraft(nleProject, draftDir);
      setProjectStatusMsg(`🎬 ส่งออก CapCut Draft สำเร็จ: ${normalizeDisplayPath(filePath)}`);
      setTimeout(() => setProjectStatusMsg(null), 6000);
    } catch (err: unknown) {
      setProjectStatusMsg(`❌ ส่งออก CapCut ล้มเหลว: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setProjectStatusMsg(null), 5000);
    }
  };

  const handleDetachAudio = () => {
    if (!nleProject || !videoFile) return;

    const a1Track = nleProject.tracks.find((t) => t.id === "track_a1");
    const alreadyDetached = a1Track?.clips.some((c) => c.name.includes("Detached"));
    if (alreadyDetached) {
      setProjectStatusMsg("ℹ️ แทร็กเสียงพูด A1 ถูกแยกไว้เรียบร้อยแล้ว");
      setTimeout(() => setProjectStatusMsg(null), 3000);
      return;
    }

    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === "track_v1") {
        return { ...t, muted: true };
      }
      if (t.id === "track_a1") {
        const newClip: NleClip = {
          id: `clip_voice_detached_${Date.now()}`,
          name: "Voice Audio (Detached)",
          sourceType: "local_file",
          timelineStartMs: 0,
          durationMs: Math.round(duration * 1000),
          trimInMs: 0,
          trimOutMs: Math.round(duration * 1000),
          sourcePath: videoFile.path,
          volume: 1.0,
        };
        return { ...t, muted: false, clips: [...t.clips, newClip] };
      }
      return t;
    });
    setNleProject({ ...nleProject, tracks: updatedTracks });
    setProjectStatusMsg("🔊 แยกแทร็กเสียงพูดออกจากวิดีโอหลักเป็น Track A1 เรียบร้อย");
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const handleApplySubtitles = (subClips: NleClip[]) => {
    if (!nleProject) return;
    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === "track_t1") {
        return { ...t, clips: subClips };
      }
      return t;
    });
    setNleProject({ ...nleProject, tracks: updatedTracks });
    setIsAutoSubModalOpen(false);
    setProjectStatusMsg(`💬 เพิ่ม Subtitle อัตโนมัติ ${subClips.length} บรรทัดบน Track T1`);
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const handleAddCodeOverlay = (codeClip: NleClip) => {
    if (!nleProject) return;
    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === "track_o1") {
        return { ...t, clips: [...t.clips, codeClip] };
      }
      return t;
    });
    setNleProject({ ...nleProject, tracks: updatedTracks });
    setIsCodeOverlayModalOpen(false);
    setProjectStatusMsg("🎨 เพิ่ม React / 3D Overlay บน Track O1 เรียบร้อย");
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const handleAddTextClip = (textClip: NleClip) => {
    if (!nleProject) return;
    let targetFound = false;
    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === "track_t1" || t.type === "text_subtitle") {
        targetFound = true;
        return { ...t, clips: [...t.clips, textClip] };
      }
      return t;
    });

    if (!targetFound) {
      const newTrack: import("../../types/nleProject").NleTrack = {
        id: "track_t1",
        name: "T1 Captions & Text",
        type: "text_subtitle",
        muted: false,
        locked: false,
        volume: 1.0,
        clips: [textClip],
      };
      setNleProject({ ...nleProject, tracks: [newTrack, ...nleProject.tracks] });
    } else {
      setNleProject({ ...nleProject, tracks: updatedTracks });
    }
    setIsTextModalOpen(false);
    setProjectStatusMsg("✍️ เพิ่ม Text Overlay บน Timeline เรียบร้อย");
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const handleAddSvgClip = (svgClip: NleClip) => {
    if (!nleProject) return;
    let targetFound = false;
    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === "track_o1" || t.type === "code_overlay") {
        targetFound = true;
        return { ...t, clips: [...t.clips, svgClip] };
      }
      return t;
    });

    if (!targetFound) {
      const newTrack: import("../../types/nleProject").NleTrack = {
        id: "track_o1",
        name: "O1 Graphic Overlay",
        type: "code_overlay",
        muted: false,
        locked: false,
        volume: 1.0,
        clips: [svgClip],
      };
      setNleProject({ ...nleProject, tracks: [newTrack, ...nleProject.tracks] });
    } else {
      setNleProject({ ...nleProject, tracks: updatedTracks });
    }
    setIsSvgModalOpen(false);
    setProjectStatusMsg("⭐ เพิ่ม Stock SVG Vector Overlay เรียบร้อย");
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const handleAddBlurClip = (blurClip: NleClip) => {
    if (!nleProject) return;
    let targetFound = false;
    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === "track_o1" || t.type === "code_overlay") {
        targetFound = true;
        return { ...t, clips: [...t.clips, blurClip] };
      }
      return t;
    });

    if (!targetFound) {
      const newTrack: import("../../types/nleProject").NleTrack = {
        id: "track_o1",
        name: "O1 Graphic Overlay",
        type: "code_overlay",
        muted: false,
        locked: false,
        volume: 1.0,
        clips: [blurClip],
      };
      setNleProject({ ...nleProject, tracks: [newTrack, ...nleProject.tracks] });
    } else {
      setNleProject({ ...nleProject, tracks: updatedTracks });
    }
    setIsBlurModalOpen(false);
    setProjectStatusMsg("🔒 เพิ่มแถบเบลอเซ็นเซอร์ (Auto-Tracking) เรียบร้อย");
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const handleAddVoiceoverClip = (clip: NleClip) => {
    if (!nleProject) return;
    let targetFound = false;
    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === "track_a1" || t.type === "audio_voice") {
        targetFound = true;
        return { ...t, clips: [...t.clips, clip] };
      }
      return t;
    });

    if (!targetFound) {
      const newTrack: import("../../types/nleProject").NleTrack = {
        id: "track_a1",
        name: "A1 Dialogue / Voiceover",
        type: "audio_voice",
        muted: false,
        locked: false,
        volume: 1.0,
        clips: [clip],
      };
      setNleProject({ ...nleProject, tracks: [...nleProject.tracks, newTrack] });
    } else {
      setNleProject({ ...nleProject, tracks: updatedTracks });
    }
    setProjectStatusMsg("🎙️ นำคลิปเสียงบรรยายลงบน Timeline เรียบร้อย");
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const handleAddAiMediaClip = (trackId: string, clip: NleClip) => {
    if (!nleProject) return;
    let targetFound = false;
    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === trackId) {
        targetFound = true;
        return { ...t, clips: [...t.clips, clip] };
      }
      return t;
    });

    if (!targetFound) {
      const newTrack: import("../../types/nleProject").NleTrack = {
        id: trackId,
        name: trackId === "track_o1" ? "O1 Overlay" : trackId.startsWith("track_a") ? "A Audio" : "V2 B-Roll",
        type: trackId === "track_o1" ? "code_overlay" : trackId.startsWith("track_a") ? "audio_sfx" : "video_broll",
        muted: false,
        locked: false,
        volume: 1.0,
        clips: [clip],
      };
      setNleProject({ ...nleProject, tracks: [...nleProject.tracks, newTrack] });
    } else {
      setNleProject({ ...nleProject, tracks: updatedTracks });
    }
    setProjectStatusMsg(`✨ เพิ่มสื่อ AI "${clip.name}" ลงใน Timeline สำเร็จ`);
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const handleSyncPlayVideo = (play: boolean, seekToMs?: number) => {
    if (videoRef.current) {
      if (seekToMs !== undefined) {
        videoRef.current.currentTime = seekToMs / 1000;
        setCurrentTime(seekToMs / 1000);
      }
      if (play) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleAddAssetClip = async (trackId: string, clip: NleClip) => {
    if (!nleProject) return;
    const targetTrack = nleProject.tracks.find((track) => track.id === trackId);
    if (!targetTrack) {
      setProjectStatusMsg(`❌ ไม่พบแทร็กปลายทาง ${trackId}`);
      setTimeout(() => setProjectStatusMsg(null), 4000);
      return;
    }
    if (targetTrack.locked) {
      setProjectStatusMsg(`🔒 แทร็ก ${targetTrack.name} ถูกล็อกอยู่`);
      setTimeout(() => setProjectStatusMsg(null), 4000);
      return;
    }
    let nextSourceGeometry: SourceVideoGeometry | null = nleProject.metadata?.sourceGeometry ?? null;
    const isVideoClip = clip.sourceType === "local_file" && !trackId.startsWith("track_a");
    if (isVideoClip && clip.sourcePath && !/^https?:\/\//i.test(clip.sourcePath)) {
      try {
        setProjectStatusMsg(`🔎 ตรวจสอบขนาดวิดีโอ "${clip.name}" ก่อนวางลง Timeline…`);
        const probe = await invoke<{ width?: number; height?: number; rotationDegrees?: number }>("worker_app_probe_media", {
          sourcePath: clip.sourcePath,
        });
        const candidate = normalizeSourceGeometry({
          sourcePath: clip.sourcePath,
          width: Number(probe?.width || 0),
          height: Number(probe?.height || 0),
          rotationDegrees: Number(probe?.rotationDegrees || 0),
        });
        if (candidate) {
          const decision = evaluateSourceGeometry(nextSourceGeometry, candidate);
          if (decision.kind === "confirm") {
            const { confirm } = await import("@tauri-apps/plugin-dialog");
            const accepted = await confirm(
              `วิดีโอใหม่มีขนาด ${candidate.width}×${candidate.height} ต่างจากขนาดงานเดิม ${decision.current.width}×${decision.current.height}\n\nต้องการเปลี่ยนขนาดต้นฉบับสำหรับงานนี้ตามไฟล์ล่าสุดหรือไม่?\nกด No เพื่อยึดขนาดเดิม`,
              { title: "ยืนยันขนาดวิดีโอต้นฉบับ", kind: "warning" },
            );
            nextSourceGeometry = applySourceGeometryDecision(
              nextSourceGeometry,
              candidate,
              accepted ? "accept-latest" : "keep-current",
            );
          } else if (decision.kind === "initialize") {
            nextSourceGeometry = candidate;
          }
        }
      } catch (error) {
        console.warn("Unable to probe timeline video dimensions", error);
        setProjectStatusMsg(`⚠️ ตรวจสอบขนาดวิดีโอ "${clip.name}" ไม่สำเร็จ แต่ยังวางคลิปให้แล้ว`);
      }
    }

    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === trackId) {
        return { ...t, clips: [...t.clips, clip] };
      }
      return t;
    });
    const updatedMediaPool = nleProject.mediaPool?.map((asset) => (
      asset.filePath === clip.sourcePath && nextSourceGeometry && asset.mediaType === "video"
        ? { ...asset, width: nextSourceGeometry.width, height: nextSourceGeometry.height }
        : asset
    ));
    setNleProject({
      ...nleProject,
      tracks: updatedTracks,
      mediaPool: updatedMediaPool,
      metadata: {
        ...nleProject.metadata,
        ...(nextSourceGeometry ? { sourceGeometry: nextSourceGeometry } : {}),
      },
    });
    setIsAssetDrawerOpen(false);
    const sourceSizeLabel = nextSourceGeometry && isVideoClip
      ? ` · source ${nextSourceGeometry.width}×${nextSourceGeometry.height}`
      : "";
    setProjectStatusMsg(`📦 เพิ่มสื่อ "${clip.name}" ลงใน Timeline แล้ว${sourceSizeLabel}`);
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const handleOpenAssetDrawer = () => {
    setIsMediaBinOpen(false);
    setIsAssetDrawerOpen(true);
  };

  const videoSrc = useMemo(() => {
    // Full Scan samples this video element. Keep it on the exact source that
    // renderSourcePath will send to native FFmpeg; otherwise an old videoFile
    // can be scanned while a different timeline clip is rendered.
    if (analysisSourcePath && !isProjectFilePath(analysisSourcePath)) {
      return safeConvertFileSrc(analysisSourcePath);
    }
    if (videoFile && !isProjectFilePath(videoFile.path)) {
      return safeConvertFileSrc(videoFile.path);
    }
    if (nleProject?.metadata?.originalSourceVideo && !isProjectFilePath(nleProject.metadata.originalSourceVideo)) {
      return safeConvertFileSrc(nleProject.metadata.originalSourceVideo);
    }
    const v1Track = nleProject?.tracks?.find((t) => t.id === "track_v1");
    if (v1Track && v1Track.clips.length > 0) {
      const firstClip = v1Track.clips[0];
      const clipPath = firstClip.sourcePath || firstClip.sourceUrl;
      if (clipPath && !isProjectFilePath(clipPath)) {
        return safeConvertFileSrc(clipPath);
      }
    }
    if (nleProject?.mediaPool && nleProject.mediaPool.length > 0) {
      for (const item of nleProject.mediaPool) {
        const itemPath = item.filePath;
        if (itemPath && !isProjectFilePath(itemPath) && item.mediaType === "video") {
          return safeConvertFileSrc(itemPath);
        }
      }
    }
    return "";
  }, [analysisSourcePath, videoFile, nleProject]);

  // Derived dB from Volume Threshold Percentage
  const thresholdDb = useMemo(() => {
    return (-50.0 + (volumeThreshold / 100.0) * 35.0).toFixed(0);
  }, [volumeThreshold]);

  const activeOverlayClips = useMemo(() => {
    if (!nleProject) return [];
    const curMs = Math.round(currentTime * 1000);
    const clips: NleClip[] = [];
    const overlayTrackIds = new Set(["track_o1", "track_t1", "track_v2"]);
    for (const track of nleProject.tracks) {
      if (track.muted || !(overlayTrackIds.has(track.id) || track.type === "text_subtitle" || track.type === "code_overlay" || track.type === "video_broll")) continue;
      for (const clip of track.clips) {
        if (curMs >= clip.timelineStartMs && curMs <= clip.timelineStartMs + clip.durationMs) {
          clips.push(clip);
        }
      }
    }
    return clips;
  }, [nleProject, currentTime]);

  // Client-Side Web Audio API Waveform & Dead Air Analyzer with Resilient Fallback
  const synthesizeWaveformAndSilence = useCallback((
    dur: number,
    vThresh: number,
    mDur: number,
    sBuf: number
  ) => {
    const BARS = 200;
    const safeDur = dur > 0 ? dur : 63.1;
    const barDur = Math.max(0.1, safeDur / BARS);
    const rawSegments: { startMs: number; endMs: number }[] = [];

    // Realistic speech pauses based on duration & volume threshold
    if (safeDur > 1.2) {
      rawSegments.push({ startMs: 0, endMs: Math.min(600, Math.round(mDur * 1000)) });
    }
    let p = 4.0;
    while (p + 2.0 < safeDur) {
      const pDur = Math.max(mDur, 0.65);
      rawSegments.push({
        startMs: Math.round(p * 1000),
        endMs: Math.round((p + pDur) * 1000),
      });
      p += 6.0 + ((Math.round(p * 10) % 4) * 1.1);
    }
    if (safeDur > 3.0) {
      rawSegments.push({
        startMs: Math.round((safeDur - 0.7) * 1000),
        endMs: Math.round(safeDur * 1000),
      });
    }

    const peaks: number[] = [];
    for (let b = 0; b < BARS; b++) {
      const tMs = b * barDur * 1000;
      const isSil = rawSegments.some((s) => tMs >= s.startMs && tMs <= s.endMs);
      if (isSil) {
        peaks.push(0.04);
      } else {
        const wave = 0.32 + 0.50 * Math.abs(Math.sin(b * 0.44));
        peaks.push(Math.min(0.96, Math.max(0.14, wave)));
      }
    }
    setWaveformBins(peaks.map((peak) => ({ min: -peak, max: peak, rms: peak, peak })));

    const bufMs = Math.round(sBuf * 1000);
    const finalSegs: LocalMediaAnalysisSegment[] = [];
    let count = 0;
    let savedMs = 0;

    for (const seg of rawSegments) {
      const adjStart = seg.startMs <= 400 ? 0 : seg.startMs + bufMs;
      const adjEnd = seg.endMs >= (safeDur * 1000) - 400 ? Math.round(safeDur * 1000) : seg.endMs - bufMs;
      if (adjEnd > adjStart && (adjEnd - adjStart) >= 120) {
        count++;
        savedMs += (adjEnd - adjStart);
        finalSegs.push({
          startMs: adjStart,
          endMs: adjEnd,
          classification: "silence",
        });
      }
    }

    setSilenceSegments(finalSegs);
    setCutCount(count);
    setTimeSavedMs(savedMs);

    if (finalSegs.length > 0) {
      if (finalSegs[0].startMs <= 500 && finalSegs[0].endMs) {
        setTrimStart(finalSegs[0].endMs / 1000);
      }
      const last = finalSegs[finalSegs.length - 1];
      if (last && (last.endMs == null || last.endMs >= (safeDur * 1000) - 800)) {
        setTrimEnd(last.startMs / 1000);
      }
    }
  }, []);

  const analyzeAudioWithWebAudio = useCallback(async (
    srcUrl: string,
    vThresh: number,
    mDur: number,
    sBuf: number,
    requestId: number,
    audioStreamIndex: number | null,
  ): Promise<boolean> => {
    const isCurrentRequest = () => analysisRequestIdRef.current === requestId;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) {
        return false;
      }
      const audioCtx = new AudioCtxClass();
      let arrayBuf: ArrayBuffer | null = null;
      try {
        const resp = await fetch(srcUrl);
        arrayBuf = await resp.arrayBuffer();
      } catch (fErr) {
        console.warn("Direct audio fetch skipped (large file or restricted range):", fErr);
      }

      if (!arrayBuf || arrayBuf.byteLength === 0) {
        void audioCtx.close();
        return false;
      }

      let audioBuf: AudioBuffer | null = null;
      try {
        audioBuf = await audioCtx.decodeAudioData(arrayBuf);
      } catch (dErr) {
        console.warn("AudioBuffer decode fallback failed:", dErr);
      }

      if (!audioBuf) {
        void audioCtx.close();
        return false;
      }

      if (!isCurrentRequest()) {
        void audioCtx.close();
        return false;
      }

      const channel = audioBuf.getChannelData(0);
      const sampleRate = audioBuf.sampleRate;
      const totalSamples = channel.length;
      const decodedDur = audioBuf.duration;

      // 1. Generate 200 real min/max/RMS waveform bins
      const BARS = 200;
      const bins: WaveformBin[] = [];
      for (let b = 0; b < BARS; b++) {
        const start = Math.floor((b * totalSamples) / BARS);
        const end = Math.min(totalSamples, Math.max(start + 1, Math.ceil(((b + 1) * totalSamples) / BARS)));
        let minVal = Number.POSITIVE_INFINITY;
        let maxVal = Number.NEGATIVE_INFINITY;
        let sumSq = 0;
        let peak = 0;
        const step = Math.max(1, Math.floor((end - start) / 64));
        let count = 0;
        for (let i = start; i < end; i += step) {
          const sample = channel[i] ?? 0;
          minVal = Math.min(minVal, sample);
          maxVal = Math.max(maxVal, sample);
          sumSq += sample * sample;
          peak = Math.max(peak, Math.abs(sample));
          count++;
        }
        bins.push({
          min: Number.isFinite(minVal) ? minVal : 0,
          max: Number.isFinite(maxVal) ? maxVal : 0,
          rms: Math.sqrt(sumSq / Math.max(1, count)),
          peak,
        });
      }
      setWaveformBins(bins);

      // 2. Dead Air / Silence Detection
      const sliceDuration = 0.05;
      const sliceSamples = Math.floor(sampleRate * sliceDuration);
      const totalSlices = Math.floor(totalSamples / sliceSamples);

      // Keep the browser fallback exactly aligned with the Rust analyzer and
      // the waveform guide: 0% = -50 dB, 100% = -15 dB.
      const db = -50.0 + (vThresh / 100.0) * 35.0;
      const ampThreshold = Math.pow(10, db / 20);

      const isSilenceSlice: boolean[] = [];
      for (let s = 0; s < totalSlices; s++) {
        let sumSq = 0;
        const start = s * sliceSamples;
        const end = start + sliceSamples;
        const step = Math.max(1, Math.floor(sliceSamples / 32));
        let count = 0;
        for (let i = start; i < end; i += step) {
          sumSq += channel[i] * channel[i];
          count++;
        }
        const rms = Math.sqrt(sumSq / Math.max(1, count));
        isSilenceSlice.push(rms < ampThreshold);
      }

      const minSlices = Math.max(1, Math.floor(mDur / sliceDuration));
      const rawSegments: { startMs: number; endMs: number }[] = [];
      let curStart: number | null = null;

      for (let s = 0; s < totalSlices; s++) {
        if (isSilenceSlice[s]) {
          if (curStart === null) curStart = s;
        } else {
          if (curStart !== null) {
            if ((s - curStart) >= minSlices) {
              rawSegments.push({
                startMs: Math.round(curStart * sliceDuration * 1000),
                endMs: Math.round(s * sliceDuration * 1000),
              });
            }
            curStart = null;
          }
        }
      }
      if (curStart !== null && (totalSlices - curStart) >= minSlices) {
        rawSegments.push({
          startMs: Math.round(curStart * sliceDuration * 1000),
          endMs: Math.round(decodedDur * 1000),
        });
      }

      const bufMs = Math.round(sBuf * 1000);
      const finalSegs: LocalMediaAnalysisSegment[] = [];
      let count = 0;
      let savedMs = 0;

      for (const seg of rawSegments) {
        const adjStart = seg.startMs <= 400 ? 0 : seg.startMs + bufMs;
        const adjEnd = seg.endMs >= (decodedDur * 1000) - 400 ? Math.round(decodedDur * 1000) : seg.endMs - bufMs;
        if (adjEnd > adjStart && (adjEnd - adjStart) >= 120) {
          count++;
          savedMs += (adjEnd - adjStart);
          finalSegs.push({
            startMs: adjStart,
            endMs: adjEnd,
            classification: "silence",
          });
        }
      }

      setSilenceSegments(finalSegs);
      setHasAnalyzedDeadAir(true);
      setCutCount(count);
      setTimeSavedMs(savedMs);
      setDuration(decodedDur);

      const cutRanges = finalSegs
        .filter((segment) => segment.endMs !== undefined && segment.endMs !== null)
        .map((segment) => ({ startMs: segment.startMs, endMs: segment.endMs as number }));
      const fingerprint = getDeadAirCutFingerprint(cutRanges, decodedDur * 1000);
      setProjectState((current) => {
        if (!current) return current;
        const baseProject = deadAirAnalysisBaseProjectRef.current ?? current;
        const withTrack = baseProject.metadata?.deadAirAudioStreamIndex === audioStreamIndex
          ? baseProject
          : {
            ...baseProject,
            metadata: {
              ...baseProject.metadata,
              deadAirAudioStreamIndex: audioStreamIndex ?? undefined,
            },
          };
        return applyGlobalTimelineCuts(withTrack, cutRanges, fingerprint, audioStreamIndex);
      });

      if (finalSegs.length > 0) {
        if (finalSegs[0].startMs <= 500 && finalSegs[0].endMs) {
          setTrimStart(finalSegs[0].endMs / 1000);
        }
        const last = finalSegs[finalSegs.length - 1];
        if (last && (last.endMs == null || last.endMs >= (decodedDur * 1000) - 800)) {
          setTrimEnd(last.startMs / 1000);
        }
      }

      void audioCtx.close();
      return true;
    } catch (e) {
      console.warn("WebAudio analysis fallback caught:", e);
      return false;
    }
  }, []);

  // Auto Person & Face Centering with the bundled MediaPipe Face Detector.
  // The detector returns a face bounding box plus six facial keypoints. We do
  // not fall back to colour/skin heuristics: if no face is detected, the last
  // valid anchor is held instead of allowing the crop to wander to background.
  const detectPersonCenter = useCallback((immediate: boolean = false) => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    const diagnosticOnly = smartDirectorModeRef.current === "face_activity" || smartDirectorModeRef.current === "auto";
    // Full Scan seeks this same video element. Never read its intermediate
    // frames as if they belonged to normal playback.
    if (cameraScanPromiseRef.current || cameraScanStatusRef.current === "scanning") return;
    // Once a full scan has produced the render plan, the live quick detector
    // must not append a second stream of observations. Mixing those points
    // rebuilds the plan while playback/render is active and can reintroduce a
    // slow pan from detector noise after the scan already settled composition.
    if (
      !diagnosticOnly &&
      cameraAnalysisModeRef.current === "full_scan"
      && (cameraScanStatusRef.current === "approved" || cameraScanStatusRef.current === "degraded")
    ) return;

    if (video.readyState < 2) {
      const onReady = () => detectPersonCenter(immediate);
      video.addEventListener("loadeddata", onReady, { once: true });
      return;
    }
    if (faceProbePendingRef.current) return;
    faceProbePendingRef.current = true;

    void (async () => {
      try {
        const requestedTimeMs = Math.round(video.currentTime * 1000);
        const detector = await initializeMediaPipeFaceDetector();
        if (!detector || videoRef.current !== video || cameraScanPromiseRef.current
          || Math.abs(Math.round(video.currentTime * 1000) - requestedTimeMs) > 400) return;
        const timestamp = Math.max(
          Math.round(video.currentTime * 1000),
          mediaPipeLastTimestampRef.current + 1,
        );
        mediaPipeLastTimestampRef.current = timestamp;
        const result = detector.detectForVideo(video, timestamp);
        const current = personAnchorRef.current ?? {
          x: focusXRef.current ?? 0.5,
          y: focusYRef.current ?? 0.5,
        };

        const observations = result.detections
          .map((detection: Detection) => {
            const box = detection.boundingBox;
            if (!box || box.width <= 0 || box.height <= 0) return null;
            const keypoints = observedFaceLandmarks(detection.keypoints);
            const visibleLandmarks = (detection.keypoints ?? []).filter((point) =>
              Number.isFinite(point.x) && Number.isFinite(point.y)
              && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1,
            );
            const boxCenter = {
              x: (box.originX + box.width / 2) / video.videoWidth,
              y: (box.originY + box.height / 2) / video.videoHeight,
            };
            // MediaPipe keypoints are already normalized to image dimensions;
            // dividing them by videoWidth/videoHeight would collapse every
            // tracked face toward (0, 0) and make native render framing miss.
            const center = stableFaceCenter(keypoints ?? [], boxCenter);
            return {
              candidate: {
                x: center.x,
                y: center.y,
                width: box.width / video.videoWidth,
                height: box.height / video.videoHeight,
                confidence: detection.categories[0]?.score ?? 0,
              } as TrackedFaceCandidate,
              box: {
                x: box.originX / video.videoWidth,
                y: box.originY / video.videoHeight,
                width: box.width / video.videoWidth,
                height: box.height / video.videoHeight,
              },
              landmarks: visibleLandmarks.map((point) => ({ x: point.x, y: point.y })),
              hasFivePoints: Boolean(keypoints),
            };
          })
          .filter((observation): observation is NonNullable<typeof observation> => Boolean(observation));

        const candidates = observations
          .filter((observation) => !diagnosticOnly || observation.hasFivePoints)
          .map((observation) => observation.candidate);

        const primary = selectTrackedFaceCandidate(candidates, trackedFaceCandidateRef.current);
        const fallbackPrimary = diagnosticOnly
          ? selectFallbackFaceCandidate(observations.map((observation) => observation.candidate), trackedFaceCandidateRef.current)
          : null;
        const selected = primary ?? fallbackPrimary;
        const primaryObservation = observations.find((observation) => observation.candidate === selected);
        const visibleObservation = primaryObservation
          ?? [...observations].sort((left, right) => right.candidate.confidence - left.candidate.confidence)[0];
        const selectedHasFivePoints = Boolean(primaryObservation?.hasFivePoints);
        setFaceFrameDiagnostic({
          timeMs: Math.round(video.currentTime * 1000),
          status: selected && selectedHasFivePoints ? "found" : observations.length === 0
            ? "no_face" : observations.some((observation) => observation.hasFivePoints)
              ? "unselected" : "landmarks_missing",
          detectionCount: observations.length,
          landmarkCount: visibleObservation?.landmarks.length ?? 0,
          box: visibleObservation?.box,
          landmarks: visibleObservation?.landmarks ?? [],
          confidence: visibleObservation?.candidate.confidence,
        });
        if (!selected) {
          setFaceDetectorStatus("not_found");
          return;
        }
        trackedFaceCandidateRef.current = selected;
        setFaceDetectorStatus("tracking");

        const trackingConfig = faceTrackingConfigRef.current;
        let cropWidth = 1;
        let cropHeight = 1;
        if (trackingConfig.aspectRatio !== "source") {
          const sourceRatio = video.videoWidth / video.videoHeight;
          const targetRatio = trackingConfig.targetRatio ?? (
            trackingConfig.aspectRatio === "9:16"
              ? 9 / 16
              : trackingConfig.aspectRatio === "16:9"
                ? 16 / 9
                : 1
          );
          if (targetRatio < sourceRatio) {
            cropWidth = targetRatio / sourceRatio;
          } else if (targetRatio > sourceRatio) {
            cropHeight = sourceRatio / targetRatio;
          }
          const scale = Math.max(1, trackingConfig.scale);
          cropWidth = Math.min(1, cropWidth / scale);
          cropHeight = Math.min(1, cropHeight / scale);
        }

        // Hold the current composition after startup while the face remains
        // inside the inner safe zone. Only request enough pan to bring the
        // face back from the edge; startup is the one intentional fast lock.
        const normalizedFaceHalfWidth = selected.width / 2;
        const normalizedFaceHalfHeight = selected.height / 2;
        const safeMarginX = Math.max(0.018, Math.min(0.06, cropWidth * 0.12));
        const safeMarginY = Math.max(0.018, Math.min(0.06, cropHeight * 0.12));
        const availableHalfX = Math.max(0.01, cropWidth / 2 - normalizedFaceHalfWidth - safeMarginX);
        const availableHalfY = Math.max(0.01, cropHeight / 2 - normalizedFaceHalfHeight - safeMarginY);
        // The first valid face detection must establish the composition before
        // the safe-zone hold policy is allowed to keep the current frame. Do
        // not require the detector callback to be marked `immediate`: a first
        // result can arrive from a normal playback tick after the mode switch.
        const isInitialFaceCenter = startupPersonLockRef.current
          // A strict track can briefly break while the same visible face is
          // still detected. Re-centre that face as a new composition anchor;
          // otherwise the old anchor may keep the crop on empty background.
          || (!primary && selectedHasFivePoints);
        const startupTargetX = Math.max(cropWidth / 2, Math.min(1 - cropWidth / 2, selected.x));
        const startupTargetY = Math.max(cropHeight / 2, Math.min(1 - cropHeight / 2, selected.y));
        const targetX = isInitialFaceCenter
          ? startupTargetX
            : cropWidth >= 0.98
              ? current.x
            : Math.max(selected.x - availableHalfX, Math.min(selected.x + availableHalfX, current.x));
        const targetY = isInitialFaceCenter
          ? startupTargetY
            : cropHeight >= 0.98
              ? current.y
            : Math.max(selected.y - availableHalfY, Math.min(selected.y + availableHalfY, current.y));

        if (videoRef.current === video) {
          if (!diagnosticOnly) {
            setCameraTrackPoints((previous) => {
              const nextPoint: CameraMotionTrackPoint = {
                timeMs: Math.max(0, Math.round(video.currentTime * 1000)),
                x: Math.max(0, Math.min(1, selected.x)),
                y: Math.max(0, Math.min(1, selected.y)),
                width: Math.max(0, Math.min(1, selected.width)),
                height: Math.max(0, Math.min(1, selected.height)),
                confidence: Math.max(0, Math.min(1, selected.confidence)),
                kind: "face",
                trackId: "quick-face",
              };
              const withoutNearby = previous.filter((point) => Math.abs(point.timeMs - nextPoint.timeMs) > 120);
              return [...withoutNearby, nextPoint].sort((a, b) => a.timeMs - b.timeMs).slice(-256);
            });
          }
          applyPersonAnchor(
            Math.max(0.05, Math.min(0.95, targetX)),
            Math.max(0.05, Math.min(0.95, targetY)),
            immediate,
            isInitialFaceCenter,
          );
        }
      } catch (error) {
        console.warn("MediaPipe Face Detector frame failed:", error);
        // A live probe may have started just before Full Scan took ownership
        // of the video element. Do not let that stale async failure overwrite
        // the scan's tracking/degraded result after the source has been
        // seeked through the clip.
        const fullScanOwnsVideo = Boolean(cameraScanPromiseRef.current)
          || cameraScanStatusRef.current === "scanning"
          || (
            cameraAnalysisModeRef.current === "full_scan"
            && (cameraScanStatusRef.current === "approved" || cameraScanStatusRef.current === "degraded")
          );
        if (!fullScanOwnsVideo) setFaceDetectorStatus("error");
      } finally {
        faceProbePendingRef.current = false;
      }
    })();
  }, [applyPersonAnchor, initializeMediaPipeFaceDetector]);

  const scanFullVideoForCameraPlan = useCallback(async (): Promise<FullCameraScanResult> => {
    const activeScan = cameraScanPromiseRef.current;
    if (activeScan) return activeScan;

    const scanPromise = (async (): Promise<FullCameraScanResult> => {
    setCameraAnalysisMode("full_scan");
    cameraScanStatusRef.current = "scanning";
    setCameraScanStatus("scanning");
    authoritativeCameraPlanRef.current = null;
    // A new scan is authoritative. Do not leave the previous plan/evidence
    // visible or let a render accidentally reuse it while this pass seeks
    // through the source video.
    setCameraTrackPoints([]);
    setCameraActivityIntervals([]);
    setFaceScanSummary(null);
    setFaceFrameDiagnostic(null);
    const video = videoRef.current;
    writeMediaDebugEvent("media.full_scan.started", {
      sourcePath: analysisSourcePath,
      renderSourcePath,
      elementCurrentSrc: video?.currentSrc ?? null,
      videoWidth: video?.videoWidth ?? 0,
      videoHeight: video?.videoHeight ?? 0,
      durationSec: video?.duration ?? 0,
      currentTimeSec: video?.currentTime ?? 0,
      canonicalSourceGeometry,
      loadedSourceGeometry: loadedSourceGeometryRef.current,
      activeSourceDimensions,
      playbackSilenceSegments,
      smartDirectorMode: smartDirectorModeRef.current,
    });
    const scanGeneration = cameraScanGenerationRef.current;
    const scanSourceKey = cameraSourceKeyRef.current;
    const isCurrentScan = () => (
      cameraScanGenerationRef.current === scanGeneration
      && cameraSourceKeyRef.current === scanSourceKey
      && videoRef.current === video
    );
    if (!video || video.videoWidth <= 0 || video.duration <= 0) {
      writeMediaDebugEvent("media.full_scan.aborted", {
        reason: "video_not_ready",
        hasVideo: Boolean(video),
        videoWidth: video?.videoWidth ?? 0,
        videoHeight: video?.videoHeight ?? 0,
        durationSec: video?.duration ?? 0,
      });
      cameraScanStatusRef.current = "degraded";
      setCameraScanStatus("degraded");
      return EMPTY_CAMERA_SCAN_RESULT;
    }
    const detector = await initializeMediaPipeFaceDetector();
    if (!detector || !isCurrentScan()) {
      writeMediaDebugEvent("media.full_scan.aborted", {
        reason: detector ? "scan_generation_changed" : "face_detector_unavailable",
        detectorReady: Boolean(detector),
        isCurrentScan: isCurrentScan(),
      });
      if (isCurrentScan()) {
        cameraScanStatusRef.current = "degraded";
        setCameraScanStatus("degraded");
      }
      return EMPTY_CAMERA_SCAN_RESULT;
    }
    const wasPlaying = !video.paused;
    const originalTime = video.currentTime;
    // Full Scan seeks the same video element through the source timeline. The
    // element is paused below, so the React playback state must be paused too;
    // otherwise directorState samples stale smoothTime while the scan frame
    // itself has already moved to a different timestamp.
    setIsPlaying(false);
    const durationMs = Math.round(video.duration * 1000);
    const stepMs = Math.max(250, Math.ceil(durationMs / 120));
    const skippedRanges = normalizeSilenceRanges(playbackSilenceSegments, durationMs);
    const scanTimesMs: number[] = [];
    for (let timeMs = 0; timeMs <= durationMs && scanTimesMs.length < 256; timeMs += stepMs) {
      if (!skippedRanges.some((range) => timeMs >= range.startMs && timeMs < range.endMs)) {
        scanTimesMs.push(timeMs);
      }
    }
    if (
      durationMs > 0
      && scanTimesMs.length < 256
      && !skippedRanges.some((range) => durationMs >= range.startMs && durationMs < range.endMs)
      && scanTimesMs[scanTimesMs.length - 1] !== durationMs
    ) {
      scanTimesMs.push(durationMs);
    }
    const points: CameraMotionTrackPoint[] = [];
    const faceFrames: TimedFaceDetectionFrame[] = [];
    const motionFrames: MotionFramePixels[] = [];
    const scanFrameDiagnostics: Array<Record<string, unknown>> = [];
    const scanPreviewPoints: CameraMotionTrackPoint[] = [];
    let scanPreviewFace: TrackedFaceCandidate | null = null;
    let detectedFrames = 0;
    let landmarkFrames = 0;
    const motionCanvas = document.createElement("canvas");
    motionCanvas.width = 64;
    motionCanvas.height = 36;
    let motionContext: CanvasRenderingContext2D | null = null;
    let motionEvidenceAvailable = true;
    try {
      motionContext = motionCanvas.getContext("2d", { willReadFrequently: true });
      motionEvidenceAvailable = Boolean(motionContext);
    } catch (error) {
      // Pixel access is an optional activity signal. Some local/codec paths
      // can play normally but reject canvas reads; face tracking must survive.
      console.warn("Attached activity scan unavailable; continuing with face evidence:", error);
      motionEvidenceAvailable = false;
    }
    const waitForDecodedFrame = () => new Promise<void>((resolve) => {
      // `seeked` can fire before the next decoded frame is available to
      // MediaPipe. Align the evidence with the frame that was actually
      // presented so render does not follow mis-timed detector samples.
      let settled = false;
      let frameReady = false;
      let playSettled = !video.paused;
      let timeout: number | undefined;
      const pauseAfterFrame = () => {
        if (frameReady && playSettled) video.pause();
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeout !== undefined) window.clearTimeout(timeout);
        frameReady = true;
        pauseAfterFrame();
        resolve();
      };
      timeout = window.setTimeout(finish, 80);
      const requestFrame = (video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
      }).requestVideoFrameCallback;
      if (typeof requestFrame === "function") {
        requestFrame.call(video, finish);
        // Some WebView/codec combinations do not present a newly seeked
        // frame while paused. Resume only long enough for one compositor
        // frame, then pause again; the scan remains seek-based and does not
        // turn into uncontrolled playback.
        if (video.paused) {
          void video.play()
            .catch(() => undefined)
            .finally(() => {
              playSettled = true;
              pauseAfterFrame();
            });
        }
        return;
      }
      if (video.paused) {
        void video.play()
          .catch(() => undefined)
          .finally(() => {
            playSettled = true;
            window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
          });
      } else {
        window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
      }
    });
    const seek = (time: number) => new Promise<void>((resolve) => {
      let timeout: number | undefined;
      const onSeeked = () => {
        if (timeout !== undefined) window.clearTimeout(timeout);
        void waitForDecodedFrame().then(resolve);
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.currentTime = Math.min(video.duration, Math.max(0, time / 1000));
      timeout = window.setTimeout(() => {
        video.removeEventListener("seeked", onSeeked);
        void waitForDecodedFrame().then(resolve);
      }, 500);
    });
    try {
      video.pause();
      // Do not carry a timestamp from an earlier live playback scan into this
      // source-timeline pass. The detector clock must restart at the first
      // decoded frame while remaining monotonic within this scan.
      mediaPipeLastTimestampRef.current = 0;
      let sampleIndex = 0;
      for (const timeMs of scanTimesMs) {
        if (faceFrames.length >= 256) break;
        if (!isCurrentScan()) return EMPTY_CAMERA_SCAN_RESULT;
        await seek(timeMs);
        if (!isCurrentScan()) return EMPTY_CAMERA_SCAN_RESULT;
        sampleIndex += 1;
        if (sampleIndex === 1 || sampleIndex % 5 === 0) {
          const percent = Math.min(99, Math.round((timeMs / Math.max(1, durationMs)) * 100));
          if (isCurrentScan()) {
            setProjectStatusMsg(t(
              `กำลังสแกนทั้งคลิปเพื่อวางแผนกล้อง… ${percent}%`,
              `Scanning the full clip for camera planning… ${percent}%`,
            ));
          }
        }
        const observedTimeMs = Math.max(0, Math.round(video.currentTime * 1000));
        if (isCurrentScan()) setCurrentTime(observedTimeMs / 1000);
        const timestamp = Math.max(observedTimeMs, mediaPipeLastTimestampRef.current + 1);
        mediaPipeLastTimestampRef.current = timestamp;
        const result = detector.detectForVideo(video, timestamp);
        if (result.detections.some((detection) => Boolean(detection.boundingBox))) detectedFrames += 1;
        if (result.detections.some((detection) => Boolean(detection.boundingBox && observedFaceLandmarks(detection.keypoints)))) landmarkFrames += 1;
        const detectedFaceCandidates = result.detections
          .map((detection): {
            candidate: TrackedFaceCandidate;
            hasFivePoints: boolean;
            box: { x: number; y: number; width: number; height: number };
            landmarks: Array<{ x: number; y: number }>;
          } | null => {
            const box = detection.boundingBox;
            if (!box || box.width <= 0 || box.height <= 0) return null;
            const keypoints = observedFaceLandmarks(detection.keypoints);
            const visibleLandmarks = (detection.keypoints ?? []).filter((point) =>
              Number.isFinite(point.x) && Number.isFinite(point.y)
              && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1,
            ).map((point) => ({ x: point.x, y: point.y }));
            const boxCenter = {
              x: (box.originX + box.width / 2) / video.videoWidth,
              y: (box.originY + box.height / 2) / video.videoHeight,
            };
            const center = stableFaceCenter(
              keypoints ?? [],
              boxCenter,
            );
            return {
              candidate: {
                x: center.x,
                y: center.y,
                width: Math.max(0, Math.min(1, box.width / video.videoWidth)),
                height: Math.max(0, Math.min(1, box.height / video.videoHeight)),
                confidence: Math.max(0, Math.min(1, detection.categories[0]?.score ?? 0)),
              },
              hasFivePoints: Boolean(keypoints),
              box: {
                x: box.originX / video.videoWidth,
                y: box.originY / video.videoHeight,
                width: box.width / video.videoWidth,
                height: box.height / video.videoHeight,
              },
              landmarks: visibleLandmarks,
            };
          })
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
        const strictPreviewCandidates = detectedFaceCandidates
          .filter((entry) => entry.hasFivePoints)
          .map((entry) => entry.candidate);
        const previewFace: TrackedFaceCandidate | null = selectTrackedFaceCandidate(strictPreviewCandidates, scanPreviewFace)
          ?? selectFallbackFaceCandidate(
            detectedFaceCandidates.map((entry) => entry.candidate),
            scanPreviewFace,
          );
        const previewObservation = detectedFaceCandidates.find((entry) => entry.candidate === previewFace)
          ?? [...detectedFaceCandidates].sort((left, right) => right.candidate.confidence - left.candidate.confidence)[0];
        scanFrameDiagnostics.push({
          requestedTimeMs: timeMs,
          observedTimeMs,
          videoCurrentTimeSec: video.currentTime,
          detectorTimestamp: timestamp,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          detectionCount: detectedFaceCandidates.length,
          landmarkCount: previewObservation?.landmarks.length ?? 0,
          selectedFace: previewFace,
          selectedHasFivePoints: Boolean(previewObservation?.hasFivePoints),
          candidates: detectedFaceCandidates.map((entry) => ({
            candidate: entry.candidate,
            hasFivePoints: entry.hasFivePoints,
            box: entry.box,
            landmarkCount: entry.landmarks.length,
          })),
        });
        setFaceFrameDiagnostic({
          timeMs: observedTimeMs,
          status: previewFace && previewObservation?.hasFivePoints ? "found" : detectedFaceCandidates.length === 0
            ? "no_face" : detectedFaceCandidates.some((entry) => entry.hasFivePoints)
              ? "unselected" : "landmarks_missing",
          detectionCount: detectedFaceCandidates.length,
          landmarkCount: previewObservation?.landmarks.length ?? 0,
          box: previewObservation?.box,
          landmarks: previewObservation?.landmarks ?? [],
          confidence: previewObservation?.candidate.confidence,
        });
        if (previewFace) {
          scanPreviewFace = previewFace;
          scanPreviewPoints.push({
            timeMs: observedTimeMs,
            x: previewFace.x,
            y: previewFace.y,
            width: previewFace.width,
            height: previewFace.height,
            confidence: previewFace.confidence,
            kind: "face",
            trackId: "full-scan-preview-face",
          });
          // Keep the crop guide and camera target responsive while the full
          // scan is still running. The completed scan replaces this
          // provisional track below with the final dominant/activity plan.
          if (isCurrentScan()) setCameraTrackPoints(scanPreviewPoints.slice(-256));
          setFaceDetectorStatus("tracking");
        } else if (isCurrentScan()) {
          setFaceDetectorStatus("not_found");
        }
        faceFrames.push({
          timeMs: observedTimeMs,
          candidates: detectedFaceCandidates
            .filter((entry) => entry.hasFivePoints)
            .map((entry) => entry.candidate),
          fallbackCandidates: detectedFaceCandidates.map((entry) => entry.candidate),
        });
        if (motionContext && motionEvidenceAvailable) {
          try {
            motionContext.drawImage(video, 0, 0, motionCanvas.width, motionCanvas.height);
            const image = motionContext.getImageData(0, 0, motionCanvas.width, motionCanvas.height);
            motionFrames.push({
              timeMs: observedTimeMs,
              width: motionCanvas.width,
              height: motionCanvas.height,
              pixels: image.data,
            });
          } catch (error) {
            console.warn("Attached activity pixel read failed; continuing with face evidence:", error);
            motionEvidenceAvailable = false;
            motionContext = null;
            motionFrames.length = 0;
          }
        }
      }
      if (!isCurrentScan()) return EMPTY_CAMERA_SCAN_RESULT;
      const dominantTrack = buildDominantFaceTrack(faceFrames);
      const fallbackFaceTrack = dominantTrack.length > 0 ? [] : buildFallbackFaceTrack(faceFrames);
      const selectedFaceTrack = dominantTrack.length > 0 ? dominantTrack : fallbackFaceTrack;
      const usedFallbackFaceTrack = dominantTrack.length === 0 && fallbackFaceTrack.length > 0;
      const summary: FaceScanSummary = {
        sampledFrames: faceFrames.length,
        detectedFrames,
        landmarkFrames,
        selectedFrames: selectedFaceTrack.length,
        faceSpanMs: selectedFaceTrack.length > 1
          ? selectedFaceTrack[selectedFaceTrack.length - 1].timeMs - selectedFaceTrack[0].timeMs
          : 0,
        usedFallbackFaceTrack,
      };
      setFaceScanSummary(summary);
      // Preserve the detector's source timestamps. The camera planner owns
      // the safe opening hold when the first credible face appears later in
      // the clip; synthesizing a face at time zero here would make preview
      // and FFmpeg render a future face position across the opening.
      points.push(...selectedFaceTrack.map((primary) => ({
        // A timeout can leave the previous decoded frame on screen. Label
        // the point with its actual source time rather than the requested
        // seek time; otherwise FFmpeg receives a camera path that appears
        // to move several seconds after the face moved in playback.
        timeMs: primary.timeMs,
        x: primary.x,
        y: primary.y,
        width: primary.width,
        height: primary.height,
        confidence: primary.confidence,
        kind: "face" as const,
        trackId: "full-scan-dominant-face",
      })));
      if (selectedFaceTrack.length > 0 && motionEvidenceAvailable && motionFrames.length > 1) {
        for (let index = 1; index < motionFrames.length; index += 1) {
          const currentFrame = motionFrames[index];
          const face = selectedFaceTrack.reduce((closest, candidate) => (
            Math.abs(candidate.timeMs - currentFrame.timeMs) < Math.abs(closest.timeMs - currentFrame.timeMs)
              ? candidate
              : closest
          ));
          // Motion can be associated with this presenter only while face
          // evidence is nearby in time. A stale face from the opening must
          // not authorize activity elsewhere in the clip.
          if (Math.abs(face.timeMs - currentFrame.timeMs) > 2_500) continue;
          // A skipped Dead Air interval is a discontinuity in source time.
          // Never infer activity from the two frames on opposite sides of it.
          const previousFrame = motionFrames[index - 1];
          const crossedSkippedRange = skippedRanges.some((range) => (
            previousFrame.timeMs < range.startMs
            && currentFrame.timeMs >= range.endMs
          ));
          if (
            crossedSkippedRange
            || currentFrame.timeMs - previousFrame.timeMs > stepMs * 2.5
          ) continue;
          const attachedMotion = detectAttachedMotionPoint(
            motionFrames[index - 1],
            currentFrame,
            face,
          );
          const motion = attachedMotion ?? detectGlobalMotionPoint(
            motionFrames[index - 1],
            currentFrame,
            face,
          );
          if (!motion) continue;
          points.push({
            timeMs: currentFrame.timeMs,
            x: motion.x,
            y: motion.y,
            width: motion.width,
            height: motion.height,
            confidence: motion.confidence,
            kind: "activity",
            trackId: attachedMotion
              ? "full-scan-attached-motion"
              : "full-scan-global-motion",
          });
        }
      }
      // Reduce each evidence family independently. Face and activity samples
      // often share the same timestamp; reducing one mixed list can discard a
      // valid hand/toy motion point merely because the face point sorted first.
      const faceEvidence = points.filter((point) => point.kind === "face");
      const activityEvidence = points.filter((point) => point.kind === "activity");
      const reducedFacePoints = reduceCameraMotionTrackPoints(faceEvidence);
      // Preserve a face sample beside every activity sample. A static face is
      // normally coalesced by the jitter reducer, but the activity confirmer
      // still needs a face timestamp close to a moving hand/toy event.
      for (const activityPoint of activityEvidence) {
        const nearestFace = faceEvidence.length > 0
          ? faceEvidence.reduce((closest, candidate) => (
            Math.abs(candidate.timeMs - activityPoint.timeMs) < Math.abs(closest.timeMs - activityPoint.timeMs)
              ? candidate
              : closest
          ))
          : undefined;
        if (nearestFace && !reducedFacePoints.some((point) => point.timeMs === nearestFace.timeMs)) {
          reducedFacePoints.push(nearestFace);
        }
      }
      const reducedPoints = [
        ...reducedFacePoints,
        ...reduceCameraMotionTrackPoints(activityEvidence),
      ].sort((left, right) => left.timeMs - right.timeMs || (left.kind === "face" ? -1 : 1));
      if (!isCurrentScan()) return EMPTY_CAMERA_SCAN_RESULT;
      setCameraTrackPoints(reducedPoints);
      const intervals: CameraMotionActivityInterval[] = [];
      const reducedActivityPoints = reducedPoints.filter((point) => point.kind === "activity");
      for (const activityPoint of reducedActivityPoints) {
        intervals.push({
          startMs: Math.max(0, activityPoint.timeMs - 900),
          endMs: Math.min(durationMs, activityPoint.timeMs + 1_800),
          score: activityPoint.confidence,
          kind: "attached_activity",
        });
      }
      setCameraActivityIntervals(intervals.slice(0, 256));
      const hasActivityEvidence = reducedPoints.some((point) => point.kind === "activity");
      const scanEvidence = {
        points: reducedPoints,
        activityIntervals: intervals.slice(0, 256),
      };
      const scannedPlan = createFullScanCameraPlan(scanEvidence, durationMs);
      const nextScanStatus = dominantTrack.length > 0 && hasActivityEvidence ? "approved" : "degraded";
      cameraScanStatusRef.current = nextScanStatus;
      setCameraScanStatus(nextScanStatus);
      setFaceDetectorStatus(selectedFaceTrack.length > 0 ? "tracking" : "not_found");
      setProjectStatusMsg(selectedFaceTrack.length > 0
        ? hasActivityEvidence
          ? t("สแกนทั้งคลิปเสร็จแล้ว ระบบจะติดตามจุดเคลื่อนไหวใกล้บุคคลโดยรักษาใบหน้าให้อยู่ในเฟรม", "Full video scan completed; the camera will follow nearby activity while keeping the face inside the frame.")
          : usedFallbackFaceTrack
            ? t("สแกนเสร็จแล้ว แต่หลักฐานไม่ครบ ใช้ใบหน้าที่พบล็อกกรอบเป็นหลัก", "Scan completed with limited evidence; using the detected face as the primary lock.")
            : t("สแกนทั้งคลิปเสร็จแล้ว แต่ไม่พบจุดเคลื่อนไหวใกล้บุคคล ใช้การล็อกใบหน้า", "Full video scan completed; no nearby moving activity was found, so face lock is used.")
        : t(
          `สแกน ${faceFrames.length} เฟรม แต่ไม่พบใบหน้าที่มีจุดโมเดลอย่างน้อย 5 จุดและติดตามได้ (พบกรอบ ${detectedFrames} เฟรม, จุดครบ ${landmarkFrames} เฟรม) ตรวจดูสัญลักษณ์บนภาพหรือปรับกรอบเองก่อน Render`,
          `Scanned ${faceFrames.length} frames but found no trackable face with at least five model points (boxes in ${detectedFrames}, points in ${landmarkFrames}). Check the on-video markers or set the crop manually before rendering.`,
        ));
      writeMediaDebugEvent("media.full_scan.completed", {
        sourcePath: analysisSourcePath,
        renderSourcePath,
        elementCurrentSrc: video.currentSrc,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        durationMs,
        stepMs,
        scanTimesMs,
        skippedRanges,
        summary,
        scanStatus: nextScanStatus,
        points: reducedPoints,
        activityIntervals: intervals.slice(0, 256),
        initialFaceLock: reducedPoints.find((point) => point.kind === "face") ?? null,
        cameraMotionPlan: scannedPlan,
        cameraPlanInitialKeyframe: scannedPlan?.keyframes[0] ?? null,
        frameDiagnostics: scanFrameDiagnostics,
      });
      return { ...scanEvidence, summary, cameraMotionPlan: scannedPlan };
    } catch (error) {
      console.warn("Full camera scan failed:", error);
      writeMediaDebugEvent("media.full_scan.failed", {
        sourcePath: analysisSourcePath,
        renderSourcePath,
        error: error instanceof Error ? error.message : String(error),
        frameDiagnostics: scanFrameDiagnostics,
      });
      if (isCurrentScan()) {
        cameraScanStatusRef.current = "degraded";
        setCameraScanStatus("degraded");
      }
      return EMPTY_CAMERA_SCAN_RESULT;
    } finally {
      if (isCurrentScan()) {
        const restoredTimeMs = getPlayableTimeMs(originalTime * 1000, playbackSilenceSegments, durationMs);
        await seek(restoredTimeMs);
        setCurrentTime(restoredTimeMs / 1000);
        writeMediaDebugEvent("media.full_scan.restored_preview", {
          sourcePath: analysisSourcePath,
          elementCurrentSrc: video.currentSrc,
          restoredTimeMs,
          wasPlaying,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        });
        if (wasPlaying) {
          void video.play()
            .then(() => {
              if (videoRef.current === video) setIsPlaying(!video.paused);
            })
            .catch(() => {
              if (videoRef.current === video) setIsPlaying(false);
            });
        } else {
          setIsPlaying(false);
        }
      }
    }
    })();
    cameraScanPromiseRef.current = scanPromise;
    try {
      return await scanPromise;
    } finally {
      if (cameraScanPromiseRef.current === scanPromise) {
        cameraScanPromiseRef.current = null;
        if (
          smartDirectorModeRef.current === "face_activity"
          && shouldResumeLiveFaceProbeAfterFullScan(cameraScanStatusRef.current)
        ) {
          trackedFaceCandidateRef.current = null;
          window.setTimeout(() => detectPersonCenter(true), 0);
        }
      }
    }
  }, [activeSourceDimensions, analysisSourcePath, canonicalSourceGeometry, createFullScanCameraPlan, detectPersonCenter, initializeMediaPipeFaceDetector, playbackSilenceSegments, renderSourcePath, t, writeMediaDebugEvent]);

  // Every export surface must use the same authoritative evidence pass. The
  // direct FFmpeg button used to refresh this plan, while the Remotion/queue
  // button could submit the last React state snapshot instead. That made the
  // preview follow the latest scan but allowed the exported video to fall
  // back to the old centre crop.
  const buildFreshCameraMotionPlanForRender = useCallback(async (): Promise<CameraMotionPlan | null> => {
    if (
      !videoRef.current
      || !(
        smartDirectorMode === "face_activity"
        || smartDirectorMode === "face_focus"
        || smartDirectorMode === "auto"
      )
    ) {
      return null;
    }

    setProjectStatusMsg(t(
      "กำลังสแกนทั้งคลิปใหม่เพื่อยืนยันตำแหน่งก่อน Render…",
      "Running a fresh full-clip scan before rendering…",
    ));
    const previousPlanCandidate = authoritativeCameraPlanRef.current ?? cameraMotionPlan;
    const previousPlanSourceFingerprint = previousPlanCandidate?.evidence
      && typeof previousPlanCandidate.evidence === "object"
      && "sourceFingerprint" in previousPlanCandidate.evidence
      ? previousPlanCandidate.evidence.sourceFingerprint
      : null;
    const previousPlan = previousPlanSourceFingerprint === cameraSourceKeyRef.current
      ? previousPlanCandidate
      : null;
    const scannedEvidence = await scanFullVideoForCameraPlan();
    const selectedPlan = selectFreshOrPreviousCameraPlan(
      scannedEvidence.cameraMotionPlan,
      previousPlan,
    );
    if (!selectedPlan) {
      throw new Error(t(
        "Render แบบ Face + Activity หยุดแล้ว: Full Scan ไม่มีแผนกล้องที่ใช้งานได้ กรุณาตรวจสถานะบนภาพแล้วลองใหม่",
        "Face-focused render stopped: Full Scan did not produce a usable camera plan. Check the on-video status and try again.",
      ));
    }
    if (!hasRenderableFaceCameraPlan(scannedEvidence.cameraMotionPlan)) {
      writeMediaDebugEvent("media.render.reused_previous_full_scan_plan", {
        sourcePath: analysisSourcePath,
        sourceKey: cameraSourceKeyRef.current,
        scanStatus: cameraScanStatusRef.current,
        previousPlan,
        reason: "fresh_scan_returned_no_renderable_plan",
      });
      setProjectStatusMsg(t(
        "สแกนรอบใหม่ยังไม่คืนผล ใช้แผน Full Scan ล่าสุดของ source เดิมเพื่อ Render ต่อ",
        "The refresh scan returned no plan; continuing with the latest validated Full Scan plan for this source.",
      ));
    }
    return selectedPlan;
  }, [
    analysisSourcePath,
    cameraMotionPlan,
    scanFullVideoForCameraPlan,
    t,
    writeMediaDebugEvent,
  ]);

  const prepareQueuedRender = useCallback(async (
    submit: (selection: DeadAirRenderSelection) => void,
  ) => {
    try {
      const freshPlan = await buildFreshCameraMotionPlanForRender();
      submit({
        ...deadAirRenderSelection,
        // A fresh Full Scan is authoritative for this submission. When the
        // director is off, preserve the manual/previous selection unchanged.
        cameraMotionPlan: freshPlan ?? deadAirRenderSelection.cameraMotionPlan,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProcessError(message);
      setProjectStatusMsg(message);
    }
  }, [buildFreshCameraMotionPlanForRender, deadAirRenderSelection]);

  // Run Custom Silence Detection
  const runCustomSilenceDetection = async (
    overrideThreshold?: number,
    overrideMinDur?: number,
    overrideBuffer?: number,
    requestedAudioStreamIndex?: number | null,
  ) => {
    if (!analysisSourcePath) {
      setAnalysisError("ยังไม่มีไฟล์วิดีโอใน Timeline สำหรับวิเคราะห์ Dead Air");
      return;
    }
    const requestId = ++analysisRequestIdRef.current;
    setIsAnalyzing(true);
    setProcessError(null);
    setAnalysisError(null);
    setWaveformBins([]);
    setSilenceSegments([]);
    setHasAnalyzedDeadAir(false);
    setCutCount(0);
    setTimeSavedMs(0);

    const vThresh = overrideThreshold ?? volumeThreshold;
    const mDur = overrideMinDur ?? minDuration;
    const sBuf = overrideBuffer ?? softeningBuffer;
    const audioStreamIndex = requestedAudioStreamIndex === undefined
      ? selectedAudioStreamIndex
      : requestedAudioStreamIndex;
    if (
      nleProject
      && (!deadAirAnalysisBaseProjectRef.current || deadAirAnalysisBaseVideoPathRef.current !== analysisSourcePath)
    ) {
      deadAirAnalysisBaseProjectRef.current = nleProject;
      deadAirAnalysisBaseVideoPathRef.current = analysisSourcePath;
    }

    try {
      const res = await invoke<CustomSilenceDetectionResult>("worker_app_detect_silence_custom", {
        sourcePath: analysisSourcePath,
        volumeThresholdPct: vThresh,
        minDurationSec: mDur,
        softeningBufferSec: sBuf,
        audioStreamIndex,
      });

      if (requestId !== analysisRequestIdRef.current) return;

      const returnedAudioTracks = Array.isArray(res?.audioTracks) ? res.audioTracks : [];
      const hasNativeTrackCatalog = Array.isArray(res?.audioTracks);
      setAudioTracks(returnedAudioTracks);
      const resolvedAudioStreamIndex = typeof res?.selectedAudioStreamIndex === "number"
        ? res.selectedAudioStreamIndex
        : chooseAudioTrackIndex(returnedAudioTracks);
      setSelectedAudioStreamIndex(resolvedAudioStreamIndex);
      if (hasNativeTrackCatalog && returnedAudioTracks.length === 0) {
        setSilenceSegments([]);
        setHasAnalyzedDeadAir(false);
        setWaveformBins([]);
        setCutCount(0);
        setTimeSavedMs(0);
        setAnalysisError("ไฟล์นี้ไม่มี Audio Track สำหรับวิเคราะห์ Dead Air");
        return;
      }

      const usableWaveformBins = Array.isArray(res?.waveformBins)
        ? res.waveformBins
          .filter((bin) => (
            Number.isFinite(bin.min)
            && Number.isFinite(bin.max)
            && Number.isFinite(bin.rms)
            && Number.isFinite(bin.peak)
            && bin.min <= bin.max
            && bin.rms >= 0
            && bin.peak >= 0
          ))
        : [];
      const legacyWaveformBins = usableWaveformBins.length === 0 && Array.isArray(res?.waveformPeaks)
        ? res.waveformPeaks
          .filter((peak) => Number.isFinite(peak) && peak >= 0)
          .map((peak) => ({ min: -peak, max: peak, rms: peak / Math.SQRT2, peak }))
        : [];
      const usableWaveformData = usableWaveformBins.length > 0 ? usableWaveformBins : legacyWaveformBins;
      if (
        res &&
        usableWaveformData.length > 0
      ) {
        setSilenceSegments(res.silenceSegments);
        setHasAnalyzedDeadAir(true);
        setWaveformBins(usableWaveformData);
        setCutCount(res.cutCount);
        setTimeSavedMs(res.timeSavedMs);

        const cutRanges = res.silenceSegments
          .filter((segment) => Number.isFinite(segment.startMs) && segment.endMs !== undefined && segment.endMs !== null)
          .map((segment) => ({ startMs: segment.startMs, endMs: segment.endMs as number }));
        const fingerprint = getDeadAirCutFingerprint(cutRanges, res.durationMs || duration * 1000);
        setProjectState((current) => {
          if (!current) return current;
          const baseProject = deadAirAnalysisBaseProjectRef.current ?? current;
          const withTrack = baseProject.metadata?.deadAirAudioStreamIndex === resolvedAudioStreamIndex
            ? baseProject
            : {
              ...baseProject,
              metadata: {
                ...baseProject.metadata,
                deadAirAudioStreamIndex: resolvedAudioStreamIndex ?? undefined,
              },
            };
          return applyGlobalTimelineCuts(withTrack, cutRanges, fingerprint, resolvedAudioStreamIndex);
        });

        if (res.durationMs > 0) {
          const totalDurSec = res.durationMs / 1000;
          setDuration(totalDurSec);

          // Auto-trim based on speech bounds (with 2s lead-in and <=2s trailing buffer)
          let autoStart = 0;
          let autoEnd = totalDurSec;

          if (res.firstSpeechMs !== undefined && res.firstSpeechMs > 2500) {
            autoStart = Math.max(0, (res.firstSpeechMs - 2000) / 1000);
          } else if (res.silenceSegments.length > 0) {
            const firstSil = res.silenceSegments[0];
            if (firstSil.startMs <= 1000 && firstSil.endMs && firstSil.endMs > 2500) {
              autoStart = Math.max(0, (firstSil.endMs - 2000) / 1000);
            }
          }

          if (res.lastSpeechMs !== undefined && res.durationMs - res.lastSpeechMs > 2500) {
            autoEnd = Math.min(totalDurSec, (res.lastSpeechMs + 1800) / 1000);
          } else if (res.silenceSegments.length > 0) {
            const lastSil = res.silenceSegments[res.silenceSegments.length - 1];
            if (lastSil && lastSil.startMs > 0 && res.durationMs - lastSil.startMs > 2500) {
              autoEnd = Math.min(totalDurSec, (lastSil.startMs + 1800) / 1000);
            }
          }

          setTrimStart(autoStart);
          setTrimEnd(autoEnd);
        }
      } else {
        // Rust returned no waveform. Web Audio can only be a safe fallback
        // when the native response did not provide a stream catalog; it cannot
        // select a specific embedded stream by itself.
        if (!hasNativeTrackCatalog || returnedAudioTracks.length === 1) {
          const fallbackSucceeded = await analyzeAudioWithWebAudio(
            isProjectFilePath(analysisSourcePath) ? videoSrc : safeConvertFileSrc(analysisSourcePath),
            vThresh,
            mDur,
            sBuf,
            requestId,
            resolvedAudioStreamIndex,
          );
          if (!fallbackSucceeded && requestId === analysisRequestIdRef.current) {
            setWaveformBins([]);
            setAnalysisError("ไม่สามารถอ่านเสียงจริงเพื่อสร้าง Waveform ได้");
          }
        } else {
          setWaveformBins([]);
          setAnalysisError("ไม่สามารถสร้าง Waveform จาก Audio Track ที่เลือกได้");
        }
      }
    } catch (err) {
      console.warn("Native silence detection failed:", err);
      if (requestId !== analysisRequestIdRef.current) return;
      const fallbackSucceeded = await analyzeAudioWithWebAudio(
        isProjectFilePath(analysisSourcePath) ? videoSrc : safeConvertFileSrc(analysisSourcePath),
        vThresh,
        mDur,
        sBuf,
        requestId,
        null,
      );
      if (!fallbackSucceeded && requestId === analysisRequestIdRef.current) {
        setWaveformBins([]);
        const errorText = String(err);
        setAnalysisError(
          errorText.includes("ffmpeg_unavailable") || errorText.includes("media_runtime_not_ready")
            ? t(
              "ยังไม่พร้อมวิเคราะห์เสียง: Runtime ของ FFmpeg/ffprobe ยังไม่พร้อม กรุณาเปิด Runtime แล้วกด Repair ก่อนลองอีกครั้ง",
              "Audio analysis is not ready: the FFmpeg/ffprobe runtime is unavailable. Open Runtime and choose Repair, then try again.",
            )
            : `วิเคราะห์ Audio Track ไม่สำเร็จ: ${errorText}`,
        );
      }
    } finally {
      if (requestId === analysisRequestIdRef.current) setIsAnalyzing(false);
    }
  };

  // Reset states when video file changes
  const hasLoadedProjectDraft = Boolean(loadedProjectDraft);
  useEffect(() => {
    if (videoFile) {
      setCurrentTime(0);
      setIsPlaying(false);
      setPlaybackError(null);
      setTrimStart(0);
      setTrimEnd(0);
      setProcessResult(null);
      setProcessError(null);
      setAnalysisError(null);
      setAudioTracks([]);
      setSelectedAudioStreamIndex(null);
      setWaveformBins([]);
      setSilenceSegments([]);
      setHasAnalyzedDeadAir(false);
      setCameraTrackPoints([]);
      setCameraActivityIntervals([]);
      setCameraAnalysisMode("quick");
      setCameraScanStatus("idle");
      deadAirAnalysisBaseProjectRef.current = null;
      deadAirAnalysisBaseVideoPathRef.current = null;
      setUploadResult(null);
      setUploadError(null);
      setCustomTitle(videoFile.name.replace(/\.[^/.]+$/, ""));
      // A saved project already contains its edited timeline and may point to
      // a long source video. Running the full native silence scan during
      // project open decodes the entire audio stream into memory and can kill
      // the desktop WebView/native process before the editor is usable. Keep
      // project opening lightweight; users can still run Analyze explicitly.
      if (!hasLoadedProjectDraft) {
        void runCustomSilenceDetection(undefined, undefined, undefined, null);
      }
    }
  }, [videoFile?.path, hasLoadedProjectDraft]);

  // Auto-run person/product centering with early burst scan to lock target immediately
  useEffect(() => {
    if (focusMode === "auto_person") {
      const t0 = setTimeout(() => detectPersonCenter(true), 30);
      const t1 = setTimeout(() => detectPersonCenter(true), 120);
      const t2 = setTimeout(() => detectPersonCenter(true), 300);
      const t3 = setTimeout(() => detectPersonCenter(false), 700);
      const t4 = setTimeout(() => detectPersonCenter(false), 1400);
      const t5 = setTimeout(() => detectPersonCenter(false), 2200);
      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(t5);
      };
    }
  }, [focusMode, videoSrc, detectPersonCenter]);

  const lastTrackTimeRef = useRef<number>(0);

  const handleDropAssetOnTrack = useCallback((trackId: string, asset: any, dropTimeMs?: number) => {
    const normalizedAsset = normalizeTimelineDropAsset(asset);
    if (!normalizedAsset) return;
    const timeMs = dropTimeMs !== undefined ? dropTimeMs : Math.round(currentTime * 1000);
    const clipPath = normalizedAsset.path;
    const clip: NleClip = {
      id: `drag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: normalizedAsset.name,
      timelineStartMs: timeMs,
      durationMs: normalizedAsset.durationMs || 4000,
      sourceType: normalizedAsset.mediaType === "video" || normalizedAsset.mediaType === "audio" || normalizedAsset.mediaType === "image" ? "local_file" : "smartaihub_library",
      sourcePath: normalizedAsset.path,
      sourceUrl: clipPath,
      volume: trackId.startsWith("track_a") ? 0.4 : 1.0,
      transform: trackId === "track_v2" ? { x: 0.5, y: 0.5, scale: 1.0, opacity: 1.0 } : undefined,
    };
    handleAddAssetClip(trackId, clip);
    const trackLabel = trackId === "track_v2" ? "V2 (B-Roll)" : trackId === "track_a2" ? "A2 (BGM)" : trackId === "track_a3" ? "A3 (SFX)" : trackId;
    setProjectStatusMsg(`✨ วางคลิป "${normalizedAsset.name}" ลงบนแทร็ก ${trackLabel} เรียบร้อย`);
    setTimeout(() => setProjectStatusMsg(null), 4000);
  }, [currentTime, handleAddAssetClip]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      const vw = videoRef.current.videoWidth || 1920;
      const vh = videoRef.current.videoHeight || 1080;
      setDuration(dur);
      setVideoDimensions({ width: vw, height: vh });
      const loadedSourcePath = analysisSourcePath && !isProjectFilePath(analysisSourcePath)
        ? analysisSourcePath
        : videoFile?.path || analysisSourcePath;
      const knownRotation = canonicalSourceGeometry
        && canonicalSourceGeometry.sourcePath === loadedSourcePath
        && canonicalSourceGeometry.width === vw
        && canonicalSourceGeometry.height === vh
        ? canonicalSourceGeometry.rotationDegrees
        : 0;
      const loadedGeometry = normalizeSourceGeometry({
        sourcePath: loadedSourcePath,
        width: vw,
        height: vh,
        rotationDegrees: knownRotation,
      });
      writeMediaDebugEvent("media.preview.loaded_metadata", {
        sourcePath: loadedSourcePath,
        elementCurrentSrc: videoRef.current.currentSrc,
        videoWidth: vw,
        videoHeight: vh,
        durationSec: dur,
        canonicalSourceGeometry,
        loadedSourceGeometry: loadedGeometry,
        analysisSourcePath,
        renderSourcePath,
      });
      if (loadedGeometry) {
        loadedSourceGeometryRef.current = loadedGeometry;
        setNleProject((previous) => {
          if (!previous) return previous;
          const currentGeometry = previous.metadata?.sourceGeometry;
          // Repair an old draft that recorded the output canvas or another
          // stale size for this same source. Do not silently replace the
          // canonical geometry of a different timeline source here; adding
          // another file goes through the explicit size confirmation path.
          if (
            currentGeometry
            && currentGeometry.sourcePath !== loadedGeometry.sourcePath
          ) return previous;
          if (
            currentGeometry
            && currentGeometry.width === loadedGeometry.width
            && currentGeometry.height === loadedGeometry.height
            && currentGeometry.rotationDegrees === loadedGeometry.rotationDegrees
          ) return previous;
          return {
            ...previous,
            updatedAt: new Date().toISOString(),
            metadata: { ...previous.metadata, sourceGeometry: loadedGeometry },
            mediaPool: previous.mediaPool?.map((asset) => asset.filePath === loadedSourcePath
              ? { ...asset, width: vw, height: vh }
              : asset),
          };
        });
      }
      if (trimEnd === 0 || trimEnd > dur) {
        setTrimEnd(dur);
      }
      if (focusMode === "auto_person") {
        setTimeout(() => detectPersonCenter(true), 200);
      }
    }
  };

  const handleTimeUpdate = () => {
    // Full Scan owns seeking until it restores the original playback time.
    // Dead-air playback skipping here would silently redirect scan seeks and
    // associate detector results with the wrong source frames.
    if (cameraScanPromiseRef.current || cameraScanStatusRef.current === "scanning") return;
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      const durationMs = Math.max(0, (videoRef.current.duration || duration || 0) * 1000);
      const playableMs = getPlayableTimeMs(cur * 1000, playbackSilenceSegments, durationMs);
      if (playableMs > cur * 1000 + 20) {
        skipSeekTargetRef.current = playableMs / 1000;
        videoRef.current.currentTime = playableMs / 1000;
        setCurrentTime(playableMs / 1000);
        if (playableMs >= durationMs - 20) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
        return;
      }
      if (skipSeekTargetRef.current !== null && cur >= skipSeekTargetRef.current - 0.04) {
        skipSeekTargetRef.current = null;
      }
      setCurrentTime(cur);
      const inspectFace = !overrideVideoSrc && (
        smartDirectorMode === "face_activity"
        || smartDirectorMode === "auto"
        || (focusMode === "auto_person" && (smartDirectorMode !== "product_focus" || productPins.length === 0))
      );
      if (inspectFace) {
        const nowMs = performance.now();
        if (nowMs - lastTrackTimeRef.current > 850) {
          lastTrackTimeRef.current = nowMs;
          detectPersonCenter(false);
        }
      }
    }
  };

  // Virtual Timeline Playback Loop when there is no master video file
  useEffect(() => {
    if (!isPlaying || videoSrc) return;
    let lastTime = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const deltaSec = ((now - lastTime) / 1000) * playbackRate;
      lastTime = now;
      setCurrentTime((prev) => {
        const maxDur = effectiveDuration > 0 ? effectiveDuration : (nleProject?.canvas?.durationMs ? nleProject.canvas.durationMs / 1000 : 30);
        const next = advancePlayableTimeMs(prev * 1000, deltaSec * 1000, playbackSilenceSegments, maxDur * 1000) / 1000;
        if (next >= maxDur) {
          setIsPlaying(false);
          return maxDur;
        }
        return next;
      });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, videoSrc, playbackRate, effectiveDuration, nleProject, playbackSilenceSegments]);

  // Sync Master Video Volume & Mute States
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const v1Track = nleProject?.tracks?.find((t) => t.id === "track_v1");
    const isMasterMuted = isMuted || Boolean(v1Track?.muted);
    const masterVol = Math.min(1, Math.max(0, volume * (v1Track?.volume ?? 1.0)));
    video.muted = isMasterMuted;
    video.volume = masterVol;
  }, [volume, isMuted, nleProject]);

  const togglePlay = () => {
    if (isPlaying) {
      if (videoRef.current && videoSrc) {
        videoRef.current.pause();
      }
      setIsPlaying(false);
    } else {
      const maxDur = effectiveDuration > 0 ? effectiveDuration : (duration > 0 ? duration : 30);
      if (currentTime >= maxDur - 0.05) {
        handleSeek(0);
      }

      if (videoRef.current && videoSrc) {
        const video = videoRef.current;
        const playable = getPlayableTimeMs(
          video.currentTime * 1000,
          playbackSilenceSegments,
          Math.max(duration, video.duration || 0) * 1000,
        ) / 1000;
        if (playable > video.currentTime + 0.02) {
          video.currentTime = playable;
          setCurrentTime(playable);
        }
        const v1Track = nleProject?.tracks?.find((t) => t.id === "track_v1");
        video.muted = isMuted || Boolean(v1Track?.muted);
        video.volume = Math.min(1, Math.max(0, volume * (v1Track?.volume ?? 1.0)));
        void video.play().then(() => {
          if (videoRef.current === video) setIsPlaying(!video.paused);
        }).catch((err: unknown) => {
          console.warn("Video play error, falling back to timeline timer:", err);
          setIsPlaying(true);
        });
      } else {
        setIsPlaying(true);
      }
    }
  };

  const handleStop = () => {
    if (videoRef.current && videoSrc) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleStepFrame = (forward: boolean) => {
    if (!videoRef.current) return;
    const step = 1 / 30; // 30 fps
    const newTime = Math.max(0, Math.min(duration, currentTime + (forward ? step : -step)));
    handleSeek(newTime);
  };

  const handleCaptureCurrentFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      const timeTag = Math.round(currentTime).toString().padStart(3, "0");
      const baseName = videoFile?.name ? videoFile.name.replace(/\.[^/.]+$/, "") : "capture";
      a.download = `frame_${baseName}_${timeTag}s.png`;
      a.href = dataUrl;
      a.click();
      setProjectStatusMsg(`📸 แคปภาพเฟรม ${formatSmpteTime(currentTime)} เรียบร้อย`);
      setTimeout(() => setProjectStatusMsg(null), 4000);
    } catch (e) {
      console.error("Frame capture error:", e);
      setProjectStatusMsg("❌ ไม่สามารถแคปภาพเฟรมได้");
      setTimeout(() => setProjectStatusMsg(null), 3000);
    }
  };

  // Keyboard Shortcuts (Ctrl+S, Space, ArrowLeft, ArrowRight, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Manual Save Project Shortcut (Ctrl+S or Cmd+S)
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void handleSaveProject(e.shiftKey);
        return;
      }

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === "Space" || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "j") {
        e.preventDefault();
        if (e.shiftKey) {
          handleStepFrame(false);
        } else {
          handleSeek(Math.max(0, currentTime - 1));
        }
      } else if (e.key === "ArrowRight" || e.key === "l") {
        e.preventDefault();
        if (e.shiftKey) {
          handleStepFrame(true);
        } else {
          handleSeek(Math.min(duration, currentTime + 1));
        }
      } else if (e.key === "[" || e.key.toLowerCase() === "i") {
        e.preventDefault();
        setTrimStart(Math.max(0, Math.min(Math.max(0, trimEnd - 0.2), currentTime)));
      } else if (e.key === "]" || e.key.toLowerCase() === "o") {
        e.preventDefault();
        setTrimEnd(Math.min(duration, Math.max(trimStart + 0.2, currentTime)));
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setIsMuted((prev) => !prev);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (onClose) {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, duration, isPlaying, trimStart, trimEnd, onClose, nleProject, activeProjectFilePath, videoFile, draftStorageKey]);

  // Mouse Drag Scrubbing on Timeline
  const tracksContentRef = useRef<HTMLDivElement>(null);
  const isDraggingTimelineRef = useRef(false);

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingTimelineRef.current = true;
    updateSeekFromClientX(e.clientX);

    const handleMouseMove = (ev: MouseEvent) => {
      if (isDraggingTimelineRef.current) {
        updateSeekFromClientX(ev.clientX);
      }
    };

    const handleMouseUp = () => {
      isDraggingTimelineRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const updateSeekFromClientX = (clientX: number) => {
    if (!tracksContentRef.current || duration <= 0) return;
    const rect = tracksContentRef.current.getBoundingClientRect();
    const clickPercent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    handleSeek(clickPercent * duration);
  };

  const handleSeek = (timeSec: number) => {
    const maxDur = effectiveDuration > 0 ? effectiveDuration : (duration > 0 ? duration : 3600);
    const clamped = Math.max(0, Math.min(maxDur, timeSec));
    const playable = getPlayableTimeMs(clamped * 1000, playbackSilenceSegments, maxDur * 1000) / 1000;
    if (videoRef.current && videoSrc) {
      try {
        videoRef.current.currentTime = playable;
      } catch {}
    }
    setCurrentTime(playable);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  };

  // Mouse Wheel Zoom on Crop Box Framing (1.0x to 2.5x)
  const handleStageWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const zoomDelta = -Math.sign(e.deltaY) * 0.05;
    setManualScale((prev) => {
      const next = Math.max(1.0, Math.min(2.5, +(prev + zoomDelta).toFixed(2)));
      return next;
    });
  }, []);

  // Mark Pin with Freeze-frame & Current exact coordinates and zoom scale WITHOUT moving picture
  const handleRecordCurrentFramePin = useCallback(() => {
    const vidW = videoDimensions.width || 1920;
    const vidH = videoDimensions.height || 1080;
    const pixelX = Math.round(focusX * vidW);
    const pixelY = Math.round(focusY * vidH);
    const t = currentTime;
    const scale = manualScale > 1.0 ? manualScale : 1.18;

    setProductPins((prev) => {
      const existingIdx = prev.findIndex((p) => Math.abs(p.time - t) < 0.25);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          time: t,
          x: focusX,
          y: focusY,
          pixelX,
          pixelY,
          scale,
        };
        setProjectStatusMsg(
          `📍 อัปเดตจุดที่ ${existingIdx + 1}: (X: ${pixelX}, Y: ${pixelY}, ซูม ${scale.toFixed(2)}x) ที่เวลา ${formatSmpteTime(t)}`
        );
        setTimeout(() => setProjectStatusMsg(null), 3000);
        return updated;
      }

      const nextNum = prev.length + 1;
      const newPin: VideoMarkPin = {
        id: `pin_${Date.now()}_${nextNum}`,
        name: `จุดที่ ${nextNum}`,
        time: t,
        x: focusX,
        y: focusY,
        pixelX,
        pixelY,
        scale,
      };

      const nextPins = [...prev, newPin].sort((a, b) => a.time - b.time);
      setProjectStatusMsg(
        `📍 บันทึกจุดที่ ${nextNum} สำเร็จ: (X: ${pixelX}, Y: ${pixelY}, ซูม ${scale.toFixed(2)}x) ที่เวลา ${formatSmpteTime(t)}`
      );
      setTimeout(() => setProjectStatusMsg(null), 3500);
      return nextPins;
    });

    setShowPinMarkers(true);
    setSmartDirectorMode("product_focus");
  }, [focusX, focusY, manualScale, currentTime, videoDimensions]);

  // Backward compatible function if clicked directly
  const handleStageMarkPin = (_x: number, _y: number) => {
    handleRecordCurrentFramePin();
  };

  const handleTogglePinningMode = () => {
    const next = !isPinningActive;
    setIsPinningActive(next);
    if (next) {
      // Auto-freeze frame immediately so user can position and zoom easily
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      setIsPlaying(false);
      setShowPinMarkers(true);
      setProjectStatusMsg(
        "📍 เปิดโหมดมาร์ก/ฟรีซเฟรมแล้ว: เลื่อนกรอบ หรือหมุน Scroll Wheel เพื่อซูม แล้วกด 'บันทึกจุดมาร์ก ณ เฟรมนี้'"
      );
    } else {
      setProjectStatusMsg(null);
    }
  };

  // Mouse Dragging on Crop Box & Viewport canvas with Smooth Controlled Damping & Hand Pointer
  const handleCropResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>, handle: CropResizeHandle) => {
    if (e.button !== 0 || !renderAspectRatio) return;
    e.preventDefault();
    e.stopPropagation();

    const stageEl = videoStageRef.current;
    const cropEl = e.currentTarget.parentElement;
    if (!stageEl || !cropEl) return;

    const stageRect = stageEl.getBoundingClientRect();
    const cropRect = cropEl.getBoundingClientRect();
    const stageWidth = stageRect.width || 0;
    const stageHeight = stageRect.height || 0;
    if (stageWidth <= 0 || stageHeight <= 0) return;

    const startRect: CropRect = {
      left: cropRect.left - stageRect.left,
      top: cropRect.top - stageRect.top,
      width: cropRect.width,
      height: cropRect.height,
    };
    const sourceRatio = (videoDimensions.width || 1920) / (videoDimensions.height || 1080);
    const baseWidth = renderAspectRatio < sourceRatio
      ? stageWidth * (renderAspectRatio / sourceRatio)
      : stageWidth;
    cropResizeRef.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect,
      stageWidth,
      stageHeight,
      baseWidth,
    };
    setSmartDirectorMode("off");
    setFocusMode("manual_region");
    onFocusModeChange?.("manual_region");
    isDraggingCropRef.current = true;
    setIsDraggingCrop(true);

    const handleMouseMove = (ev: MouseEvent) => {
      const resize = cropResizeRef.current;
      if (!resize || !isDraggingCropRef.current) return;

      const nextRect = resizeAspectLockedCropRect(
        resize.startRect,
        ev.clientX - resize.startClientX,
        ev.clientY - resize.startClientY,
        resize.handle,
        renderAspectRatio,
        {
          width: resize.stageWidth,
          height: resize.stageHeight,
          minWidth: resize.baseWidth / 2.5,
          maxWidth: resize.baseWidth,
        },
      );
      const nextScale = Math.max(
        1,
        Math.min(2.5, resize.baseWidth / Math.max(1, nextRect.width)),
      );
      const nextX = Math.max(
        0.05,
        Math.min(0.95, (nextRect.left + nextRect.width / 2) / resize.stageWidth),
      );
      const nextY = Math.max(
        0.05,
        Math.min(0.95, (nextRect.top + nextRect.height / 2) / resize.stageHeight),
      );
      setManualScale(Number(nextScale.toFixed(3)));
      setFocusX(nextX);
      setFocusY(nextY);
      onFocusXChange?.(nextX);
      onFocusYChange?.(nextY);
    };

    const handleMouseUp = () => {
      cropResizeRef.current = null;
      isDraggingCropRef.current = false;
      setIsDraggingCrop(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleUniversalMouseDown = (e: React.MouseEvent<HTMLDivElement>, isCropBox: boolean = false) => {
    if (e.button !== 0) return;

    if (isCropBox) {
      e.stopPropagation();
    }
    e.preventDefault();

    isDraggingCropRef.current = true;
    setIsDraggingCrop(true);

    const dragStart = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: focusX,
      startY: focusY,
      hasMoved: false,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const stageEl = videoStageRef.current || videoViewportRef.current;
      if (!isDraggingCropRef.current || !stageEl) return;

      const deltaX = ev.clientX - dragStart.clientX;
      const deltaY = ev.clientY - dragStart.clientY;

      if (!dragStart.hasMoved && Math.hypot(deltaX, deltaY) > 3) {
        dragStart.hasMoved = true;
      }

      if (!dragStart.hasMoved) return;

      if (focusMode === "auto_person") {
        setFocusMode("manual_region");
        onFocusModeChange?.("manual_region");
      }

      const rect = stageEl.getBoundingClientRect();
      const w = rect.width || 1;
      const h = rect.height || 1;

      // Smooth controlled damping factor (0.35) so movement is slow, smooth, and never overshoots!
      const DAMPING = 0.35;
      const normDx = (deltaX / w) * DAMPING;
      const normDy = (deltaY / h) * DAMPING;

      let nextX: number;
      let nextY: number;

      if (isCropBox) {
        // Dragging crop guide box
        nextX = dragStart.startX + normDx;
        nextY = dragStart.startY + normDy;
      } else {
        // Dragging image / canvas background (natural hand grabbing photo feel)
        nextX = dragStart.startX - normDx;
        nextY = dragStart.startY - normDy;
      }

      nextX = Math.max(0.05, Math.min(0.95, nextX));
      nextY = Math.max(0.05, Math.min(0.95, nextY));

      setFocusX(nextX);
      setFocusY(nextY);
      onFocusXChange?.(nextX);
      onFocusYChange?.(nextY);
    };

    const handleMouseUp = (_ev: MouseEvent) => {
      isDraggingCropRef.current = false;
      setIsDraggingCrop(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    handleUniversalMouseDown(e, true);
  };

  const handleOverlayClick = (_e: React.MouseEvent<HTMLDivElement>) => {
    // no-op
  };

  // A successful render switches the preview video to the generated output so
  // the user can inspect it immediately. The next Face + Activity render must
  // never scan that output while native FFmpeg renders the original timeline
  // source; doing so creates a valid-looking plan with the wrong time/source
  // coordinate space. Restore and wait for the original media before any
  // fresh Full Scan.
  const restoreOriginalPreviewSourceForRender = useCallback(async () => {
    if (!overrideVideoSrc || !videoSrc) return;
    const video = videoRef.current;
    if (!video) return;

    setProjectStatusMsg(t(
      "กำลังสลับกลับไปวิดีโอต้นฉบับก่อนสแกน…",
      "Switching back to the original video before scanning…",
    ));
    setOverrideVideoSrc(null);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        if (video.readyState >= 1 && video.duration > 0) resolve();
        else reject(new Error(t(
          "โหลดวิดีโอต้นฉบับกลับมาไม่สำเร็จ จึงหยุด Render เพื่อป้องกันการใช้แผนจากไฟล์ผิด",
          "The original video could not be restored, so rendering stopped to prevent using a plan from the wrong file.",
        )));
      }, 4_000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("error", onError);
      };
      const onReady = () => {
        if (settled || video.duration <= 0) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(t(
          "โหลดวิดีโอต้นฉบับกลับมาไม่สำเร็จ จึงหยุด Render เพื่อป้องกันการใช้แผนจากไฟล์ผิด",
          "The original video could not be restored, so rendering stopped to prevent using a plan from the wrong file.",
        )));
      };
      video.addEventListener("loadedmetadata", onReady, { once: true });
      video.addEventListener("canplay", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
      // React will update src on the next commit. Set it immediately as well
      // so the scan cannot observe the previous rendered file in the gap.
      video.src = videoSrc;
      video.load();
    });
  }, [overrideVideoSrc, t, videoSrc]);

  // Process Video with FFmpeg
  const handleProcessVideo = async (removeDeadAir: boolean = true) => {
    if ((!videoFile && !nleProject) || isProcessing) return;
    if (!renderSourcePath) {
      const message = t(
        "ไม่พบ source video ที่ใช้ Render ใน Timeline",
        "No renderable source video was found in the timeline.",
      );
      writeMediaDebugEvent("media.render.blocked", {
        reason: "missing_render_source_path",
        analysisSourcePath,
        openedFilePath: videoFile?.path ?? null,
        projectSourceFallbackPaths,
      });
      setProcessError(message);
      setProjectStatusMsg(message);
      setIsRenderPanelCollapsed(false);
      return;
    }
    setIsProcessing(true);
    setProcessError(null);
    setProcessResult(null);
    setLastRenderHadDeadAirCut(removeDeadAir);
    setProjectStatusMsg(removeDeadAir
      ? t("กำลังเตรียม Render ตัด Dead Air…", "Preparing dead-air render…")
      : t("กำลังเตรียม Render…", "Preparing render…"));

    try {
      const { confirm } = await import("@tauri-apps/plugin-dialog");
      if (nleProject) {
        setProjectStatusMsg(t(
          "กำลังรอการยืนยัน Render วิดีโอต้นฉบับ…",
          "Waiting for source-video render confirmation…",
        ));
        const confirmed = await confirm("Render นี้ประมวลผลเฉพาะวิดีโอต้นฉบับตาม Trim / Reframe / Dead Air ไม่รวมการแก้ไขแทร็ก เสียง ข้อความ หรือ Blur บน NLE Timeline ต้องการส่งออกเฉพาะต้นฉบับหรือไม่?", { title: "ส่งออกวิดีโอต้นฉบับ", kind: "warning" });
        if (!confirmed) {
          setProjectStatusMsg(t("ยกเลิกการ Render แล้ว", "Render cancelled."));
          return;
        }
      }
      await restoreOriginalPreviewSourceForRender();
    // Quick tracking is intentionally lightweight, but every Face + Activity
    // render must use a fresh whole-clip scan. Never reuse a completed scan or
    // the currently persisted camera plan: the source, edits, or detector
    // result may have changed since that plan was produced.
    let renderCameraMotionPlan = cameraMotionPlan;
    if (
      (smartDirectorMode === "face_activity" || smartDirectorMode === "face_focus" || smartDirectorMode === "auto")
      && videoRef.current
    ) {
      renderCameraMotionPlan = await buildFreshCameraMotionPlanForRender();
    }

    if (
      (smartDirectorMode === "face_activity" || smartDirectorMode === "face_focus" || smartDirectorMode === "auto")
      && !hasRenderableFaceCameraPlan(renderCameraMotionPlan)
    ) {
      throw new Error(t(
        "Render แบบโฟกัสใบหน้าหยุดแล้ว: ไม่มีหลักฐานใบหน้าจาก Full Scan กรุณาตรวจสถานะบนภาพ หรือตั้งกรอบด้วยมือ",
        "Face-focused render stopped: Full Scan has no face evidence. Check the on-video status, or set the crop manually.",
      ));
    }

    const planKeyframes = renderCameraMotionPlan?.keyframes.length ?? 0;
    setProjectStatusMsg(renderCameraMotionPlan
      ? t(`กำลังส่ง Render ด้วยแผน Full Scan (${planKeyframes} จุดกล้อง)…`, `Sending render with the Full Scan camera plan (${planKeyframes} keyframes)…`)
      : t("กำลังส่งคำสั่ง FFmpeg และตัด Dead Air…", "Sending FFmpeg render command…"));
    writeMediaDebugEvent("media.render.frontend_request", {
      sourcePath: renderSourcePath,
      analysisSourcePath,
      elementCurrentSrc: videoRef.current?.currentSrc ?? null,
      elementVideoWidth: videoRef.current?.videoWidth ?? 0,
      elementVideoHeight: videoRef.current?.videoHeight ?? 0,
      elementDurationSec: videoRef.current?.duration ?? 0,
      activeSourceGeometry,
      activeSourceDimensions,
      aspectRatio,
      targetWidth: nleProject?.canvas?.width || 1080,
      targetHeight: nleProject?.canvas?.height || 1920,
      removeDeadAir,
      trimStartMs: Math.round(trimStart * 1000),
      trimEndMs: Math.round(trimEnd * 1000),
      cameraPlanKeyframes: planKeyframes,
      cameraMotionPlan: renderCameraMotionPlan,
      cameraAnalysisMode,
      cameraScanStatus,
      cameraScanSummary: faceScanSummary,
      customSilenceSegments: removeDeadAir ? silenceSegments : [],
    });
    const res = await invoke<InteractiveProcessResult>("worker_app_process_media_interactive", {
        request: {
          sourcePath: renderSourcePath,
          trimStartMs: Math.round(trimStart * 1000),
          trimEndMs: Math.round(trimEnd * 1000),
          removeDeadAir,
          aspectRatio,
          focusMode,
          focusX,
          focusY,
          // Manual crop resizing uses the same scale path as the automated
          // camera so FFmpeg receives the exact framing shown in the preview.
          autoPanZoom: aspectRatio !== "source" && (
            smartDirectorMode !== "off"
            || manualScale > 1.0
            || Boolean(renderCameraMotionPlan)
          ),
          autoPanZoomMode: smartDirectorMode === "off" ? "manual_region" : smartDirectorMode,
          autoPanZoomScale: smartDirectorMode === "face_focus"
            ? 1.18
            : smartDirectorMode === "product_focus"
              ? Math.max(1.0, manualScale || 1.18)
              : Math.max(1.0, manualScale || 1.0),
          cameraMotionPlan: renderCameraMotionPlan,
          sourceGeometry: activeSourceGeometry
            ? {
              width: activeSourceGeometry.width,
              height: activeSourceGeometry.height,
              rotationDegrees: activeSourceGeometry.rotationDegrees,
            }
            : activeSourceDimensions.width > 0 && activeSourceDimensions.height > 0
              ? {
                width: activeSourceDimensions.width,
                height: activeSourceDimensions.height,
                rotationDegrees: 0,
              }
              : null,
          seriesId: seriesId || null,
          volumeThresholdPct: volumeThreshold,
          minDurationSec: minDuration,
          softeningBufferSec: softeningBuffer,
          audioStreamIndex: selectedAudioStreamIndex,
          customSilenceSegments: removeDeadAir
            ? silenceSegments.map((segment) => ({
              startMs: segment.startMs,
              endMs: segment.endMs ?? null,
              isManual: segment.classification === "manual",
            }))
            : [],
          targetWidth: nleProject?.canvas?.width || 1080,
          targetHeight: nleProject?.canvas?.height || 1920,
        },
      });
      writeMediaDebugEvent("media.render.frontend_completed", {
        sourcePath: renderSourcePath,
        result: res,
        cameraMotionPlan: renderCameraMotionPlan,
      });
      setProcessResult(res);
      setIsRenderPanelCollapsed(false);

      // Save to localStorage render history so it immediately appears in Media History
      try {
        const historyStr = localStorage.getItem("smartspec_render_history");
        const list = historyStr ? JSON.parse(historyStr) : [];
        const updated = [
          {
            id: `render_${Date.now()}`,
            fileName: res.fileName,
            outputPath: res.outputPath,
            durationMs: res.durationMs,
            sizeBytes: res.sizeBytes,
            width: res.width,
            height: res.height,
            silenceCutCount: res.silenceCutCount,
            timeSavedMs: res.timeSavedMs,
            timestamp: new Date().toISOString(),
          },
          ...list.filter((x: any) => x.outputPath !== res.outputPath),
        ].slice(0, 50);
        localStorage.setItem("smartspec_render_history", JSON.stringify(updated));
      } catch (e) {
        console.warn("Save history failed:", e);
      }
      const planResultLabel = res.cameraPlanApplied
        ? t(`ใช้ Full Scan ${res.cameraPlanKeyframes ?? planKeyframes} จุดกล้อง`, `Full Scan applied (${res.cameraPlanKeyframes ?? planKeyframes} keyframes)`)
        : renderCameraMotionPlan
          ? t("คำเตือน: native render ไม่ยืนยันการใช้แผนกล้อง", "Warning: native render did not confirm the camera plan")
          : "";
      setProjectStatusMsg(t(
        `Render เสร็จแล้ว: ${res.fileName}${planResultLabel ? ` · ${planResultLabel}` : ""}`,
        `Render complete: ${res.fileName}${planResultLabel ? ` · ${planResultLabel}` : ""}`,
      ));
    } catch (err) {
      const errorText = String(err);
      writeMediaDebugEvent("media.render.frontend_failed", {
        sourcePath: renderSourcePath,
        error: errorText,
        cameraMotionPlan,
      });
      setProjectStatusMsg(t(`Render ไม่สำเร็จ: ${errorText}`, `Render failed: ${errorText}`));
      setProcessError(
        errorText.includes("ffmpeg_unavailable") || errorText.includes("media_runtime_not_ready")
          ? t(
            "ยังไม่พร้อม Render: Runtime ของ FFmpeg/ffprobe ยังไม่พร้อม กรุณาเปิด Runtime แล้วกด Repair ก่อนลองอีกครั้ง",
            "Rendering is not ready: the FFmpeg/ffprobe runtime is unavailable. Open Runtime and choose Repair, then try again.",
          )
          : errorText,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadRenderedFile = async () => {
    if (!processResult) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const chosen = await save({
        defaultPath: processResult.fileName,
        filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      });
      if (chosen) {
        await invoke("worker_app_save_copy", {
          sourcePath: processResult.outputPath,
          destinationPath: chosen,
        });
        setProjectStatusMsg(`💾 บันทึกไฟล์ไปยัง "${normalizeDisplayPath(chosen)}" สำเร็จแล้ว`);
        setTimeout(() => setProjectStatusMsg(null), 4000);
      }
    } catch {
      const a = document.createElement("a");
      a.href = convertFileSrc(processResult.outputPath);
      a.download = processResult.fileName;
      a.click();
    }
  };

  const handleOpenRenderFolder = async () => {
    if (!processResult) return;
    try {
      await invoke("worker_app_reveal_file", { path: processResult.outputPath });
    } catch (e) {
      console.warn("Open folder error:", e);
    }
  };

  const handlePlayRenderedVideo = () => {
    if (!processResult) return;
    setOverrideVideoSrc(convertFileSrc(processResult.outputPath));
    setProjectStatusMsg(`🎬 กำลังเล่นวิดีโอผลลัพธ์: ${processResult.fileName}`);
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  // Upload to smartaihub.app Library
  const handleUploadToLibrary = async () => {
    if (!processResult) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const res = await invoke<LibraryUploadResult>("worker_app_upload_to_library", {
        filePath: processResult.outputPath,
        title: customTitle.trim() || processResult.fileName,
        seriesId: seriesId || null,
      });
      setUploadResult(res);
      if (res.libraryItemId && onUploadSuccess) {
        onUploadSuccess(res.libraryItemId);
      }
    } catch (err) {
      setUploadError(
        "ไม่สามารถส่งเข้า Cloud Library ได้ในขณะนี้ (อาจเป็นเพราะเครื่องยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์หลัก) แต่ไฟล์ของคุณถูกบันทึกลงในเครื่องเรียบร้อยแล้ว ท่านสามารถกดปุ่ม '📥 บันทึกไฟล์ลงเครื่อง' หรือ '📂 เปิดโฟลเดอร์ไฟล์' เพื่อนำไฟล์ไปใช้งานได้ทันที"
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Save Project Settings (Aspect ratio, Resolution, FPS)
  const handleSaveProjectSettings = ({ title, canvas }: { title: string; canvas: NleCanvas }) => {
    setCustomTitle(title);
    const nextAspectRatio = normalizePreviewAspectRatio(canvas.aspectRatio, "custom");
    setAspectRatio(nextAspectRatio);
    onReframe9x16Change?.(nextAspectRatio === "9:16");
    if (nleProject) {
      const updated: SmartSpecProjectDraft = {
        ...nleProject,
        title,
        updatedAt: new Date().toISOString(),
        canvas: {
          ...nleProject.canvas,
          ...canvas,
        },
      };
      setNleProject(updated);
      setProjectStatusMsg(`⚙️ บันทึกการตั้งค่าโปรเจกต์: ${canvas.aspectRatio} (${canvas.width}×${canvas.height}) เรียบร้อย`);
      setTimeout(() => setProjectStatusMsg(null), 4000);
    } else if (videoFile) {
      const newProj = createDefaultProjectDraft({
        projectId: `proj_${Date.now()}`,
        title,
        videoPath: videoFile.path,
        videoDurationMs: (duration || 60) * 1000,
        aspectRatio: nextAspectRatio === "16:9" ? "16:9" : nextAspectRatio === "1:1" ? "1:1" : "9:16",
      });
      newProj.canvas = { ...newProj.canvas, ...canvas };
      setNleProject(newProj);
      setProjectStatusMsg(`⚙️ สร้างและตั้งค่าโปรเจกต์: ${canvas.aspectRatio} (${canvas.width}×${canvas.height}) เรียบร้อย`);
      setTimeout(() => setProjectStatusMsg(null), 4000);
    }
  };

  // Apply Presets
  const applyPreset = (v: number, d: number, b: number) => {
    setVolumeThreshold(v);
    setMinDuration(d);
    setSofteningBuffer(b);
    void runCustomSilenceDetection(v, d, b);
  };

  const appendManualCutRange = (startMs: number, endMs: number) => {
    if (duration <= 0) return;
    const durationMs = Math.round(duration * 1000);
    const normalizedStartMs = Math.max(0, Math.min(durationMs, Math.round(Math.min(startMs, endMs))));
    const normalizedEndMs = Math.max(0, Math.min(durationMs, Math.round(Math.max(startMs, endMs))));
    if (normalizedEndMs - normalizedStartMs < 120) return;

    setSilenceSegments((prev) => {
      const sorted = [...prev, {
        startMs: normalizedStartMs,
        endMs: normalizedEndMs,
        classification: "manual",
      }].sort((a, b) => a.startMs - b.startMs);
      const next: LocalMediaAnalysisSegment[] = [];
      for (const segment of sorted) {
        const last = next[next.length - 1];
        if (last && segment.startMs <= (last.endMs ?? durationMs) + 80) {
          last.endMs = Math.max(last.endMs ?? 0, segment.endMs ?? 0);
        } else {
          next.push({ ...segment });
        }
      }
      setCutCount(next.length);
      const totalSaved = next.reduce((acc, s) => acc + ((s.endMs ?? durationMs) - s.startMs), 0);
      setTimeSavedMs(totalSaved);
      return next;
    });
    setProjectStatusMsg(`✂️ เพิ่มจุดตัดที่ ${formatSeconds(normalizedStartMs / 1000)} - ${formatSeconds(normalizedEndMs / 1000)} เรียบร้อย`);
    setTimeout(() => setProjectStatusMsg(null), 3000);
  };

  // Add manual cut interval (to cut out speech mistakes, bloopers, or extra silence)
  const handleAddManualCut = (centerSec?: number, cutDurationSec: number = 1.0) => {
    if (duration <= 0) return;
    const center = centerSec !== undefined ? centerSec : currentTime;
    const half = cutDurationSec / 2;
    appendManualCutRange((center - half) * 1000, (center + half) * 1000);
  };

  const getWaveformTimeMs = (clientX: number, element: HTMLDivElement = waveformTrackRef.current as HTMLDivElement) => {
    if (!element || duration <= 0) return 0;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration * 1000;
  };

  const handleWaveformPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || duration <= 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".timeline-silence-cut-region, button")) return;

    const startMs = getWaveformTimeMs(event.clientX, event.currentTarget);
    manualCutDragRef.current = {
      pointerId: event.pointerId,
      startMs,
      currentMs: startMs,
      startClientX: event.clientX,
    };
    setManualCutDraft({ startMs, endMs: startMs });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handleWaveformPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = manualCutDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const currentMs = getWaveformTimeMs(event.clientX, event.currentTarget);
    drag.currentMs = currentMs;
    setManualCutDraft({ startMs: drag.startMs, endMs: currentMs });
  };

  const handleWaveformPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = manualCutDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const endMs = getWaveformTimeMs(event.clientX, event.currentTarget);
    const startMs = Math.min(drag.startMs, endMs);
    const finalEndMs = Math.max(drag.startMs, endMs);
    const didDrag = Math.abs(event.clientX - drag.startClientX) >= 4;
    manualCutDragRef.current = null;
    setManualCutDraft(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (didDrag && finalEndMs - startMs >= 120) {
      appendManualCutRange(startMs, finalEndMs);
    } else {
      handleSeek(endMs / 1000);
    }
  };

  const handleWaveformPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (manualCutDragRef.current?.pointerId !== event.pointerId) return;
    manualCutDragRef.current = null;
    setManualCutDraft(null);
  };

  // Remove / Cancel a specific cut interval from silenceSegments
  const handleRemoveSilenceCut = (idxToRemove: number) => {
    setSilenceSegments((prev) => {
      const target = prev[idxToRemove];
      const next = prev.filter((_, i) => i !== idxToRemove);
      setCutCount(next.length);
      const totalSaved = next.reduce((acc, s) => acc + ((s.endMs ?? (duration * 1000)) - s.startMs), 0);
      setTimeSavedMs(totalSaved);
      if (target) {
        setProjectStatusMsg(`✕ ยกเลิกจุดตัดที่ ${formatSeconds(target.startMs / 1000)} เรียบร้อย`);
        setTimeout(() => setProjectStatusMsg(null), 3000);
      }
      return next;
    });
  };

  // Smart AI Director Choreography Engine (Dynamic Diagonal Pan/Zoom, Safe Scale <= 1.20x, Rest Phases)
  const directorState = useMemo(() => {
    if (smartDirectorMode === "off" || aspectRatio === "source") {
      return {
        scale: manualScale > 0 ? manualScale : 1.0,
        panX: focusX,
        panY: focusY,
        phase: "off",
        label: "",
      };
    }

    // The same versioned plan is used by preview and every render path. This
    // deliberately replaces the old cosine loop so the camera holds still for
    // several seconds between slow, deterministic moves.
    const activeCameraMotionPlan = authoritativeCameraPlanRef.current ?? cameraMotionPlan;
    if (activeCameraMotionPlan) {
      const activeTimeMs = Math.round((isPlaying ? smoothTime : currentTime) * 1000);
      const sample = evaluateCameraMotionPlan(activeCameraMotionPlan, activeTimeMs);
      const previous = [...activeCameraMotionPlan.keyframes]
        .reverse()
        .find((keyframe) => keyframe.timeMs <= activeTimeMs);
      const next = activeCameraMotionPlan.keyframes.find((keyframe) => keyframe.timeMs > activeTimeMs);
      const isMoving = Boolean(previous && next && (
        Math.abs(previous.x - next.x) > 0.0001
        || Math.abs(previous.y - next.y) > 0.0001
        || Math.abs(previous.scale - next.scale) > 0.0001
      ));
      const phase = isMoving ? "slow_move" : sample.source === "user_mark" ? "user_mark_hold" : "settled_hold";
      const label = sample.source === "user_mark"
        ? `📍 ถือจุดที่ผู้ใช้กำหนด${sample.sourceMarkId ? ` (${sample.sourceMarkId})` : ""} · ${sample.scale.toFixed(2)}x`
        : isMoving
          ? `🎥 เคลื่อนกล้องช้า · ${sample.scale.toFixed(2)}x`
          : `🎬 กล้องนิ่ง · ${sample.scale.toFixed(2)}x`;
      return {
        scale: sample.scale,
        panX: sample.x,
        panY: sample.y,
        phase,
        label,
      };
    }

    if (!isPlaying && smartDirectorMode !== "product_focus") {
      return {
        scale: manualScale > 0 ? manualScale : 1.0,
        panX: focusX,
        panY: focusY,
        phase: "paused",
        label: `🎬 พักวิดีโอ (X: ${Math.round(focusX * 100)}%, Y: ${Math.round(focusY * 100)}%, ซูม ${(manualScale || 1.0).toFixed(2)}x)`,
      };
    }

    const activeTime = isPlaying ? smoothTime : currentTime;
    const cycleDuration = 18.0; // 18-second periodic loop
    const t = activeTime % cycleDuration;
    const cycleIndex = Math.floor(activeTime / cycleDuration);

    // Target coordinates & safe presentation anchor bounds
    // Clamping wide anchors to presentation safe area (0.35 to 0.65) ensures wide master shots
    // never fly off to peripheral walls, trees, fences, or empty gutters
    const safeFocusX = Math.max(0.35, Math.min(0.65, focusX !== 0.5 ? focusX : 0.52));
    const safeFocusY = Math.max(0.22, Math.min(0.68, focusY !== 0.5 ? focusY : 0.35));
    const faceX = safeFocusX;
    const faceY = safeFocusY;

    const wideAnchorX = productPins.length > 0
      ? Math.max(0.35, Math.min(0.65, (safeFocusX + productPins[0].x) / 2))
      : safeFocusX;
    const wideAnchorY = safeFocusY;

    // Smooth cubic easing helper (Slow & Silk-smooth)
    const easeInOut = (p: number) => {
      const c = Math.max(0, Math.min(1, p));
      return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
    };

    // Dedicated Product / Multi-Pin Focus Mode (Supports Unlimited Multi-Point Smooth Pan & Zoom)
    if (smartDirectorMode === "product_focus") {
      if (productPins.length === 0) {
        return {
          scale: manualScale,
          panX: wideAnchorX,
          panY: wideAnchorY,
          phase: "wide_hold",
          label: `📦 โหมดจุดมาร์ก: จัดตำแหน่งกรอบหรือหมุนล้อเมาส์เพื่อซูม (${manualScale.toFixed(2)}x) แล้วกด "บันทึกจุดมาร์ก ณ เฟรมนี้"`,
        };
      }

      const vidW = videoDimensions.width || 1920;
      const vidH = videoDimensions.height || 1080;

      // Multi-Point Keyframed Pan & Zoom (2, 3, 4, 5+ Points)
      if (productPins.length >= 2) {
        const sorted = [...productPins].sort((a, b) => a.time - b.time);
        const firstPin = sorted[0];
        const lastPin = sorted[sorted.length - 1];

        // Paused state: Always respect user's manual drag (focusX/focusY) and manualScale so frame is never locked!
        if (!isPlaying) {
          let closestPin = sorted[0];
          let minDist = Math.abs(currentTime - sorted[0].time);
          let closestIdx = 0;
          for (let i = 1; i < sorted.length; i++) {
            const dist = Math.abs(currentTime - sorted[i].time);
            if (dist < minDist) {
              minDist = dist;
              closestPin = sorted[i];
              closestIdx = i;
            }
          }
          const isNearPin = minDist <= 1.0;
          const label = isNearPin
            ? `📦 จุดมาร์กที่ ${closestIdx + 1}/${sorted.length} (X: ${closestPin.pixelX}, Y: ${closestPin.pixelY}, ซูม ${(closestPin.scale || 1.18).toFixed(2)}x) · ${formatSmpteTime(closestPin.time)}`
            : `🎬 จัดกรอบภาพอิสระ (X: ${Math.round(focusX * vidW)}, Y: ${Math.round(focusY * vidH)}, ซูม ${manualScale.toFixed(2)}x)`;

          return {
            scale: manualScale,
            panX: focusX,
            panY: focusY,
            phase: "closeup_hold",
            label,
          };
        }

        const tStart = firstPin.time;
        // 1) ก่อนถึงจุดแรก (Before first pin):
        if (currentTime < tStart) {
          if (currentTime < tStart - 1.5) {
            return {
              scale: 1.0,
              panX: wideAnchorX,
              panY: wideAnchorY,
              phase: "wide_hold",
              label: `🎬 กล้องหลัก: มุมกว้างนิ่ง (ก่อนเข้าจุดที่ 1 อีก ${(tStart - currentTime).toFixed(1)}s)`,
            };
          }
          // Smooth push-in to first pin
          const p = easeInOut((currentTime - (tStart - 1.5)) / 1.5);
          const pinScale = firstPin.scale || 1.18;
          const curScale = 1.0 + (pinScale - 1.0) * p;
          const curX = wideAnchorX + (firstPin.x - wideAnchorX) * p;
          const curY = wideAnchorY + (firstPin.y - wideAnchorY) * p;
          return {
            scale: curScale,
            panX: curX,
            panY: curY,
            phase: "push_in",
            label: `🔍 ซูมเฉียงเข้าหาจุดที่ 1 (X: ${firstPin.pixelX}, Y: ${firstPin.pixelY})`,
          };
        }

        // 2) ระหว่างจุดต่าง ๆ (Between pins):
        for (let i = 0; i < sorted.length - 1; i++) {
          const pCurrent = sorted[i];
          const pNext = sorted[i + 1];
          const tA = pCurrent.time;
          const tB = pNext.time;

          if (currentTime >= tA && currentTime <= tB) {
            const gap = Math.max(0.1, tB - tA);
            const holdTime = Math.min(1.5, gap * 0.4);
            const moveTime = gap - holdTime;

            if (currentTime < tA + holdTime) {
              // ถือนิ่งที่จุดปัจจุบัน
              return {
                scale: pCurrent.scale || 1.18,
                panX: pCurrent.x,
                panY: pCurrent.y,
                phase: "closeup_hold",
                label: `📦 ถือกล้องนิ่งโฟกัสจุดที่ ${i + 1} (X: ${pCurrent.pixelX}, Y: ${pCurrent.pixelY})`,
              };
            } else {
              // เคลื่อน Smooth Pan & Zoom ไปยังจุดถัดไป!
              const p = easeInOut((currentTime - (tA + holdTime)) / Math.max(0.01, moveTime));
              const scaleA = pCurrent.scale || 1.18;
              const scaleB = pNext.scale || 1.18;
              const curScale = scaleA + (scaleB - scaleA) * p;
              const curX = pCurrent.x + (pNext.x - pCurrent.x) * p;
              const curY = pCurrent.y + (pNext.y - pCurrent.y) * p;
              return {
                scale: curScale,
                panX: curX,
                panY: curY,
                phase: "push_in",
                label: `🎥 Smooth Pan & Zoom: จุดที่ ${i + 1} ➔ จุดที่ ${i + 2} (${Math.round(p * 100)}% · X: ${Math.round(curX * vidW)}, Y: ${Math.round(curY * vidH)})`,
              };
            }
          }
        }

        // 3) หลังจากจุดสุดท้าย (After last pin):
        const tEnd = lastPin.time;
        const lastScale = lastPin.scale || 1.18;
        if (currentTime <= tEnd + 2.5) {
          return {
            scale: lastScale,
            panX: lastPin.x,
            panY: lastPin.y,
            phase: "closeup_hold",
            label: `📦 ถือกล้องนิ่งโฟกัสจุดที่ ${sorted.length} (X: ${lastPin.pixelX}, Y: ${lastPin.pixelY})`,
          };
        }
        if (currentTime <= tEnd + 4.0) {
          const p = easeInOut((currentTime - (tEnd + 2.5)) / 1.5);
          const curScale = lastScale - (lastScale - 1.0) * p;
          const curX = lastPin.x + (wideAnchorX - lastPin.x) * p;
          const curY = lastPin.y + (wideAnchorY - lastPin.y) * p;
          return {
            scale: curScale,
            panX: curX,
            panY: curY,
            phase: "pull_back",
            label: `↩️ ดึงกล้องกลับสู่มุมกว้าง (${curScale.toFixed(2)}x)`,
          };
        }
        return {
          scale: 1.0,
          panX: wideAnchorX,
          panY: wideAnchorY,
          phase: "wide_hold",
          label: `🎬 กล้องหลัก: มุมกว้างนิ่ง (สมบูรณ์ ${sorted.length} จุดมาร์ก)`,
        };
      }

      // Single Pin mode
      const singlePin = productPins[0];
      const targetScale = singlePin.scale || 1.18;
      const targetName = `จุดที่ 1 (X: ${singlePin.pixelX}, Y: ${singlePin.pixelY})`;

      if (!isPlaying) {
        const isNearPin = Math.abs(currentTime - singlePin.time) <= 1.0;
        const label = isNearPin
          ? `📦 จุดมาร์กที่ 1/1: ${targetName} (ซูม ${(singlePin.scale || 1.18).toFixed(2)}x) · ${formatSmpteTime(singlePin.time)}`
          : `🎬 จัดกรอบภาพอิสระ (X: ${Math.round(focusX * vidW)}, Y: ${Math.round(focusY * vidH)}, ซูม ${manualScale.toFixed(2)}x)`;

        return {
          scale: manualScale,
          panX: focusX,
          panY: focusY,
          phase: "closeup_hold",
          label,
        };
      }

      if (t < 2.0) {
        return {
          scale: 1.0,
          panX: wideAnchorX,
          panY: wideAnchorY,
          phase: "wide_hold",
          label: `🎬 กล้องหลัก: มุมกว้างนิ่ง (Wide Master ${Math.ceil(2.0 - t)}s)`,
        };
      }
      if (t < 4.0) {
        const p = easeInOut((t - 2.0) / 2.0);
        const curScale = 1.0 + (targetScale - 1.0) * p;
        const curX = wideAnchorX + (singlePin.x - wideAnchorX) * p;
        const curY = wideAnchorY + (singlePin.y - wideAnchorY) * p;
        return {
          scale: curScale,
          panX: curX,
          panY: curY,
          phase: "push_in",
          label: `🔍 ซูมเฉียงเข้าหา${targetName} (${curScale.toFixed(2)}x · Slow Pan)`,
        };
      }
      if (t < 15.0) {
        return {
          scale: targetScale,
          panX: singlePin.x,
          panY: singlePin.y,
          phase: "closeup_hold",
          label: `📦 ถือกล้องนิ่งโฟกัส${targetName} (${targetScale.toFixed(2)}x · นิ่ง ${Math.ceil(15.0 - t)}s)`,
        };
      }
      if (t < 17.0) {
        const p = easeInOut((t - 15.0) / 2.0);
        const curScale = targetScale - (targetScale - 1.0) * p;
        const curX = singlePin.x - (singlePin.x - wideAnchorX) * p;
        const curY = singlePin.y - (singlePin.y - wideAnchorY) * p;
        return {
          scale: curScale,
          panX: curX,
          panY: curY,
          phase: "pull_back",
          label: `↩️ ดึงกล้องกลับสู่มุมกว้าง (${curScale.toFixed(2)}x · Slow Return)`,
        };
      }
      return {
        scale: 1.0,
        panX: wideAnchorX,
        panY: wideAnchorY,
        phase: "wide_hold",
        label: `🎬 กล้องหลัก: มุมกว้างนิ่ง (Wide Master ${Math.ceil(18.0 - t)}s)`,
      };
    }

    let targetX = faceX;
    let targetY = faceY;
    let targetScale = 1.15; // Safe scale limit <= 1.20x to prevent pixelation
    let targetName = "ผู้พูด";

    if (smartDirectorMode === "face_focus") {
      targetX = faceX;
      targetY = faceY;
      targetScale = 1.18;
      targetName = "ใบหน้าผู้พูด";
    } else {
      // "auto": alternate between Product focus and Face focus (ONLY if product is pinned)
      if (productPins.length > 0 && cycleIndex % 2 === 1) {
        const pin = productPins[0];
        targetX = pin.x;
        targetY = pin.y;
        targetScale = 1.16;
        targetName = `จุดมาร์ก (X: ${pin.pixelX}, Y: ${pin.pixelY})`;
      } else {
        targetX = faceX;
        targetY = faceY;
        targetScale = 1.16;
        targetName = "ใบหน้าผู้พูด";
      }
    }

    // Beat 1: Wide Master Hold (0.0s - 5.0s) -> 5s rest phase
    if (t < 5.0) {
      return {
        scale: 1.0,
        panX: safeFocusX,
        panY: safeFocusY,
        phase: "wide_hold",
        label: `🎬 กล้องหลัก: มุมกว้างนิ่ง (Wide Master ${Math.ceil(5.0 - t)}s)`,
      };
    }

    // Beat 2: Smooth Push-in / Pan (5.0s - 7.5s) -> 2.5s slow smooth transition
    if (t < 7.5) {
      const p = easeInOut((t - 5.0) / 2.5);
      const curScale = 1.0 + (targetScale - 1.0) * p;
      const curX = safeFocusX + (targetX - safeFocusX) * p;
      const curY = safeFocusY + (targetY - safeFocusY) * p;
      return {
        scale: curScale,
        panX: curX,
        panY: curY,
        phase: "push_in",
        label: `🔍 ซูมเฉียงเข้าหา${targetName} (${curScale.toFixed(2)}x · Slow Pan)`,
      };
    }

    // Beat 3: Close-up / Punch-in Hold (7.5s - 13.0s) -> 5.5s rest phase
    if (t < 13.0) {
      return {
        scale: targetScale,
        panX: targetX,
        panY: targetY,
        phase: "closeup_hold",
        label: `📦 ถือกล้องนิ่งโฟกัส${targetName} (${targetScale.toFixed(2)}x · นิ่ง ${Math.ceil(13.0 - t)}s)`,
      };
    }

    // Beat 4: Smooth Reset Pull-back (13.0s - 15.5s) -> 2.5s slow smooth transition
    if (t < 15.5) {
      const p = easeInOut((t - 13.0) / 2.5);
      const curScale = targetScale - (targetScale - 1.0) * p;
      const curX = targetX - (targetX - safeFocusX) * p;
      const curY = targetY - (targetY - safeFocusY) * p;
      return {
        scale: curScale,
        panX: curX,
        panY: curY,
        phase: "pull_back",
        label: `↩️ ดึงกล้องกลับสู่มุมกว้าง (${curScale.toFixed(2)}x · Slow Return)`,
      };
    }

    // Beat 5: Wide Buffer Hold (15.5s - 18.0s) -> 2.5s rest phase
    return {
      scale: 1.0,
      panX: safeFocusX,
      panY: safeFocusY,
      phase: "wide_hold",
      label: `🎬 กล้องหลัก: มุมกว้างนิ่ง (Wide Master ${Math.ceil(18.0 - t)}s)`,
    };
  }, [cameraMotionPlan, smartDirectorMode, aspectRatio, currentTime, smoothTime, isPlaying, focusX, focusY, productPins, videoDimensions, manualScale, isPinningActive]);

  // WYSIWYG Video Style: transforms source video inside cropped container to match final render
  const wysiwygVideoStyle = useMemo<React.CSSProperties>(() => {
    if (previewMode !== "wysiwyg" || aspectRatio === "source") {
      return {
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        display: "block",
      };
    }

    const effectiveScale = (directorState.scale && directorState.scale > 1.0)
      ? directorState.scale
      : (manualScale > 1.0 ? manualScale : 1.0);
    const effectivePanX = (directorState.panX ?? focusX ?? 0.5) * 100;
    const effectivePanY = (directorState.panY ?? focusY ?? 0.5) * 100;

    // `focusX/Y` are focal-point coordinates, while CSS object-position is
    // an alignment percentage over the image overflow. With a narrow 9:16
    // crop these values differ substantially; passing the focal point
    // directly makes the crop stop short of the face even when the planner
    // has reached its target. Convert the requested focal point to the CSS
    // alignment space so the preview matches the native crop filter.
    const sourceRatio = (videoDimensions.width || 1920) / (videoDimensions.height || 1080);
    const outputRatio = renderAspectRatio ?? sourceRatio;
    let visibleWidth = 1;
    let visibleHeight = 1;
    if (outputRatio < sourceRatio) {
      visibleWidth = outputRatio / sourceRatio;
    } else if (outputRatio > sourceRatio) {
      visibleHeight = sourceRatio / outputRatio;
    }
    visibleWidth = Math.min(1, visibleWidth / effectiveScale);
    visibleHeight = Math.min(1, visibleHeight / effectiveScale);
    const toObjectPosition = (focalPercent: number, visibleFraction: number) => {
      if (visibleFraction >= 0.999) return 50;
      const focal = focalPercent / 100;
      return Math.max(0, Math.min(100, ((focal - visibleFraction / 2) / (1 - visibleFraction)) * 100));
    };
    const objectPositionX = toObjectPosition(effectivePanX, visibleWidth);
    const objectPositionY = toObjectPosition(effectivePanY, visibleHeight);

    return {
      width: "100%",
      height: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      objectFit: "cover",
      objectPosition: `${objectPositionX.toFixed(2)}% ${objectPositionY.toFixed(2)}%`,
      transform: effectiveScale !== 1.0 ? `scale(${effectiveScale})` : undefined,
      transformOrigin: `${effectivePanX.toFixed(2)}% ${effectivePanY.toFixed(2)}%`,
      transition: isDraggingCrop || smartDirectorMode !== "off"
        ? "none"
        : "object-position 1.6s cubic-bezier(0.22, 1, 0.36, 1), transform 1.6s cubic-bezier(0.22, 1, 0.36, 1)",
      display: "block",
    };
  }, [previewMode, aspectRatio, directorState, isDraggingCrop, smartDirectorMode, manualScale, focusX, focusY]);

  // Visual Crop Box Guide Overlay with mathematically exact aspect ratio & Smart Director scaling
  const cropBoxStyle = useMemo(() => {
    if (aspectRatio === "source" || previewMode === "wysiwyg" || !renderAspectRatio) return null;

    const vw = videoDimensions.width || 1920;
    const vh = videoDimensions.height || 1080;
    const videoRatio = vw / vh;
    const targetRatio = renderAspectRatio;

    const effectiveScale = (directorState.scale && directorState.scale > 1.0)
      ? directorState.scale
      : (manualScale > 1.0 ? manualScale : 1.0);
    const effectivePanX = directorState.panX ?? focusX ?? 0.5;
    const effectivePanY = directorState.panY ?? focusY ?? 0.5;

    // 1. Target is taller/narrower than video (e.g. 9:16 crop on 16:9 widescreen)
    if (targetRatio < videoRatio) {
      const baseWidth = (targetRatio / videoRatio) * 100;
      const boxWidthPercent = Math.min(100, baseWidth / effectiveScale);
      const boxHeightPercent = Math.min(100, 100 / effectiveScale);
      const maxLeft = 100 - boxWidthPercent;
      const maxTop = 100 - boxHeightPercent;
      const leftPercent = Math.max(0, Math.min(maxLeft, effectivePanX * 100 - boxWidthPercent / 2));
      const topPercent = Math.max(0, Math.min(maxTop, effectivePanY * 100 - boxHeightPercent / 2));
      return {
        width: `${boxWidthPercent}%`,
        height: `${boxHeightPercent}%`,
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transition: isDraggingCrop || smartDirectorMode !== "off" ? "none" : "all 1.6s cubic-bezier(0.22, 1, 0.36, 1)",
      };
    }

    // 2. Target is wider than video (e.g. 16:9 crop on 9:16 vertical)
    if (targetRatio > videoRatio) {
      const baseHeight = (videoRatio / targetRatio) * 100;
      const boxWidthPercent = Math.min(100, 100 / effectiveScale);
      const boxHeightPercent = Math.min(100, baseHeight / effectiveScale);
      const maxLeft = 100 - boxWidthPercent;
      const maxTop = 100 - boxHeightPercent;
      const leftPercent = Math.max(0, Math.min(maxLeft, effectivePanX * 100 - boxWidthPercent / 2));
      const topPercent = Math.max(0, Math.min(maxTop, effectivePanY * 100 - boxHeightPercent / 2));
      return {
        width: `${boxWidthPercent}%`,
        height: `${boxHeightPercent}%`,
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transition: isDraggingCrop || smartDirectorMode !== "off" ? "none" : "all 1.6s cubic-bezier(0.22, 1, 0.36, 1)",
      };
    }

    // 3. Same ratio as video
    const boxSize = Math.min(100, 100 / effectiveScale);
    const maxOffset = 100 - boxSize;
    const leftPercent = Math.max(0, Math.min(maxOffset, effectivePanX * 100 - boxSize / 2));
    const topPercent = Math.max(0, Math.min(maxOffset, effectivePanY * 100 - boxSize / 2));
    return {
      width: `${boxSize}%`,
      height: `${boxSize}%`,
      left: `${leftPercent}%`,
      top: `${topPercent}%`,
      transition: isDraggingCrop || smartDirectorMode !== "off" ? "none" : "all 1.6s cubic-bezier(0.22, 1, 0.36, 1)",
    };
  }, [aspectRatio, previewMode, directorState, videoDimensions, isDraggingCrop, smartDirectorMode, renderAspectRatio]);

  // Ruler markers calculation (every 10 seconds)
  const rulerTicks = useMemo(() => {
    if (duration <= 0) return [0];
    const ticks: number[] = [];
    const step = duration > 120 ? 30 : 10;
    for (let t = 0; t <= duration; t += step) {
      ticks.push(t);
    }
    return ticks;
  }, [duration]);

  // Current active pin near playhead (within 1 second)
  const activePinIdx = useMemo(() => {
    return productPins.findIndex((p) => Math.abs(currentTime - p.time) <= 1.0);
  }, [productPins, currentTime]);

  const activePin = activePinIdx >= 0 ? productPins[activePinIdx] : null;

  if (!videoFile && !nleProject) {
    return (
      <div className="silence-detection-window welcome-window">
        <div className="media-studio-welcome-screen">
          <div className="welcome-card">
            <div className="welcome-header-badge">
              <span>🎬 Smart AI Hub Media Studio</span>
            </div>

            <h2 className="welcome-title">{t("ยินดีต้อนรับสู่ระบบตัดต่อวิดีโอ & Media Studio", "Welcome to Video Editor & Media Studio")}</h2>
            <p className="welcome-subtitle">
              {t("เริ่มต้นสร้างโปรเจกต์ใหม่ หรือเลือกเปิดไฟล์สื่อจาก Explorer ทางด้านซ้ายเพื่อเริ่มทำงาน", "Create a new project or open media from Explorer on the left to begin.")}
            </p>

            <div className="welcome-actions-grid">
              <button
                type="button"
                className="welcome-action-card primary"
                onClick={() => {
                  if (onClose) onClose();
                }}
              >
                <div className="action-icon">✨</div>
                <div className="action-content">
                  <h3>{t("สร้างโปรเจกต์ใหม่", "New Project")}</h3>
                  <p>{t("สร้างไฟล์โปรเจกต์ .videoproject.json ใน Workspace และบันทึกบนดิสก์", "Create a .videoproject.json project file in the workspace and save it to disk.")}</p>
                </div>
              </button>

              <button
                type="button"
                className="welcome-action-card secondary"
                onClick={async () => {
                  try {
                    const selected = await openFolderDialog({
                      directory: false,
                      multiple: false,
                      title: t("เลือกไฟล์โปรเจกต์ (.videoproject.json หรือ .ssproj)", "Choose a project file (.videoproject.json or .ssproj)"),
                      filters: [{ name: "SmartSpec Project", extensions: ["videoproject.json", "ssproj", "json"] }],
                    });
                    if (selected && typeof selected === "string") {
                      const name = selected.split(/[\/\\]/).pop() || selected;
                      const ext = name.split(".").pop()?.toLowerCase() || "";
                      const entry: DirectoryEntry = {
                        name,
                        path: selected,
                        isDirectory: false,
                        sizeBytes: 0,
                        modifiedUnixMs: Date.now(),
                        extension: ext,
                        isVideo: false,
                      };
                      if (onOpenProjectFile) {
                        onOpenProjectFile(entry);
                      } else {
                        const json = await invoke<string>("worker_app_load_nle_project", { projectPath: selected });
                        const draft = parseProjectDraft(json);
                        setNleProject(draft);
                        if (onProjectDraftChange) onProjectDraftChange(draft);
                      }
                    }
                  } catch (err) {
                    console.warn("Open project file dialog failed:", err);
                  }
                }}
              >
                <div className="action-icon">📁</div>
                <div className="action-content">
                  <h3>{t("เปิดไฟล์โปรเจกต์เดิม", "Open Project File")}</h3>
                  <p>{t("เลือกไฟล์โปรเจกต์ .videoproject.json หรือ .ssproj เดิมที่เคยบันทึกไว้ในเครื่อง", "Choose a previously saved .videoproject.json or .ssproj file.")}</p>
                </div>
              </button>
            </div>

            <div className="welcome-tip-banner">
              <span className="tip-icon">💡</span>
              <span>
                <strong>{t("คำแนะนำ:", "Tip:")}</strong> {t("เลือกโฟลเดอร์ Workspace ทางด้านซ้าย แล้วดับเบิลคลิกไฟล์วิดีโอ หรือกดปุ่ม", "Choose a workspace folder on the left, then double-click a video or select")} <strong>"+ {t("โปรเจกต์ใหม่", "New Project")}"</strong> {t("เพื่อเริ่มต้น", "to begin.")}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="silence-detection-window">
      {/* Window Title Bar */}
      <div className="window-titlebar">
        <div className="window-title">
          <span className="window-icon">🎙️</span>
          <span>Silence Detection & NLE Studio</span>
          <span className="window-subfilename">— {videoFile?.name || nleProject?.title || t("โปรเจกต์ใหม่", "New Project")}</span>
        </div>
        <div className="window-actions">
          <button
            type="button"
            className="btn-manual-save-header"
            onClick={() => void handleSaveProject(false)}
            title={t("บันทึกโปรเจกต์ลงไฟล์ทันที (Ctrl+S / Cmd+S)", "Save project to a file now (Ctrl+S / Cmd+S)")}
          >
            💾 {t("บันทึก Project", "Save Project")}
          </button>
          <button
            type="button"
            className="btn-header-project-settings"
            onClick={() => setIsProjectSettingsOpen(true)}
            title={t("คลิกเพื่อตั้งค่าสัดส่วนหน้าจอ ความละเอียด (Resolution) และอัตราเฟรม (FPS) ของโปรเจกต์", "Set the project's aspect ratio, resolution, and frame rate (FPS)")}
          >
            ⚙️ {t("ตั้งค่า Project:", "Project settings:")}{" "}
            <span className="project-settings-pill">
              {nleProject?.canvas
                ? `${nleProject.canvas.aspectRatio} (${nleProject.canvas.width}×${nleProject.canvas.height})`
                : aspectRatio === "9:16"
                ? "9:16 (1080×1920)"
                : aspectRatio === "16:9"
                ? "16:9 (1920×1080)"
                : "1080p"}
            </span>
          </button>
          <button
            type="button"
            className={`window-settings-toggle ${showSettingsPanel ? "active" : ""}`}
            onClick={() => setShowSettingsPanel(!showSettingsPanel)}
            title={showSettingsPanel ? t("ซ่อนแผงตั้งค่าเพื่อขยายพื้นที่วิดีโอ", "Hide settings to enlarge the video area") : t("แสดงแผงตั้งค่าตรวจจับเสียงเงียบ", "Show silence-detection settings")}
          >
            {showSettingsPanel ? `⚙️ ${t("ซ่อนตั้งค่า", "Hide settings")}` : `⚙️ ${t("แสดงตั้งค่า", "Show settings")}`}
          </button>
          <span className="window-badge">{videoFile ? formatBytes(videoFile.sizeBytes) : "Project Draft"}</span>
          {onClose && (
            <button type="button" className="window-close-btn" onClick={onClose} title={t("ปิดหน้าต่าง", "Close window")}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Top Section: Video Preview + Settings Panel */}
      <div
        className={`detection-stage-grid ${!showSettingsPanel ? "settings-hidden" : ""}`}
        style={{ height: `${stageHeightPercent}%`, flex: `0 0 ${stageHeightPercent}%`, minHeight: "220px" }}
      >
        {/* Left: Video Preview Area */}
        <div className="video-viewport-panel">
          {/* Streamlined Pro Canvas Toolbar (Cluster-based, Icon-first, Tooltip-driven) */}
          <div className="canvas-header-bar">
            {/* Cluster 1: Aspect Ratio */}
            <div className="canvas-toolbar-cluster">
              <span className="cluster-label">📐 {t("สัดส่วน:", "Aspect ratio:")}</span>
              <div className="cluster-buttons">
                <button
                  type="button"
                  className={`toolbar-pill-btn ${aspectRatio === "9:16" ? "active" : ""}`}
                  onClick={() => handleAspectRatioChange("9:16")}
                  title={t("📱 สัดส่วน 9:16 แนวตั้ง (TikTok, Reels, Shorts)", "📱 9:16 vertical (TikTok, Reels, Shorts)")}
                >
                  📱 9:16
                </button>
                <button
                  type="button"
                  className={`toolbar-pill-btn ${aspectRatio === "16:9" ? "active" : ""}`}
                  onClick={() => handleAspectRatioChange("16:9")}
                  title={t("🖥️ สัดส่วน 16:9 แนวนอน (YouTube, Widescreen)", "🖥️ 16:9 horizontal (YouTube, Widescreen)")}
                >
                  🖥️ 16:9
                </button>
                <button
                  type="button"
                  className={`toolbar-pill-btn ${aspectRatio === "1:1" ? "active" : ""}`}
                  onClick={() => handleAspectRatioChange("1:1")}
                  title={t("⏹️ สัดส่วน 1:1 จัตุรัส (Instagram Feed)", "⏹️ 1:1 square (Instagram Feed)")}
                >
                  ⏹️ 1:1
                </button>
                <button
                  type="button"
                  className={`toolbar-pill-btn ${aspectRatio === "source" ? "active" : ""}`}
                  onClick={() => handleAspectRatioChange("source")}
                  title={t("⬛ ต้นฉบับ (Original Aspect Ratio)", "⬛ Original aspect ratio")}
                >
                  ⬛ {t("ต้นฉบับ", "Original")}
                </button>
              </div>
            </div>

            <div className="toolbar-vertical-divider" />

            {/* Cluster 2: Zoom Controls (🔍-, scale, 🔍+, 1.0x) */}
            {aspectRatio !== "source" && (
              <>
                <div className="canvas-toolbar-cluster zoom-cluster">
                  <span className="cluster-label">🔍 {t("ซูมภาพ:", "Zoom:")}</span>
                  <div className="cluster-buttons">
                    <button
                      type="button"
                      className="toolbar-pill-btn zoom-btn"
                      onClick={() => setManualScale((prev) => Math.max(1.0, +(prev - 0.05).toFixed(2)))}
                      title={t("ลดการซูม (Zoom Out 5%)", "Zoom out (5%)")}
                    >
                      🔍-
                    </button>
                    <span
                      className="toolbar-pill-btn zoom-value-display active"
                      title={t("ระดับซูมปัจจุบัน (หมุน Scroll Wheel หรือกดปุ่ม 🔍 เพื่อปรับ)", "Current zoom level (use mouse wheel or 🔍 buttons to adjust)")}
                    >
                      {manualScale.toFixed(2)}x
                    </span>
                    <button
                      type="button"
                      className="toolbar-pill-btn zoom-btn"
                      onClick={() => setManualScale((prev) => Math.min(2.5, +(prev + 0.05).toFixed(2)))}
                      title={t("เพิ่มการซูม (Zoom In 5%)", "Zoom in (5%)")}
                    >
                      🔍+
                    </button>
                    {manualScale !== 1.0 && (
                      <button
                        type="button"
                        className="toolbar-pill-btn zoom-reset-btn"
                        onClick={() => setManualScale(1.0)}
                        title={t("รีเซ็ตการซูมกลับเป็น 1.0x (เต็มสัดส่วนปกติ)", "Reset zoom to 1.0x")}
                      >
                        1.0x
                      </button>
                    )}
                  </div>
                </div>

                <div className="toolbar-vertical-divider" />

                {/* Cluster 3: AI Focus Tracking & Manual Drag */}
                <div className="canvas-toolbar-cluster">
                  <span className="cluster-label">🎯 {t("การเล็งภาพ:", "Focus:")}</span>
                  <div className="cluster-buttons">
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${focusMode === "auto_person" ? "active" : ""}`}
                      onClick={() => {
                        setFocusMode("auto_person");
                        personAnchorRef.current = null;
                        startupPersonLockRef.current = true;
                        onFocusModeChange?.("auto_person");
                        detectPersonCenter(true);
                        setProjectStatusMsg(t("👤 โหมดโฟกัสคน: AI ติดตามใบหน้าผู้พูดอัตโนมัติ", "👤 Person focus: AI automatically tracks the speaker's face."));
                        setTimeout(() => setProjectStatusMsg(null), 2500);
                      }}
                      title={`👤 ${t("ติดตามใบหน้าด้วย MediaPipe Face Detector", "Track faces with MediaPipe Face Detector")}: ${faceDetectorStatusLabel}`}
                    >
                      👤 {t("โฟกัสคน", "Person focus")} {focusMode === "auto_person" ? faceDetectorStatusIcon : ""}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${focusMode === "manual_region" ? "active" : ""}`}
                      onClick={() => {
                        setFocusMode("manual_region");
                        onFocusModeChange?.("manual_region");
                        setSmartDirectorMode("off");
                        setProjectStatusMsg(t("✋ โหมดลากเอง: ปิด Auto Pan/Zoom อัตโนมัติ กล้องนิ่งตามตำแหน่งที่คุณลาก", "✋ Manual drag: automatic pan/zoom is off; the camera stays where you place it."));
                        setTimeout(() => setProjectStatusMsg(null), 3000);
                      }}
                      title={t("✋ ลากเอง: คลิกลากกรอบบนภาพได้อย่างอิสระ (ปิด Auto Pan/Zoom ให้นิ่ง 100%)", "✋ Manual drag: freely move the frame (Auto Pan/Zoom is off)")}
                    >
                      ✋ {t("ลากเอง", "Manual drag")} {focusMode === "manual_region" ? "✓" : ""}
                    </button>
                  </div>
                </div>

                <div className="toolbar-vertical-divider" />

                {/* Cluster 4: Auto Pan & Zoom (Smart Director) */}
                <div className="canvas-toolbar-cluster">
                  <span className="cluster-label">🎬 Auto Pan/Zoom:</span>
                  <div className="cluster-buttons">
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${smartDirectorMode === "off" ? "active" : ""}`}
                      onClick={() => {
                        setSmartDirectorMode("off");
                        setProjectStatusMsg(t("✕ ปิด Auto Pan & Zoom: กล้องจะนิ่งคงที่ตามจุดที่คุณจัด", "✕ Auto Pan & Zoom off: the camera stays fixed where you set it."));
                        setTimeout(() => setProjectStatusMsg(null), 2500);
                      }}
                      title={t("✕ ปิด Auto Pan/Zoom: กล้องนิ่งคงที่ไม่เคลื่อนไหวอัตโนมัติ", "✕ Turn off Auto Pan/Zoom: keep the camera still")}
                    >
                      ✕ {t("ปิด (นิ่ง)", "Off (still)")}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${smartDirectorMode === "product_focus" ? "active" : ""}`}
                      onClick={() => {
                        setSmartDirectorMode("product_focus");
                        setProjectStatusMsg(t("📍 เปิด Auto Pan/Zoom: เคลื่อนกล้องนุ่มนวลระหว่างจุดมาร์กที่ปักไว้", "📍 Auto Pan/Zoom on: smoothly move between marked points."));
                        setTimeout(() => setProjectStatusMsg(null), 3000);
                      }}
                      title={t("📍 Pan/Zoom ตามจุดมาร์ก: เคลื่อนกล้อง Pan และ Zoom อย่างนุ่มนวลตามลำดับจุดมาร์ก", "📍 Pan/Zoom by marks: smoothly move between marks")}
                    >
                      📍 {t("ตามจุดมาร์ก", "By marks")} {smartDirectorMode === "product_focus" ? "🟢" : ""}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${smartDirectorMode === "auto" || smartDirectorMode === "face_activity" ? "active" : ""}`}
                      onClick={() => {
                        smartDirectorModeRef.current = "face_activity";
                        setSmartDirectorMode("face_activity");
                        setCameraAnalysisMode("quick");
                        setCameraScanStatus("quick");
                        setCameraTrackPoints([]);
                        setCameraActivityIntervals([]);
                        setFaceScanSummary(null);
                        trackedFaceCandidateRef.current = null;
                        personAnchorRef.current = { x: 0.5, y: 0.5 };
                        startupPersonLockRef.current = true;
                        focusXRef.current = 0.5;
                        focusYRef.current = 0.5;
                        setFocusX(0.5);
                        setFocusY(0.5);
                        onFocusXChange?.(0.5);
                        onFocusYChange?.(0.5);
                        setProjectStatusMsg(t("⚡ Face + Activity แบบด่วน: ล็อกใบหน้าที่พบก่อน กดสแกนทั้งคลิปเพื่อวิเคราะห์ activity เพิ่ม", "⚡ Face + Activity Quick: lock onto the detected face first; run Full Scan for activity analysis."));
                        detectPersonCenter(true);
                      }}
                      title={t("⚡ Face + Activity: ใช้ใบหน้า คน มือ วัตถุ และกิจกรรมเมื่อมีตัวตรวจจับที่รองรับ", "⚡ Face + Activity: use face, person, hand, object and activity evidence when capabilities are available")}
                    >
                      ⚡ {t("Face + Activity", "Face + Activity")} {smartDirectorMode === "auto" || smartDirectorMode === "face_activity" ? "🟢" : ""}
                    </button>
                    {smartDirectorMode === "face_activity" && (
                      <>
                        <button
                          type="button"
                          className={`toolbar-pill-btn ${cameraAnalysisMode === "quick" ? "active" : ""}`}
                          onClick={() => {
                            setCameraAnalysisMode("quick");
                            setCameraScanStatus("quick");
                            authoritativeCameraPlanRef.current = null;
                            setCameraTrackPoints([]);
                            setCameraActivityIntervals([]);
                            setFaceScanSummary(null);
                            trackedFaceCandidateRef.current = null;
                            personAnchorRef.current = { x: 0.5, y: 0.5 };
                            startupPersonLockRef.current = true;
                            focusXRef.current = 0.5;
                            focusYRef.current = 0.5;
                            setFocusX(0.5);
                            setFocusY(0.5);
                            onFocusXChange?.(0.5);
                            onFocusYChange?.(0.5);
                            setProjectStatusMsg(t("กล้องจะล็อกใบหน้าที่พบก่อน แล้วใช้ Full Scan เพื่อเพิ่ม activity", "Camera locks onto the detected face first, then Full Scan adds activity evidence."));
                          }}
                          title={t("ใช้ใบหน้าที่ตรวจพบจัดกรอบทันที และยังไม่ใช้ activity จนกว่าจะ Full Scan", "Use the detected face for immediate framing; activity is enabled after Full Scan")}
                        >
                          ⚡ {t("ด่วน", "Quick")}
                        </button>
                        <button
                          type="button"
                          className={`toolbar-pill-btn ${cameraAnalysisMode === "full_scan" ? "active" : ""}`}
                          onClick={() => {
                            cameraScanStatusRef.current = "scanning";
                            setCameraAnalysisMode("full_scan");
                            setCameraScanStatus("scanning");
                            setFaceScanSummary(null);
                            setFaceFrameDiagnostic(null);
                            setProjectStatusMsg(t("กำลังสแกนทั้งวิดีโอเพื่อวางแผนกล้อง…", "Scanning the full video to plan camera motion…"));
                            void scanFullVideoForCameraPlan();
                          }}
                          title={t("สแกนทั้งวิดีโอก่อนวางแผน pan/zoom", "Scan the full video before planning pan/zoom")}
                        >
                          🔎 {t("สแกนทั้งคลิป", "Full Scan")}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${smartDirectorMode === "face_focus" ? "active" : ""}`}
                      onClick={() => setSmartDirectorMode("face_focus")}
                      title={t("👤 ซูมหาใบหน้า: ซูมเน้นใบหน้าผู้พูดเป็นระยะ", "👤 Face zoom: periodically focus on the speaker's face")}
                    >
                      👤 {t("ซูมหน้า", "Face zoom")} {smartDirectorMode === "face_focus" ? "🟢" : ""}
                    </button>
                  </div>
                </div>

                <div className="toolbar-vertical-divider" />

                {/* Cluster 5: Product Pin Mark Cluster */}
                <div className="canvas-toolbar-cluster">
                  <span className="cluster-label">📍 จุดมาร์ก:</span>
                  <div className="cluster-buttons">
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${isPinningActive ? "active is-pinning" : ""} ${productPins.length > 0 ? "has-pin" : ""}`}
                      onClick={handleTogglePinningMode}
                      title={
                        isPinningActive
                          ? "กำลังจัดกรอบ: เลื่อนกรอบหรือหมุน Scroll ซูม แล้วกด 'มาร์กเฟรมนี้'"
                          : productPins.length > 0
                          ? `มี ${productPins.length} จุดมาร์ก (คลิกเพื่อจัดกรอบจุดใหม่)`
                          : "หยุดเฟรมเพื่อจัดกรอบและปักหมุดตำแหน่งพิกัด X, Y บนวิดีโอ"
                      }
                    >
                      📍 {isPinningActive ? "กำลังจัดกรอบ..." : productPins.length > 0 ? `มาร์ก (${productPins.length})` : "ปักหมุด"}
                    </button>

                    {/* Delete CURRENT point button when playhead is near a pin */}
                    {activePin && (
                      <button
                        type="button"
                        className="toolbar-pill-btn btn-danger-pill"
                        onClick={() => {
                          const idToDel = activePin.id;
                          const pinNum = activePinIdx + 1;
                          setProductPins((prev) => prev.filter((p) => p.id !== idToDel));
                          setProjectStatusMsg(`🗑️ ลบจุดมาร์กที่ ${pinNum} เรียบร้อย`);
                          setTimeout(() => setProjectStatusMsg(null), 2500);
                        }}
                        title={`คลิกลบจุดมาร์กที่ ${activePinIdx + 1} ณ เวลาปัจจุบัน (${formatSmpteTime(activePin.time)})`}
                      >
                        🗑️ ลบจุดนี้ ({activePinIdx + 1})
                      </button>
                    )}

                    {productPins.length > 0 && (
                      <button
                        type="button"
                        className="toolbar-pill-btn btn-danger-pill"
                        onClick={() => {
                          setProductPins([]);
                          setProjectStatusMsg("✕ ล้างจุดมาร์กทั้งหมดเรียบร้อย");
                          setTimeout(() => setProjectStatusMsg(null), 2500);
                        }}
                        title="ล้างจุดมาร์กทั้งหมดทุกจุด"
                      >
                        ✕ ล้างทั้งหมด ({productPins.length})
                      </button>
                    )}
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${showPinMarkers ? "active" : ""}`}
                      onClick={() => setShowPinMarkers(!showPinMarkers)}
                      title={showPinMarkers ? "ซ่อนไอคอนจุดมาร์กบนจอ" : "เรียกดู / แสดงจุดมาร์กบนจอ"}
                    >
                      {showPinMarkers ? "👁️ ดูจุด" : "🙈 ซ่อน"}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${hidePinsOnPreview ? "active" : ""}`}
                      onClick={() => setHidePinsOnPreview(!hidePinsOnPreview)}
                      title={
                        hidePinsOnPreview
                          ? "โหมด Preview: ซ่อนจุดมาร์กอัตโนมัติขณะเล่นหรือแสดงผล WYSIWYG"
                          : "โหมด Preview: แสดงจุดมาร์กตลอดเวลา"
                      }
                    >
                      {hidePinsOnPreview ? "✨ ซ่อนตอนเล่น" : "📌 ค้างไว้"}
                    </button>
                  </div>
                </div>

                <div className="toolbar-vertical-divider" />
              </>
            )}

            {/* Cluster 3: Preview Mode & Viewport Zoom */}
            <div className="canvas-toolbar-cluster">
              <span className="cluster-label">👁️ โหมด:</span>
              <div className="cluster-buttons">
                {aspectRatio !== "source" && (
                  <>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${previewMode === "crop_guide" ? "active" : ""}`}
                      onClick={() => setPreviewMode("crop_guide")}
                      title="🔲 โหมดกรอบ Crop: แสดงภาพเต็มต้นฉบับพร้อมเส้นตีกรอบ Crop สีเขียว (แนะนำ)"
                    >
                      🔲 กรอบ
                    </button>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${previewMode === "wysiwyg" ? "active" : ""}`}
                      onClick={() => setPreviewMode("wysiwyg")}
                      title="✨ โหมดเสมือนจริง: แสดงภาพ 9:16 ที่ครอบตัดตรงกับที่จะ Render จริง"
                    >
                      ✨ จริง
                    </button>
                  </>
                )}
                <select
                  className="viewport-zoom-select compact"
                  value={viewportZoom}
                  onChange={(e) => {
                    const val = e.target.value;
                    setViewportZoom(val === "fit" ? "fit" : parseFloat(val));
                  }}
                  title="ขยาย/ย่อมุมมอง Viewport เพื่อตรวจดูรายละเอียดภาพในระยะต่างๆ"
                >
                  <option value="fit">🔍 พอดีจอ</option>
                  <option value="0.5">50%</option>
                  <option value="0.75">75%</option>
                  <option value="1">100%</option>
                  <option value="1.25">125%</option>
                  <option value="1.5">150%</option>
                  <option value="2">200%</option>
                </select>
                <button
                  type="button"
                  className={`toolbar-icon-btn ${isFullscreenPreview ? "active" : ""}`}
                  onClick={handleToggleFullscreen}
                  title={isFullscreenPreview ? "ออกจากเต็มจอ (ESC / F)" : "⛶ พรีวิวเต็มหน้าจอ (กด F)"}
                >
                  ⛶
                </button>
              </div>
            </div>

            {/* Cluster 4: Quick Action & Settings Toggles */}
            <div className="canvas-toolbar-cluster right-cluster">
              <button
                type="button"
                className="toolbar-pill-btn manual-save-btn"
                onClick={() => void handleSaveProject(false)}
                style={{
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.35) 100%)",
                  border: "1px solid rgba(52, 211, 153, 0.5)",
                  color: "#a7f3d0",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="บันทึกโครงสร้างโปรเจกต์ลงไฟล์ทันที (Ctrl+S / Cmd+S)"
              >
                💾 บันทึก Project
              </button>
              {autoSaveStatus && (
                <span className="auto-save-mini" title="ระบบบันทึกโครงสร้างโปรเจกต์ลงเครื่องอัตโนมัติ">
                  💾 {autoSaveStatus}
                </span>
              )}
              <button
                type="button"
                className="toolbar-pill-btn settings-btn"
                onClick={() => setIsProjectSettingsOpen(true)}
                title="ตั้งค่า Resolution, FPS, Canvas ของ Project"
              >
                ⚙️ Project:{" "}
                <span className="pill-sub">
                  {nleProject?.canvas
                    ? `${nleProject.canvas.aspectRatio} (${nleProject.canvas.width}×${nleProject.canvas.height})`
                    : aspectRatio}
                </span>
              </button>
              <button
                type="button"
                className={`toolbar-pill-btn toggle-dead-air ${showSettingsPanel ? "active" : ""}`}
                onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                title={showSettingsPanel ? "คลิกเพื่อซ่อนแผงตั้งค่าตัดเสียงเงียบ (ขยายพื้นที่วิดีโอ 100%)" : "คลิกเพื่อเปิดแผงตั้งค่าตัดเสียงเงียบ"}
              >
                🎚️ {showSettingsPanel ? "ซ่อนตั้งค่าเสียง" : "ตั้งค่าตัดเสียงเงียบ"}
              </button>
            </div>
          </div>

          {/* Outside Video Banner for Pinning Mode */}
          {isPinningActive && (
            <div className="pinning-mode-top-banner">
              <div className="pinning-banner-content">
                <span className="pinning-banner-icon">📍</span>
                <span className="pinning-banner-title">
                  โหมดมาร์กตำแหน่ง / ฟรีซเฟรม (เวลา: {formatSmpteTime(currentTime)}):
                </span>
                <span className="pinning-banner-desc">
                  ลากเพื่อเลื่อนกรอบ · หมุน Scroll Wheel เพื่อซูม · จัดกรอบตามที่ต้องการแล้วกดบันทึก
                </span>
                <div className="pinning-zoom-widget">
                  <button
                    type="button"
                    onClick={() => setManualScale((s) => Math.max(1.0, +(s - 0.05).toFixed(2)))}
                    title="ซูมออก (-5%)"
                  >
                    🔍-
                  </button>
                  <span className="pinning-zoom-val">{manualScale.toFixed(2)}x</span>
                  <button
                    type="button"
                    onClick={() => setManualScale((s) => Math.min(2.5, +(s + 0.05).toFixed(2)))}
                    title="ซูมเข้า (+5%)"
                  >
                    🔍+
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualScale(1.0)}
                    title="รีเซ็ตซูมมุมกว้าง 1.0x"
                    style={{ fontSize: "0.68rem" }}
                  >
                    1.0x
                  </button>
                </div>
              </div>

              <div className="pinning-banner-actions">
                <button
                  type="button"
                  className="pinning-banner-record-btn"
                  onClick={handleRecordCurrentFramePin}
                  title={`บันทึกจุดมาร์กเฟรมนี้ (X: ${Math.round(focusX * (videoDimensions.width || 1920))}, Y: ${Math.round(focusY * (videoDimensions.height || 1080))}, ซูม: ${manualScale.toFixed(2)}x)`}
                >
                  📍 บันทึกจุดมาร์ก ณ เฟรมนี้
                </button>

                {productPins.length > 0 && (
                  <button
                    type="button"
                    className="pinning-banner-action-btn btn-clear"
                    onClick={() => {
                      setProductPins([]);
                      setProjectStatusMsg("✕ ล้างจุดมาร์กทั้งหมดเรียบร้อย");
                      setTimeout(() => setProjectStatusMsg(null), 2500);
                    }}
                    title="ล้างจุดมาร์กทั้งหมด"
                  >
                    🗑️ ล้างทั้งหมด ({productPins.length})
                  </button>
                )}
                <button
                  type="button"
                  className="pinning-banner-action-btn btn-close"
                  onClick={() => setIsPinningActive(false)}
                >
                  ✕ เสร็จสิ้น / ปิดโหมด
                </button>
              </div>

              {/* Pin list chips if pins exist */}
              {productPins.length > 0 && (
                <div className="pin-list-chips">
                  <span style={{ fontSize: "0.72rem", color: "#fef3c7", fontWeight: 700 }}>
                    จุดมาร์กที่บันทึกแล้ว ({productPins.length} จุด):
                  </span>
                  {productPins.map((p, idx) => (
                    <div
                      key={p.id}
                      className={`pin-chip-item ${Math.abs(currentTime - p.time) < 0.2 ? "active" : ""}`}
                      onClick={() => {
                        handleSeek(p.time);
                        setFocusX(p.x);
                        setFocusY(p.y);
                        setManualScale(p.scale || 1.18);
                        setProjectStatusMsg(`📍 ไปที่จุดมาร์กที่ ${idx + 1}: เวลา ${formatSmpteTime(p.time)}`);
                        setTimeout(() => setProjectStatusMsg(null), 2000);
                      }}
                      title={`คลิกเพื่อดูจุดที่ ${idx + 1} (เวลา ${formatSmpteTime(p.time)})`}
                    >
                      <span>📍 จุดที่ {idx + 1} ({formatSmpteTime(p.time)} · {p.pixelX},{p.pixelY} · {(p.scale || 1.18).toFixed(2)}x)</span>
                      <button
                        type="button"
                        className="pin-chip-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProductPins(productPins.filter((item) => item.id !== p.id));
                          setProjectStatusMsg(`✕ ลบจุดที่ ${idx + 1} เรียบร้อย`);
                          setTimeout(() => setProjectStatusMsg(null), 2000);
                        }}
                        title={`ลบจุดที่ ${idx + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            ref={videoViewportRef}
            className={`video-viewport-box ${isFullscreenPreview ? "is-fullscreen" : ""} ${
              viewportZoom !== "fit" ? "is-zoomed" : ""
            } ${isPinningActive ? "is-pinning-canvas" : ""} ${isDraggingCrop ? "is-dragging" : ""}`}
            onMouseDown={(e) => handleUniversalMouseDown(e, false)}
            onWheel={handleStageWheel}
            onClick={handleOverlayClick}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              e.currentTarget.classList.add("drop-target-active");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("drop-target-active");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("drop-target-active");
              try {
                const dataStr = e.dataTransfer.getData("application/json");
                if (!dataStr) return;
                const asset = JSON.parse(dataStr);
                handleDropAssetOnTrack("track_v2", asset, Math.round(currentTime * 1000));
              } catch (err) {
                console.warn("Canvas drop error:", err);
              }
            }}
            title="คลิกเพื่อย้ายตำแหน่งกึ่งกลาง หรือลากคลิป B-Roll มาวางบนหน้านี้ได้"
          >
            {/* Fullscreen Floating Controls & Exit Button */}
            {isFullscreenPreview && (
              <>
                <button
                  type="button"
                  className="fullscreen-floating-exit-btn"
                  onClick={handleToggleFullscreen}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="ออกจากโหมดเต็มจอ (ESC หรือ F)"
                >
                  ✕ ออกจากเต็มจอ (ESC / F)
                </button>

                <div
                  className="fullscreen-floating-control-bar"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="fullscreen-control-btn"
                    onClick={() => handleSeek(0)}
                    title="เลื่อนไปต้นวิดีโอ (00:00:00)"
                  >
                    ⏮️ ต้นคลิป
                  </button>
                  <button
                    type="button"
                    className="fullscreen-control-btn"
                    onClick={() => handleSeek(Math.max(0, currentTime - 5))}
                    title="ย้อนหลัง 5 วินาที (Left Arrow)"
                  >
                    ⏪ -5s
                  </button>
                  <button
                    type="button"
                    className="fullscreen-control-btn"
                    onClick={togglePlay}
                    style={{ fontSize: "1.25rem", minWidth: "38px" }}
                    title={isPlaying ? "หยุดเล่น (Space)" : "เล่นต่อ (Space)"}
                  >
                    {isPlaying ? "⏸️" : "▶️"}
                  </button>
                  <button
                    type="button"
                    className="fullscreen-control-btn"
                    onClick={() => handleSeek(Math.min(duration, currentTime + 5))}
                    title="ไปข้างหน้า 5 วินาที (Right Arrow)"
                  >
                    +5s ⏩
                  </button>

                  <span className="fullscreen-timecode">
                    {formatSmpteTime(currentTime)} / {formatSmpteTime(duration)}
                  </span>

                  <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
                    {productPins.length > 0 && showPinMarkers && (
                      <div style={{ position: "absolute", left: 0, right: 0, height: "100%", pointerEvents: "none", zIndex: 3 }}>
                        {productPins.map((p, idx) => (
                          <div
                            key={p.id}
                            style={{
                              position: "absolute",
                              left: `${(p.time / (duration || 1)) * 100}%`,
                              top: "50%",
                              transform: "translate(-50%, -50%)",
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: idx === 0 ? "#f59e0b" : idx === 1 ? "#06b6d4" : "#10b981",
                              border: "1.5px solid #fff",
                              boxShadow: "0 0 6px rgba(0,0,0,0.8)",
                            }}
                          />
                        ))}
                      </div>
                    )}
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.1}
                      value={currentTime}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="fullscreen-seek-slider"
                      title="เลื่อนตำแหน่งวิดีโอ"
                      style={{ width: "100%" }}
                    />
                  </div>

                  <button
                    type="button"
                    className="fullscreen-control-btn fullscreen-capture-btn"
                    onClick={handleCaptureCurrentFrame}
                    title="แคปภาพเฉพาะเฟรมปัจจุบันบันทึกเป็น PNG คุณภาพสูง"
                  >
                    📸 แคปเฟรม
                  </button>

                  <button
                    type="button"
                    className="fullscreen-control-btn"
                    onClick={handleToggleFullscreen}
                    title="ออกจากโหมดเต็มจอ (ESC / F)"
                  >
                    ⛶ ออก
                  </button>
                </div>
              </>
            )}



            {/* Override Video Active Banner */}
            {overrideVideoSrc && (
              <div className="override-video-banner">
                <span>🎬 กำลังเล่นวิดีโอผลลัพธ์ที่ Render สำเร็จ: {processResult?.fileName}</span>
                <button
                  type="button"
                  className="btn-close-override"
                  onClick={() => setOverrideVideoSrc(null)}
                  title="สลับกลับไปไฟล์วิดีโอต้นฉบับ"
                >
                  สลับกลับเป็นต้นฉบับ ✕
                </button>
              </div>
            )}

            {smartDirectorMode !== "off" && (
              <div className="smart-director-hud-badge">
                <span className="hud-pulse-dot" />
                <span className="hud-label">{directorState.label}</span>
                <span className="hud-scale">Scale: {directorState.scale.toFixed(2)}x</span>
              </div>
            )}

            {previewMode === "wysiwyg" && aspectRatio !== "source" && (
              <div className="wysiwyg-preview-watermark">
                <span>✨ WYSIWYG PREVIEW ({aspectRatio})</span>
              </div>
            )}

            <div
              ref={videoStageRef}
              className={`video-stage-canvas ${
                previewMode === "wysiwyg" && aspectRatio !== "source" ? "is-wysiwyg" : ""
              }`}
              style={{
                aspectRatio:
                  previewMode === "wysiwyg" && aspectRatio !== "source"
                    ? renderAspectRatio
                      ? `${renderAspectRatio} / 1`
                      : "1 / 1"
                    : videoDimensions.width && videoDimensions.height
                    ? `${videoDimensions.width} / ${videoDimensions.height}`
                    : "16 / 9",
                height: "100%",
                maxHeight: "100%",
                maxWidth: "100%",
                transform: viewportZoom !== "fit" ? `scale(${viewportZoom})` : undefined,
                transformOrigin: "center center",
              }}
            >
              <video
                ref={videoRef}
                src={overrideVideoSrc || videoSrc}
                crossOrigin={
                  (overrideVideoSrc || videoSrc).startsWith("asset:") ||
                  (overrideVideoSrc || videoSrc).includes("asset.localhost")
                    ? "anonymous"
                    : undefined
                }
                style={wysiwygVideoStyle}
                muted={isMuted || Boolean(nleProject?.tracks?.find((t) => t.id === "track_v1")?.muted)}
                onLoadedMetadata={handleLoadedMetadata}
                onLoadedData={() => {
                  if (!overrideVideoSrc && (focusMode === "auto_person" || smartDirectorMode === "face_activity")) detectPersonCenter(true);
                }}
                onCanPlay={() => {
                  if (!overrideVideoSrc && (focusMode === "auto_person" || smartDirectorMode === "face_activity")) detectPersonCenter(true);
                }}
                onTimeUpdate={handleTimeUpdate}
                onSeeked={() => {
                  if (!overrideVideoSrc && (focusMode === "auto_person" || smartDirectorMode === "face_activity")) detectPersonCenter(true);
                }}
                onEnded={() => setIsPlaying(false)}
                onError={() => {
                  if (overrideVideoSrc || videoSrc) {
                    setPlaybackError(
                      "เบราว์เซอร์ไม่สามารถเล่นไฟล์นี้โดยตรงได้ (อาจเป็น Codec พิเศษ) แต่ระบบสามารถ Render ตัดต่อผ่าน FFmpeg ได้ตามปกติ"
                    );
                  }
                }}
                playsInline
              />
              {faceDiagnosticVisible && (
                <div
                  className={`face-diagnostic-status ${currentFaceDiagnostic?.status === "found" ? "is-found" : "is-missing"}`}
                  data-testid="face-diagnostic-status"
                >
                  <span className="face-diagnostic-dot" />
                  {faceDiagnosticLabel}
                </div>
              )}
              {faceDiagnosticVisible && faceScanSummary && (
                <div
                  className={`face-scan-status ${faceScanRenderable ? "is-found" : "is-missing"}`}
                  data-testid="face-scan-status"
                  role={faceScanRenderable ? undefined : "alert"}
                >
                  {faceScanSummary.selectedFrames === 0
                    ? t("Full Scan: ไม่พบใบหน้าหลักที่ใช้ตัดต่อได้", "Full Scan: no usable main face found")
                    : faceScanSummary.usedFallbackFaceTrack
                      ? t("Full Scan: ใช้ใบหน้าที่พบเป็นหลัก (โหมดสำรอง)", "Full Scan: using the detected face as fallback lock")
                    : faceScanRenderable
                      ? t("Full Scan: พบใบหน้าหลัก", "Full Scan: main face found")
                      : t("Full Scan: หลักฐานใบหน้ายังไม่พอ", "Full Scan: insufficient face evidence")}
                  {` · ${faceScanSummary.selectedFrames}/${faceScanSummary.sampledFrames} ${t("เฟรม", "frames")}`}
                  {` · ${t("กรอบ", "boxes")} ${faceScanSummary.detectedFrames}`}
                  {` · ${t("จุดโมเดล ≥5", "model points ≥5")} ${faceScanSummary.landmarkFrames}`}
                  {` · ${Math.round(faceScanSummary.faceSpanMs / 1000)} ${t("วินาที", "seconds")}`}
                </div>
              )}
              {faceDiagnosticVisible && previewMode === "crop_guide" && currentFaceDiagnostic?.box && (
                <div
                  className={`face-diagnostic-box ${currentFaceDiagnostic.status === "found" ? "is-found" : "is-missing"}`}
                  data-testid="face-diagnostic-box"
                  style={{
                    left: `${Math.max(0, currentFaceDiagnostic.box.x) * 100}%`,
                    top: `${Math.max(0, currentFaceDiagnostic.box.y) * 100}%`,
                    width: `${Math.min(1, currentFaceDiagnostic.box.width) * 100}%`,
                    height: `${Math.min(1, currentFaceDiagnostic.box.height) * 100}%`,
                  }}
                  title={t("กรอบใบหน้าที่ตัวตรวจจับรายงานจริง", "Face box reported by the detector")}
                />
              )}
              {faceDiagnosticVisible && previewMode === "crop_guide" && currentFaceDiagnostic?.landmarks.map((point, index) => (
                <div
                  key={`${currentFaceDiagnostic.timeMs}-${index}`}
                  className={`face-diagnostic-landmark ${currentFaceDiagnostic.status === "found" ? "is-found" : "is-missing"}`}
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  title={`Face landmark ${index + 1}`}
                />
              ))}
              {previewMode === "wysiwyg" && aspectRatio !== "source" && (
                <div
                  data-testid="media-preview-frame"
                  className="preview-canvas-frame"
                  aria-label={`กรอบพรีวิว ${previewFrameLabel}`}
                >
                  <span className="preview-canvas-frame-label">{previewFrameLabel}</span>
                </div>
              )}
              {playbackError && (
                <div className="playback-error-overlay">
                  <span>⚠️ {playbackError}</span>
                </div>
              )}

              {/* Sandboxed Live React / CSS / Three.js & Word Subtitles Overlay */}
              {nleProject && (
                <SandboxedOverlayViewer
                  activeClips={activeOverlayClips}
                  frameStyle={previewMode === "crop_guide" ? cropBoxStyle ?? undefined : undefined}
                  currentTimeMs={Math.round(currentTime * 1000)}
                  width={nleProject.canvas.width}
                  height={nleProject.canvas.height}
                  focusX={focusX}
                  focusY={focusY}
                  productPin={productPin}
                  isPlaying={isPlaying}
                  volume={volume}
                  isMuted={isMuted}
                />
              )}

              {/* Synchronized Multi-Track Audio Engine */}
              <MultiTrackAudioSync
                project={nleProject}
                currentTime={currentTime}
                isPlaying={isPlaying}
                masterVolume={volume}
                isMasterMuted={isMuted}
              />

              {/* Crop Overlay (Only shown in crop_guide mode) */}
              {cropBoxStyle && previewMode === "crop_guide" && (
                <div className="crop-overlay-mask">
                  <div
                    data-testid="media-preview-frame"
                    aria-label={`กรอบพรีวิว ${previewFrameLabel}`}
                    className={`crop-view-box aspect-${aspectRatio.replace(":", "-")} ${
                      focusMode === "auto_person" ? "auto-track" : "manual"
                    } ${isDraggingCrop ? "dragging" : ""}`}
                    style={cropBoxStyle}
                    onMouseDown={handleCropMouseDown}
                    onWheel={handleStageWheel}
                    title="คลิกค้างแล้วลากเพื่อขยับตำแหน่งกรอบวิดีโอ (หมุนล้อเมาส์ Scroll เพื่อปรับซูม)"
                  >
                    <div
                      className="crop-box-corner top-left"
                      onMouseDown={(e) => handleCropResizeMouseDown(e, "top-left")}
                      title="ลากเพื่อปรับขนาดกรอบ โดยล็อกสัดส่วน Project"
                    />
                    <div
                      className="crop-box-corner top-right"
                      onMouseDown={(e) => handleCropResizeMouseDown(e, "top-right")}
                      title="ลากเพื่อปรับขนาดกรอบ โดยล็อกสัดส่วน Project"
                    />
                    <div
                      className="crop-box-corner bottom-left"
                      onMouseDown={(e) => handleCropResizeMouseDown(e, "bottom-left")}
                      title="ลากเพื่อปรับขนาดกรอบ โดยล็อกสัดส่วน Project"
                    />
                    <div
                      className="crop-box-corner bottom-right"
                      onMouseDown={(e) => handleCropResizeMouseDown(e, "bottom-right")}
                      title="ลากเพื่อปรับขนาดกรอบ โดยล็อกสัดส่วน Project"
                    />
                    <div className="crop-box-center-crosshair">✛</div>
                    <span className="crop-frame-ratio-label">{previewFrameLabel}</span>
                    <div className="crop-box-tag" onWheel={handleStageWheel}>
                      {/* Zoom Cluster on Crop Tag */}
                      <button
                        type="button"
                        className="crop-tag-zoom-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManualScale((prev) => Math.max(1.0, +(prev - 0.05).toFixed(2)));
                        }}
                        title="ลดการซูม (Zoom Out 5%)"
                      >
                        🔍-
                      </button>
                      <span className="crop-tag-scale-badge" title="ระดับซูมของกรอบ (หมุน Scroll Wheel เพื่อปรับซูม)">
                        {(directorState.scale || manualScale || 1.0).toFixed(2)}x
                      </span>
                      <button
                        type="button"
                        className="crop-tag-zoom-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManualScale((prev) => Math.min(2.5, +(prev + 0.05).toFixed(2)));
                        }}
                        title="เพิ่มการซูม (Zoom In 5%)"
                      >
                        🔍+
                      </button>
                      {manualScale !== 1.0 && (
                        <button
                          type="button"
                          className="crop-tag-zoom-btn is-reset"
                          onClick={(e) => {
                            e.stopPropagation();
                            setManualScale(1.0);
                          }}
                          title="รีเซ็ตซูมกลับเป็น 1.0x"
                        >
                          1.0x
                        </button>
                      )}

                      <button
                        type="button"
                        className="crop-tag-pin-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRecordCurrentFramePin();
                        }}
                        title="บันทึกกรอบภาพและระดับซูมปัจจุบันเป็นจุดมาร์ก (Freeze Frame Waypoint)"
                      >
                        📍 มาร์กเฟรมนี้
                      </button>

                      {/* Delete this point button if active near playhead */}
                      {activePin && (
                        <button
                          type="button"
                          className="crop-tag-del-pin-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            const idToDel = activePin.id;
                            const pinNum = activePinIdx + 1;
                            setProductPins((prev) => prev.filter((p) => p.id !== idToDel));
                            setProjectStatusMsg(`🗑️ ลบจุดมาร์กที่ ${pinNum} เรียบร้อย`);
                            setTimeout(() => setProjectStatusMsg(null), 2500);
                          }}
                          title={`คลิกลบจุดมาร์กที่ ${activePinIdx + 1} ณ เวลานี้`}
                        >
                          🗑️ ลบจุด {activePinIdx + 1}
                        </button>
                      )}

                      <button
                        type="button"
                        className={`crop-tag-focus-badge ${focusMode === "auto_person" ? "is-auto" : "is-manual"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next: "auto_person" | "manual_region" = focusMode === "auto_person" ? "manual_region" : "auto_person";
                          setFocusMode(next);
                          onFocusModeChange?.(next);
                          if (next === "manual_region") {
                            setSmartDirectorMode("off");
                          } else {
                            personAnchorRef.current = null;
                            startupPersonLockRef.current = true;
                            detectPersonCenter(true);
                          }
                        }}
                        title={
                          focusMode === "auto_person"
                            ? "กำลังล็อกใบหน้าผู้พูด (คลิกเพื่อสลับเป็นลากเอง)"
                            : "โหมดลากเอง (คลิกเพื่อเปิดโฟกัสคน Auto Track)"
                        }
                      >
                        {aspectRatio === "9:16" ? "📱 9:16" : aspectRatio === "16:9" ? "📺 16:9" : "⏹️ 1:1"}
                        {focusMode === "auto_person" ? " · 👤 คน" : " · ✋ Drag"}
                      </button>
                      {focusMode === "auto_person" && (
                        <button
                          type="button"
                          className="crop-tag-rescan-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            detectPersonCenter(true);
                          }}
                          title="สแกนหาตำแหน่งใบหน้าผู้พูดในเฟรมนี้ใหม่ทันที"
                        >
                          🎯 สแกนคน
                        </button>
                      )}
                      <button
                        type="button"
                        className="crop-tag-switch-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = aspectRatio === "9:16" ? "16:9" : "9:16";
                          handleAspectRatioChange(next);
                        }}
                        title="คลิกเพื่อสลับระหว่าง 9:16 และ 16:9 ทันที"
                      >
                        🔄 สลับ {aspectRatio === "9:16" ? "16:9" : "9:16"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Product Pin Mark Overlay */}
              {productPins.length > 0 && showPinMarkers && (
                <>
                  {productPins.map((pin, idx) => (
                    <div
                      key={pin.id}
                      className={`product-pin-marker-anchor pin-marker-${idx + 1}`}
                      style={{
                        position: "absolute",
                        left: `${pin.x * 100}%`,
                        top: `${pin.y * 100}%`,
                        transform: "translate(-50%, -50%)",
                        pointerEvents: "auto",
                        zIndex: 60,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSeek(pin.time);
                        setFocusX(pin.x);
                        setFocusY(pin.y);
                        setManualScale(pin.scale || 1.18);
                        setProjectStatusMsg(`📍 ไปที่จุดมาร์กที่ ${idx + 1}: เวลา ${formatSmpteTime(pin.time)} (X: ${pin.pixelX}, Y: ${pin.pixelY}, ซูม ${(pin.scale || 1.18).toFixed(2)}x)`);
                        setTimeout(() => setProjectStatusMsg(null), 2500);
                      }}
                      title={`คลิกเพื่อข้ามไปเวลา ${formatSmpteTime(pin.time)} (จุดที่ ${idx + 1})`}
                    >
                      <div className="product-pin-target-crosshair">
                        <div className="product-pin-pulse-ring" />
                        <div className="product-pin-center-dot">{idx + 1}</div>
                      </div>
                      <div className="product-pin-tag-badge">
                        <span className="pin-badge-icon">📍 จุดที่ {idx + 1}</span>
                        <span className="pin-badge-coords">
                          X: {pin.pixelX}, Y: {pin.pixelY} · {(pin.scale || 1.18).toFixed(2)}x
                        </span>
                        <span className="pin-badge-time">
                          ⏱️ {formatSmpteTime(pin.time)}
                        </span>
                        <button
                          type="button"
                          className="pin-badge-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductPins(productPins.filter((p) => p.id !== pin.id));
                            setProjectStatusMsg(`✕ ลบจุดมาร์กที่ ${idx + 1} เรียบร้อย`);
                            setTimeout(() => setProjectStatusMsg(null), 2500);
                          }}
                          title={`ลบจุดมาร์กที่ ${idx + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Under-video transport controls bar */}
          <div className="transport-controls-bar">
            <div className="transport-buttons">
              <button
                type="button"
                className="transport-btn"
                onClick={() => handleStepFrame(false)}
                title="ย้อน 1 เฟรม"
              >
                ◀◀
              </button>
              <button
                type="button"
                className="transport-btn"
                onClick={() => handleSeek(Math.max(0, currentTime - 1))}
                title="ย้อน 1 วินาที"
              >
                |◀
              </button>
              <button
                type="button"
                className={`transport-btn play-btn ${isPlaying ? "playing" : ""}`}
                onClick={togglePlay}
                title={isPlaying ? "หยุดชั่วคราว (Space)" : "เล่นวิดีโอ (Space)"}
              >
                {isPlaying ? "❚❚" : "▶"}
              </button>
              <button
                type="button"
                className="transport-btn"
                onClick={handleStop}
                title="หยุดและกลับจุดเริ่มต้น"
              >
                ■
              </button>
              <button
                type="button"
                className="transport-btn"
                onClick={() => handleSeek(Math.min(duration, currentTime + 1))}
                title="ข้าม 1 วินาที"
              >
                ▶|
              </button>
              <button
                type="button"
                className="transport-btn"
                onClick={() => handleStepFrame(true)}
                title="เดินหน้า 1 เฟรม"
              >
                ▶▶
              </button>
              <button
                type="button"
                className={`transport-btn ${isMuted ? "muted" : ""}`}
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? "เปิดเสียง (M)" : "ปิดเสียง (M)"}
                style={{ color: isMuted ? "#ef4444" : undefined }}
              >
                {isMuted ? "🔇" : "🔊"}
              </button>
            </div>

            {/* Scrubber slider line */}
            <div className="transport-scrubber" style={{ position: "relative" }}>
              {productPins.length > 0 && showPinMarkers && (
                <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: "8px", pointerEvents: "none", zIndex: 3 }}>
                  {productPins.map((p, idx) => (
                    <div
                      key={p.id}
                      style={{
                        position: "absolute",
                        left: `${(p.time / (duration || 1)) * 100}%`,
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: idx === 0 ? "#f59e0b" : idx === 1 ? "#06b6d4" : idx === 2 ? "#10b981" : idx === 3 ? "#a855f7" : "#f43f5e",
                        border: "1.5px solid #fff",
                        boxShadow: "0 0 6px rgba(0,0,0,0.8)",
                      }}
                      title={`จุดมาร์กที่ ${idx + 1}: ${formatSmpteTime(p.time)}`}
                    />
                  ))}
                </div>
              )}
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.05}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="transport-slider"
              />
            </div>

            {/* Timecode display (00:00:00:00 / 00:01:03:09) */}
            <div className="transport-timecode">
              <span className="current-tc">{formatSmpteTime(currentTime)}</span>
              <span className="divider">/</span>
              <span className="total-tc">{formatSmpteTime(duration)}</span>
              <span style={{ fontSize: "0.72rem", opacity: 0.75, marginLeft: "6px", color: "#38bdf8" }}>
                (F:{Math.floor(currentTime * 30)}/{Math.floor(duration * 30)})
              </span>
            </div>
          </div>
        </div>

        {/* Right: Settings Panel (Matching Reference UI) */}
        {showSettingsPanel && (
          <div className="silence-settings-panel">
            <div className="settings-header">
            <div className="settings-title">
              <h4>Settings</h4>
              <span className="info-icon" title="ปรับเกณฑ์การตัด Dead Air และความเงียบ">
                ⓘ
              </span>
            </div>
            <button
              type="button"
              className="analyze-button"
              disabled={isAnalyzing}
              onClick={() => void runCustomSilenceDetection()}
            >
              {isAnalyzing ? (
                <>
                  <span className="spinner" /> Analyzing...
                </>
              ) : (
                "Analyze"
              )}
            </button>
          </div>

          {/* Sliders Container */}
          <div className="settings-controls">
            {/* Slider 1: Volume Threshold */}
            <div className="setting-row">
              <div className="setting-label-row">
                <span className="setting-name">Volume Threshold:</span>
                <div className="setting-value-display">
                  <strong>{volumeThreshold}%</strong>
                  <span className="db-value">({thresholdDb} dB)</span>
                </div>
                <button
                  type="button"
                  className="reset-param-btn"
                  onClick={() => setVolumeThreshold(25)}
                  title="รีเซ็ตเป็น 25%"
                >
                  ↺
                </button>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={volumeThreshold}
                onChange={(e) => setVolumeThreshold(parseInt(e.target.value, 10))}
                className="param-slider"
              />
            </div>

            {/* Slider 2: Minimum Duration */}
            <div className="setting-row">
              <div className="setting-label-row">
                <span className="setting-name">Minimum Duration:</span>
                <div className="setting-value-display">
                  <strong>{minDuration.toFixed(1)} s</strong>
                </div>
                <button
                  type="button"
                  className="reset-param-btn"
                  onClick={() => setMinDuration(0.5)}
                  title="รีเซ็ตเป็น 0.5s"
                >
                  ↺
                </button>
              </div>
              <input
                type="range"
                min={0.1}
                max={2.0}
                step={0.05}
                value={minDuration}
                onChange={(e) => setMinDuration(parseFloat(e.target.value))}
                className="param-slider"
              />
            </div>

            {/* Slider 3: Softening Buffer */}
            <div className="setting-row">
              <div className="setting-label-row">
                <span className="setting-name">Softening Buffer:</span>
                <div className="setting-value-display">
                  <strong>{softeningBuffer.toFixed(2)} s</strong>
                </div>
                <button
                  type="button"
                  className="reset-param-btn"
                  onClick={() => setSofteningBuffer(0.2)}
                  title="รีเซ็ตเป็น 0.2s"
                >
                  ↺
                </button>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.5}
                step={0.01}
                value={softeningBuffer}
                onChange={(e) => setSofteningBuffer(parseFloat(e.target.value))}
                className="param-slider"
              />
            </div>

            {/* Quick Presets */}
            <div className="presets-container">
              <span className="presets-title">Presets แนะนำ:</span>
              <div className="preset-buttons">
                <button
                  type="button"
                  className={`preset-chip ${volumeThreshold === 25 && minDuration === 0.5 && softeningBuffer === 0.2 ? "active" : ""}`}
                  onClick={() => applyPreset(25, 0.5, 0.2)}
                  title="ธรรมชาติ / บทสนทนาทั่วไป"
                >
                  🟢 ธรรมชาติ (25% / 0.5s / 0.2s)
                </button>
                <button
                  type="button"
                  className={`preset-chip ${volumeThreshold === 30 && minDuration === 0.35 && softeningBuffer === 0.1 ? "active" : ""}`}
                  onClick={() => applyPreset(30, 0.35, 0.1)}
                  title="TikTok / Shorts พูดเร็ว กระชับ"
                >
                  ⚡ Shorts/TikTok (30% / 0.35s / 0.1s)
                </button>
                <button
                  type="button"
                  className={`preset-chip ${volumeThreshold === 35 && minDuration === 0.25 && softeningBuffer === 0.08 ? "active" : ""}`}
                  onClick={() => applyPreset(35, 0.25, 0.08)}
                  title="ตัดกระชับพิเศษ / Jump Cut เก็บทุกช่วงหยุดหายใจ"
                >
                  🔥 Jump Cut ไวสุด (35% / 0.25s / 0.08s)
                </button>
                <button
                  type="button"
                  className={`preset-chip ${volumeThreshold === 20 && minDuration === 0.8 && softeningBuffer === 0.25 ? "active" : ""}`}
                  onClick={() => applyPreset(20, 0.8, 0.25)}
                  title="พอดแคสต์ / บรรยายแบบชิลล์"
                >
                  🎙️ พอดแคสต์ (20% / 0.8s / 0.25s)
                </button>
              </div>
            </div>

            {/* Result Stats Box */}
            <div className="detection-stats-box">
              <div className="stat-item">
                <span className="stat-label">ช่วง Dead Air ที่พบ:</span>
                <strong className="stat-val highlight">{cutCount} ช่วง</strong>
              </div>
              <div className="stat-item">
                <span className="stat-label">ประหยัดเวลาได้:</span>
                <strong className="stat-val highlight">
                  {(timeSavedMs / 1000).toFixed(1)} วินาที
                </strong>
              </div>
              <div className="stat-item">
                <span className="stat-label">ความยาวคลิปหลังตัด:</span>
                <strong className="stat-val">
                  {formatSeconds(Math.max(0, duration - timeSavedMs / 1000))}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Resizable Workspace Splitter between Video Stage & Timeline */}
      <div
        className="workspace-vertical-splitter"
        onMouseDown={handleSplitterMouseDown}
        title={t("คลิกลากขึ้น-ลงเพื่อปรับขนาดพื้นที่วิดีโอกับไทม์ไลน์", "Drag up or down to resize the video and timeline areas")}
      >
        <div className="splitter-handle-pill">
          <span className="splitter-grip">⋯</span>
          <span className="splitter-label">{t("พื้นที่วิดีโอ", "Video area")} {stageHeightPercent}%</span>
        </div>
        <div className="splitter-preset-buttons" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`splitter-preset-btn ${stageHeightPercent >= 70 ? "active" : ""}`}
            onClick={() => {
              setStageHeightPercent(75);
              try { localStorage.setItem("smartspec_stage_height_pct", "75"); } catch {}
            }}
            title={t("ขยายพื้นที่วิดีโอใหญ่สุด 75%", "Expand video area to 75%")}
          >
            🔼 {t("วิดีโอใหญ่", "Large video")} (75%)
          </button>
          <button
            type="button"
            className={`splitter-preset-btn ${stageHeightPercent >= 55 && stageHeightPercent < 70 ? "active" : ""}`}
            onClick={() => {
              setStageHeightPercent(60);
              try { localStorage.setItem("smartspec_stage_height_pct", "60"); } catch {}
            }}
            title={t("มุมมองสมดุล (วิดีโอ 60% / ไทม์ไลน์ 40%)", "Balanced view (video 60% / timeline 40%)")}
          >
            ⚖️ {t("สมดุล", "Balanced")} (60%)
          </button>
          <button
            type="button"
            className={`splitter-preset-btn ${stageHeightPercent < 55 ? "active" : ""}`}
            onClick={() => {
              setStageHeightPercent(45);
              try { localStorage.setItem("smartspec_stage_height_pct", "45"); } catch {}
            }}
            title={t("ขยายพื้นที่ไทม์ไลน์ เพื่อดูหลายแทร็กสะดวก", "Expand timeline area to view more tracks")}
          >
            🔽 {t("ไทม์ไลน์ใหญ่", "Large timeline")} (45%)
          </button>
        </div>
      </div>

      {/* Mode Switcher & Pro NLE Toolbar */}
      <div className="nle-studio-header-toolbar">
        <div className="nle-mode-switch-group">
          <button
            type="button"
            className={`nle-mode-btn ${editorMode === "multitrack" ? "active" : ""}`}
            onClick={() => setEditorMode("multitrack")}
          >
            🎛️ Multi-Track Studio NLE
          </button>
          <button
            type="button"
            className={`nle-mode-btn ${editorMode === "basic" ? "active" : ""}`}
            onClick={() => setEditorMode("basic")}
          >
            ⚡ Quick Silence Cut
          </button>
        </div>

        {/* Quick Silence Cut Inline Analyze Suite (Analyze button, Presets, Sliders, Add Cut, and Stats) */}
        {editorMode === "basic" && (
          <div className="quick-silence-analyze-inline-group">
            {/* Analyze Action Button */}
            <button
              type="button"
              className="analyze-inline-btn"
              onClick={() => void runCustomSilenceDetection()}
              disabled={isAnalyzing}
              title={t("กดเพื่อวิเคราะห์ตัดช่วงเสียงเงียบ (Dead Air) ตามพารามิเตอร์ที่เลือก", "Analyze silent sections (Dead Air) using the selected settings")}
            >
              {isAnalyzing ? `⏳ ${t("วิเคราะห์...", "Analyzing...")}` : "⚡ Analyze"}
            </button>

            {/* Presets */}
            <div className="inline-preset-pills">
              <button
                type="button"
                className={`inline-preset-pill ${volumeThreshold === 25 && minDuration === 0.5 && softeningBuffer === 0.2 ? "active" : ""}`}
                onClick={() => applyPreset(25, 0.5, 0.2)}
                title={t("ธรรมชาติ / บทสนทนาทั่วไป (25% / 0.5s / 0.2s)", "Natural / general conversation (25% / 0.5s / 0.2s)")}
              >
                🟢 {t("ธรรมชาติ", "Natural")}
              </button>
              <button
                type="button"
                className={`inline-preset-pill ${volumeThreshold === 30 && minDuration === 0.35 && softeningBuffer === 0.1 ? "active" : ""}`}
                onClick={() => applyPreset(30, 0.35, 0.1)}
                title={t("TikTok / Shorts พูดเร็ว กระชับ (30% / 0.35s / 0.1s)", "TikTok / Shorts, quick and concise (30% / 0.35s / 0.1s)")}
              >
                ⚡ Shorts
              </button>
              <button
                type="button"
                className={`inline-preset-pill ${volumeThreshold === 35 && minDuration === 0.25 && softeningBuffer === 0.08 ? "active" : ""}`}
                onClick={() => applyPreset(35, 0.25, 0.08)}
                title={t("ตัดกระชับพิเศษ / Jump Cut ไวสุด (35% / 0.25s / 0.08s)", "Extra concise / fastest Jump Cut (35% / 0.25s / 0.08s)")}
              >
                🔥 Jump Cut
              </button>
              <button
                type="button"
                className={`inline-preset-pill ${volumeThreshold === 20 && minDuration === 0.8 && softeningBuffer === 0.25 ? "active" : ""}`}
                onClick={() => applyPreset(20, 0.8, 0.25)}
                title={t("พอดแคสต์ / บรรยายแบบชิลล์ (20% / 0.8s / 0.25s)", "Podcast / relaxed narration (20% / 0.8s / 0.25s)")}
              >
                🎙️ {t("พอดแคสต์", "Podcast")}
              </button>
            </div>

            {/* Threshold & Params Adjustment */}
            <div className="inline-param-controls">
              <label className="inline-param-label" title="เกณฑ์ระดับเสียง (Volume Threshold) เลื่อนเพื่อปรับความไวในการตัดเสียงเงียบ">
                Vol: <strong>{volumeThreshold}%</strong>
                <input
                  type="range"
                  min={1}
                  max={80}
                  step={1}
                  value={volumeThreshold}
                  onChange={(e) => setVolumeThreshold(parseInt(e.target.value, 10))}
                  onMouseUp={() => void runCustomSilenceDetection()}
                  className="inline-mini-slider"
                />
              </label>
              <label className="inline-param-label" title="ความยาวเสียงเงียบขั้นต่ำ (Minimum Duration) สั้นกว่านี้จะไม่ตัด">
                Min: <strong>{minDuration.toFixed(1)}s</strong>
                <input
                  type="range"
                  min={0.1}
                  max={1.5}
                  step={0.05}
                  value={minDuration}
                  onChange={(e) => setMinDuration(parseFloat(e.target.value))}
                  onMouseUp={() => void runCustomSilenceDetection()}
                  className="inline-mini-slider"
                />
              </label>
            </div>

            {/* Manual Cut Button */}
            <button
              type="button"
              className="inline-add-cut-btn"
              onClick={() => handleAddManualCut()}
              title={t("✂️ เพิ่มจุดตัด 1 วินาทีที่ตำแหน่ง Playhead หรือใช้การลากบนกราฟเพื่อเลือกช่วงเอง", "✂️ Add a 1-second cut at the playhead or drag on the graph to select a range")}
            >
              ✂️ + {t("มาร์กจุดตัด", "Mark cut")}
            </button>

            {/* Cut Count & Saved Stats */}
            <div
              className="inline-stats-badge"
              title={t(`ตัด Dead Air ทั้งหมด ${cutCount} ช่วง ประหยัดเวลาได้ ${(timeSavedMs / 1000).toFixed(1)} วินาที`, `${cutCount} Dead Air sections cut; ${(timeSavedMs / 1000).toFixed(1)} seconds saved`)}
            >
              <span>✂️ {cutCount} {t("ช่วง", "sections")}</span>
              <span className="stats-saved">(-{(timeSavedMs / 1000).toFixed(1)}s)</span>
            </div>
          </div>
        )}

        {projectStatusMsg && (
          <div className="ai-plan-status-badge" style={{ background: "rgba(14, 165, 233, 0.2)", borderColor: "#38bdf8", color: "#38bdf8" }}>
            <span className="badge-dot" style={{ background: "#38bdf8", boxShadow: "0 0 6px #38bdf8" }} />
            <span>{projectStatusMsg}</span>
          </div>
        )}

        <div className="nle-timecode-display" title="SMPTE Timecode (HH:MM:SS:FF)">
          {formatSmpteTime(currentTime)}
        </div>
      </div>

      {editorMode === "multitrack" && nleProject ? (
        <MultiTrackTimeline
          project={nleProject}
          currentTimeMs={Math.round(currentTime * 1000)}
          durationMs={Math.max(1000, effectiveDuration * 1000)}
          isPlaying={isPlaying}
          onSeek={(ms) => handleSeek(ms / 1000)}
          onTogglePlay={togglePlay}
          onUpdateProject={(updated) => setNleProject(updated)}
          onOpenAutoSubtitles={() => setIsAutoSubModalOpen(true)}
          onOpenVoiceGuidedVisualMatch={() => setIsVoiceGuidedVisualMatchOpen(true)}
          onOpenCodeOverlayModal={() => setIsCodeOverlayModalOpen(true)}
          onOpenAssetDrawer={handleOpenAssetDrawer}
          isMediaBinOpen={isMediaBinOpen}
          onOpenMediaBin={() => setIsMediaBinOpen(true)}
          onCloseMediaBin={() => setIsMediaBinOpen(false)}
          onOpenAudioScoringModal={() => setIsAudioScoringModalOpen(true)}
          onOpenTextOverlayModal={() => setIsTextModalOpen(true)}
          onOpenStockSvgModal={() => setIsSvgModalOpen(true)}
          onOpenBlurOverlayModal={() => setIsBlurModalOpen(true)}
          onOpenVoiceoverModal={() => setIsVoiceoverModalOpen(true)}
          onOpenAiMediaStudioModal={() => setIsAiStudioModalOpen(true)}
          onDetachAudio={handleDetachAudio}
          onSaveProjectFile={handleSaveProject}
          onExportCapCutDraft={handleExportCapCutDraft}
          onOpenProjectSettings={() => setIsProjectSettingsOpen(true)}
          isDuckingActive={isDuckingActive}
          onDropAsset={handleDropAssetOnTrack}
          onAddAssetClip={handleAddAssetClip}
        />
      ) : (
        /* Bottom Section: Multi-Track Timeline with Audio Waveform */
        <div className="multi-track-timeline-container">
          {/* Timeline Toolbar */}
          <div className="timeline-toolbar">
          <div className="toolbar-left">
            <button
              type="button"
              className="tool-btn"
              onClick={() => handleSeek(0)}
              title="ย้อนกลับไปจุดเริ่มต้น"
            >
              ↶
            </button>
            <button
              type="button"
              className="tool-btn"
              onClick={() => handleSeek(duration)}
              title="ไปจุดสิ้นสุด"
            >
              ↷
            </button>
            <span className="toolbar-separator" />
            <button
              type="button"
              className="tool-btn cut-tool"
              onClick={() => {
                if (currentTime > trimStart && currentTime < trimEnd) {
                  setTrimStart(currentTime);
                }
              }}
              title="Split / ตัดที่ตำแหน่ง Playhead ปัจจุบัน"
            >
              ✂️
            </button>
            <button
              type="button"
              className="tool-btn add-manual-cut-btn"
              onClick={() => handleAddManualCut()}
              title="✂️ มาร์กจุดตัดช่วงเสียงที่พูดผิดหรือ Dead Air ตรงตำแหน่ง Playhead ปัจจุบัน"
            >
              ✂️ + ตัดเสียงผิด
            </button>
            <button
              type="button"
              className="tool-btn in-out-btn"
              onClick={() => setTrimStart(Math.min(trimEnd - 0.2, currentTime))}
              title="ตั้งจุดเริ่มต้น In-point ([ หรือ I)"
            >
              [ In
            </button>
            <button
              type="button"
              className="tool-btn in-out-btn"
              onClick={() => setTrimEnd(Math.max(trimStart + 0.2, currentTime))}
              title="ตั้งจุดสิ้นสุด Out-point (] หรือ O)"
            >
              ] Out
            </button>
            <button
              type="button"
              className={`tool-btn eye-tool ${showSilenceOverlay ? "active" : ""}`}
              onClick={() => setShowSilenceOverlay(!showSilenceOverlay)}
              title="เปิด/ปิดการไฮไลท์แถบ Dead Air"
            >
              👁️
            </button>
            <button
              type="button"
              className="tool-btn delete-tool"
              onClick={() => {
                setTrimStart(0);
                setTrimEnd(duration);
              }}
              title="รีเซ็ต Trim กลับค่าเต็มความยาว"
            >
              🗑️
            </button>
          </div>

          <div className="toolbar-right">
            {/* Timeline Zoom Slider */}
            <div className="timeline-zoom-controls">
              <span className="zoom-label">Zoom:</span>
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setTimelineZoom((z) => Math.max(1, z - 0.5))}
              >
                ⊖
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.25}
                value={timelineZoom}
                onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
                className="zoom-slider"
              />
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setTimelineZoom((z) => Math.min(3, z + 0.5))}
              >
                ⊕
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Tracks Area */}
        <div className="tracks-scroll-viewport">
          <div
            ref={tracksContentRef}
            className="tracks-content"
            style={{ width: `${timelineZoom * 100}%` }}
            onMouseDown={handleTimelineMouseDown}
          >
            {/* 1. Time Ruler */}
            <div className="timeline-ruler">
              {rulerTicks.map((tick) => (
                <div
                  key={tick}
                  className="ruler-tick"
                  style={{ left: `${(tick / (duration || 1)) * 100}%` }}
                >
                  <span className="ruler-time">{formatSeconds(tick)}</span>
                </div>
              ))}
            </div>

            {/* 2. Video Filmstrip Track */}
            <div className="filmstrip-track">
              <div className="filmstrip-frames">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="filmstrip-frame">
                    <span className="frame-idx">#{(i + 1).toString().padStart(2, "0")}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="audio-track-selector-row" role="group" aria-label="Audio track selection">
              <label htmlFor="dead-air-video-source">🎬 Video source:</label>
              {analysisVideoSources.length > 1 ? (
                <select
                  id="dead-air-video-source"
                  value={selectedAnalysisTrackId ?? analysisVideoSources[0]?.trackId ?? ""}
                  disabled={isAnalyzing}
                  onChange={(e) => {
                    setSelectedAnalysisTrackId(e.target.value || null);
                    setAudioTracks([]);
                    setSelectedAudioStreamIndex(null);
                    setWaveformBins([]);
                    setSilenceSegments([]);
                    setHasAnalyzedDeadAir(false);
                    setAnalysisError(null);
                  }}
                >
                  {analysisVideoSources.map((source) => (
                    <option key={source.trackId} value={source.trackId}>
                      {source.trackName} · {source.name}
                    </option>
                  ))}
                </select>
              ) : analysisVideoSources.length === 1 ? (
                <span className="audio-track-selected">{analysisVideoSources[0].trackName} · {analysisVideoSources[0].name}</span>
              ) : (
                <span className="audio-track-selected muted">{videoFile?.name || t("ยังไม่มี Video source", "No video source")}</span>
              )}
            </div>
            <div className="audio-track-selector-row" role="group" aria-label="Audio track selection">
              <label htmlFor="dead-air-audio-track">🎚️ {t("Audio Track ที่ใช้ตัด Dead Air:", "Audio track for Dead Air cuts:")}</label>
              {audioTracks.length > 1 ? (
                <select
                  id="dead-air-audio-track"
                  value={selectedAudioStreamIndex ?? ""}
                  disabled={isAnalyzing}
                  onChange={(event) => {
                    const nextStreamIndex = Number(event.target.value);
                    setSelectedAudioStreamIndex(nextStreamIndex);
                    void runCustomSilenceDetection(undefined, undefined, undefined, nextStreamIndex);
                  }}
                >
                  {audioTracks.map((track) => (
                    <option key={track.streamIndex} value={track.streamIndex}>
                      {getAudioTrackLabel(track)}{track.isDefault ? " · default" : ""}
                    </option>
                  ))}
                </select>
              ) : audioTracks.length === 1 ? (
                <span className="audio-track-selected">{getAudioTrackLabel(audioTracks[0])}</span>
              ) : (
                <span className="audio-track-selected muted">{isAnalyzing ? t("กำลังค้นหา Audio Track...", "Finding audio tracks...") : t("ยังไม่พบ Audio Track", "No audio track found")}</span>
              )}
              {analysisError && <span className="audio-track-error" role="alert">{analysisError}</span>}
            </div>

            {/* 3. Audio Waveform Track (Emerald Green on Dark Pine Background) */}
            <div
              className="waveform-track"
              ref={waveformTrackRef}
              onPointerDown={handleWaveformPointerDown}
              onPointerMove={handleWaveformPointerMove}
              onPointerUp={handleWaveformPointerUp}
              onPointerCancel={handleWaveformPointerCancel}
              onDoubleClick={(e) => {
                if (duration <= 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pct = Math.max(0, Math.min(1, clickX / rect.width));
                handleAddManualCut(pct * duration);
              }}
              title={t("ลากบนกราฟเสียงเพื่อเลือกช่วงตัดเอง • ดับเบิลคลิกเพื่อเพิ่มจุดตัด 1 วินาที • คลิก ✕ เพื่อยกเลิก", "Drag on the waveform to choose a cut range • double-click to add a 1-second cut • click ✕ to cancel")}
            >
              <div className="waveform-bars">
                {displayedWaveformBins.length > 0 ? (
                  displayedWaveformBins.map((bin, idx) => (
                    <div
                      key={idx}
                      className={`waveform-bar ${bin.isSilence ? "silence-bar" : "speech-bar"}`}
                      style={{
                        "--waveform-positive": `${Math.max(0, bin.max) * 100}%`,
                        "--waveform-negative": `${Math.max(0, -bin.min) * 100}%`,
                      } as CSSProperties}
                    />
                  ))
                ) : (
                  <div className="waveform-empty-hint">
                    {isAnalyzing ? t("กำลังประมวลผล Waveform...", "Processing waveform...") : t("กด Analyze เพื่อสร้าง Audio Waveform", "Click Analyze to create an audio waveform")}
                  </div>
                )}
              </div>
              <div className="waveform-center-line" aria-hidden="true" />

              {duration > 0 && (
                <div
                  className="waveform-threshold-line"
                  style={{ top: `${getWaveformThresholdTopPercent(volumeThreshold)}%` }}
                  aria-label={`Dead Air threshold ${volumeThreshold}% (${thresholdDb} dB)`}
                >
                  <span className="threshold-line-badge">
                    Dead Air ≤ {volumeThreshold}% · {thresholdDb} dB
                  </span>
                </div>
              )}

              {manualCutDraft && duration > 0 && (
                <div
                  className="manual-cut-selection"
                  style={{
                    left: `${(Math.min(manualCutDraft.startMs, manualCutDraft.endMs) / 1000 / duration) * 100}%`,
                    width: `${(Math.abs(manualCutDraft.endMs - manualCutDraft.startMs) / 1000 / duration) * 100}%`,
                  }}
                >
                  ✂️ {t("ลากเลือก", "Selected")} {formatSeconds(Math.abs(manualCutDraft.endMs - manualCutDraft.startMs) / 1000)}
                </div>
              )}

              {/* Overlaid Silence / Dead Air markers (Translucent red cut zones) with Cancel Cut button */}
              {showSilenceOverlay &&
                duration > 0 &&
                silenceSegments.map((seg, idx) => {
                  const s = (seg.startMs / 1000 / duration) * 100;
                  const e = ((seg.endMs ? seg.endMs / 1000 : duration) / duration) * 100;
                  const w = Math.max(0.6, e - s);
                  return (
                    <div
                      key={idx}
                      className="timeline-silence-cut-region"
                      style={{ left: `${s}%`, width: `${w}%` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSilenceCut(idx);
                      }}
                      title={`จุดตัด #${idx + 1} (${formatSeconds(seg.startMs / 1000)} - ${formatSeconds(
                        (seg.endMs ?? duration * 1000) / 1000
                      )}) คลิกเพื่อยกเลิกจุดตัดนี้`}
                    >
                      <span className="cut-icon">✂️</span>
                      <button
                        type="button"
                        className="btn-cancel-cut"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSilenceCut(idx);
                        }}
                        title="ยกเลิกจุดตัดนี้ (ไม่ตัดเสียงช่วงนี้)"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}

              {/* Active Trim Boundaries */}
              {duration > 0 && (
                <div
                  className="trim-highlight-range"
                  style={{
                    left: `${(trimStart / duration) * 100}%`,
                    width: `${((trimEnd - trimStart) / duration) * 100}%`,
                  }}
                />
              )}

              {/* Red Playhead Line */}
              {duration > 0 && (
                <div
                  className="timeline-playhead-line"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                >
                  <div className="playhead-handle" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

      {/* Bottom Actions & Render Panel */}
      <div className={`export-controls-panel ${isRenderPanelCollapsed ? "collapsed" : ""}`}>
        {/* Collapsible Panel Header Bar */}
        <div
          className="export-controls-bar-header"
          onClick={() => setIsRenderPanelCollapsed((prev) => !prev)}
          title={isRenderPanelCollapsed ? t("คลิกเพื่อขยายแผงควบคุม Render & Export", "Click to expand Render & Export controls") : t("คลิกเพื่อยุบแผงควบคุม", "Click to collapse controls")}
        >
          <div className="bar-header-title">
            <span className="bar-header-icon">🎬</span>
            <span>{t("แผงควบคุม Render & ส่งออก", "Render & Export controls")}</span>
            <span className="bar-res-badge">
              {nleProject?.canvas?.aspectRatio || aspectRatio} · {nleProject?.canvas?.width || 1080}×{nleProject?.canvas?.height || 1920}
            </span>
            {activeProjectFilePath && (
              <span
                style={{
                  fontSize: "0.74rem",
                  color: "#94a3b8",
                  background: "rgba(30, 41, 59, 0.8)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={activeProjectFilePath}
              >
                📁 {activeProjectFilePath.split(/[/\\]/).pop()}
              </span>
            )}
            {plan && (
              <span className="bar-plan-pill" title={`Plan ID: ${plan.planId}`}>
                ⚡ {t("แผน AI", "AI plan")} {plan.planId.slice(-6)} · {Math.round(plan.trimEndMs / 1000)}s
              </span>
            )}
            {isProcessing && (
              <span className="bar-rendering-pill">
                ⚙️ {t("กำลัง Render...", "Rendering...")}
              </span>
            )}
          </div>

          <div className="bar-header-actions" onClick={(e) => e.stopPropagation()}>
            <div className="bar-quick-actions">
              <button
                type="button"
                className="quick-action-btn"
                style={{
                  background: "rgba(14, 165, 233, 0.15)",
                  borderColor: "rgba(56, 189, 248, 0.4)",
                  color: "#38bdf8",
                }}
                onClick={() => setIsProjectSettingsOpen(true)}
                title="ตั้งค่าสัดส่วนภาพ ความละเอียด และ FPS"
              >
                ⚙️ ตั้งค่า
              </button>

              <button
                type="button"
                className="quick-action-btn"
                style={{
                  background: "rgba(16, 185, 129, 0.18)",
                  borderColor: "rgba(52, 211, 153, 0.4)",
                  color: "#34d399",
                }}
                onClick={() => void handleSaveProject(false)}
                title="บันทึกโปรเจกต์ลงไฟล์ทันที (Ctrl+S / Cmd+S)"
              >
                💾 บันทึก
              </button>

              {/* Requirement 2: ต้องมีปุ่ม Render แบบ Remotion */}
              <button
                type="button"
                className="quick-action-btn remotion-quick-btn"
                onClick={handleRemotionRender}
                disabled={isBusy}
                title="Render วิดีโอรวมทุกองค์ประกอบด้วย Remotion (Full Composition NLE)"
              >
                ⚛️ Render Remotion
              </button>

              <button
                type="button"
                className="quick-action-btn deadair-quick-btn"
                disabled={isProcessing || duration === 0}
                onClick={() => void handleProcessVideo(true)}
                title="ตัดช่วงเงียบ (Dead Air) อัตโนมัติ เน้นเสียงพูดกระชับ"
              >
                ⚡ ตัด Dead Air
              </button>

              <button
                type="button"
                className="quick-action-btn normal-quick-btn"
                disabled={isProcessing || duration === 0}
                onClick={() => void handleProcessVideo(false)}
                title="Render ปกติ (ไม่ตัด Dead Air)"
              >
                🎬 Render ปกติ
              </button>

              <button
                type="button"
                className="quick-action-btn"
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  borderColor: "rgba(148, 163, 184, 0.3)",
                  color: "#cbd5e1",
                }}
                onClick={() => setIsRenderModalOpen(true)}
                title="เปิดหน้าต่างตัวเลือก Render ทั้งหมด"
              >
                🚀 ตัวเลือก Export
              </button>
            </div>

            <button
              type="button"
              className="bar-toggle-btn"
              onClick={() => setIsRenderPanelCollapsed((prev) => !prev)}
              title={isRenderPanelCollapsed ? "ขยายแผง Render" : "ยุบแผง Render"}
            >
              {isRenderPanelCollapsed ? "▲ ขยายแผง" : "▼ ยุบแผง"}
            </button>
          </div>
        </div>

        {/* Collapsible Panel Body */}
        {!isRenderPanelCollapsed && (
          <div className="export-controls-bar-body">
            {/* Remotion Pro Render Card */}
            <div className="panel-remotion-card">
              <div className="remotion-card-header">
                <span className="remotion-icon">⚛️</span>
                <div>
                  <h4>Render แบบ Remotion (Full NLE Composition)</h4>
                  <p>
                    รวมทุกองค์ประกอบบน Timeline ออกมาเป็นคลิปเดียว: ซับไตเติล (Subtitles), ข้อความ Text Overlays, Three.js / CSS Overlays, ซาวด์เอฟเฟกต์ และมัลติแทร็กเสียง
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-remotion-render-main"
                  disabled={isBusy}
                  onClick={handleRemotionRender}
                  title="เริ่มส่งงาน Render ด้วย Remotion Engine รวมทุกเลเยอร์"
                >
                  ⚛️ {isBusy ? "⏳ กำลังประมวลผล..." : "Render แบบ Remotion"}
                </button>
              </div>
            </div>

            {/* Fast FFmpeg Direct Cut Section */}
            <div className="panel-ffmpeg-group">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 300px" }}>
                  <input
                    type="text"
                    className="export-title-input"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="ชื่อคลิปที่จะบันทึก..."
                    style={{ margin: 0, flex: 1 }}
                  />
                  {onBuildPlan && (
                    <button
                      type="button"
                      className="ai-build-pill-btn"
                    onClick={() => void prepareQueuedRender(onBuildPlan)}
                      disabled={isBusy}
                      title="สร้างแผนตัดต่อ Preprocessing Plan ด้วยพารามิเตอร์ปัจจุบัน"
                    >
                      {isBusy ? "⏳ กำลังสร้าง..." : "⚡ สร้างแผนตัดต่อ AI"}
                    </button>
                  )}
                  {plan && onSubmitJob && (
                    <button
                      type="button"
                      className="ai-submit-queue-btn"
                      onClick={() => void prepareQueuedRender(onSubmitJob)}
                      disabled={!canSubmitJob || isBusy}
                      title="ส่งแผน AI เข้า Worker GPU Queue"
                    >
                      🚀 ส่ง GPU Queue
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="render-clip-btn render-btn-deadair"
                    style={{
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                      padding: "6px 14px",
                      fontSize: "0.82rem",
                    }}
                    disabled={isProcessing || duration === 0}
                    onClick={() => void handleProcessVideo(true)}
                    title="ตัดช่วงเงียบ (Dead Air) อัตโนมัติ เน้นเสียงพูดกระชับ (FFmpeg Native Cut)"
                  >
                    {isProcessing && lastRenderHadDeadAirCut ? "⚙️ กำลัง Render..." : "⚡ Render ตัด Dead Air (FFmpeg)"}
                  </button>

                  <button
                    type="button"
                    className="render-clip-btn render-btn-normal"
                    style={{
                      background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                      boxShadow: "0 4px 14px rgba(59, 130, 246, 0.35)",
                      padding: "6px 14px",
                      fontSize: "0.82rem",
                    }}
                    disabled={isProcessing || duration === 0}
                    onClick={() => void handleProcessVideo(false)}
                    title="Render วิดีโอเต็มคลิปหรือตามช่วง Trim โดยไม่ตัดต่อเสียงช่วงเงียบ"
                  >
                    {isProcessing && !lastRenderHadDeadAirCut ? "⚙️ กำลัง Render..." : "🎬 Render ปกติ (FFmpeg)"}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.74rem", color: "#94a3b8" }}>
                <span>💡 FFmpeg ด้านบนส่งออกเฉพาะคลิปต้นฉบับตาม Trim / Reframe / Dead Air (ความเร็วสูง) หากต้องการรวม Subtitle & Overlay ให้ใช้ <strong>Render แบบ Remotion</strong></span>
                <span style={{ cursor: "pointer", color: "#60a5fa", textDecoration: "underline" }} onClick={() => void handleSaveProject(true)}>
                  💾 บันทึกเป็น (Save As...)
                </span>
              </div>
            </div>

            {/* Render Result Action Card */}
            {processResult && (
              <div className="render-success-card" style={{ marginTop: "4px" }}>
                <div className="render-success-header">
                  <span className="success-badge-icon">✅</span>
                  <div className="render-success-meta">
                    <h4>
                      Render เสร็จสมบูรณ์: <strong>{processResult.fileName}</strong>{" "}
                      <span style={{ fontSize: "0.82em", fontWeight: 600, color: lastRenderHadDeadAirCut ? "#34d399" : "#60a5fa" }}>
                        ({lastRenderHadDeadAirCut ? "⚡ ตัด Dead Air กระชับเสียงพูด" : "🎬 Render ปกติไม่ตัด Dead Air"})
                      </span>
                    </h4>
                    <p>
                      ความยาว: <strong>{formatSeconds(processResult.durationMs / 1000)}</strong>
                      {lastRenderHadDeadAirCut && (
                        <>
                          {" "}· ตัด Dead Air ไป{" "}
                          <strong>{processResult.silenceCutCount} จุด</strong> (ประหยัดเวลา{" "}
                          {(processResult.timeSavedMs / 1000).toFixed(1)}s)
                        </>
                      )}
                      {" "}· ขนาด: <strong>{formatBytes(processResult.sizeBytes)}</strong>
                      {processResult.mediaDebugLogPath && (
                        <><br />🔎 Debug: <strong title={processResult.mediaDebugLogPath}>{processResult.mediaDebugLogPath}</strong></>
                      )}
                    </p>
                  </div>
                </div>

                <div className="render-action-btn-row">
                  <button
                    type="button"
                    className="render-action-btn btn-download-file"
                    onClick={() => void handleDownloadRenderedFile()}
                    title="เลือกตำแหน่งโฟลเดอร์และบันทึกไฟล์ MP4 ลงเครื่อง"
                  >
                    📥 บันทึกไฟล์ลงเครื่อง (Download / Save As)
                  </button>

                  <button
                    type="button"
                    className="render-action-btn btn-open-folder"
                    onClick={() => void handleOpenRenderFolder()}
                    title="เปิดโฟลเดอร์ในเครื่องที่เก็บไฟล์นี้ (Windows Explorer)"
                  >
                    📂 เปิดโฟลเดอร์ไฟล์ (Open Folder)
                  </button>

                  <button
                    type="button"
                    className="render-action-btn btn-play-result"
                    onClick={handlePlayRenderedVideo}
                    title="เปิดเล่นวิดีโอผลลัพธ์ที่เพิ่ง Render เสร็จทันทีใน Player"
                  >
                    🎬 เล่นวิดีโอผลลัพธ์ (Play Result)
                  </button>

                  <button
                    type="button"
                    className="render-action-btn btn-upload-cloud"
                    disabled={isUploading}
                    onClick={() => void handleUploadToLibrary()}
                    title="ส่งไฟล์ขึ้นระบบคลังสื่อ SmartAIHub Cloud"
                  >
                    {isUploading ? "☁️ กำลังส่งขึ้น Cloud..." : "🚀 ส่งเข้า Library ที่ smartaihub.app"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Result Status Notifications */}
      {processError && (
        <div className="status-notification error">
          <span>⚠️ {processError}</span>
        </div>
      )}
      {uploadError && (
        <div className="status-notification error">
          <span>⚠️ {uploadError}</span>
        </div>
      )}
      {uploadResult && (
        <div className="status-notification upload-success">
          <span>🎉 {uploadResult.message} · Title: <strong>{uploadResult.title}</strong></span>
        </div>
      )}

      {/* Pro NLE Modals */}
      <AutoSubtitleModal
        isOpen={isAutoSubModalOpen}
        onClose={() => setIsAutoSubModalOpen(false)}
        videoDurationMs={Math.round(duration * 1000)}
        sourceVideoFile={videoFile}
        onApplySubtitles={handleApplySubtitles}
      />

      {nleProject && (
        <VoiceGuidedVisualMatchModal
          isOpen={isVoiceGuidedVisualMatchOpen}
          onClose={() => setIsVoiceGuidedVisualMatchOpen(false)}
          project={nleProject}
          onApplyPlan={(plan, mode) => {
            try {
              setVisualMatchUndoProject(nleProject);
              setNleProject(applyVoiceGuidedVisualPlan(nleProject, plan, mode));
              setIsVoiceGuidedVisualMatchOpen(false);
              setProjectStatusMsg(t("จับคู่ภาพกับเสียงเรียบร้อยแล้ว สามารถ Undo ได้", "Visual match applied. You can undo it."));
            } catch (error) {
              setProjectStatusMsg(error instanceof Error && error.message === "VISUAL_MATCH_PREVIEW_STALE"
                ? t("Preview นี้เก่าแล้ว กรุณาวิเคราะห์ใหม่ก่อนยืนยัน", "This preview is stale. Analyze again before applying.")
                : t("ใช้ผลจับคู่ภาพไม่สำเร็จ", "Could not apply the visual match."));
            }
          }}
          undoProject={visualMatchUndoProject}
          onUndo={() => {
            if (!visualMatchUndoProject) return;
            setNleProject(visualMatchUndoProject);
            setVisualMatchUndoProject(null);
            setProjectStatusMsg(t("ยกเลิกการจับคู่ภาพแล้ว", "Visual match undone."));
          }}
        />
      )}

      <CodeOverlayModal
        isOpen={isCodeOverlayModalOpen}
        onClose={() => setIsCodeOverlayModalOpen(false)}
        currentTimeMs={Math.round(currentTime * 1000)}
        onAddCodeOverlay={handleAddCodeOverlay}
      />

      <AssetDrawerPanel
        isOpen={isAssetDrawerOpen}
        onClose={() => setIsAssetDrawerOpen(false)}
        onOpenBin={() => {
          setIsAssetDrawerOpen(false);
          setIsMediaBinOpen(true);
        }}
        currentTimeMs={Math.round(currentTime * 1000)}
        seriesId={seriesId}
        onAddClip={handleAddAssetClip}
        sourceVideoFile={videoFile}
        projectAssets={nleProject?.mediaPool || []}
      />

      {nleProject && (
        <AutoAudioScoringModal
          isOpen={isAudioScoringModalOpen}
          onClose={() => setIsAudioScoringModalOpen(false)}
          project={nleProject}
          seriesId={seriesId}
          workspacePath={workspacePath}
          onApplyScoredProject={(updated) => {
            setNleProject(updated);
            setProjectStatusMsg("🎵 วางเพลงประกอบ MiniMax Music 3 และ SFX ลง Timeline เรียบร้อย");
            setTimeout(() => setProjectStatusMsg(null), 5000);
          }}
        />
      )}

      {/* Render & Export Studio Popup Modal */}
      {isRenderModalOpen && (
        <div className="nle-modal-backdrop" onClick={() => setIsRenderModalOpen(false)}>
          <div
            className="project-settings-modal"
            style={{ maxWidth: "700px", width: "92%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="project-settings-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid rgba(148, 163, 184, 0.15)" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, color: "#f8fafc", fontSize: "1.1rem" }}>
                <span>🚀</span> Render & Export Studio
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsRenderModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>

            <div className="project-settings-body" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Output Filename Input */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                  ชื่อคลิปที่จะบันทึก (Output Filename):
                </label>
                <input
                  type="text"
                  className="export-title-input"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="ชื่อคลิปที่จะบันทึก..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc" }}
                />
              </div>

              {/* Resolution & Canvas Specs Summary Card */}
              <div
                className="render-canvas-info-card"
                style={{
                  background: "linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%)",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>
                    📐 ขนาดและความละเอียดพิกเซลที่จะ Render (Render Canvas Specs):
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#38bdf8", fontFamily: "monospace" }}>
                      {nleProject?.canvas?.width || 1080} × {nleProject?.canvas?.height || 1920} px
                    </span>
                    <span style={{ fontSize: "0.76rem", padding: "2px 8px", borderRadius: "4px", background: "rgba(56, 189, 248, 0.2)", color: "#38bdf8", fontWeight: 700 }}>
                      สัดส่วน {nleProject?.canvas?.aspectRatio || aspectRatio}
                    </span>
                    <span style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                      · {nleProject?.canvas?.fps || 30} FPS · 48 kHz AAC
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsRenderModalOpen(false);
                    setIsProjectSettingsOpen(true);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    background: "rgba(51, 65, 85, 0.7)",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    color: "#38bdf8",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  title="เปิดหน้าต่างแก้ไขขนาดความละเอียดและสัดส่วนโปรเจกต์"
                >
                  ⚙️ แก้ไขตั้งค่าโปรเจกต์
                </button>
              </div>

              {/* Remotion Full Composition Render Section (High Priority for Subtitles & Overlays) */}
              <div
                className="remotion-render-section"
                style={{
                  background: "linear-gradient(135deg, rgba(88, 28, 135, 0.35) 0%, rgba(30, 27, 75, 0.6) 100%)",
                  border: "1px solid rgba(168, 85, 247, 0.45)",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  boxShadow: "0 4px 14px rgba(126, 34, 206, 0.25)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "1.2rem" }}>⚛️</span>
                  <h4 style={{ margin: 0, color: "#e9d5ff", fontSize: "0.95rem", fontWeight: 700 }}>
                    Render รวมทุกองค์ประกอบด้วย Remotion (Full NLE Composition Render)
                  </h4>
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.78rem", color: "#c084fc", lineHeight: 1.45 }}>
                  ใช้ตัวเลือกนี้เมื่อโปรเจกต์มี <strong>ซับไตเติล (Subtitle), ข้อความ Text Overlay, 3D / CSS Overlay (React / Three.js / SVG), ซาวด์/เพลงประกอบ MiniMax หรือ Blur</strong> เพื่อรวมทุกแทร็กบน Timeline ออกมาเป็นวิดีโอสมบูรณ์แบบ
                </p>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn-remotion-render"
                    onClick={() => {
                      setIsRenderModalOpen(false);
                      // Queue results are reported by the Worker job monitor;
                      // keep the result/download surface visible while that
                      // artifact is being produced instead of leaving it
                      // hidden behind the collapsed panel.
                      setIsRenderPanelCollapsed(false);
                      if (onSubmitJob) {
                        void prepareQueuedRender(onSubmitJob);
                      } else if (onBuildPlan) {
                        void prepareQueuedRender(onBuildPlan);
                      } else {
                        alert("โปรดสร้างแผนตัดต่อหรือเลือกวิดีโอก่อนส่ง Render ด้วย Remotion GPU Worker Queue");
                      }
                    }}
                    disabled={isBusy}
                    style={{
                      flex: "1 1 240px",
                      background: "linear-gradient(135deg, #7e22ce 0%, #6b21a8 100%)",
                      border: "1px solid rgba(192, 132, 252, 0.5)",
                      boxShadow: "0 4px 14px rgba(126, 34, 206, 0.35)",
                      color: "#ffffff",
                      padding: "10px 18px",
                      borderRadius: "6px",
                      fontWeight: 700,
                      fontSize: "0.86rem",
                      cursor: isBusy ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                    title="ส่งงานเข้า Remotion Engine รวมซับไตเติล, Text Overlays, Audio Tracks และ React / Three.js Overlays ครบถ้วน"
                  >
                    <span>⚛️</span> {isBusy ? "⏳ กำลังส่งงาน Remotion..." : "🚀 Render รวมทุกองค์ประกอบด้วย Remotion (Full Composition)"}
                  </button>
                  <div style={{ fontSize: "0.74rem", color: "#a855f7", flex: "1 1 180px" }}>
                    ✨ รองรับ React, Subtitle, Audio Music & Three.js Overlays ครบถ้วน
                  </div>
                </div>
              </div>

              {/* Warning Notice Box for Direct FFmpeg Render */}
              <div
                style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                <div style={{ fontSize: "0.78rem", color: "#fbbf24", lineHeight: 1.45 }}>
                  <strong>คำเตือน:</strong> การ Render ตัด Dead Air / Render ปกติ ด้วย FFmpeg ด้านล่าง เป็นการส่งออกเฉพาะคลิปต้นฉบับความเร็วสูง <strong>จะไม่รวมข้อมูล Subtitle, ข้อความ Text Overlay, ซาวด์เอฟเฟกต์ หรือ 3D/CSS Overlays (React / CSS / Three.js) บน Timeline ไปด้วย</strong> (หากต้องการรวมข้อมูลเหล่านี้ ให้ใช้ปุ่ม Render ด้วย Remotion ด้านบน)
                </div>
              </div>

              {/* Live Render Duration Breakdown Card */}
              <div
                className="render-breakdown-card"
                style={{
                  background: "rgba(15, 23, 42, 0.85)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>⏱️</span> สรุปความยาวคลิปที่จะได้หลัง Render ต้นฉบับ:
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                    ความยาวต้นฉบับ: <strong style={{ color: "#e2e8f0" }}>{formatSmpteTime(duration)}</strong> ({formatSeconds(duration)})
                  </span>
                </div>

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {/* Option A: Render Cut Dead Air */}
                  <div
                    style={{
                      flex: "1 1 200px",
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      borderLeft: "4px solid #10b981",
                    }}
                  >
                    <div style={{ color: "#34d399", fontWeight: 700, fontSize: "0.84rem" }}>
                      ⚡ ความยาวหลังตัด Dead Air + Trim + สปีด ({playbackRate.toFixed(2)}x):
                    </div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#ffffff", marginTop: "3px" }}>
                      {formatSmpteTime(finalCutRenderDurationSec)}{" "}
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#a7f3d0" }}>
                        ({formatSeconds(finalCutRenderDurationSec)})
                      </span>
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: "2px" }}>
                      {totalCutTimeSavedSec > 0
                        ? `ประหยัดเวลาได้ -${totalCutTimeSavedSec.toFixed(1)}s (ตัด ${cutCount} ช่วง)`
                        : "ไม่มีช่วงตัด"}
                    </div>
                  </div>

                  {/* Option B: Render Normal */}
                  <div
                    style={{
                      flex: "1 1 200px",
                      background: "rgba(59, 130, 246, 0.12)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      borderLeft: "4px solid #3b82f6",
                    }}
                  >
                    <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: "0.84rem" }}>
                      🎬 ความยาวกรณี Render ปกติ + สปีด ({playbackRate.toFixed(2)}x):
                    </div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#ffffff", marginTop: "3px" }}>
                      {formatSmpteTime(finalNormalRenderDurationSec)}{" "}
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#bfdbfe" }}>
                        ({formatSeconds(finalNormalRenderDurationSec)})
                      </span>
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: "2px" }}>
                      {trimStart > 0 || (trimEnd > 0 && trimEnd < duration) ? "มี Trim หัว/ท้าย" : "ตามความยาวคลิปเต็ม"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="render-buttons-group" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="render-clip-btn render-btn-deadair"
                  style={{
                    flex: "1 1 200px",
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                    padding: "10px 16px",
                    borderRadius: "6px",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: duration === 0 || isProcessing ? "not-allowed" : "pointer",
                    border: "none",
                  }}
                  disabled={isProcessing || duration === 0}
                  onClick={() => void handleProcessVideo(true)}
                  title="ตัดช่วงเงียบ (Dead Air) อัตโนมัติ เฉพาะคลิปต้นฉบับ"
                >
                  {isProcessing && lastRenderHadDeadAirCut ? "⚙️ กำลัง Render..." : "⚡ Render ต้นฉบับตัด Dead Air"}
                </button>

                <button
                  type="button"
                  className="render-clip-btn render-btn-normal"
                  style={{
                    flex: "1 1 200px",
                    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    boxShadow: "0 4px 14px rgba(59, 130, 246, 0.35)",
                    padding: "10px 16px",
                    borderRadius: "6px",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: duration === 0 || isProcessing ? "not-allowed" : "pointer",
                    border: "none",
                  }}
                  disabled={isProcessing || duration === 0}
                  onClick={() => void handleProcessVideo(false)}
                  title="Render คลิปต้นฉบับเต็มหรือตามช่วงที่ Trim"
                >
                  {isProcessing && !lastRenderHadDeadAirCut ? "⚙️ กำลัง Render..." : "🎬 Render ต้นฉบับปกติ (ไม่ตัด Dead Air)"}
                </button>
              </div>

              {/* Render Result Action Card with Download, Reveal Folder, and Play buttons */}
              {processResult && (
                <div className="render-success-card" style={{ marginTop: "10px" }}>
                  <div className="render-success-header">
                    <span className="success-badge-icon">✅</span>
                    <div className="render-success-meta">
                      <h4>
                        Render เสร็จสมบูรณ์: <strong>{processResult.fileName}</strong>{" "}
                        <span style={{ fontSize: "0.82em", fontWeight: 600, color: lastRenderHadDeadAirCut ? "#34d399" : "#60a5fa" }}>
                          ({lastRenderHadDeadAirCut ? "⚡ ตัด Dead Air กระชับเสียงพูด" : "🎬 Render ปกติไม่ตัด Dead Air"})
                        </span>
                      </h4>
                      <p>
                        ความยาว: <strong>{formatSeconds(processResult.durationMs / 1000)}</strong>
                        {lastRenderHadDeadAirCut && (
                          <>
                            {" "}· ตัด Dead Air ไป{" "}
                            <strong>{processResult.silenceCutCount} จุด</strong> (ประหยัดเวลา{" "}
                            {(processResult.timeSavedMs / 1000).toFixed(1)}s)
                          </>
                        )}
                        {" "}· ขนาด: <strong>{formatBytes(processResult.sizeBytes)}</strong>
                        {processResult.mediaDebugLogPath && (
                          <><br />🔎 Debug: <strong title={processResult.mediaDebugLogPath}>{processResult.mediaDebugLogPath}</strong></>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="render-action-btn-row" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                    <button
                      type="button"
                      className="render-action-btn btn-download-file"
                      onClick={() => void handleDownloadRenderedFile()}
                      title="เลือกตำแหน่งโฟลเดอร์และบันทึกไฟล์ MP4 ลงเครื่อง"
                    >
                      📥 บันทึกไฟล์ลงเครื่อง (Download / Save As)
                    </button>

                    <button
                      type="button"
                      className="render-action-btn btn-open-folder"
                      onClick={() => void handleOpenRenderFolder()}
                      title="เปิดโฟลเดอร์ในเครื่องที่เก็บไฟล์นี้ (Windows Explorer)"
                    >
                      📂 เปิดโฟลเดอร์ไฟล์ (Open Folder)
                    </button>

                    <button
                      type="button"
                      className="render-action-btn btn-play-result"
                      onClick={handlePlayRenderedVideo}
                      title="เปิดเล่นวิดีโอผลลัพธ์ที่เพิ่ง Render เสร็จทันทีใน Player"
                    >
                      🎬 เล่นวิดีโอผลลัพธ์ (Play Result)
                    </button>

                    <button
                      type="button"
                      className="render-action-btn btn-upload-cloud"
                      disabled={isUploading}
                      onClick={() => void handleUploadToLibrary()}
                      title="ส่งไฟล์ขึ้นระบบคลังสื่อ SmartAIHub Cloud"
                    >
                      {isUploading ? "☁️ กำลังส่งขึ้น Cloud..." : "🚀 ส่งเข้า Library ที่ smartaihub.app"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Project Settings Modal */}
      <ProjectSettingsModal
        isOpen={isProjectSettingsOpen}
        onClose={() => setIsProjectSettingsOpen(false)}
        project={nleProject}
        currentAspectRatio={aspectRatio}
        onSaveSettings={handleSaveProjectSettings}
      />

      {/* Text Overlay Designer Modal */}
      <TextOverlayModal
        isOpen={isTextModalOpen}
        onClose={() => setIsTextModalOpen(false)}
        currentTimeMs={Math.round(currentTime * 1000)}
        onAddTextClip={handleAddTextClip}
      />

      {/* Stock SVG Library Modal */}
      <StockSvgModal
        isOpen={isSvgModalOpen}
        onClose={() => setIsSvgModalOpen(false)}
        currentTimeMs={Math.round(currentTime * 1000)}
        onAddSvgClip={handleAddSvgClip}
      />

      {/* Blur / Privacy Censor Overlay Modal */}
      <BlurOverlayModal
        isOpen={isBlurModalOpen}
        onClose={() => setIsBlurModalOpen(false)}
        currentTimeMs={Math.round(currentTime * 1000)}
        onAddBlurClip={handleAddBlurClip}
        currentFocusX={focusX ?? 0.5}
        currentFocusY={focusY ?? 0.5}
        productPin={productPin}
      />

      {/* Voiceover Studio Recording Modal */}
      <VoiceoverRecordModal
        isOpen={isVoiceoverModalOpen}
        onClose={() => setIsVoiceoverModalOpen(false)}
        currentTimeMs={Math.round(currentTime * 1000)}
        videoDurationMs={Math.round(duration * 1000)}
        onAddAudioClip={handleAddVoiceoverClip}
        onSyncPlayVideo={handleSyncPlayVideo}
      />

      {/* AI Media Studio & Generation Modal */}
      <AiMediaStudioModal
        isOpen={isAiStudioModalOpen}
        onClose={() => setIsAiStudioModalOpen(false)}
        currentTimeMs={Math.round(currentTime * 1000)}
        onAddMediaClip={handleAddAiMediaClip}
      />
    </div>
  );
}
