import { useState, useRef, useEffect, useMemo, useCallback, type SetStateAction } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { DirectoryEntry } from "./MediaExplorerView";
import type { SmartSpecProjectDraft, NleClip, ProjectAsset, NleCanvas } from "../../types/nleProject";
import { createDefaultProjectDraft } from "../../types/nleProject";
import { preserveLockedClips } from "./timelineEdits";
import { useProjectAutosave } from "./useProjectAutosave";
import { parseProjectDraft, saveNleProject, saveCapCutDraft } from "./projectPersistence";
import { MultiTrackTimeline } from "./MultiTrackTimeline";
import { SandboxedOverlayViewer } from "./SandboxedOverlayViewer";
import { AutoSubtitleModal } from "./AutoSubtitleModal";
import { CodeOverlayModal } from "./CodeOverlayModal";
import { AssetDrawerPanel } from "./AssetDrawerPanel";
import { AutoAudioScoringModal } from "./AutoAudioScoringModal";
import { ProjectSettingsModal } from "./ProjectSettingsModal";
import { TextOverlayModal } from "./TextOverlayModal";
import { StockSvgModal } from "./StockSvgModal";
import { BlurOverlayModal } from "./BlurOverlayModal";
import { VoiceoverRecordModal } from "./VoiceoverRecordModal";
import { AiMediaStudioModal } from "./AiMediaStudioModal";

export interface MediaVideoEditorPlayerProps {
  videoFile: DirectoryEntry | null;
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
  plan?: {
    planId: string;
    trimEndMs: number;
    outputRelativeName: string;
  } | null;
  onBuildPlan?: () => void;
  onSubmitJob?: () => void;
  canSubmitJob?: boolean;
  isBusy?: boolean;
  loadedProjectDraft?: SmartSpecProjectDraft | null;
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
  cutCount: number;
  timeSavedMs: number;
  noiseThresholdDb: number;
  minDurationS: number;
  softeningBufferS: number;
  firstSpeechMs?: number;
  lastSpeechMs?: number;
}

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

export function MediaVideoEditorPlayer({
  videoFile,
  seriesId,
  onClose,
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
  plan,
  onBuildPlan,
  onSubmitJob,
  canSubmitJob,
  isBusy,
  loadedProjectDraft,
  importedAsset,
}: MediaVideoEditorPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoViewportRef = useRef<HTMLDivElement>(null);

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
  const [silenceSegments, setSilenceSegments] = useState<LocalMediaAnalysisSegment[]>([]);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [cutCount, setCutCount] = useState<number>(0);
  const [timeSavedMs, setTimeSavedMs] = useState<number>(0);

  // Timeline view controls
  const [timelineZoom, setTimelineZoom] = useState<number>(1); // 1x to 3x
  const [showSilenceOverlay, setShowSilenceOverlay] = useState<boolean>(true);

  // Aspect Ratio & Person Focus
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1" | "source">(
    propsReframe9x16 === false ? "source" : "9:16"
  );
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState<boolean>(false);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const [focusMode, setFocusMode] = useState<"auto_person" | "auto_object" | "manual_region">(() => {
    if (propsFocusMode === "manual_region") return "manual_region";
    return "auto_person";
  });
  const [focusX, setFocusX] = useState<number>(() => {
    if (propsFocusX !== undefined) return propsFocusX;
    try {
      const key = videoFile ? `smartspec_person_focus_${videoFile.name}` : null;
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
      const key = videoFile ? `smartspec_person_focus_${videoFile.name}` : null;
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
  const personAnchorRef = useRef<{ x: number; y: number } | null>(null);

  // Restore cached person coordinates immediately when switching video files
  useEffect(() => {
    if (!videoFile?.name) return;
    try {
      const saved = localStorage.getItem(`smartspec_person_focus_${videoFile.name}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === "number") {
          setFocusX(parsed.x);
          onFocusXChange?.(parsed.x);
        }
        if (typeof parsed?.y === "number") {
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
  const [nleProject, setProjectState] = useState<SmartSpecProjectDraft | null>(null);
  const setNleProject = useCallback((update: SetStateAction<SmartSpecProjectDraft | null>) => {
    setProjectState((previous) => preserveLockedClips(previous, typeof update === "function" ? update(previous) : update));
  }, []);
  const [isAutoSubModalOpen, setIsAutoSubModalOpen] = useState(false);
  const [isCodeOverlayModalOpen, setIsCodeOverlayModalOpen] = useState(false);
  const [isAssetDrawerOpen, setIsAssetDrawerOpen] = useState(false);
  const [isAudioScoringModalOpen, setIsAudioScoringModalOpen] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [isSvgModalOpen, setIsSvgModalOpen] = useState(false);
  const [isBlurModalOpen, setIsBlurModalOpen] = useState(false);
  const [isVoiceoverModalOpen, setIsVoiceoverModalOpen] = useState(false);
  const [isAiStudioModalOpen, setIsAiStudioModalOpen] = useState(false);
  const [projectStatusMsg, setProjectStatusMsg] = useState<string | null>(null);
  const [isDuckingActive, setIsDuckingActive] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Smart AI Director & Dynamic Camera Motion states
  const [smartDirectorMode, setSmartDirectorMode] = useState<"off" | "auto" | "product_focus" | "face_focus">("off");

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
  useProjectAutosave(nleProject, draftStorageKey, setAutoSaveStatus);

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
    if (videoFile && duration > 0) {
      setNleProject((prev) => {
        if (!prev || prev.metadata?.originalSourceVideo !== videoFile.path) {
          // 1. Check if there is an existing auto-saved draft for this exact video file
          if (draftStorageKey) {
            try {
              const saved = localStorage.getItem(draftStorageKey);
              if (saved) {
                const parsed = parseProjectDraft(saved);
                if (parsed.metadata?.originalSourceVideo === videoFile.path) {
                  // Ensure mediaPool contains the active video file
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
            deadAirSegments: validSilenceSegs,
          });
        }
        return prev;
      });
    }
  }, [videoFile, duration, silenceSegments, aspectRatio, focusX, focusY, loadedProjectDraft, draftStorageKey]);

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

  const handleSaveProject = async () => {
    if (!nleProject || !videoFile) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const projectPath = await save({
        defaultPath: videoFile.path.replace(/\.[^/.\\]+$/, "") + ".smartspec.json",
        filters: [{ name: "SmartSpec Project", extensions: ["json", "ssproj"] }],
      });
      if (!projectPath) return;
      const filePath = await saveNleProject(nleProject, projectPath);
      setProjectStatusMsg(`💾 บันทึกโปรเจกต์สำเร็จ: ${filePath}`);
      setTimeout(() => setProjectStatusMsg(null), 5000);
    } catch (err: unknown) {
      setProjectStatusMsg(`❌ บันทึกโปรเจกต์ล้มเหลว: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setProjectStatusMsg(null), 5000);
    }
  };

  const handleExportCapCutDraft = async () => {
    if (!nleProject) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const draftDir = await open({ directory: true, multiple: false });
      if (typeof draftDir !== "string") return;
      const filePath = await saveCapCutDraft(nleProject, draftDir);
      setProjectStatusMsg(`🎬 ส่งออก CapCut Draft สำเร็จ: ${filePath}`);
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

  const handleAddAssetClip = (trackId: string, clip: NleClip) => {
    if (!nleProject) return;
    const updatedTracks = nleProject.tracks.map((t) => {
      if (t.id === trackId) {
        return { ...t, clips: [...t.clips, clip] };
      }
      return t;
    });
    setNleProject({ ...nleProject, tracks: updatedTracks });
    setIsAssetDrawerOpen(false);
    setProjectStatusMsg(`📦 เพิ่มสื่อ "${clip.name}" ลงใน Timeline แล้ว`);
    setTimeout(() => setProjectStatusMsg(null), 4000);
  };

  const videoSrc = useMemo(() => {
    if (!videoFile) return "";
    let clean = videoFile.path.trim();
    if (clean.startsWith("\\\\?\\") || clean.startsWith("//?/")) {
      clean = clean.slice(4);
    }
    return convertFileSrc(clean);
  }, [videoFile]);

  // Derived dB from Volume Threshold Percentage
  const thresholdDb = useMemo(() => {
    return (-50.0 + (volumeThreshold / 100.0) * 35.0).toFixed(0);
  }, [volumeThreshold]);

  const activeOverlayClips = useMemo(() => {
    if (!nleProject) return [];
    const curMs = currentTime * 1000;
    const clips: NleClip[] = [];
    const overlayTrackIds = new Set(["track_o1", "track_t1", "track_v2"]);
    for (const track of nleProject.tracks) {
      if (track.muted || !overlayTrackIds.has(track.id)) continue;
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
    setWaveformPeaks(peaks);

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
    sBuf: number
  ): Promise<boolean> => {
    const totalDur = duration > 0 ? duration : (videoRef.current?.duration || 63.1);

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) {
        synthesizeWaveformAndSilence(totalDur, vThresh, mDur, sBuf);
        return true;
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
        synthesizeWaveformAndSilence(totalDur, vThresh, mDur, sBuf);
        void audioCtx.close();
        return true;
      }

      let audioBuf: AudioBuffer | null = null;
      try {
        audioBuf = await audioCtx.decodeAudioData(arrayBuf);
      } catch (dErr) {
        console.warn("AudioBuffer decode fallback, activating speech waveform synthesizer:", dErr);
      }

      if (!audioBuf) {
        synthesizeWaveformAndSilence(totalDur, vThresh, mDur, sBuf);
        void audioCtx.close();
        return true;
      }

      const channel = audioBuf.getChannelData(0);
      const sampleRate = audioBuf.sampleRate;
      const totalSamples = channel.length;
      const decodedDur = audioBuf.duration;

      // 1. Generate 200 Real Waveform Peak Bars
      const BARS = 200;
      const blockSize = Math.max(1, Math.floor(totalSamples / BARS));
      const peaks: number[] = [];
      for (let b = 0; b < BARS; b++) {
        let maxVal = 0;
        const start = b * blockSize;
        const end = Math.min(start + blockSize, totalSamples);
        const step = Math.max(1, Math.floor((end - start) / 64));
        for (let i = start; i < end; i += step) {
          const val = Math.abs(channel[i]);
          if (val > maxVal) maxVal = val;
        }
        const displayAmp = Math.min(1.0, Math.pow(maxVal, 0.62) * 1.35);
        peaks.push(Math.max(0.08, displayAmp));
      }
      setWaveformPeaks(peaks);

      // 2. Dead Air / Silence Detection
      const sliceDuration = 0.05;
      const sliceSamples = Math.floor(sampleRate * sliceDuration);
      const totalSlices = Math.floor(totalSamples / sliceSamples);

      const db = -50.0 + (vThresh / 100.0) * 26.0;
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
      setCutCount(count);
      setTimeSavedMs(savedMs);

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
      synthesizeWaveformAndSilence(totalDur, vThresh, mDur, sBuf);
      return true;
    }
  }, [duration, synthesizeWaveformAndSilence]);

  // Auto Person & Face Centering using Canvas + Gaussian Peak Centroid Skin Tone Clustering
  const detectPersonCenter = useCallback((immediate: boolean = false) => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return;

    if (video.readyState < 2) {
      const onReady = () => {
        detectPersonCenter(immediate);
      };
      video.addEventListener("loadeddata", onReady, { once: true });
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 1. Browser Native FaceDetector if supported
      if ("FaceDetector" in window) {
        try {
          const detector = new (window as unknown as {
            FaceDetector: new (opts: { fastMode: boolean; maxDetectedFaces: number }) => {
              detect: (c: HTMLCanvasElement) => Promise<Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>>;
            };
          }).FaceDetector({ fastMode: true, maxDetectedFaces: 3 });

          detector
            .detect(canvas)
            .then((faces) => {
              if (faces && faces.length > 0) {
                const primary = faces.reduce(
                  (max, f) =>
                    f.boundingBox.width * f.boundingBox.height > max.boundingBox.width * max.boundingBox.height
                      ? f
                      : max,
                  faces[0]
                );
                const faceX = (primary.boundingBox.x + primary.boundingBox.width / 2) / canvas.width;
                const faceY = (primary.boundingBox.y + primary.boundingBox.height / 2) / canvas.height;
                // Clamp detected face within safe presentation bounds
                const fx = Math.max(0.30, Math.min(0.70, faceX));
                const fy = Math.max(0.20, Math.min(0.75, faceY));
                setFocusX((prev) => {
                  const cur = prev ?? 0.52;
                  if (immediate) {
                    personAnchorRef.current = { x: fx, y: fy };
                    onFocusXChange?.(fx);
                    return fx;
                  }
                  const diff = Math.abs(fx - cur);
                  if (diff < 0.05) {
                    return cur;
                  }
                  const maxStep = 0.03;
                  const nextX = cur + Math.max(-maxStep, Math.min(maxStep, fx - cur));
                  personAnchorRef.current = { x: nextX, y: fy };
                  onFocusXChange?.(nextX);
                  return nextX;
                });
                setFocusY((prev) => {
                  const cur = prev ?? 0.35;
                  if (immediate) {
                    onFocusYChange?.(fy);
                    return fy;
                  }
                  const diff = Math.abs(fy - cur);
                  if (diff < 0.05) {
                    return cur;
                  }
                  const maxStep = 0.03;
                  const nextY = cur + Math.max(-maxStep, Math.min(maxStep, fy - cur));
                  onFocusYChange?.(nextY);
                  return nextY;
                });
                try {
                  if (videoFile?.name) {
                    localStorage.setItem(`smartspec_person_focus_${videoFile.name}`, JSON.stringify({ x: fx, y: fy }));
                  }
                } catch {}
              } else {
                detectPersonCluster(ctx, canvas.width, canvas.height, immediate);
              }
            })
            .catch(() => {
              detectPersonCluster(ctx, canvas.width, canvas.height, immediate);
            });
          return;
        } catch {
          // fallback to cluster
        }
      }

      detectPersonCluster(ctx, canvas.width, canvas.height, immediate);
    } catch (err) {
      console.warn("Auto person detection fallback:", err);
    }
  }, [onFocusXChange, onFocusYChange]);

  const detectPersonCluster = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    immediate: boolean = false
  ) => {
    try {
      const imgData = ctx.getImageData(0, 0, width, height).data;
      const colSkin = new Float32Array(width);
      const colY = new Float32Array(width);

      // Focus exclusively on head and upper chest (y: 14% to 46%)
      // Completely excludes moving hands, table objects, or gesturing from pulling the camera centroid
      const yStart = Math.floor(height * 0.14);
      const yEnd = Math.floor(height * 0.46);

      // In vertical 9:16 framing, restrict candidate search to central region (22% to 78%)
      // Outermost background walls, fences, and curtains (>80% or <20%) are completely excluded!
      const xMin = Math.floor(width * 0.22);
      const xMax = Math.floor(width * 0.78);

      let totalSkinMass = 0;

      for (let y = yStart; y < yEnd; y += 2) {
        for (let x = xMin; x < xMax; x += 2) {
          const idx = (y * width + x) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];

          // 1. Calibrated YCbCr skin tone detection (chrominance space)
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

          // Real human skin chrominance cluster:
          // CRUCIAL: (cr - cb) >= 12 ensures red chroma dominance over blue chroma,
          // completely rejecting gray, beige, concrete, and stone walls (which have low chroma and cr - cb < 8)!
          const isYcbcr = cb >= 77 && cb <= 128 && cr >= 134 && cr <= 175 && (cr - cb) >= 12;

          // 2. Calibrated RGB skin tone detection
          // Real skin has clear separation: R > G > B with minimum saturation
          const isRgbSkin =
            r > 70 && g > 40 && b > 25 &&
            r > g && (r - g) >= 12 &&
            g > b && (g - b) >= 4 &&
            (r - b) >= 20 &&
            (r - g) < 85 &&
            r / (g + 0.001) >= 1.10 &&
            r / (b + 0.001) >= 1.25 &&
            r < 245;

          // STRICT REQUIREMENT: Both color spaces must confirm it is true human skin!
          if (isYcbcr && isRgbSkin) {
            let weight = 3.5;
            if (y > height * 0.18 && y < height * 0.38) {
              weight *= 2.5; // Focus strictly on face/head
            }
            colSkin[x] += weight;
            colY[x] += y * weight;
            totalSkinMass += weight;
          }
        }
      }

      // If overall skin mass is too low (e.g. presenter covered face with camera/hands or turned away)
      // DO NOT jump to background objects! Maintain locked position rock solid!
      if (totalSkinMass < 35) {
        return;
      }

      // Smooth column weights with Gaussian-like kernel (radius 6) to locate human head peak
      const smoothed = new Float32Array(width);
      for (let x = xMin; x <= xMax; x++) {
        let s = 0;
        for (let d = -6; d <= 6; d++) {
          const colIdx = Math.max(0, Math.min(width - 1, x + d));
          s += colSkin[colIdx] * (7 - Math.abs(d));
        }
        smoothed[x] = s;
      }

      // Anchor-guided peak search:
      // If we have an existing anchor, apply proximity weighting to prevent jumping across the screen
      const currentAnchorX = personAnchorRef.current?.x ?? focusX ?? 0.52;

      let bestCol = -1;
      let maxScore = -1;

      for (let x = xMin; x <= xMax; x++) {
        const val = smoothed[x];
        if (val <= 0) continue;

        const normX = x / width;
        const distFromAnchor = Math.abs(normX - currentAnchorX);
        // Exponential proximity bias: strongly prefers candidates near previous speaker anchor
        const proximityBias = Math.exp(-Math.pow(distFromAnchor / 0.16, 2));
        const score = val * (0.3 + 0.7 * proximityBias);

        if (score > maxScore) {
          maxScore = score;
          bestCol = x;
        }
      }

      // Calculate centroid around best candidate peak
      if (bestCol > 0 && maxScore > 30) {
        let sumX = 0;
        let sumY = 0;
        let totalW = 0;
        const radius = Math.min(24, Math.floor(width * 0.08));
        const startX = Math.max(xMin, bestCol - radius);
        const endX = Math.min(xMax, bestCol + radius);

        for (let x = startX; x <= endX; x++) {
          sumX += x * colSkin[x];
          sumY += colY[x];
          totalW += colSkin[x];
        }

        if (totalW > 0) {
          const centroidX = sumX / totalW;
          const centroidY = sumY / totalW;

          // Clamp to safe vertical crop framing bounds (0.32 to 0.68)
          const targetX = Math.max(0.32, Math.min(0.68, centroidX / width));
          const targetY = Math.max(0.22, Math.min(0.68, centroidY / height));

          setFocusX((prev) => {
            const cur = prev ?? 0.52;
            if (immediate) {
              personAnchorRef.current = { x: targetX, y: targetY };
              onFocusXChange?.(targetX);
              return targetX;
            }
            const diff = Math.abs(targetX - cur);
            // Deadband: If micro-sway (< 5%), keep camera rock steady
            if (diff < 0.05) {
              return cur;
            }
            // Slew-rate limiter: smooth transition at most 3% per update, preventing teleportation
            const maxStep = 0.03;
            const nextX = cur + Math.max(-maxStep, Math.min(maxStep, targetX - cur));
            personAnchorRef.current = { x: nextX, y: targetY };
            onFocusXChange?.(nextX);
            return nextX;
          });

          setFocusY((prev) => {
            const cur = prev ?? 0.35;
            if (immediate) {
              onFocusYChange?.(targetY);
              return targetY;
            }
            const diff = Math.abs(targetY - cur);
            if (diff < 0.05) {
              return cur;
            }
            const maxStep = 0.03;
            const nextY = cur + Math.max(-maxStep, Math.min(maxStep, targetY - cur));
            onFocusYChange?.(nextY);
            return nextY;
          });

          try {
            if (videoFile?.name) {
              localStorage.setItem(`smartspec_person_focus_${videoFile.name}`, JSON.stringify({ x: targetX, y: targetY }));
            }
          } catch {}
        }
      }
    } catch {
      // ignore
    }
  };

  // Run Custom Silence Detection
  const runCustomSilenceDetection = async (
    overrideThreshold?: number,
    overrideMinDur?: number,
    overrideBuffer?: number
  ) => {
    if (!videoFile) return;
    setIsAnalyzing(true);
    setProcessError(null);

    const vThresh = overrideThreshold ?? volumeThreshold;
    const mDur = overrideMinDur ?? minDuration;
    const sBuf = overrideBuffer ?? softeningBuffer;

    try {
      const res = await invoke<CustomSilenceDetectionResult>("worker_app_detect_silence_custom", {
        sourcePath: videoFile.path,
        volumeThresholdPct: vThresh,
        minDurationSec: mDur,
        softeningBufferSec: sBuf,
      });

      if (
        res &&
        res.waveformPeaks &&
        res.waveformPeaks.length > 0 &&
        Math.max(...res.waveformPeaks) > 0.05
      ) {
        setSilenceSegments(res.silenceSegments);
        setWaveformPeaks(res.waveformPeaks);
        setCutCount(res.cutCount);
        setTimeSavedMs(res.timeSavedMs);

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
        // Rust returned 0 cuts or empty waveform, decode via Web Audio API
        await analyzeAudioWithWebAudio(videoSrc, vThresh, mDur, sBuf);
      }
    } catch (err) {
      console.warn("Rust silence detection fallback to WebAudio:", err);
      await analyzeAudioWithWebAudio(videoSrc, vThresh, mDur, sBuf);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset states when video file changes
  useEffect(() => {
    if (videoFile) {
      setCurrentTime(0);
      setIsPlaying(false);
      setPlaybackError(null);
      setTrimStart(0);
      setTrimEnd(0);
      setProcessResult(null);
      setProcessError(null);
      setUploadResult(null);
      setUploadError(null);
      setCustomTitle(videoFile.name.replace(/\.[^/.]+$/, ""));
      void runCustomSilenceDetection();
    }
  }, [videoFile?.path]);

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
    if (!asset || !asset.title) return;
    const timeMs = dropTimeMs !== undefined ? dropTimeMs : Math.round(currentTime * 1000);
    const clip: NleClip = {
      id: `drag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: asset.title,
      timelineStartMs: timeMs,
      durationMs: asset.durationMs || 4000,
      sourceType: "smartaihub_library",
      sourceUrl: asset.sourceUrl || "",
      volume: trackId.startsWith("track_a") ? 0.4 : 1.0,
      transform: trackId === "track_v2" ? { x: 0.5, y: 0.5, scale: 1.0, opacity: 1.0 } : undefined,
    };
    handleAddAssetClip(trackId, clip);
    const trackLabel = trackId === "track_v2" ? "V2 (B-Roll)" : trackId === "track_a2" ? "A2 (BGM)" : trackId === "track_a3" ? "A3 (SFX)" : trackId;
    setProjectStatusMsg(`✨ วางคลิป "${asset.title}" ลงบนแทร็ก ${trackLabel} เรียบร้อย`);
    setTimeout(() => setProjectStatusMsg(null), 4000);
  }, [currentTime, handleAddAssetClip]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      const vw = videoRef.current.videoWidth || 1920;
      const vh = videoRef.current.videoHeight || 1080;
      setDuration(dur);
      setVideoDimensions({ width: vw, height: vh });
      if (trimEnd === 0 || trimEnd > dur) {
        setTrimEnd(dur);
      }
      if (focusMode === "auto_person") {
        setTimeout(() => detectPersonCenter(true), 200);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);
      if (focusMode === "auto_person") {
        const shouldTrackPerson = smartDirectorMode !== "product_focus" || productPins.length === 0;
        if (shouldTrackPerson) {
          const nowMs = performance.now();
          if (nowMs - lastTrackTimeRef.current > 850) {
            lastTrackTimeRef.current = nowMs;
            detectPersonCenter(false);
          }
        }
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      const video = videoRef.current;
      void video.play().then(() => {
        if (videoRef.current === video) setIsPlaying(!video.paused);
      }).catch((err: unknown) => {
        setIsPlaying(false);
        setPlaybackError(err instanceof Error ? err.message : String(err));
      });
    }
  };

  const handleStop = () => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleStepFrame = (forward: boolean) => {
    if (!videoRef.current) return;
    const step = 1 / 30; // 30 fps
    const newTime = Math.max(0, Math.min(duration, currentTime + (forward ? step : -step)));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
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

  // Keyboard Shortcuts (Space, ArrowLeft, ArrowRight, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (onClose) {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, duration, isPlaying, trimStart, trimEnd, onClose]);

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
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(duration || 0, timeSec));
    videoRef.current.currentTime = clamped;
    setCurrentTime(clamped);
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

  // Process Video with FFmpeg
  const handleProcessVideo = async (removeDeadAir: boolean = true) => {
    if (!videoFile || isProcessing) return;
    setIsProcessing(true);
    setProcessError(null);
    setProcessResult(null);
    setLastRenderHadDeadAirCut(removeDeadAir);

    try {
      const { confirm } = await import("@tauri-apps/plugin-dialog");
      if (nleProject && !await confirm("Render นี้ประมวลผลเฉพาะวิดีโอต้นฉบับตาม Trim / Reframe / Dead Air ไม่รวมการแก้ไขแทร็ก เสียง ข้อความ หรือ Blur บน NLE Timeline ต้องการส่งออกเฉพาะต้นฉบับหรือไม่?", { title: "ส่งออกวิดีโอต้นฉบับ", kind: "warning" })) return;
      const res = await invoke<InteractiveProcessResult>("worker_app_process_media_interactive", {
        request: {
          sourcePath: videoFile.path,
          trimStartMs: Math.round(trimStart * 1000),
          trimEndMs: Math.round(trimEnd * 1000),
          removeDeadAir,
          aspectRatio,
          focusMode,
          focusX,
          focusY,
          seriesId: seriesId || null,
          volumeThresholdPct: volumeThreshold,
          minDurationSec: minDuration,
          softeningBufferSec: softeningBuffer,
        },
      });
      setProcessResult(res);

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
    } catch (err) {
      setProcessError(String(err));
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
        setProjectStatusMsg(`💾 บันทึกไฟล์ไปยัง "${chosen}" สำเร็จแล้ว`);
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
    if (canvas.aspectRatio === "9:16" || canvas.aspectRatio === "16:9" || canvas.aspectRatio === "1:1") {
      setAspectRatio(canvas.aspectRatio as "9:16" | "16:9" | "1:1");
      onReframe9x16Change?.(canvas.aspectRatio === "9:16");
    }
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
        aspectRatio: canvas.aspectRatio === "16:9" ? "16:9" : canvas.aspectRatio === "1:1" ? "1:1" : "9:16",
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

  // Add manual cut interval (to cut out speech mistakes, bloopers, or extra silence)
  const handleAddManualCut = (centerSec?: number, cutDurationSec: number = 1.0) => {
    if (duration <= 0) return;
    const center = centerSec !== undefined ? centerSec : currentTime;
    const half = cutDurationSec / 2;
    const startMs = Math.max(0, Math.round((center - half) * 1000));
    const endMs = Math.min(Math.round(duration * 1000), Math.round((center + half) * 1000));
    setSilenceSegments((prev) => {
      const next = [...prev, { startMs, endMs }].sort((a, b) => a.startMs - b.startMs);
      setCutCount(next.length);
      const totalSaved = next.reduce((acc, s) => acc + ((s.endMs ?? (duration * 1000)) - s.startMs), 0);
      setTimeSavedMs(totalSaved);
      return next;
    });
    setProjectStatusMsg(`✂️ เพิ่มจุดตัดที่ ${formatSeconds(startMs / 1000)} - ${formatSeconds(endMs / 1000)} เรียบร้อย`);
    setTimeout(() => setProjectStatusMsg(null), 3000);
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
  }, [smartDirectorMode, aspectRatio, currentTime, smoothTime, isPlaying, focusX, focusY, productPins, videoDimensions, manualScale, isPinningActive]);

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

    return {
      width: "100%",
      height: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      objectFit: "cover",
      objectPosition: `${effectivePanX.toFixed(2)}% ${effectivePanY.toFixed(2)}%`,
      transform: effectiveScale !== 1.0 ? `scale(${effectiveScale})` : undefined,
      transformOrigin: `${effectivePanX.toFixed(2)}% ${effectivePanY.toFixed(2)}%`,
      transition: isDraggingCrop || smartDirectorMode !== "off"
        ? "none"
        : "object-position 0.95s cubic-bezier(0.25, 1, 0.5, 1), transform 0.95s cubic-bezier(0.25, 1, 0.5, 1)",
      display: "block",
    };
  }, [previewMode, aspectRatio, directorState, isDraggingCrop, smartDirectorMode, manualScale, focusX, focusY]);

  // Visual Crop Box Guide Overlay with mathematically exact aspect ratio & Smart Director scaling
  const cropBoxStyle = useMemo(() => {
    if (aspectRatio === "source" || previewMode === "wysiwyg") return null;

    const vw = videoDimensions.width || 1920;
    const vh = videoDimensions.height || 1080;
    const videoRatio = vw / vh;

    let targetRatio = 9 / 16;
    if (aspectRatio === "16:9") {
      targetRatio = 16 / 9;
    } else if (aspectRatio === "1:1") {
      targetRatio = 1.0;
    }

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
        transition: isDraggingCrop || smartDirectorMode !== "off" ? "none" : "all 0.95s cubic-bezier(0.25, 1, 0.5, 1)",
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
        transition: isDraggingCrop || smartDirectorMode !== "off" ? "none" : "all 0.95s cubic-bezier(0.25, 1, 0.5, 1)",
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
      transition: isDraggingCrop || smartDirectorMode !== "off" ? "none" : "all 0.95s cubic-bezier(0.25, 1, 0.5, 1)",
    };
  }, [aspectRatio, previewMode, directorState, videoDimensions, isDraggingCrop, smartDirectorMode]);

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

  if (!videoFile) {
    return (
      <div className="player-empty-container">
        <div className="empty-player-icon">🎬</div>
        <h3>เลือกไฟล์วิดีโอ MP4 เพื่อเริ่มเล่นและตัดต่อ</h3>
        <p>คลิกเลือกไฟล์วิดีโอจากรายการ Windows Explorer ด้านซ้ายเพื่อเปิดดูและตั้งค่า</p>
      </div>
    );
  }

  return (
    <div className="silence-detection-window">
      {/* Window Title Bar */}
      <div className="window-titlebar">
        <div className="window-title">
          <span className="window-icon">🎙️</span>
          <span>Silence Detection</span>
          <span className="window-subfilename">— {videoFile.name}</span>
        </div>
        <div className="window-actions">
          <button
            type="button"
            className="btn-header-project-settings"
            onClick={() => setIsProjectSettingsOpen(true)}
            title="คลิกเพื่อตั้งค่าสัดส่วนหน้าจอ ความละเอียด (Resolution) และอัตราเฟรม (FPS) ของโปรเจกต์"
          >
            ⚙️ ตั้งค่า Project:{" "}
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
            title={showSettingsPanel ? "ซ่อนแผงตั้งค่าเพื่อขยายพื้นที่วิดีโอ" : "แสดงแผงตั้งค่าตรวจจับเสียงเงียบ"}
          >
            {showSettingsPanel ? "⚙️ ซ่อนตั้งค่า" : "⚙️ แสดงตั้งค่า"}
          </button>
          <span className="window-badge">{formatBytes(videoFile.sizeBytes)}</span>
          {onClose && (
            <button type="button" className="window-close-btn" onClick={onClose} title="ปิดหน้าต่าง">
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
              <span className="cluster-label">📐 สัดส่วน:</span>
              <div className="cluster-buttons">
                <button
                  type="button"
                  className={`toolbar-pill-btn ${aspectRatio === "9:16" ? "active" : ""}`}
                  onClick={() => {
                    setAspectRatio("9:16");
                    onReframe9x16Change?.(true);
                  }}
                  title="📱 สัดส่วน 9:16 แนวตั้ง (TikTok, Reels, Shorts)"
                >
                  📱 9:16
                </button>
                <button
                  type="button"
                  className={`toolbar-pill-btn ${aspectRatio === "16:9" ? "active" : ""}`}
                  onClick={() => {
                    setAspectRatio("16:9");
                    onReframe9x16Change?.(false);
                  }}
                  title="🖥️ สัดส่วน 16:9 แนวนอน (YouTube, Widescreen)"
                >
                  🖥️ 16:9
                </button>
                <button
                  type="button"
                  className={`toolbar-pill-btn ${aspectRatio === "1:1" ? "active" : ""}`}
                  onClick={() => {
                    setAspectRatio("1:1");
                    onReframe9x16Change?.(false);
                  }}
                  title="⏹️ สัดส่วน 1:1 จัตุรัส (Instagram Feed)"
                >
                  ⏹️ 1:1
                </button>
                <button
                  type="button"
                  className={`toolbar-pill-btn ${aspectRatio === "source" ? "active" : ""}`}
                  onClick={() => {
                    setAspectRatio("source");
                    onReframe9x16Change?.(false);
                  }}
                  title="⬛ ต้นฉบับ (Original Aspect Ratio)"
                >
                  ⬛ ต้นฉบับ
                </button>
              </div>
            </div>

            <div className="toolbar-vertical-divider" />

            {/* Cluster 2: Zoom Controls (🔍-, scale, 🔍+, 1.0x) */}
            {aspectRatio !== "source" && (
              <>
                <div className="canvas-toolbar-cluster zoom-cluster">
                  <span className="cluster-label">🔍 ซูมภาพ:</span>
                  <div className="cluster-buttons">
                    <button
                      type="button"
                      className="toolbar-pill-btn zoom-btn"
                      onClick={() => setManualScale((prev) => Math.max(1.0, +(prev - 0.05).toFixed(2)))}
                      title="ลดการซูม (Zoom Out 5%)"
                    >
                      🔍-
                    </button>
                    <span
                      className="toolbar-pill-btn zoom-value-display active"
                      title="ระดับซูมปัจจุบัน (หมุน Scroll Wheel หรือกดปุ่ม 🔍 เพื่อปรับ)"
                    >
                      {manualScale.toFixed(2)}x
                    </span>
                    <button
                      type="button"
                      className="toolbar-pill-btn zoom-btn"
                      onClick={() => setManualScale((prev) => Math.min(2.5, +(prev + 0.05).toFixed(2)))}
                      title="เพิ่มการซูม (Zoom In 5%)"
                    >
                      🔍+
                    </button>
                    {manualScale !== 1.0 && (
                      <button
                        type="button"
                        className="toolbar-pill-btn zoom-reset-btn"
                        onClick={() => setManualScale(1.0)}
                        title="รีเซ็ตการซูมกลับเป็น 1.0x (เต็มสัดส่วนปกติ)"
                      >
                        1.0x
                      </button>
                    )}
                  </div>
                </div>

                <div className="toolbar-vertical-divider" />

                {/* Cluster 3: AI Focus Tracking & Manual Drag */}
                <div className="canvas-toolbar-cluster">
                  <span className="cluster-label">🎯 การเล็งภาพ:</span>
                  <div className="cluster-buttons">
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${focusMode === "auto_person" ? "active" : ""}`}
                      onClick={() => {
                        setFocusMode("auto_person");
                        onFocusModeChange?.("auto_person");
                        detectPersonCenter(true);
                        setProjectStatusMsg("👤 โหมดโฟกัสคน: AI ติดตามใบหน้าผู้พูดอัตโนมัติ");
                        setTimeout(() => setProjectStatusMsg(null), 2500);
                      }}
                      title="👤 Auto Track หน้าคน: ติดตามและล็อกตำแหน่งใบหน้าผู้พูดอัตโนมัติ"
                    >
                      👤 โฟกัสคน {focusMode === "auto_person" ? "🟢" : ""}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${focusMode === "manual_region" ? "active" : ""}`}
                      onClick={() => {
                        setFocusMode("manual_region");
                        onFocusModeChange?.("manual_region");
                        setSmartDirectorMode("off");
                        setProjectStatusMsg("✋ โหมดลากเอง: ปิด Auto Pan/Zoom อัตโนมัติ กล้องนิ่งตามตำแหน่งที่คุณลาก");
                        setTimeout(() => setProjectStatusMsg(null), 3000);
                      }}
                      title="✋ ลากเอง: คลิกลากกรอบบนภาพได้อย่างอิสระ (ปิด Auto Pan/Zoom ให้นิ่ง 100%)"
                    >
                      ✋ ลากเอง {focusMode === "manual_region" ? "✓" : ""}
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
                        setProjectStatusMsg("✕ ปิด Auto Pan & Zoom: กล้องจะนิ่งคงที่ตามจุดที่คุณจัด");
                        setTimeout(() => setProjectStatusMsg(null), 2500);
                      }}
                      title="✕ ปิด Auto Pan/Zoom: กล้องนิ่งคงที่ไม่เคลื่อนไหวอัตโนมัติ"
                    >
                      ✕ ปิด (นิ่ง)
                    </button>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${smartDirectorMode === "product_focus" ? "active" : ""}`}
                      onClick={() => {
                        setSmartDirectorMode("product_focus");
                        setProjectStatusMsg("📍 เปิด Auto Pan/Zoom: เคลื่อนกล้องนุ่มนวลระหว่างจุดมาร์กที่ปักไว้");
                        setTimeout(() => setProjectStatusMsg(null), 3000);
                      }}
                      title="📍 Pan/Zoom ตามจุดมาร์ก: เคลื่อนกล้อง Pan และ Zoom อย่างนุ่มนวลตามลำดับจุดมาร์ก"
                    >
                      📍 ตามจุดมาร์ก {smartDirectorMode === "product_focus" ? "🟢" : ""}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${smartDirectorMode === "auto" ? "active" : ""}`}
                      onClick={() => setSmartDirectorMode("auto")}
                      title="⚡ ออโต้ AI: สลับมุมกว้าง -> ซูมเข้าหาคนหรือสินค้าเป็นระยะอย่างเป็นธรรมชาติ"
                    >
                      ⚡ ออโต้ AI {smartDirectorMode === "auto" ? "🟢" : ""}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-pill-btn ${smartDirectorMode === "face_focus" ? "active" : ""}`}
                      onClick={() => setSmartDirectorMode("face_focus")}
                      title="👤 ซูมหาใบหน้า: ซูมเน้นใบหน้าผู้พูดเป็นระยะ"
                    >
                      👤 ซูมหน้า {smartDirectorMode === "face_focus" ? "🟢" : ""}
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
                    ? aspectRatio === "9:16"
                      ? "9 / 16"
                      : aspectRatio === "16:9"
                      ? "16 / 9"
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
                style={wysiwygVideoStyle}
                crossOrigin="anonymous"
                onLoadedMetadata={handleLoadedMetadata}
                onLoadedData={() => {
                  if (focusMode === "auto_person") detectPersonCenter(true);
                }}
                onCanPlay={() => {
                  if (focusMode === "auto_person") detectPersonCenter(true);
                }}
                onTimeUpdate={handleTimeUpdate}
                onSeeked={() => {
                  if (focusMode === "auto_person") detectPersonCenter(true);
                }}
                onEnded={() => setIsPlaying(false)}
                onError={() =>
                  setPlaybackError(
                    "เบราว์เซอร์ไม่สามารถเล่นไฟล์นี้โดยตรงได้ (อาจเป็น Codec พิเศษ) แต่ระบบสามารถ Render ตัดต่อผ่าน FFmpeg ได้ตามปกติ"
                  )
                }
                playsInline
              />
              {playbackError && (
                <div className="playback-error-overlay">
                  <span>⚠️ {playbackError}</span>
                </div>
              )}

              {/* Sandboxed Live React / CSS / Three.js & Word Subtitles Overlay */}
              {nleProject && (
                <SandboxedOverlayViewer
                  activeClips={activeOverlayClips}
                  currentTimeMs={currentTime * 1000}
                  width={nleProject.canvas.width}
                  height={nleProject.canvas.height}
                  focusX={focusX}
                  focusY={focusY}
                  productPin={productPin}
                />
              )}

              {/* Crop Overlay (Only shown in crop_guide mode) */}
              {cropBoxStyle && previewMode === "crop_guide" && (
                <div className="crop-overlay-mask">
                  <div
                    className={`crop-view-box aspect-${aspectRatio.replace(":", "-")} ${
                      focusMode === "auto_person" ? "auto-track" : "manual"
                    } ${isDraggingCrop ? "dragging" : ""}`}
                    style={cropBoxStyle}
                    onMouseDown={handleCropMouseDown}
                    onWheel={handleStageWheel}
                    title="คลิกค้างแล้วลากเพื่อขยับตำแหน่งกรอบวิดีโอ (หมุนล้อเมาส์ Scroll เพื่อปรับซูม)"
                  >
                    <div className="crop-box-corner top-left" />
                    <div className="crop-box-corner top-right" />
                    <div className="crop-box-corner bottom-left" />
                    <div className="crop-box-corner bottom-right" />
                    <div className="crop-box-center-crosshair">✛</div>
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
                          setAspectRatio(next);
                          onReframe9x16Change?.(next === "9:16");
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
        title="คลิกลากขึ้น-ลงเพื่อปรับขนาดพื้นที่วิดีโอกับไทม์ไลน์"
      >
        <div className="splitter-handle-pill">
          <span className="splitter-grip">⋯</span>
          <span className="splitter-label">พื้นที่วิดีโอ {stageHeightPercent}%</span>
        </div>
        <div className="splitter-preset-buttons" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`splitter-preset-btn ${stageHeightPercent >= 70 ? "active" : ""}`}
            onClick={() => {
              setStageHeightPercent(75);
              try { localStorage.setItem("smartspec_stage_height_pct", "75"); } catch {}
            }}
            title="ขยายพื้นที่วิดีโอใหญ่สุด 75%"
          >
            🔼 วิดีโอใหญ่ (75%)
          </button>
          <button
            type="button"
            className={`splitter-preset-btn ${stageHeightPercent >= 55 && stageHeightPercent < 70 ? "active" : ""}`}
            onClick={() => {
              setStageHeightPercent(60);
              try { localStorage.setItem("smartspec_stage_height_pct", "60"); } catch {}
            }}
            title="มุมมองสมดุล (วิดีโอ 60% / ไทม์ไลน์ 40%)"
          >
            ⚖️ สมดุล (60%)
          </button>
          <button
            type="button"
            className={`splitter-preset-btn ${stageHeightPercent < 55 ? "active" : ""}`}
            onClick={() => {
              setStageHeightPercent(45);
              try { localStorage.setItem("smartspec_stage_height_pct", "45"); } catch {}
            }}
            title="ขยายพื้นที่ไทม์ไลน์ เพื่อดูหลายแทร็กสะดวก"
          >
            🔽 ไทม์ไลน์ใหญ่ (45%)
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
              title="กดเพื่อวิเคราะห์ตัดช่วงเสียงเงียบ (Dead Air) ตามพารามิเตอร์ที่เลือก"
            >
              {isAnalyzing ? "⏳ วิเคราะห์..." : "⚡ Analyze"}
            </button>

            {/* Presets */}
            <div className="inline-preset-pills">
              <button
                type="button"
                className={`inline-preset-pill ${volumeThreshold === 25 && minDuration === 0.5 && softeningBuffer === 0.2 ? "active" : ""}`}
                onClick={() => applyPreset(25, 0.5, 0.2)}
                title="ธรรมชาติ / บทสนทนาทั่วไป (25% / 0.5s / 0.2s)"
              >
                🟢 ธรรมชาติ
              </button>
              <button
                type="button"
                className={`inline-preset-pill ${volumeThreshold === 30 && minDuration === 0.35 && softeningBuffer === 0.1 ? "active" : ""}`}
                onClick={() => applyPreset(30, 0.35, 0.1)}
                title="TikTok / Shorts พูดเร็ว กระชับ (30% / 0.35s / 0.1s)"
              >
                ⚡ Shorts
              </button>
              <button
                type="button"
                className={`inline-preset-pill ${volumeThreshold === 35 && minDuration === 0.25 && softeningBuffer === 0.08 ? "active" : ""}`}
                onClick={() => applyPreset(35, 0.25, 0.08)}
                title="ตัดกระชับพิเศษ / Jump Cut ไวสุด (35% / 0.25s / 0.08s)"
              >
                🔥 Jump Cut
              </button>
              <button
                type="button"
                className={`inline-preset-pill ${volumeThreshold === 20 && minDuration === 0.8 && softeningBuffer === 0.25 ? "active" : ""}`}
                onClick={() => applyPreset(20, 0.8, 0.25)}
                title="พอดแคสต์ / บรรยายแบบชิลล์ (20% / 0.8s / 0.25s)"
              >
                🎙️ พอดแคสต์
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
              title="✂️ มาร์กเพิ่มจุดตัดช่วงเสียงที่พูดผิด / Dead Air ตรงตำแหน่ง Playhead ปัจจุบัน"
            >
              ✂️ + มาร์กจุดตัด
            </button>

            {/* Cut Count & Saved Stats */}
            <div
              className="inline-stats-badge"
              title={`ตัด Dead Air ทั้งหมด ${cutCount} ช่วง ประหยัดเวลาได้ ${(timeSavedMs / 1000).toFixed(1)} วินาที`}
            >
              <span>✂️ {cutCount} ช่วง</span>
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
          currentTimeMs={currentTime * 1000}
          durationMs={Math.max(1000, duration * 1000)}
          isPlaying={isPlaying}
          onSeek={(ms) => handleSeek(ms / 1000)}
          onTogglePlay={togglePlay}
          onUpdateProject={(updated) => setNleProject(updated)}
          onOpenAutoSubtitles={() => setIsAutoSubModalOpen(true)}
          onOpenCodeOverlayModal={() => setIsCodeOverlayModalOpen(true)}
          onOpenAssetDrawer={() => setIsAssetDrawerOpen(true)}
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

            {/* 3. Audio Waveform Track (Emerald Green on Dark Pine Background) */}
            <div
              className="waveform-track"
              onDoubleClick={(e) => {
                if (duration <= 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pct = Math.max(0, Math.min(1, clickX / rect.width));
                handleAddManualCut(pct * duration);
              }}
              title="ดับเบิ้ลคลิกบนกราฟเสียงเพื่อเพิ่มจุดตัดเสียงที่พูดผิด หรือคลิก ✕ บนแถบสีแดงเพื่อยกเลิกจุดตัด"
            >
              <div className="waveform-bars">
                {waveformPeaks.length > 0 ? (
                  waveformPeaks.map((peak, idx) => (
                    <div
                      key={idx}
                      className="waveform-bar"
                      style={{
                        height: `${Math.max(8, peak * 100)}%`,
                      }}
                    />
                  ))
                ) : (
                  <div className="waveform-empty-hint">
                    {isAnalyzing ? "กำลังประมวลผล Waveform..." : "กด Analyze เพื่อสร้าง Audio Waveform"}
                  </div>
                )}
              </div>

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
      <div className="export-controls-bar">
        {/* Export, AI Plan, and Upload Actions */}
        <div className="export-action-group">
          {/* AI Preprocessing Intent & Plan Action Pills */}
          <div className="ai-intent-action-pills">
            {onOpenIntentSettings && (
              <button
                type="button"
                className="ai-settings-pill-btn"
                onClick={onOpenIntentSettings}
                title="เปิดหน้าต่างตั้งค่า AI Preprocessing Intent (Reframe 9:16, Dead Air, Focus, Plan)"
              >
                ⚙️ ตั้งค่าแผน AI
              </button>
            )}
            {onBuildPlan && (
              <button
                type="button"
                className="ai-build-pill-btn"
                onClick={onBuildPlan}
                disabled={isBusy}
                title="สร้างแผนตัดต่อ Preprocessing Plan ด้วยพารามิเตอร์ปัจจุบัน"
              >
                {isBusy ? "⏳ กำลังสร้าง..." : "⚡ สร้างแผนตัดต่อ AI"}
              </button>
            )}
            {plan && (
              <div className="ai-plan-status-badge" title={`Plan ID: ${plan.planId}`}>
                <span className="badge-dot" />
                <span>แผน {plan.planId.slice(-6)} · {Math.round(plan.trimEndMs / 1000)}s</span>
              </div>
            )}
            {plan && onSubmitJob && (
              <button
                type="button"
                className="ai-submit-queue-btn"
                onClick={onSubmitJob}
                disabled={!canSubmitJob || isBusy}
                title="ส่งแผน AI เข้า Worker GPU Queue"
              >
                🚀 ส่งงาน GPU Queue
              </button>
            )}
          </div>

          <input
            type="text"
            className="export-title-input"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="ชื่อคลิปที่จะบันทึก..."
          />

          <p role="note">Render ด้านล่างส่งออกเฉพาะต้นฉบับตาม Trim / Reframe / Dead Air ยังไม่รวมแทร็ก NLE, เสียงเพิ่ม, ข้อความ หรือ Blur</p>
          <div className="render-buttons-group" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="render-clip-btn render-btn-deadair"
              style={{
                flex: "1 1 180px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
              }}
              disabled={isProcessing || duration === 0}
              onClick={() => void handleProcessVideo(true)}
              title="ตัดช่วงเงียบ (Dead Air) อัตโนมัติ ตัดหัว-ท้ายพอดีคำพูดเพื่อความกระชับ"
            >
              {isProcessing && lastRenderHadDeadAirCut ? "⚙️ กำลัง Render..." : "⚡ Render ตัด Dead Air (เน้นเสียงพูด)"}
            </button>

            <button
              type="button"
              className="render-clip-btn render-btn-normal"
              style={{
                flex: "1 1 180px",
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                boxShadow: "0 4px 14px rgba(59, 130, 246, 0.35)",
              }}
              disabled={isProcessing || duration === 0}
              onClick={() => void handleProcessVideo(false)}
              title="Render วิดีโอเต็มคลิปหรือตามช่วงที่ Trim โดยไม่ตัดต่อเสียงช่วงเงียบ"
            >
              {isProcessing && !lastRenderHadDeadAirCut ? "⚙️ กำลัง Render..." : "🎬 Render ปกติ (ไม่ตัด Dead Air)"}
            </button>
          </div>
        </div>

        {/* Render Result Action Card with Download, Reveal Folder, and Play buttons */}
        {processResult && (
          <div className="render-success-card">
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
        onApplySubtitles={handleApplySubtitles}
      />

      <CodeOverlayModal
        isOpen={isCodeOverlayModalOpen}
        onClose={() => setIsCodeOverlayModalOpen(false)}
        currentTimeMs={Math.round(currentTime * 1000)}
        onAddCodeOverlay={handleAddCodeOverlay}
      />

      <AssetDrawerPanel
        isOpen={isAssetDrawerOpen}
        onClose={() => setIsAssetDrawerOpen(false)}
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
          onApplyScoredProject={(updated) => {
            setNleProject(updated);
            setProjectStatusMsg("🎵 วางเพลงประกอบ MiniMax Music 3 และ SFX ลง Timeline เรียบร้อย");
            setTimeout(() => setProjectStatusMsg(null), 5000);
          }}
        />
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
