import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useWorkerAppContext } from "../../app/workerContext";
import { MediaExplorerView, isAudioFile, isImageFile, isProjectFile, type DirectoryBrowseResult, type DirectoryEntry } from "./MediaExplorerView";
import { parseProjectDraft, saveNleProject, isProjectFilePath } from "./projectPersistence";
import { MediaVideoEditorPlayer } from "./MediaVideoEditorPlayer";
import { SpeakerAwareWorkflowPanel } from "./SpeakerAwareWorkflowPanel";
import type { DeadAirRenderSelection } from "./mediaWorkspaceTimeline";
import { normalizeDisplayPath, resolveWorkspaceRelativePath, resolveWorkspaceSourcePath } from "./sourcePath";
import type { SmartSpecProjectDraft, ProjectAsset } from "../../types/nleProject";
import type { WireAdapterPolicy, WireAdapterId } from "./SpeakerAwareWorkflowPanel";

type WorkspaceStage =
  | "intake"
  | "inventory"
  | "ai-plan"
  | "review"
  | "qc"
  | "processing"
  | "published";

type WorkspaceStatus = {
  status: string;
  fileCount: number;
  totalBytes: number;
  localPath?: string;
} | null;

type ScanStatus = {
  supportedFileCount: number;
  skippedFileCount: number;
  fileCount: number;
} | null;

type PlanStatus = {
  planId: string;
  trimEndMs: number;
  outputRelativeName: string;
} | null;

type FolderBatchItem = {
  relativeName: string;
  displayName: string;
  outputRelativeName: string;
  status: "queued" | "scanning" | "dead_air_scan" | "rendering" | "saving" | "completed" | "skipped" | "failed" | "canceled";
  error?: string;
};

type LocalFolderBatchItemSnapshot = {
  sourceRelativeName: string;
  displayName: string;
  outputRelativeName: string;
  status: FolderBatchItem["status"];
  stage: string;
  error?: string | null;
};

type LocalFolderBatchSnapshot = {
  batchId: string;
  status: string;
  currentFile?: string | null;
  stage: string;
  completedCount: number;
  skippedCount: number;
  failedCount: number;
  canceledCount: number;
  items: LocalFolderBatchItemSnapshot[];
};

type LocalFolderBatchVideoRequest = {
  sourceRelativeName: string;
  outputRelativeName: string;
  displayName: string;
  scanError?: string | null;
  canceledBeforeStart: boolean;
  cameraMotionPlan?: DeadAirRenderSelection["cameraMotionPlan"];
  reframe9x16: boolean;
  volumeThresholdPct: number;
  minDurationSec: number;
  softeningBufferSec: number;
  audioStreamIndex?: number | null;
};

export interface MediaWorkspaceHostProps {
  workspace: WorkspaceStatus;
  scan: ScanStatus;
  plan: PlanStatus;
  busy: boolean;
  seriesId?: string | null;
  canSubmit?: boolean;
  onSubmit?: (deadAir?: DeadAirRenderSelection, sourceRelativeName?: string, options?: { fullVideo?: boolean }) => Promise<{ jobId?: string; status?: string } | void> | void;
  onIngest?: () => void;
  sourceRelativeName?: string;
  onSelectSourceFile?: (relativeName: string, fullPath: string) => void;
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
  onBuildPlan?: (deadAir?: DeadAirRenderSelection) => void;
  onWorkspacePathChange?: (path: string) => void;
  onSpeakerAwareRequestScan?: (input: { workflowMode: string; adapters: WireAdapterId[]; adapterPolicy: WireAdapterPolicy; requestedStages: string[]; outputStage: string; sourceRelativeName: string }) => void | Promise<{ jobId?: string; status?: string } | void>;
}

function isGeneratedBatchOutput(name: string): boolean {
  return /_edited(?:_[a-z0-9]+)?\.mp4$/i.test(name);
}

function hasExistingGeneratedBatchOutput(outputName: string, existingNames: Set<string>): boolean {
  const normalizedOutput = outputName.toLocaleLowerCase();
  const outputStem = normalizedOutput.replace(/\.mp4$/, "");
  return [...existingNames].some((name) => name === normalizedOutput
    || (name.startsWith(`${outputStem}_`) && /^[a-z0-9]+(?:_[0-9]+)?\.mp4$/.test(name.slice(outputStem.length + 1))));
}

function outputDisambiguator(entry: DirectoryEntry, stemCount: number): string {
  if (stemCount < 2) return "";
  return (entry.extension || entry.name.split(".").pop() || "video").replace(/^\./, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "video";
}

function invokeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function folderBatchItemsFromSnapshot(snapshot: LocalFolderBatchSnapshot): FolderBatchItem[] {
  return snapshot.items.map((item) => ({
    relativeName: item.sourceRelativeName,
    displayName: item.displayName,
    outputRelativeName: item.outputRelativeName,
    status: item.status,
    error: item.error || undefined,
  }));
}

function folderBatchProgressMessage(snapshot: LocalFolderBatchSnapshot, locale: string): string {
  if (snapshot.status !== "running") {
    const label = snapshot.status === "completed"
      ? (locale === "th" ? "Batch เสร็จแล้ว" : "Batch completed")
      : snapshot.status === "canceled"
        ? (locale === "th" ? "หยุด Batch แล้ว" : "Batch stopped")
        : (locale === "th" ? "Batch เสร็จพร้อมรายการที่ผิดพลาด" : "Batch finished with errors");
    return `${label} · ${locale === "th" ? "สำเร็จ" : "done"} ${snapshot.completedCount} · ${locale === "th" ? "ข้าม" : "skipped"} ${snapshot.skippedCount} · ${locale === "th" ? "ผิดพลาด" : "failed"} ${snapshot.failedCount}${snapshot.canceledCount ? ` · ${locale === "th" ? "ยกเลิก" : "canceled"} ${snapshot.canceledCount}` : ""}`;
  }
  const current = snapshot.currentFile ? ` · ${snapshot.currentFile}` : "";
  const stage = snapshot.stage === "face_activity_scan"
    ? (locale === "th" ? "กำลังสแกน Face + Activity" : "Scanning Face + Activity")
    : snapshot.stage === "dead_air_scan"
      ? (locale === "th" ? "กำลังสแกน Dead Air ทั้งคลิป" : "Scanning full-video dead air")
      : snapshot.stage === "rendering"
        ? (locale === "th" ? "กำลัง Render ในเครื่อง" : "Rendering locally")
        : snapshot.stage === "saving"
          ? (locale === "th" ? "กำลังบันทึก MP4" : "Saving MP4")
          : (locale === "th" ? "กำลังเตรียม Batch ในเครื่อง" : "Preparing local batch");
  return `${stage}${current} · ${snapshot.completedCount}/${snapshot.items.length}`;
}

export function MediaWorkspaceHost({
  workspace,
  scan,
  plan,
  busy,
  seriesId,
  canSubmit,
  onSubmit,
  onIngest,
  sourceRelativeName,
  onSelectSourceFile,
  reframe9x16,
  onReframe9x16Change,
  focusX,
  onFocusXChange,
  focusY,
  onFocusYChange,
  focusMode,
  onFocusModeChange,
  removeDeadAir,
  onRemoveDeadAirChange,
  onOpenIntentSettings,
  onBuildPlan,
  onWorkspacePathChange,
  onSpeakerAwareRequestScan,
}: MediaWorkspaceHostProps) {
  const { locale } = useWorkerAppContext();
  const [activeTab, setActiveTab] = useState<"explorer" | "stages">("explorer");
  const [stage, setStage] = useState<WorkspaceStage>("intake");
  const [selectedVideo, setSelectedVideo] = useState<DirectoryEntry | null>(null);
  const [loadedProjectDraft, setLoadedProjectDraft] = useState<SmartSpecProjectDraft | null>(null);
  const [timelineProject, setTimelineProject] = useState<SmartSpecProjectDraft | null>(null);
  const [timelineProjectReady, setTimelineProjectReady] = useState(false);
  const [speakerSourcePath, setSpeakerSourcePath] = useState<string | null>(null);
  const [folderBatchItems, setFolderBatchItems] = useState<FolderBatchItem[]>([]);
  const [folderBatchRunning, setFolderBatchRunning] = useState(false);
  const [folderBatchPreparing, setFolderBatchPreparing] = useState(false);
  const [folderBatchId, setFolderBatchId] = useState<string | null>(null);
  const [folderBatchCancelRequested, setFolderBatchCancelRequested] = useState(false);
  const [folderBatchMessage, setFolderBatchMessage] = useState("");
  const [folderBatchError, setFolderBatchError] = useState("");
  const [folderBatchDebugLogPath, setFolderBatchDebugLogPath] = useState<string | null>(null);
  const [folderBatchDebugLogWriteError, setFolderBatchDebugLogWriteError] = useState<string | null>(null);
  const [batchScanTarget, setBatchScanTarget] = useState<{ entry: DirectoryEntry; request: { id: string; sourcePath: string } } | null>(null);
  const [importedAsset, setImportedAsset] = useState<ProjectAsset | null>(null);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isSpeakerAwareOpen, setIsSpeakerAwareOpen] = useState(false);
  const [mediaPickerRequest, setMediaPickerRequest] = useState(0);
  const [autoSubtitleRequest, setAutoSubtitleRequest] = useState(0);
  const speakerAwarePanelRef = useRef<HTMLElement | null>(null);
  const [explorerWidth, setExplorerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smartspec_explorer_width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 850) return parsed;
      }
    } catch {
      // Fallback to default width
    }
    return 360;
  });

  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<boolean>(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const projectRequest = useRef(0);
  const folderBatchCancelRef = useRef(false);
  const folderBatchStartingRef = useRef(false);
  const batchScanIdRef = useRef(0);
  const batchScanWaiterRef = useRef<{
    id: string;
    resolve: (selection: DeadAirRenderSelection) => void;
    reject: (error: Error) => void;
    timeout: number;
  } | null>(null);
  const workspacePath = useRef(workspace?.localPath);
  const displayWorkspacePath = normalizeDisplayPath(workspace?.localPath);
  const batchProjectFolder = loadedProjectDraft?.metadata?.workspacePath?.trim()
    || timelineProject?.metadata?.workspacePath?.trim()
    || workspace?.localPath?.trim()
    || "";
  // Opening a project may ask the parent to switch to the project's recorded
  // workspace. That controlled path change must not clear the source we just
  // restored from the project; unrelated workspace changes still reset it.
  const preserveSelectionOnNextWorkspaceChange = useRef(false);

  const handleTimelineProjectChange = useCallback((draft: SmartSpecProjectDraft | null) => {
    setTimelineProjectReady(true);
    setTimelineProject(draft);
  }, []);

  const timelineVideoOptions = useMemo(() => {
    const options: Array<{ path: string; label: string; relativeName?: string }> = [];
    const seen = new Set<string>();
    for (const track of timelineProject?.tracks ?? []) {
      if (track.type !== "video_main" && track.type !== "video_broll") continue;
      for (const clip of track.clips) {
        const path = clip.sourcePath?.trim();
        if (!path || isProjectFilePath(path) || seen.has(path)) continue;
        const relativeName = resolveWorkspaceRelativePath(workspace?.localPath, path);
        if (!relativeName) continue;
        seen.add(path);
        options.push({
          path,
          label: clip.name?.trim() || path.split(/[\\/]/).pop() || path,
          relativeName,
        });
      }
    }
    // A freshly opened source is the first timeline clip while the editor is
    // still initialising its draft. Keep the tool usable during that brief
    // window, but never expose files that are only in the Media Explorer.
    const selectedRelativeName = selectedVideo?.path ? resolveWorkspaceRelativePath(workspace?.localPath, selectedVideo.path) : null;
    if (!timelineProjectReady && options.length === 0 && selectedVideo?.isVideo && selectedVideo.path && !isProjectFilePath(selectedVideo.path) && selectedRelativeName) {
      options.push({
        path: selectedVideo.path,
        label: selectedVideo.name,
        relativeName: selectedRelativeName,
      });
    }
    return options;
  }, [timelineProject, timelineProjectReady, selectedVideo, workspace?.localPath]);

  useEffect(() => {
    setSpeakerSourcePath((current) => {
      if (current && timelineVideoOptions.some((option) => option.path === current)) return current;
      return timelineVideoOptions.length === 1 ? timelineVideoOptions[0].path : null;
    });
  }, [timelineVideoOptions]);

  const handleBatchFullScanResult = useCallback((
    requestId: string,
    result: { selection?: DeadAirRenderSelection; error?: string; failureReason?: string; debugLogPath?: string | null; debugLogWriteError?: string | null },
  ) => {
    const waiter = batchScanWaiterRef.current;
    if (!waiter || waiter.id !== requestId) return;
    if (result.debugLogPath) setFolderBatchDebugLogPath(result.debugLogPath);
    if (result.debugLogWriteError !== undefined) setFolderBatchDebugLogWriteError(result.debugLogWriteError);
    window.clearTimeout(waiter.timeout);
    batchScanWaiterRef.current = null;
    setBatchScanTarget(null);
    if (result.selection) waiter.resolve(result.selection);
    else waiter.reject(new Error([
      result.error || "face_activity_scan_failed",
      result.failureReason ? `reason=${result.failureReason}` : "",
    ].filter(Boolean).join(" · ")));
  }, []);

  const handleBatchDebugLogUpdate = useCallback((path: string | null, error: string | null) => {
    if (path) setFolderBatchDebugLogPath(path);
    setFolderBatchDebugLogWriteError(error);
  }, []);

  const requestBatchFullScan = useCallback((entry: DirectoryEntry) => new Promise<DeadAirRenderSelection>((resolve, reject) => {
    const id = `folder-batch-${Date.now()}-${++batchScanIdRef.current}`;
    const timeout = window.setTimeout(() => {
      if (batchScanWaiterRef.current?.id !== id) return;
      batchScanWaiterRef.current = null;
      setBatchScanTarget(null);
      reject(new Error("face_activity_scan_timeout"));
    }, 10 * 60 * 1000);
    batchScanWaiterRef.current = { id, resolve, reject, timeout };
    setBatchScanTarget({ entry, request: { id, sourcePath: entry.path } });
  }), []);

  useEffect(() => () => {
    const waiter = batchScanWaiterRef.current;
    if (!waiter) return;
    window.clearTimeout(waiter.timeout);
    batchScanWaiterRef.current = null;
    waiter.reject(new Error("folder_batch_interrupted"));
  }, []);

  useEffect(() => {
    let mounted = true;
    void invoke<LocalFolderBatchSnapshot | null>("worker_app_get_local_folder_batch_status")
      .then((snapshot) => {
        if (!mounted || !snapshot) return;
        setFolderBatchId(snapshot.batchId);
        setFolderBatchItems(folderBatchItemsFromSnapshot(snapshot));
        setFolderBatchRunning(snapshot.status === "running");
        setFolderBatchMessage(folderBatchProgressMessage(snapshot, locale));
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!folderBatchId) return;
    let active = true;
    const refreshStatus = async () => {
      try {
        const snapshot = await invoke<LocalFolderBatchSnapshot | null>("worker_app_get_local_folder_batch_status");
        if (!active || !snapshot || snapshot.batchId !== folderBatchId) return;
        setFolderBatchItems(folderBatchItemsFromSnapshot(snapshot));
        setFolderBatchRunning(snapshot.status === "running");
        setFolderBatchMessage(folderBatchProgressMessage(snapshot, locale));
        if (snapshot.status !== "running") setFolderBatchCancelRequested(false);
      } catch (error) {
        if (active) setFolderBatchError(invokeError(error));
      }
    };
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 1200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [folderBatchId, locale]);

  const runFolderBatch = async () => {
    const projectFolder = batchProjectFolder;
    if (!projectFolder) {
      setFolderBatchError(locale === "th"
        ? "กรุณาเลือกโฟลเดอร์ Project ในเครื่องก่อนเริ่ม Batch"
        : "Choose a local project folder before starting the batch.");
      return;
    }

    if (folderBatchRunning || folderBatchStartingRef.current) return;
    folderBatchStartingRef.current = true;
    setFolderBatchPreparing(true);
    setFolderBatchError("");
    setFolderBatchDebugLogPath(null);
    setFolderBatchDebugLogWriteError(null);
    setFolderBatchMessage(locale === "th" ? "กำลังตรวจสอบรายการวิดีโอก่อนเริ่ม…" : "Checking folder videos before starting…");
    setFolderBatchCancelRequested(false);
    folderBatchCancelRef.current = false;
    let nativeBatchStarted = false;
    try {
      const listing = await invoke<DirectoryBrowseResult>("worker_app_browse_directory", { path: projectFolder });
      const sourceEntries = listing.entries.filter((entry) => !entry.isDirectory && entry.isVideo && !isGeneratedBatchOutput(entry.name));
      const stemCounts = new Map<string, number>();
      for (const entry of sourceEntries) {
        const stem = entry.name.replace(/\.[^.]+$/, "").toLocaleLowerCase();
        stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1);
      }
      const existingNames = new Set(listing.entries.map((entry) => entry.name.toLocaleLowerCase()));
      const videos = sourceEntries.flatMap((entry) => {
        const relativeName = entry.name;
        const stem = entry.name.replace(/\.[^.]+$/, "");
        const disambiguator = outputDisambiguator(entry, stemCounts.get(stem.toLocaleLowerCase()) ?? 1);
        const outputName = disambiguator ? `${stem}_edited_${disambiguator}.mp4` : `${stem}_edited.mp4`;
        return [{
          entry,
          item: {
            relativeName,
            displayName: entry.name,
            outputRelativeName: outputName,
            status: "queued" as FolderBatchItem["status"],
          },
        }];
      });
      if (videos.length === 0) {
        setFolderBatchMessage(locale === "th" ? "ไม่พบวิดีโอในโฟลเดอร์เดียวกับ Project" : "No videos found beside this project.");
        setFolderBatchItems([]);
        return;
      }
      const existingOutputCount = videos.filter(({ item }) => hasExistingGeneratedBatchOutput(item.outputRelativeName, existingNames)).length;
      const confirmationMessage = locale === "th"
        ? existingOutputCount > 0
          ? `พบวิดีโอ ${videos.length} ไฟล์ และพบไฟล์ผลลัพธ์เดิมที่เกี่ยวข้อง ${existingOutputCount} ไฟล์\n\nหากทำซ้ำ ระบบจะสร้างไฟล์ MP4 ชื่อใหม่ และจะไม่เขียนทับไฟล์เดิมหรือไฟล์ต้นฉบับ\n\nยืนยันเริ่มสแกน Face + Activity และ Dead Air แล้ว Render ทีละไฟล์หรือไม่?`
          : `ยืนยันตัดต่อวิดีโอทั้งหมด ${videos.length} ไฟล์ในโฟลเดอร์นี้หรือไม่?\n\nระบบจะสแกน Face + Activity และ Dead Air ก่อน Render MP4 ทีละไฟล์ โดยไม่แก้ไขไฟล์ต้นฉบับ`
        : existingOutputCount > 0
          ? `Found ${existingOutputCount} existing output(s) for ${videos.length} video(s).\n\nIf you continue, the batch will create new MP4 filenames and will not overwrite existing outputs or source videos.\n\nStart the Face + Activity and Dead Air scans, then render each video?`
          : `Start editing all ${videos.length} video(s) in this folder?\n\nThe app will scan Face + Activity and Dead Air before rendering each MP4. Source videos will not be changed.`;
      const { confirm } = await import("@tauri-apps/plugin-dialog");
      const accepted = await confirm(confirmationMessage, {
        title: locale === "th" ? "ยืนยันตัดต่อวิดีโอทั้งโฟลเดอร์" : "Confirm folder batch edit",
        kind: "warning",
      });
      if (!accepted) {
        setFolderBatchMessage(locale === "th" ? "ยกเลิกแล้ว — ยังไม่ได้เริ่ม Batch" : "Canceled — the batch has not started.");
        return;
      }

      setFolderBatchRunning(true);
      setFolderBatchId(null);
      setFolderBatchMessage("");
      let finalItems = videos.map(({ item }) => item);
      setFolderBatchItems(finalItems);
      const batchVideos: LocalFolderBatchVideoRequest[] = [];
      const updateItem = (relativeName: string, patch: Partial<FolderBatchItem>) => {
        finalItems = finalItems.map((item) => item.relativeName === relativeName ? { ...item, ...patch } : item);
        setFolderBatchItems(finalItems);
      };

      for (const { entry, item } of videos) {
        if (item.status === "skipped") {
          batchVideos.push({
            sourceRelativeName: item.relativeName,
            outputRelativeName: item.outputRelativeName,
            displayName: item.displayName,
            canceledBeforeStart: false,
            reframe9x16: Boolean(reframe9x16),
            volumeThresholdPct: 25,
            minDurationSec: 0.5,
            softeningBufferSec: 0.2,
          });
          continue;
        }
        if (folderBatchCancelRef.current) {
          updateItem(item.relativeName, { status: "canceled" });
          batchVideos.push({
            sourceRelativeName: item.relativeName,
            outputRelativeName: item.outputRelativeName,
            displayName: item.displayName,
            canceledBeforeStart: true,
            reframe9x16: Boolean(reframe9x16),
            volumeThresholdPct: 25,
            minDurationSec: 0.5,
            softeningBufferSec: 0.2,
          });
          continue;
        }
        let scanResult: DeadAirRenderSelection | null = null;
        let scanError: string | null = null;
        try {
          updateItem(item.relativeName, { status: "scanning", error: undefined });
          scanResult = await requestBatchFullScan(entry);
          if (!scanResult.cameraMotionPlan) scanError = "face_activity_plan_missing";
        } catch (error) {
          scanError = invokeError(error);
          updateItem(item.relativeName, { status: "failed", error: scanError });
        }
        if (!scanError) updateItem(item.relativeName, { status: "queued", error: undefined });
        batchVideos.push({
          sourceRelativeName: item.relativeName,
          outputRelativeName: item.outputRelativeName,
          displayName: item.displayName,
          scanError,
          canceledBeforeStart: false,
          cameraMotionPlan: scanResult?.cameraMotionPlan,
          reframe9x16: Boolean(reframe9x16),
          volumeThresholdPct: scanResult?.volumeThresholdPct ?? 25,
          minDurationSec: scanResult?.minDurationSec ?? 0.5,
          softeningBufferSec: scanResult?.softeningBufferSec ?? 0.2,
          audioStreamIndex: scanResult?.audioStreamIndex,
        });
      }
      const snapshot = await invoke<LocalFolderBatchSnapshot>("worker_app_start_local_folder_batch", {
        request: { projectFolderPath: projectFolder, videos: batchVideos },
      });
      nativeBatchStarted = true;
      setFolderBatchId(snapshot.batchId);
      setFolderBatchItems(folderBatchItemsFromSnapshot(snapshot));
      setFolderBatchMessage(folderBatchProgressMessage(snapshot, locale));
    } catch (error) {
      setFolderBatchError(invokeError(error));
    } finally {
      folderBatchStartingRef.current = false;
      setFolderBatchPreparing(false);
      setBatchScanTarget(null);
      setFolderBatchCancelRequested(false);
      folderBatchCancelRef.current = false;
      if (!nativeBatchStarted) setFolderBatchRunning(false);
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(320, Math.min(850, e.clientX));
      setExplorerWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem("smartspec_explorer_width", String(explorerWidth));
      } catch {
        // Ignore storage errors
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, explorerWidth]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMenuOpen) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isSpeakerAwareOpen) return;
    const frame = window.requestAnimationFrame(() => {
      speakerAwarePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isSpeakerAwareOpen]);

  useEffect(() => {
    if (workspacePath.current !== workspace?.localPath) {
      const preserveSelection = preserveSelectionOnNextWorkspaceChange.current;
      preserveSelectionOnNextWorkspaceChange.current = false;
      workspacePath.current = workspace?.localPath;
      const videoToPreserve = preserveSelection && selectedVideo?.isVideo ? selectedVideo : null;
      const relativeSelection = videoToPreserve
        ? resolveWorkspaceRelativePath(workspace?.localPath, videoToPreserve.path)
        : null;
      if (relativeSelection && videoToPreserve) {
        onSelectSourceFile?.(relativeSelection, videoToPreserve.path);
        return;
      }
      setSelectedVideo(null);
      setLoadedProjectDraft(null);
      setTimelineProject(null);
      setTimelineProjectReady(false);
      setSpeakerSourcePath(null);
      onSelectSourceFile?.("", workspace?.localPath || "");
    }
    return () => { projectRequest.current += 1; };
  }, [workspace?.localPath, onSelectSourceFile, selectedVideo]);

  const handleSelectVideo = (entry: DirectoryEntry) => {
    // If it's a project file or JSON, redirect directly to handleOpenProjectFile
    if (isProjectFile(entry) || isProjectFilePath(entry.path) || entry.extension?.toLowerCase() === "json") {
      void handleOpenProjectFile(entry);
      return;
    }
    setSelectedVideo(entry);
    setLoadedProjectDraft(null);
    setTimelineProject(null);
    setTimelineProjectReady(false);
    setSpeakerSourcePath(null);
    setImportedAsset(null);
    if (onSelectSourceFile) {
      const relativeName = resolveWorkspaceRelativePath(workspace?.localPath, entry.path) || entry.name;
      onSelectSourceFile(relativeName, entry.path);
    }
  };

  const handleOpenProjectFile = async (entry: DirectoryEntry) => {
    const requestId = (projectRequest.current += 1);
    setProjectError(null);
    setTimelineProject(null);
    setTimelineProjectReady(false);
    setSpeakerSourcePath(null);
    try {
      const jsonContent = await invoke<string>("worker_app_load_nle_project", {
        projectPath: entry.path,
      });
      const draft = parseProjectDraft(jsonContent);
      if (requestId !== projectRequest.current) return;

      // Ensure raw source video is never a project file
      const rawSource = draft.metadata?.originalSourceVideo || draft.tracks.find((track) => track.type === "video_main")?.clips.find((clip) => clip.sourcePath)?.sourcePath;
      const sourcePath = rawSource && !isProjectFilePath(rawSource) ? rawSource : null;

      setLoadedProjectDraft(draft);
      setImportedAsset(null);
      if (sourcePath) {
        const projectWorkspacePath = draft.metadata?.workspacePath?.trim() || null;
        const resolvedSourcePath = resolveWorkspaceSourcePath(workspace?.localPath, projectWorkspacePath, sourcePath) || sourcePath;
        setSelectedVideo({
          name: draft.title || entry.name.replace(/\.[^/.]+$/, ""),
          path: resolvedSourcePath,
          isDirectory: false,
          sizeBytes: 0,
          modifiedUnixMs: Date.now(),
          extension: resolvedSourcePath.split(".").pop() || "mp4",
          isVideo: true,
        });
        const relativeSourcePath = resolveWorkspaceRelativePath(workspace?.localPath, resolvedSourcePath)
          || resolveWorkspaceRelativePath(projectWorkspacePath, resolvedSourcePath);
        if (relativeSourcePath) {
          if (!resolveWorkspaceRelativePath(workspace?.localPath, resolvedSourcePath) && projectWorkspacePath) {
            preserveSelectionOnNextWorkspaceChange.current = true;
            onWorkspacePathChange?.(projectWorkspacePath);
          }
          onSelectSourceFile?.(relativeSourcePath, resolvedSourcePath);
        } else {
          onSelectSourceFile?.("", entry.path);
          setProjectError("ไม่พบ source video ภายในโฟลเดอร์ workspace ที่เปิดอยู่");
        }
      } else {
        onSelectSourceFile?.("", entry.path);
        setSelectedVideo({
          name: draft.title || entry.name.replace(/\.[^/.]+$/, ""),
          path: entry.path,
          isDirectory: false,
          sizeBytes: entry.sizeBytes || 0,
          modifiedUnixMs: entry.modifiedUnixMs || Date.now(),
          extension: entry.extension || "json",
          isVideo: false,
        });
      }
    } catch (err) {
      if (requestId === projectRequest.current) setProjectError(String(err));
    }
  };

  const handleImportMedia = (entry: DirectoryEntry) => {
    if (isProjectFile(entry) || isProjectFilePath(entry.path) || entry.extension?.toLowerCase() === "json") {
      setProjectError("ไฟล์โปรเจกต์ (.json/.videoproject.json) ไม่สามารถนำเข้าสู่ Media Bin ได้");
      return;
    }
    if (!selectedVideo && !loadedProjectDraft) {
      setProjectError("กรุณาเปิดวิดีโอหรือโปรเจกต์ก่อนนำเข้าสื่อเพิ่ม");
      return;
    }
    const isAud = isAudioFile(entry);
    const isImg = isImageFile(entry);
    const mediaType = isAud ? "audio" : isImg ? "image" : "video";
    const asset: ProjectAsset = {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: entry.name,
      filePath: entry.path,
      mediaType,
      importedAt: new Date().toISOString(),
    };
    setImportedAsset(asset);
  };

  const handleNewProject = async (folderPath?: string) => {
    projectRequest.current += 1;
    setProjectError(null);

    let targetDir = folderPath;

    // Prompt user to pick/select working directory with native folder dialog if not provided directly
    if (!targetDir) {
      try {
        const selected = await openFolderDialog({
          directory: true,
          multiple: false,
          title: "เลือกโฟลเดอร์ทำงานสำหรับโปรเจกต์ใหม่ (Select Project Working Directory)",
        });
        if (selected && typeof selected === "string") {
          targetDir = selected;
        } else {
          // User cancelled folder selection dialog
          return;
        }
      } catch (err) {
        console.warn("Folder picker error:", err);
        targetDir = workspace?.localPath;
      }
    }

    if (!targetDir) {
      setProjectError("กรุณาเลือกโฟลเดอร์ทำงานก่อนสร้างโปรเจกต์ใหม่");
      return;
    }

    try {
      localStorage.setItem("smartspec_last_project_folder", targetDir);
    } catch {}

    if (onWorkspacePathChange) {
      onWorkspacePathChange(targetDir);
    }

    const folderTitle = targetDir
      ? targetDir.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "โปรเจกต์ใหม่"
      : "โปรเจกต์ใหม่";

    const emptyDraft: SmartSpecProjectDraft = {
      projectId: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      version: "1.0.0",
      title: folderTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      canvas: {
        aspectRatio: "9:16",
        width: 1080,
        height: 1920,
        fps: 30,
        durationMs: 0,
      },
      tracks: [
        { id: "track_code", name: "01 Code Overlay (Reframe)", type: "code_overlay", muted: false, locked: false, volume: 1.0, clips: [] },
        { id: "track_captions", name: "T1 Captions & Text Host", type: "text_subtitle", muted: false, locked: false, volume: 1.0, clips: [] },
        { id: "track_v2", name: "V2 B-Roll Overlay (Clips & Images)", type: "video_broll", muted: false, locked: false, volume: 1.0, clips: [] },
        { id: "track_v1", name: "V1 Main Video (A-Roll)", type: "video_main", muted: false, locked: false, volume: 1.0, clips: [] },
        { id: "track_a1", name: "A1 Dialogue / Speech", type: "audio_voice", muted: false, locked: false, volume: 1.0, clips: [] },
      ],
      mediaPool: [],
      metadata: {
        originalSourceVideo: "",
        seriesId: seriesId || undefined,
        workspacePath: targetDir,
      },
    };

    // Save project file directly to chosen workspace directory on harddisk
    if (targetDir) {
      try {
        const cleanTitle = folderTitle.replace(/[\\/:*?"<>|]/g, "_");
        const diskPath = `${targetDir.replace(/[\/\\]+$/, "")}/${cleanTitle}.videoproject.json`;
        await saveNleProject(emptyDraft, diskPath);
      } catch (err) {
        console.warn("Failed to save initial project file on disk:", err);
      }
    }

    setLoadedProjectDraft(emptyDraft);
    setTimelineProject(emptyDraft);
    setTimelineProjectReady(true);
    setSpeakerSourcePath(null);
    setImportedAsset(null);
    setSelectedVideo(null);
    onSelectSourceFile?.("", targetDir);
  };

  const stages: Array<{ id: WorkspaceStage; label: string }> =
    locale === "th"
      ? [
          { id: "intake", label: "รับเข้า" },
          { id: "inventory", label: "คลังสื่อ" },
          { id: "ai-plan", label: "แผน AI" },
          { id: "review", label: "ตรวจทาน" },
          { id: "qc", label: "QC" },
          { id: "processing", label: "กำลังประมวลผล" },
          { id: "published", label: "เผยแพร่แล้ว" },
        ]
      : [
          { id: "intake", label: "Intake" },
          { id: "inventory", label: "Inventory" },
          { id: "ai-plan", label: "AI Plan" },
          { id: "review", label: "Review" },
          { id: "qc", label: "QC" },
          { id: "processing", label: "Processing" },
          { id: "published", label: "Published" },
        ];

  const copy =
    locale === "th"
      ? {
          aria: "ขั้นตอน Media workspace",
          chooseFolder: "เลือกโฟลเดอร์ต้นฉบับบนเครื่อง Worker ก่อน",
          inventory: "ยังไม่ได้ scan inventory",
          found: (supported: number, total: number) =>
            `ตรวจพบ ${supported} ไฟล์ที่รองรับ จาก ${total} ไฟล์`,
          plan: (id: string, seconds: number) => `แผน ${id} จำกัด ${seconds} วินาที`,
          noPlan: "ยังไม่มี edit plan",
          review:
            "ตรวจ intent: dead air, focus, aspect ratio และ duration budget ก่อนส่งงาน",
          qc: "QC จะตรวจ checksum, duration, dimensions, audio และ derived-only output",
          working: "กำลังประมวลผลบน Worker",
          idle: "ยังไม่มีงานกำลังประมวลผล",
          published: "แสดงเฉพาะ artifact ที่ server ยืนยันแล้วและพร้อมผูกกับ Series",
          submit: "ส่งเข้า Worker queue",
          ingest: "วิเคราะห์ inventory ทั้งโฟลเดอร์",
          explorerTab: "🗂️ Windows Explorer & Media Studio",
          stagesTab: "📊 Pipeline Stages & Status",
        }
      : {
          aria: "Media workspace stages",
          chooseFolder: "Select a source folder on the Worker machine first",
          inventory: "Inventory has not been scanned",
          found: (supported: number, total: number) =>
            `${supported} supported file(s) found out of ${total}`,
          plan: (id: string, seconds: number) => `Plan ${id} limited to ${seconds} seconds`,
          noPlan: "No edit plan yet",
          review:
            "Review dead air, focus, aspect ratio, and duration budget before submission",
          qc: "QC checks checksum, duration, dimensions, audio, and derived-only output",
          working: "Processing on the Worker",
          idle: "No job is processing",
          published: "Only server-verified artifacts ready to bind to the Series are shown",
          submit: "Submit to Worker queue",
          ingest: "Analyze inventory for the folder",
          explorerTab: "🗂️ Windows Explorer & Media Studio",
          stagesTab: "📊 Pipeline Stages & Status",
        };

  return (
    <section className="media-workspace-host" aria-label={copy.aria}>
      {/* Sleek Compact Top Bar with Dropdown Menu & Breadcrumbs */}
      <header className="studio-compact-topbar">
        <div className="studio-topbar-left">
          {/* Main System Menu Dropdown */}
          <div className="studio-menu-wrapper">
            <button
              type="button"
              className={`studio-menu-trigger ${isMenuOpen ? "active" : ""}`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              title="คลิกเพื่อเลือกโหมดระบบ / สลับเมนูการทำงาน"
            >
              <span className="menu-icon">☰</span>
              <span className="menu-title">
                {activeTab === "explorer" ? "🗂️ Media Studio" : "📊 Pipeline Stages"}
              </span>
              <span className="menu-chevron">{isMenuOpen ? "▲" : "▼"}</span>
            </button>

            {isMenuOpen && (
              <>
                <div
                  className="studio-menu-backdrop"
                  onClick={() => setIsMenuOpen(false)}
                />
                <div className="studio-menu-dropdown" role="menu">
                  <div className="menu-header">โหมดการทำงานระบบ</div>
                  <button
                    type="button"
                    className={`menu-item ${activeTab === "explorer" ? "selected" : ""}`}
                    onClick={() => {
                      setActiveTab("explorer");
                      setIsMenuOpen(false);
                    }}
                  >
                    <span className="item-badge">🗂️</span>
                    <div className="item-content">
                      <strong>Windows Explorer & Media Studio</strong>
                      <small>ตัดต่อวิดีโอ, Multi-Track NLE, Silence Cut, CapCut Export</small>
                    </div>
                    {activeTab === "explorer" && <span className="item-check">✓</span>}
                  </button>

                  <button
                    type="button"
                    className={`menu-item ${activeTab === "stages" ? "selected" : ""}`}
                    onClick={() => {
                      setActiveTab("stages");
                      setIsMenuOpen(false);
                    }}
                  >
                    <span className="item-badge">📊</span>
                    <div className="item-content">
                      <strong>Pipeline Stages & Status</strong>
                      <small>ตรวจสอบขั้นตอน Ingest, Inventory, แผน AI, และ QC การผลิต</small>
                    </div>
                    {activeTab === "stages" && <span className="item-check">✓</span>}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Quick Collapse / Expand Explorer button in Top Bar */}
          {activeTab === "explorer" && (
            <button
              type="button"
              className={`studio-toggle-explorer-btn ${isExplorerCollapsed ? "collapsed" : ""}`}
              onClick={() => setIsExplorerCollapsed(!isExplorerCollapsed)}
              title={
                isExplorerCollapsed
                  ? "แสดงแผงไฟล์ในเครื่อง (Expand File Explorer)"
                  : "ยุบแผงไฟล์ไปทางซ้ายเพื่อเพิ่มพื้นที่จอ (Collapse File Explorer)"
              }
            >
              {isExplorerCollapsed ? "📁 ขยายไฟล์ ▶" : "◀ ยุบแผงไฟล์"}
            </button>
          )}

          {/* Breadcrumbs */}
          <div className="studio-breadcrumb-strip">
            <span className="crumb-root">Studio</span>
            <span className="crumb-sep">›</span>
            <span className="crumb-mode">
              {activeTab === "explorer" ? "Media Studio" : "Pipeline"}
            </span>
            {(loadedProjectDraft?.title || selectedVideo?.name) ? (
              <>
                <span className="crumb-sep">›</span>
                <span
                  className="crumb-file"
                  title={`ชื่อ Project ที่ต้องการบันทึก: ${(loadedProjectDraft?.title || selectedVideo?.name || "").replace(/\.[^/.\\]+$/, "")}`}
                  style={{ color: "#38bdf8", fontWeight: 700 }}
                >
                  ✨ Project: {(loadedProjectDraft?.title || selectedVideo?.name || "").replace(/\.[^/.\\]+$/, "")}
                </span>
              </>
            ) : null}
            {displayWorkspacePath ? (
              <>
                <span className="crumb-sep">›</span>
                <span
                  className="crumb-file"
                  title={`ตำแหน่ง Workspace บน Harddisk: ${displayWorkspacePath}`}
                  style={{ color: "#cbd5e1", background: "rgba(15, 23, 42, 0.7)", borderColor: "rgba(148, 163, 184, 0.3)" }}
                >
                  📂 Workspace: {displayWorkspacePath}
                </span>
              </>
            ) : null}
          </div>

        </div>

        <div className="studio-topbar-right">
          <div className="studio-path-chip" title="ปุ่มลัด: Space (เล่น/หยุด) · M (ปิดเสียง) · F (เต็มจอ) · J/L (กรอเวลา)">
            <span className="folder-icon">⌨️</span>
            <span className="folder-name">Space / M / F</span>
          </div>
          {displayWorkspacePath && (
            <div className="studio-path-banner-inline" title={`ตำแหน่งโฟลเดอร์ Workspace บน Disk: ${displayWorkspacePath}`}>
              <span className="path-label">📍 Path:</span>
              <code className="path-text">{displayWorkspacePath}</code>
              <button
                type="button"
                className="path-inline-btn"
                onClick={async () => {
                  if (displayWorkspacePath) {
                    try {
                      if (workspace) {
                        await invoke("worker_app_reveal_file", { path: workspace.localPath });
                      }
                    } catch (err) {
                      console.warn("Failed to reveal file/folder:", err);
                    }
                  }
                }}
                title="เปิดตำแหน่งโฟลเดอร์นี้ใน File Explorer บนระบบปฏิบัติการ"
              >
                📁 เปิดในเครื่อง
              </button>
              <button
                type="button"
                className="path-inline-btn"
                onClick={() => {
                  if (displayWorkspacePath) {
                    navigator.clipboard.writeText(displayWorkspacePath);
                    setCopiedPath(true);
                    setTimeout(() => setCopiedPath(false), 2000);
                  }
                }}
                title="คัดลอก Path เต็มเข้า Clipboard"
              >
                {copiedPath ? "✅ คัดลอกแล้ว!" : "📋 คัดลอก Path"}
              </button>
            </div>
          )}

          {onOpenIntentSettings && (
            <button
              type="button"
              className="studio-intent-btn"
              onClick={onOpenIntentSettings}
              title="ตั้งค่า AI Preprocessing Intent"
            >
              ⚙️ ตั้งค่า Intent
            </button>
          )}
        </div>
      </header>

      {projectError && <p role="alert">{projectError}</p>}
      {/* Explorer & Video Studio Workspace */}
      {activeTab === "explorer" && (
        <div className={`media-studio-layout ${isExplorerCollapsed ? "explorer-collapsed" : ""}`}>
          <div
            className={`studio-explorer-pane ${isExplorerCollapsed ? "collapsed" : ""}`}
            style={isExplorerCollapsed ? undefined : { width: `${explorerWidth}px`, minWidth: `${explorerWidth}px` }}
          >
            {isExplorerCollapsed ? (
              <div
                className="explorer-collapsed-rail"
                onClick={() => setIsExplorerCollapsed(false)}
                title="คลิกเพื่อเปิดแถบเลือกไฟล์จากเครื่อง (Expand Explorer)"
              >
                <button
                  type="button"
                  className="rail-expand-btn"
                  onClick={() => setIsExplorerCollapsed(false)}
                >
                  <span className="rail-icon">📁</span>
                  <span className="rail-text">ไฟล์ในเครื่อง</span>
                  <span className="rail-arrow">▶</span>
                </button>
              </div>
            ) : (
              <MediaExplorerView
                initialPath={displayWorkspacePath || undefined}
                onSelectVideoFile={handleSelectVideo}
                onOpenProjectFile={handleOpenProjectFile}
                onImportMediaToProject={handleImportMedia}
                onNewProject={(folderPath) => {
                  if (folderPath) {
                    try {
                      localStorage.setItem("smartspec_last_project_folder", folderPath);
                    } catch {}
                    if (onWorkspacePathChange) {
                      onWorkspacePathChange(folderPath);
                    }
                  }
                  void handleNewProject(folderPath);
                }}
                onDirectoryChange={(path) => {
                  if (path) {
                    try {
                      localStorage.setItem("smartspec_last_project_folder", path);
                    } catch {}
                    if (onWorkspacePathChange) {
                      onWorkspacePathChange(path);
                    }
                  }
                }}
                selectedFilePath={selectedVideo?.path}
                focusMediaRequest={mediaPickerRequest}
                onCollapse={() => setIsExplorerCollapsed(true)}
              />
            )}
          </div>

          {!isExplorerCollapsed && (
            <div
              className="studio-explorer-resizer"
              onMouseDown={handleResizeMouseDown}
              title="ลากเพื่อปรับขนาดความกว้างแผงไฟล์ (Drag to resize File Explorer panel)"
            />
          )}

          <div className="studio-player-pane">
            <div className="media-studio-feature-toolbar">
              <div className="media-studio-feature-status" role="status" aria-live="polite">
                {isSpeakerAwareOpen ? "แผงวิเคราะห์ผู้พูดเปิดอยู่" : "พร้อมวิเคราะห์ทั้งคลิป"}
              </div>
              <button
                type="button"
                className={`secondary-button${isSpeakerAwareOpen ? " active" : ""}`}
                onClick={() => setIsSpeakerAwareOpen((current) => !current)}
                aria-expanded={isSpeakerAwareOpen}
                aria-controls="speaker-aware-workflow-panel"
              >
                {isSpeakerAwareOpen ? "✕ ปิดแผงวิเคราะห์" : "🎙️ วิเคราะห์ผู้พูดและวางแผนตัดต่อ"}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void runFolderBatch()}
                disabled={!batchProjectFolder || folderBatchRunning || folderBatchPreparing || busy}
                title={locale === "th" ? "สแกนและตัดต่อวิดีโอทั้งหมดในโฟลเดอร์ Project ทีละไฟล์" : "Scan and edit every video beside this project, one at a time"}
              >
                {folderBatchRunning
                  ? (locale === "th" ? "กำลังทำ Batch…" : "Batch in progress…")
                  : folderBatchPreparing
                    ? (locale === "th" ? "กำลังตรวจสอบก่อนยืนยัน…" : "Preparing confirmation…")
                  : (locale === "th" ? "✂️ ตัดต่อวิดีโอทั้งโฟลเดอร์" : "✂️ Edit all videos in folder")}
              </button>
            </div>
            {folderBatchRunning || folderBatchPreparing || folderBatchItems.length > 0 || folderBatchError || folderBatchMessage ? (
              <section className="workspace-status-card" aria-label={locale === "th" ? "ความคืบหน้า Batch" : "Batch progress"}>
                {folderBatchError ? <p className="connect-message error" role="alert">{folderBatchError}</p> : null}
                {folderBatchMessage ? <p className="media-studio-feature-status" role="status" aria-live="polite">{folderBatchMessage}</p> : null}
                {folderBatchDebugLogPath ? (
                  <div className="media-batch-debug-log">
                    <p>
                      {locale === "th" ? "ไฟล์วิเคราะห์ Batch (JSONL):" : "Batch diagnostic log (JSONL):"}{" "}
                      <code style={{ overflowWrap: "anywhere" }}>{folderBatchDebugLogPath}</code>
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void invoke("worker_app_open_file", { path: folderBatchDebugLogPath })
                        .catch((error) => setFolderBatchError(invokeError(error)))}
                    >
                      {locale === "th" ? "เปิดไฟล์ Debug log" : "Open debug log file"}
                    </button>{" "}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void (async () => {
                        try {
                          if (!navigator.clipboard) throw new Error("clipboard_unavailable");
                          await navigator.clipboard.writeText(folderBatchDebugLogPath);
                          setFolderBatchMessage(locale === "th" ? "คัดลอกตำแหน่ง Debug log แล้ว" : "Debug log path copied.");
                        } catch (error) {
                          setFolderBatchError(invokeError(error));
                        }
                      })()}
                    >
                      {locale === "th" ? "คัดลอก Path" : "Copy path"}
                    </button>
                    {folderBatchDebugLogWriteError ? (
                      <p className="warning" role="alert">
                        {locale === "th" ? "เขียน Debug log ไม่สำเร็จ:" : "Could not write debug log:"} {folderBatchDebugLogWriteError}
                      </p>
                    ) : null}
                  </div>
                ) : folderBatchDebugLogWriteError ? (
                  <p className="warning" role="alert">
                    {locale === "th" ? "สร้าง Debug log ไม่สำเร็จ:" : "Could not create debug log:"} {folderBatchDebugLogWriteError}
                  </p>
                ) : null}
                {folderBatchItems.length > 0 ? (
                  <>
                    <p className="subtle">
                      {locale === "th" ? "ความคืบหน้า" : "Progress"}: {folderBatchItems.filter((item) => ["completed", "skipped", "failed", "canceled"].includes(item.status)).length}/{folderBatchItems.length}
                    </p>
                    <progress
                      value={folderBatchItems.filter((item) => ["completed", "skipped", "failed", "canceled"].includes(item.status)).length}
                      max={folderBatchItems.length}
                      aria-label={locale === "th" ? "ความคืบหน้าของการตัดต่อทั้งโฟลเดอร์" : "Folder edit progress"}
                    />
                    <ul>
                      {folderBatchItems.map((item) => (
                        <li key={item.relativeName}>
                          <span>{item.displayName}</span>{" · "}
                          <span>{locale === "th"
                            ? ({ queued: "รอคิว Render", scanning: "สแกน Face + Activity ทั้งคลิป", dead_air_scan: "สแกน Dead Air ทั้งคลิป", rendering: "กำลัง Render ในเครื่อง", saving: "กำลังบันทึก MP4", completed: "เสร็จแล้ว", skipped: "ข้าม (มีไฟล์แล้ว)", failed: "ผิดพลาด", canceled: "ยกเลิก" } as const)[item.status]
                            : ({ queued: "Queued for local render", scanning: "Full Face + Activity scan", dead_air_scan: "Full Dead Air scan", rendering: "Rendering locally", saving: "Saving MP4", completed: "Completed", skipped: "Skipped (output exists)", failed: "Failed", canceled: "Canceled" } as const)[item.status]}</span>
                          {item.error ? <span className="warning"> · {item.error}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {folderBatchRunning ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setFolderBatchCancelRequested(true);
                      if (folderBatchId) {
                        void invoke("worker_app_cancel_local_folder_batch", { batchId: folderBatchId })
                          .catch((error) => setFolderBatchError(invokeError(error)));
                      } else {
                        folderBatchCancelRef.current = true;
                      }
                    }}
                    disabled={folderBatchCancelRequested}
                  >
                    {folderBatchCancelRequested
                      ? (locale === "th" ? "จะหยุดหลังวิดีโอปัจจุบัน" : "Will stop after the current video")
                      : (locale === "th" ? "หยุดหลังวิดีโอปัจจุบัน" : "Stop after current video")}
                  </button>
                ) : null}
              </section>
            ) : null}
            {folderBatchRunning ? (
              <section className="workspace-status-card pending" role="status" aria-live="polite">
                <p>{locale === "th"
                  ? "⏳ กำลังทำงานในเครื่องเบื้องหลัง ไม่ต้องเปิดวิดีโอหรือใส่คลิปใน Timeline — อย่าปิด Worker App จนกว่าจะเสร็จ"
                  : "⏳ Running locally in the background. No video preview or timeline import is needed. Keep Worker App open until it finishes."}</p>
                <p className="subtle">{folderBatchMessage}</p>
              </section>
            ) : (
              <MediaVideoEditorPlayer
                key={`${selectedVideo?.path ?? "empty"}:${loadedProjectDraft?.projectId ?? "source"}`}
                videoFile={selectedVideo}
                onSelectVideoFile={handleSelectVideo}
                onOpenProjectFile={handleOpenProjectFile}
                seriesId={seriesId || loadedProjectDraft?.metadata?.seriesId}
                workspacePath={displayWorkspacePath || undefined}
                onClose={handleNewProject}
                reframe9x16={reframe9x16}
                onReframe9x16Change={onReframe9x16Change}
                focusX={focusX}
                onFocusXChange={onFocusXChange}
                focusY={focusY}
                onFocusYChange={onFocusYChange}
                focusMode={focusMode || "auto_person"}
                onFocusModeChange={onFocusModeChange}
                removeDeadAir={removeDeadAir}
                onRemoveDeadAirChange={onRemoveDeadAirChange}
                onOpenIntentSettings={onOpenIntentSettings}
                openAutoSubtitleRequest={autoSubtitleRequest}
                plan={plan}
                onBuildPlan={onBuildPlan}
                onSubmitJob={onSubmit}
                canSubmitJob={canSubmit}
                isBusy={busy}
                loadedProjectDraft={loadedProjectDraft}
                onTimelineProjectChange={handleTimelineProjectChange}
                importedAsset={importedAsset}
                onProjectDraftChange={setLoadedProjectDraft}
              />
            )}
            {batchScanTarget ? (
              <section className="media-batch-scan-surface" aria-hidden="true">
                <MediaVideoEditorPlayer
                  key={batchScanTarget.request.id}
                  videoFile={batchScanTarget.entry}
                  workspacePath={displayWorkspacePath || undefined}
                  reframe9x16={reframe9x16}
                  focusX={focusX}
                  focusY={focusY}
                  focusMode="auto_person"
                  removeDeadAir
                  isBusy
                  batchFullScanRequest={batchScanTarget.request}
                  onBatchFullScanResult={handleBatchFullScanResult}
                  onBatchDebugLogUpdate={handleBatchDebugLogUpdate}
                />
              </section>
            ) : null}
            {isSpeakerAwareOpen ? (
              <SpeakerAwareWorkflowPanel
                ref={speakerAwarePanelRef}
                seriesId={seriesId || loadedProjectDraft?.metadata?.seriesId}
                onRequestSourceSelection={() => {
                  setActiveTab("explorer");
                  setIsExplorerCollapsed(false);
                  setMediaPickerRequest((current) => current + 1);
                }}
                sourceLabel={selectedVideo?.isVideo
                  ? resolveWorkspaceRelativePath(workspace?.localPath, speakerSourcePath || selectedVideo.path) || sourceRelativeName || selectedVideo.name
                  : (speakerSourcePath ? resolveWorkspaceRelativePath(workspace?.localPath, speakerSourcePath) : null) || sourceRelativeName || null}
                sourceOptions={timelineVideoOptions}
                selectedSourcePath={speakerSourcePath}
                onSourcePathChange={setSpeakerSourcePath}
                busy={busy || folderBatchRunning}
                onOpenSubtitleEditor={() => setAutoSubtitleRequest((current) => current + 1)}
                onRequestScan={onSpeakerAwareRequestScan ? (input) => onSpeakerAwareRequestScan({
                  ...input,
                  sourceRelativeName: resolveWorkspaceRelativePath(workspace?.localPath, speakerSourcePath || selectedVideo?.path)
                    || timelineVideoOptions.find((option) => option.path === speakerSourcePath)?.relativeName
                    || sourceRelativeName?.trim()
                    || "",
                }) : undefined}
              />
            ) : null}
          </div>
        </div>
      )}

      {/* Pipeline Stages & Cards View */}
      {activeTab === "stages" && (
        <div className="media-stages-content">
          <div className="media-stage-nav">
            {stages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={stage === item.id ? "active" : ""}
                onClick={() => setStage(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="workspace-status-card" role="status">
            <strong>{stages.find((item) => item.id === stage)?.label}</strong>
            {stage === "intake" && (
              <span>
                {workspace
                  ? locale === "th"
                    ? "เลือกโฟลเดอร์ footage ในเครื่องแล้ว"
                    : "Local footage root selected"
                  : copy.chooseFolder}
              </span>
            )}
            {stage === "inventory" && (
              <span>
                {scan ? copy.found(scan.supportedFileCount, scan.fileCount) : copy.inventory}
              </span>
            )}
            {stage === "ai-plan" && (
              <span>
                {plan ? copy.plan(plan.planId, Math.round(plan.trimEndMs / 1000)) : copy.noPlan}
              </span>
            )}
            {stage === "review" && <span>{copy.review}</span>}
            {stage === "qc" && <span>{copy.qc}</span>}
            {stage === "processing" && <span>{busy ? copy.working : copy.idle}</span>}
            {stage === "published" && <span>{copy.published}</span>}
            {onSubmit ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onSubmit()}
                disabled={!canSubmit || busy}
              >
                {copy.submit}
              </button>
            ) : null}
            {onIngest ? (
              <button
                type="button"
                className="secondary-button"
                onClick={onIngest}
                disabled={!workspace || busy}
              >
                {copy.ingest}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
