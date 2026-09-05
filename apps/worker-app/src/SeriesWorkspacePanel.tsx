import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useWorkerAppContext } from "./app/workerContext";
import { MediaWorkspaceHost } from "./screens/media-workspace/MediaWorkspaceHost";
import type { CanonicalWorkerRouteId } from "./app/workerRoutes";

type SeriesProjection = {
  seriesId: string;
  title: string;
  status: string;
  accessMode: "read" | "operate";
  accessSource: string;
  bindingRevision: number | null;
  bindingStatus: string | null;
  canBind?: boolean;
  canProcess?: boolean;
  canPublish?: boolean;
  updatedAt: string;
};
type SeriesListResponse = {
  contractVersion: string;
  items: SeriesProjection[];
  nextCursor: string | null;
};
type WorkspaceStatus = {
  seriesId: string;
  rootId: string;
  localPath: string;
  workspaceMode: string;
  status: string;
  fileCount: number;
  totalBytes: number;
  lastScanAt: string | null;
} | null;
type ScanPreview = {
  rootId: string;
  fileCount: number;
  totalBytes: number;
  supportedFileCount: number;
  skippedFileCount: number;
  status: string;
  entries: Array<{
    relativeName: string;
    kind: string;
    sizeBytes: number;
    fingerprint: string;
  }>;
};
type ImportFilesResult = {
  imported: Array<{
    sourceName: string;
    relativeName: string;
    sizeBytes: number;
    fingerprint: string;
  }>;
  scan: ScanPreview;
};

type MediaAnalysis = {
  durationMs: number | null;
  probe: { width: number | null; height: number | null; hasAudio: boolean };
  silenceSegments: Array<{ startMs: number; endMs: number | null }>;
  blackSegments: Array<{ startMs: number; endMs: number | null }>;
  frozenSegments: Array<{ startMs: number; endMs: number | null }>;
  sceneCandidates: Array<{ startMs: number; endMs: number | null }>;
  blurScores: number[];
  focusCandidates: Array<{ confidence: number; requiresReview: boolean }>;
  status: string;
  warning: string | null;
};

function invokeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildMediaIdempotencyKey(input: {
  seriesId: string;
  sourceRelativeName: string;
  sourceFingerprint?: string | null;
  processingMode: "manual_intent" | "automated_ai_editing";
  removeDeadAir: boolean;
  reframe9x16: boolean;
  focusMode: string;
  focusX: number;
  focusY: number;
  stillMotion: string | null;
  maxDurationMs: number;
}): string {
  const safe = (value: string, maxLength: number) =>
    value.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, maxLength);
  const sourceToken = safe(input.sourceFingerprint || input.sourceRelativeName, 64);
  const intentToken = safe(
    [
      input.processingMode,
      input.removeDeadAir ? "dead-air" : "keep-air",
      input.reframe9x16 ? "portrait" : "source",
      input.focusMode,
      input.focusX.toFixed(2),
      input.focusY.toFixed(2),
      input.stillMotion || "none",
      input.maxDurationMs,
    ].join("-"),
    32,
  );
  return `worker-media:${safe(input.seriesId, 24)}:${sourceToken}:${intentToken}`.slice(0, 128);
}

type WorkspaceMode = "series" | "media";
type WorkspacePanelProps = {
  mode?: WorkspaceMode;
  onNavigate?: (route: CanonicalWorkerRouteId) => void;
};

export function SeriesWorkspacePanel({ mode = "series", onNavigate }: WorkspacePanelProps = {}) {
  const isMedia = mode === "media";
  const { selectedSeriesId: contextSeriesId, setSelectedSeriesId: setContextSeriesId, setSelectedRootId, locale } =
    useWorkerAppContext();
  const copy = locale === "th" ? {
    refresh: "รีเฟรช Series", heading: "จัดการ Series และโฟลเดอร์", mediaHeading: "เตรียมสื่อสำหรับ Series", description: "เลือก Series และจัดการโฟลเดอร์ต้นฉบับบนเครื่อง Worker จากหน้านี้ ส่วนการ scan วิเคราะห์ และ preprocessing อยู่ใน Media Workspace",
    mediaDescription: "ใช้โฟลเดอร์และ Series ที่เลือกไว้เพื่อ scan วิเคราะห์ ตัด dead air, reframe 9:16 และส่งงาน preprocessing ไปยัง Worker queue",
    series: "Series ที่เข้าถึงได้", search: "ค้นหา", searchPlaceholder: "ค้นหา Series…", noSeries: "ยังไม่พบ Series หรือยังไม่ได้เชื่อมต่อ Worker", loadMore: "โหลด Series เพิ่ม", operate: "จัดการได้", readOnly: "ดูได้อย่างเดียว",
    root: "โฟลเดอร์ต้นฉบับของ Series", localPath: "Local folder path", pathPlaceholder: "เลือกโฟลเดอร์ หรือกรอก path", pathHelp: "path นี้อยู่บนเครื่อง Worker และส่งให้ native Worker ตรวจสอบเท่านั้น ไม่แสดงในข้อมูลที่ส่งกลับ server", choose: "เลือกโฟลเดอร์", create: "สร้างโฟลเดอร์ย่อย", validate: "ตรวจสอบและเลือกโฟลเดอร์", bind: "ผูกกับ Series", revoke: "ยกเลิกการผูก", folder: "โฟลเดอร์", files: "ไฟล์ทั้งหมด", bytes: "ขนาด",
    scan: "Scan preview", import: "เพิ่มไฟล์เข้า incoming", scanFound: "พบสื่อที่รองรับ", skipped: "ข้ามไฟล์", total: "รวม", nextStep: "ขั้นต่อไป: เลือก profile preprocessing และส่งงาน GPU", inventory: "รายการสื่อที่พบ", selectAll: "เลือกทั้งหมด", clearSelection: "ล้างการเลือก", analyze: "วิเคราะห์สื่อที่เลือก", notAnalyzed: "ยังไม่วิเคราะห์", analyzing: "กำลังวิเคราะห์ในเครื่อง…", analysisFailed: "วิเคราะห์ไม่สำเร็จ", processing: "สถานะงาน", submitSelected: "ส่งรายการที่เลือกเข้า preprocessing", cancelRemaining: "ยกเลิกการส่งรายการที่เหลือ",
    intentHeading: "AI-assisted preprocessing intent", sourceFile: "ไฟล์ใน root (relative name)", editingMode: "Editing mode", guided: "Guided / Manual intent", automated: "Automated AI editing (ต้องผ่าน AI plan/QC)", removeDeadAir: "ตัด dead air", reframe: "Reframe 9:16", focus: "Focus", autoSubject: "AI เลือก subject (ต้องมี vision worker)", autoPerson: "บุคคลอัตโนมัติ (ต้องมี vision worker)", autoObject: "วัตถุอัตโนมัติ (ต้องมี vision worker)", manualRegion: "กำหนด focus เอง", maxDuration: "ความยาวสูงสุด", seconds: "วินาที", focusX: "Focus X", focusY: "Focus Y", stillMotion: "Still motion", noMotion: "ไม่ขยับ", buildPlan: "สร้างแผนตัดต่อ", planReady: "พร้อมส่งขั้นตอน GPU/QC", focusWarning: "โหมด AI focus จะส่งต่อได้เมื่อ Worker มี subject/face/object track ที่ผ่านการตรวจสอบแล้ว ขณะนี้เลือก “กำหนด focus เอง” เพื่อสร้าง 9:16 แบบปลอดภัย", automatedWarning: "Automated AI เป็น intent ที่ต้องผ่าน planner และ QC; Worker รุ่นนี้จะไม่ apply อัตโนมัติหากยังไม่มี AI plan/subject track ที่ตรวจสอบแล้ว", submit: "ส่งงานเข้า Worker queue",
    selectedSeries: "Series ที่เลือก", noSelectedSeries: "ยังไม่ได้เลือก Series", chooseSeries: "เลือก Series ก่อนจึงจะ scan หรือส่งงาน preprocessing ได้", manageSeries: "จัดการ Series และโฟลเดอร์", goSelectSeries: "ไปเลือก Series", noFolder: "ยังไม่ได้เลือกโฟลเดอร์สำหรับ Series นี้", chooseFolderFirst: "กลับไป Series workspace เพื่อเลือกหรือสร้างโฟลเดอร์", canOperate: "จัดการได้", readOnlyAccess: "ดูได้อย่างเดียว"
  } : {
    refresh: "Refresh Series", heading: "Manage Series and folders", mediaHeading: "Prepare media for this Series", description: "Select a Series and manage its local source folder here. Scanning, analysis, and preprocessing belong in Media Workspace.",
    mediaDescription: "Use the selected Series and local folder to scan, analyze, remove dead air, reframe to 9:16, and submit preprocessing jobs to the Worker queue.",
    series: "Accessible Series", search: "Search", searchPlaceholder: "Search Series…", noSeries: "No Series found or the Worker is not connected", loadMore: "Load more Series", operate: "Can operate", readOnly: "Read only",
    root: "Series source folder", localPath: "Local folder path", pathPlaceholder: "Choose a folder or enter a path", pathHelp: "This path stays on the Worker machine and is only validated by the native Worker; it is never returned to the server.", choose: "Choose folder", create: "Create subfolder", validate: "Validate and select folder", bind: "Bind to Series", revoke: "Unbind", folder: "Folder", files: "Files", bytes: "Size",
    scan: "Scan preview", import: "Add files to incoming", scanFound: "Supported media", skipped: "Skipped", total: "Total", nextStep: "Next: choose a preprocessing profile and submit the GPU job.", inventory: "Media found", selectAll: "Select all", clearSelection: "Clear selection", analyze: "Analyze selected media", notAnalyzed: "Not analyzed", analyzing: "Analyzing locally…", analysisFailed: "Analysis failed", processing: "Job status", submitSelected: "Submit selected for preprocessing", cancelRemaining: "Cancel remaining submissions",
    intentHeading: "AI-assisted preprocessing intent", sourceFile: "File in root (relative name)", editingMode: "Editing mode", guided: "Guided / Manual intent", automated: "Automated AI editing (requires AI plan/QC)", removeDeadAir: "Remove dead air", reframe: "Reframe 9:16", focus: "Focus", autoSubject: "AI subject selection (requires vision Worker)", autoPerson: "Automatic person (requires vision Worker)", autoObject: "Automatic object (requires vision Worker)", manualRegion: "Set focus manually", maxDuration: "Maximum duration", seconds: "seconds", focusX: "Focus X", focusY: "Focus Y", stillMotion: "Still motion", noMotion: "No motion", buildPlan: "Build edit plan", planReady: "Ready for GPU/QC", focusWarning: "AI focus requires a verified subject/face/object track. Choose “Set focus manually” to create a safe 9:16 output.", automatedWarning: "Automated AI is an intent that must pass the planner and QC; this Worker will not apply it automatically without a verified AI plan/subject track.", submit: "Submit to Worker queue",
    selectedSeries: "Selected Series", noSelectedSeries: "No Series selected", chooseSeries: "Select a Series before scanning or submitting preprocessing jobs.", manageSeries: "Manage Series and folders", goSelectSeries: "Select a Series", noFolder: "No folder selected for this Series", chooseFolderFirst: "Return to Series workspace to choose or create a folder", canOperate: "Can operate", readOnlyAccess: "Read only"
  };
  const [series, setSeries] = useState<SeriesProjection[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState(contextSeriesId ?? "");
  const [seriesQuery, setSeriesQuery] = useState("");
  const [nextSeriesCursor, setNextSeriesCursor] = useState<string | null>(null);
  const [rootPath, setRootPath] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceStatus>(null);
  const [scan, setScan] = useState<ScanPreview | null>(null);
  const [sourceRelativeName, setSourceRelativeName] = useState("");
  const [removeDeadAir, setRemoveDeadAir] = useState(true);
  const [reframe9x16, setReframe9x16] = useState(true);
  const [focusMode, setFocusMode] = useState("auto_person");
  const [focusX, setFocusX] = useState(0.5);
  const [focusY, setFocusY] = useState(0.5);
  const [stillMotion, setStillMotion] = useState<string | null>(null);
  const [maxDurationMs, setMaxDurationMs] = useState(90000);
  const [processingMode, setProcessingMode] = useState<
    "manual_intent" | "automated_ai_editing"
  >("manual_intent");
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(
    new Set(),
  );
  const [analysisByEntry, setAnalysisByEntry] = useState<
    Record<string, MediaAnalysis | { status: "analyzing" | "failed"; error?: string }>
  >({});
  const [processingByEntry, setProcessingByEntry] = useState<
    Record<string, { status: "queued" | "submitted" | "failed" | "canceled"; error?: string }>
  >({});
  const [batchCancelRequested, setBatchCancelRequested] = useState(false);
  const batchCancelRef = useRef(false);
  const [plan, setPlan] = useState<{
    planId: string;
    trimEndMs: number;
    outputRelativeName: string;
  } | null>(null);
  const [isIntentModalOpen, setIsIntentModalOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const focusNeedsVisionWorker = !isMedia && reframe9x16 && focusMode !== "manual_region";

  const loadSeries = useCallback(async (options: { append?: boolean; cursor?: string | null; query: string }) => {
    setBusy(true);
    setError("");
    try {
      const response = await invoke<SeriesListResponse>(
        "worker_app_list_series",
        { query: options.query.trim() || null, cursor: options.cursor ?? null },
      );
      setSeries((current) => options?.append ? [...current, ...response.items] : response.items);
      setNextSeriesCursor(response.nextCursor);
      if (!options?.append && response.items[0]) setSelectedSeriesId((current) => {
        if (current) return current;
        setContextSeriesId(response.items[0].seriesId);
        return response.items[0].seriesId;
      });
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  }, [setContextSeriesId]);
  useEffect(() => {
    void loadSeries({ query: "" });
  }, [loadSeries]);
  useEffect(() => {
    if (contextSeriesId && contextSeriesId !== selectedSeriesId) {
      setSelectedSeriesId(contextSeriesId);
      setWorkspace(null);
      setSelectedRootId(null);
      setRootPath("");
      setScan(null);
      setSelectedEntries(new Set());
      setPlan(null);
      setSourceRelativeName("");
      setProcessingByEntry({});
      setAnalysisByEntry({});
    }
  }, [contextSeriesId, selectedSeriesId, setSelectedRootId]);
  useEffect(() => {
    if (!selectedSeriesId) return;
    void invoke<WorkspaceStatus>("worker_app_select_series_workspace", { seriesId: selectedSeriesId })
      .then(value => {
        setWorkspace(value);
        setSelectedRootId(value?.rootId ?? null);
        setRootPath(value?.localPath ?? "");
      })
      .catch(() => { setWorkspace(null); setSelectedRootId(null); setRootPath(""); });
  }, [selectedSeriesId, setSelectedRootId]);

  const selected =
    series.find((item) => item.seriesId === selectedSeriesId) ?? null;
  const selectSeries = (seriesId: string) => {
    setSelectedSeriesId(seriesId);
    setContextSeriesId(seriesId);
    // Never leave actions enabled against the previously selected Series while
    // the native Worker loads the new local workspace projection.
    setWorkspace(null);
    setSelectedRootId(null);
    setRootPath("");
    setScan(null);
    setSelectedEntries(new Set());
    setPlan(null);
    setSourceRelativeName("");
    setProcessingByEntry({});
    setAnalysisByEntry({});
  };
  const selectRoot = async () => {
    if (!selected || !rootPath.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const projection = await invoke<WorkspaceStatus>(
        "worker_app_pick_local_root",
        { seriesId: selected.seriesId, path: rootPath.trim() },
      );
      setWorkspace(projection);
      setSelectedRootId(projection?.rootId ?? null);
      setMessage(locale === "th" ? "โฟลเดอร์อยู่ในเครื่อง Worker และพร้อมตรวจสอบไฟล์" : "The folder is on the Worker machine and ready for validation.");
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  };
  const chooseRoot = async () => {
    const selectedPath = await openFolderDialog({
      directory: true,
      multiple: false,
      title: locale === "th" ? "เลือกโฟลเดอร์ footage ของ Series" : "Choose the Series footage folder",
    });
    if (typeof selectedPath === "string") setRootPath(selectedPath);
  };
  const createSeriesFolder = async () => {
    if (!selected) return;
    let parentPath: string | null = null;
    if (!workspace) {
      const selectedParent = await openFolderDialog({
        directory: true,
        multiple: false,
        title: locale === "th" ? "เลือกโฟลเดอร์หลักสำหรับ Series ใหม่" : "Choose a parent folder for the new Series",
      });
      if (typeof selectedParent !== "string") return;
      parentPath = selectedParent;
    }
    const folderName = window.prompt(locale === "th" ? "ชื่อโฟลเดอร์ใหม่ของ Series" : "New Series folder name");
    if (!folderName?.trim()) return;
    setBusy(true);
    setError("");
    try {
      const projection = await invoke<WorkspaceStatus>("worker_app_create_series_folder", {
        seriesId: selected.seriesId,
        folderName: folderName.trim(),
        parentPath,
      });
      setWorkspace(projection);
      setSelectedRootId(projection?.rootId ?? null);
      setRootPath("");
      setScan(null);
      setMessage(locale === "th" ? "สร้างและผูกโฟลเดอร์ใหม่กับ Series แล้ว" : "The new folder was created and bound to the Series.");
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  };
  const importFiles = async () => {
    if (!workspace) return;
    const selectedPaths = await openFolderDialog({
      multiple: true,
      directory: false,
      title: locale === "th" ? "เพิ่มไฟล์ footage เข้า incoming ของ Series" : "Add footage files to the Series incoming folder",
      filters: [{ name: "Media", extensions: ["mp4", "mov", "m4v", "mkv", "webm", "avi", "jpg", "jpeg", "png", "webp"] }],
    });
    const paths = Array.isArray(selectedPaths)
      ? selectedPaths
      : selectedPaths
        ? [selectedPaths]
        : [];
    if (!paths.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await invoke<ImportFilesResult>(
        "worker_app_import_local_files",
        { sourcePaths: paths },
      );
      setScan(result.scan);
      setSelectedEntries(new Set(result.scan.entries.map((entry) => entry.relativeName)));
      setWorkspace(await invoke<WorkspaceStatus>("worker_app_get_local_workspace_status"));
      setMessage(locale === "th" ? `นำเข้าไฟล์เข้า incoming แล้ว ${result.imported.length} ไฟล์ และพร้อม scan/preprocess` : `${result.imported.length} file(s) imported into incoming and ready to scan/preprocess.`);
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  };
  const scanRoot = async () => {
    setBusy(true);
    setError("");
    try {
      const nextScan = await invoke<ScanPreview>("worker_app_scan_preview");
      setScan(nextScan);
      setSelectedEntries(
        new Set(nextScan.entries.map((entry) => entry.relativeName)),
      );
      setWorkspace(
        await invoke<WorkspaceStatus>("worker_app_get_local_workspace_status"),
      );
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  };
  const bindSeries = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const expectedRevision = selected.bindingRevision ?? 0;
      const result = await invoke<{ status: string; bindingRevision: number }>(
        "worker_app_bind_series",
        {
          seriesId: selected.seriesId,
          expectedRevision,
          idempotencyKey: `worker-series-bind:${selected.seriesId}:${Date.now()}`,
        },
      );
      setMessage(
        locale === "th"
          ? `ผูก Series สำเร็จ สถานะ ${result.status} revision ${result.bindingRevision}`
          : `Series bound successfully: ${result.status}, revision ${result.bindingRevision}`,
      );
      await loadSeries({ query: seriesQuery });
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  };
  const revokeRoot = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await invoke("worker_app_revoke_local_root", { seriesId: selected.seriesId });
      setWorkspace(null);
      setScan(null);
      setSelectedRootId(null);
      setRootPath("");
      setMessage(locale === "th" ? "ยกเลิกการผูกโฟลเดอร์ในเครื่องแล้ว" : "The local folder binding was revoked.");
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  };
  const buildPlan = async () => {
    if (!selected || !sourceRelativeName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await invoke<{
        planId: string;
        trimEndMs: number;
        outputRelativeName: string;
      }>("worker_app_build_media_plan", {
        seriesId: selected.seriesId,
        sourceRelativeName: sourceRelativeName.trim(),
        options: {
          removeDeadAir,
          reframe9x16,
          focusMode,
          stillMotion,
          maxDurationMs,
          sourceDurationMs: maxDurationMs,
          focusX,
          focusY,
        },
      });
      setPlan(result);
      setMessage(
        locale === "th"
          ? "สร้างแผน preprocessing แล้ว ไฟล์ต้นฉบับยังอยู่ในเครื่อง Worker"
          : "Preprocessing plan created. The source file remains on the Worker machine.",
      );
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  };
  const submitJob = async () => {
    if (!selected || !sourceRelativeName.trim() || !selected.bindingRevision)
      return;
    setBusy(true);
    setError("");
    try {
      const result = await invoke<{ jobId?: string; status: string }>(
        "worker_app_submit_media_job",
        {
          seriesId: selected.seriesId,
          bindingRevision: selected.bindingRevision,
          sourceRelativeName: sourceRelativeName.trim(),
          removeDeadAir,
          reframe9x16,
          focusMode,
          focusX,
          focusY,
          stillMotion,
          maxDurationMs,
          processingMode,
          idempotencyKey: buildMediaIdempotencyKey({
            seriesId: selected.seriesId,
            sourceRelativeName: sourceRelativeName.trim(),
            sourceFingerprint: scan?.entries.find((entry) => entry.relativeName === sourceRelativeName.trim())?.fingerprint,
            processingMode,
            removeDeadAir,
            reframe9x16,
            focusMode,
            focusX,
            focusY,
            stillMotion,
            maxDurationMs,
          }),
        },
      );
      setMessage(
        locale === "th"
          ? `ส่งงาน Worker queue แล้ว ${result.jobId ? `Job ${result.jobId}` : result.status}`
          : `Worker queue accepted ${result.jobId ? `Job ${result.jobId}` : result.status}`,
      );
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  };
  const submitBatch = async () => {
    if (
      !selected ||
      !workspace ||
      !selected.bindingRevision ||
      selectedEntries.size === 0
    )
      return;
    setBusy(true);
    setError("");
    setBatchCancelRequested(false);
    batchCancelRef.current = false;
    try {
      let submitted = 0;
      let failed = 0;
      for (const relativeName of selectedEntries) {
        if (batchCancelRef.current) {
          setProcessingByEntry((current) => ({ ...current, [relativeName]: { status: "canceled" } }));
          continue;
        }
        setProcessingByEntry((current) => ({ ...current, [relativeName]: { status: "queued" } }));
        try {
          await invoke("worker_app_submit_media_job", {
            seriesId: selected.seriesId,
            bindingRevision: selected.bindingRevision,
            sourceRelativeName: relativeName,
            removeDeadAir,
            reframe9x16,
            focusMode,
            focusX,
            focusY,
            stillMotion,
            maxDurationMs,
            processingMode,
            idempotencyKey: buildMediaIdempotencyKey({
              seriesId: selected.seriesId,
              sourceRelativeName: relativeName,
              sourceFingerprint: scan?.entries.find((entry) => entry.relativeName === relativeName)?.fingerprint,
              processingMode,
              removeDeadAir,
              reframe9x16,
              focusMode,
              focusX,
              focusY,
              stillMotion,
              maxDurationMs,
            }),
          });
          setProcessingByEntry((current) => ({ ...current, [relativeName]: { status: "submitted" } }));
          submitted += 1;
        } catch (caught) {
          setProcessingByEntry((current) => ({ ...current, [relativeName]: { status: "failed", error: invokeError(caught) } }));
          failed += 1;
        }
      }
      setMessage(
        locale === "th"
          ? `ส่งงาน preprocessing แล้ว ${submitted} ไฟล์${failed ? ` · ล้มเหลว ${failed} ไฟล์` : ""} ระบบจะสร้าง derived asset แยกต่อไฟล์`
          : `Submitted ${submitted} preprocessing job(s)${failed ? ` · ${failed} failed` : ""}; a derived asset will be created per file.`,
      );
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBatchCancelRequested(false);
      batchCancelRef.current = false;
      setBusy(false);
    }
  };
  const analyzeSelected = async () => {
    if (!workspace || selectedEntries.size === 0) return;
    setBusy(true);
    setError("");
    try {
      let analyzed = 0;
      for (const relativeName of selectedEntries) {
        setAnalysisByEntry((current) => ({
          ...current,
          [relativeName]: { status: "analyzing" },
        }));
        try {
          const result = await invoke<MediaAnalysis>(
            "worker_app_analyze_media_asset",
            { sourceRelativeName: relativeName },
          );
          setAnalysisByEntry((current) => ({
            ...current,
            [relativeName]: result,
          }));
          analyzed += 1;
        } catch (caught) {
          setAnalysisByEntry((current) => ({
            ...current,
            [relativeName]: { status: "failed", error: invokeError(caught) },
          }));
        }
      }
      setMessage(
        locale === "th"
          ? `วิเคราะห์สื่อในเครื่องแล้ว ${analyzed}/${selectedEntries.size} ไฟล์`
          : `Analyzed ${analyzed}/${selectedEntries.size} media files locally`,
      );
    } finally {
      setBusy(false);
    }
  };
  const submitIngest = async () => {
    if (!selected || !workspace || !selected.bindingRevision) return;
    setBusy(true);
    setError("");
    try {
      const result = await invoke<{ jobId?: string; status: string }>(
        "worker_app_submit_media_ingest_job",
        {
          seriesId: selected.seriesId,
          bindingRevision: selected.bindingRevision,
          idempotencyKey: `worker-ingest:${selected.seriesId}:${workspace.rootId}:${Date.now()}`,
        },
      );
      setMessage(
        locale === "th"
          ? `ส่งงาน inventory แล้ว ${result.jobId ? `Job ${result.jobId}` : result.status}`
          : `Inventory job accepted ${result.jobId ? `Job ${result.jobId}` : result.status}`,
      );
    } catch (caught) {
      setError(invokeError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="dashboard-grid"
      role="tabpanel"
      aria-label={isMedia ? "Media workspace" : "Series workspace"}
    >
      <article className="panel wide">
        <div className="panel-heading inline">
          <div>
            <p className="eyebrow">{isMedia ? "Media workspace" : "Series workspace"}</p>
            <h2>{isMedia ? copy.mediaHeading : copy.heading}</h2>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void loadSeries({ query: seriesQuery })}
            disabled={busy}
          >
            {copy.refresh}
          </button>
        </div>
        <p className="subtle">
          {isMedia ? copy.mediaDescription : copy.description}
        </p>
        {error ? (
          <p className="connect-message error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="connect-message" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
        <div className={`series-workspace-grid${isMedia ? " media-workspace-grid" : ""}`}>
          {!isMedia ? <section aria-labelledby="series-list-heading">
              <h3 id="series-list-heading">{copy.series}</h3>
            <div className="button-row">
              <label className="sr-only" htmlFor="worker-series-search">{copy.search}</label>
              <input id="worker-series-search" value={seriesQuery} onChange={(event) => setSeriesQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadSeries({ query: seriesQuery }); }} placeholder={copy.searchPlaceholder} />
              <button type="button" className="secondary-button" onClick={() => void loadSeries({ query: seriesQuery })} disabled={busy}>{copy.search}</button>
            </div>
            {series.length === 0 ? (
              <p className="subtle">
                {copy.noSeries}
              </p>
            ) : null}
            <ul className="series-list">
              {series.map((item) => (
                <li
                  key={item.seriesId}
                  className={
                    item.seriesId === selectedSeriesId ? "selected" : ""
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      selectSeries(item.seriesId);
                    }}
                    aria-pressed={item.seriesId === selectedSeriesId}
                  >
                    <strong>{item.title}</strong>
                    <span>
                      ID {item.seriesId} · {item.status} ·{" "}
                      {item.accessMode === "operate" ? copy.operate : copy.readOnly}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {nextSeriesCursor ? <button type="button" className="secondary-button" onClick={() => void loadSeries({ append: true, cursor: nextSeriesCursor, query: seriesQuery })} disabled={busy}>{copy.loadMore}</button> : null}
          </section> : null}
          <section aria-labelledby={isMedia ? "media-context-heading" : "root-heading"}>
            {isMedia ? (
              <div className="media-studio-header-bar">
                <div className="studio-meta-group">
                  <div className="studio-meta-pill series-pill">
                    <span className="pill-icon">📺</span>
                    <div>
                      <strong>{selected ? selected.title : copy.noSelectedSeries}</strong>
                      {selected && <span className="pill-sub">ID: {selected.seriesId} · {selected.accessMode === "operate" ? copy.canOperate : copy.readOnlyAccess}</span>}
                    </div>
                  </div>
                  <div className="studio-meta-pill folder-pill">
                    <span className="pill-icon">📁</span>
                    <div>
                      <strong>{workspace ? workspace.localPath : copy.noFolder}</strong>
                      {workspace && <span className="pill-sub">{workspace.fileCount} ไฟล์ · Root: {workspace.rootId}</span>}
                    </div>
                  </div>
                </div>

                <div className="studio-action-group">
                  {onNavigate && (
                    <button
                      type="button"
                      className="studio-btn-subtle"
                      onClick={() => onNavigate("series")}
                      title={copy.manageSeries}
                    >
                      🔄 สลับ Series
                    </button>
                  )}
                  <button
                    type="button"
                    className="studio-btn-subtle"
                    onClick={() => void scanRoot()}
                    disabled={!workspace || busy}
                    title="Scan ตรวจสอบไฟล์ในโฟลเดอร์"
                  >
                    🔍 {copy.scan} {scan ? `(${scan.supportedFileCount})` : ""}
                  </button>
                  {scan?.entries.length ? (
                    <button
                      type="button"
                      className={`studio-btn-subtle ${isInventoryOpen ? "active" : ""}`}
                      onClick={() => setIsInventoryOpen(!isInventoryOpen)}
                    >
                      📦 Inventory ({scan.entries.length})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="studio-btn-settings"
                    onClick={() => setIsIntentModalOpen(true)}
                    title="เปิดหน้าต่างตั้งค่า AI Preprocessing Intent"
                  >
                    ⚙️ ตั้งค่าแผน AI
                  </button>
                  {plan && (
                    <div className="studio-plan-badge">
                      <span className="badge-pulse" />
                      <span>แผน {plan.planId.slice(-6)} ({Math.round(plan.trimEndMs / 1000)}s)</span>
                    </div>
                  )}
                  {plan && (
                    <button
                      type="button"
                      className="studio-btn-submit"
                      onClick={() => void submitJob()}
                      disabled={
                        !workspace ||
                        !sourceRelativeName.trim() ||
                        !selected?.bindingRevision ||
                        focusNeedsVisionWorker ||
                        busy
                      }
                      title="ส่งงานเข้า Worker GPU Queue"
                    >
                      🚀 {copy.submit}
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {!isMedia ? <>
            <h3 id="root-heading">{copy.root}</h3>
            <label className="field-label" htmlFor="series-root-path">
              {copy.localPath}
            </label>
            <div className="button-row">
              <input
                id="series-root-path"
                value={rootPath}
                onChange={(event) => setRootPath(event.target.value)}
                placeholder={copy.pathPlaceholder}
                autoComplete="off"
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => void chooseRoot()}
                disabled={!selected || busy}
              >
                {copy.choose}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void createSeriesFolder()}
                disabled={!selected || busy}
              >
                {copy.create}
              </button>
            </div>
            <p className="field-help">
              {copy.pathHelp}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => void selectRoot()}
                disabled={!selected || !rootPath.trim() || busy}
              >
                {copy.validate}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void bindSeries()}
                disabled={
                  !workspace || selected?.accessMode !== "operate" || busy
                }
              >
                {copy.bind}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void revokeRoot()}
                disabled={!workspace || busy}
              >
                {copy.revoke}
              </button>
            </div>
            {workspace ? (
              <div className="workspace-status-card" role="status">
                <strong>{workspace.status}</strong>
                <span>{copy.folder}: {workspace.localPath}</span>
                <span>Root ID: {workspace.rootId}</span>
                <span>
                  {copy.files} {workspace.fileCount} · {copy.bytes}{" "}
                  {workspace.totalBytes.toLocaleString()} bytes
                </span>
              </div>
            ) : null}
            </> : null}

            {isMedia && isInventoryOpen && scan?.entries.length ? (
              <div className="workspace-inventory collapsible-inventory" aria-label={copy.inventory}>
                <div className="button-row">
                  <strong>{copy.inventory} {selectedEntries.size}/{scan.entries.length}</strong>
                  <button type="button" className="secondary-button" onClick={() => setSelectedEntries(new Set(scan.entries.map(entry => entry.relativeName)))}>{copy.selectAll}</button>
                  <button type="button" className="secondary-button" onClick={() => setSelectedEntries(new Set())}>{copy.clearSelection}</button>
                  <button type="button" className="secondary-button" onClick={() => void analyzeSelected()} disabled={busy || selectedEntries.size === 0}>{copy.analyze}</button>
                  <button type="button" className="secondary-button" onClick={() => setIsInventoryOpen(false)}>✕ ซ่อน</button>
                </div>
                <ul className="series-list">
                  {scan.entries.slice(0, 200).map(entry => (
                    <li key={entry.relativeName}>
                      <label>
                        <input type="checkbox" checked={selectedEntries.has(entry.relativeName)} onChange={() => setSelectedEntries(prev => { const next = new Set(prev); if (next.has(entry.relativeName)) next.delete(entry.relativeName); else next.add(entry.relativeName); return next; })} />
                        <strong>{entry.relativeName}</strong>
                        <span>{entry.kind} · {entry.sizeBytes.toLocaleString()} bytes</span>
                        {(() => {
                          const analysis = analysisByEntry[entry.relativeName];
                          if (!analysis) return <span>{copy.notAnalyzed}</span>;
                          if (!("silenceSegments" in analysis)) {
                            if (analysis.status === "analyzing") return <span>{copy.analyzing}</span>;
                            return <span>{copy.analysisFailed}: {analysis.error}</span>;
                          }
                          return <span>silence {analysis.silenceSegments.length} · black {analysis.blackSegments.length} · freeze {analysis.frozenSegments.length} · scene {analysis.sceneCandidates.length} · focus {analysis.focusCandidates.length} ({analysis.status})</span>;
                        })()}
                        {processingByEntry[entry.relativeName] ? <span>{copy.processing}: {processingByEntry[entry.relativeName].status}{processingByEntry[entry.relativeName].error ? ` · ${processingByEntry[entry.relativeName].error}` : ""}</span> : null}
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="button-row">
                  <button type="button" className="primary-button" onClick={() => void submitBatch()} disabled={!workspace || !selected?.bindingRevision || selectedEntries.size === 0 || busy || focusNeedsVisionWorker}>{copy.submitSelected} ({selectedEntries.size})</button>
                  <button type="button" className="secondary-button" onClick={() => { batchCancelRef.current = true; setBatchCancelRequested(true); }} disabled={!busy || batchCancelRequested}>{copy.cancelRemaining}</button>
                </div>
              </div>
            ) : null}

            {isMedia ? <MediaWorkspaceHost
              workspace={
                workspace
                  ? {
                      status: workspace.status,
                      fileCount: workspace.fileCount,
                      totalBytes: workspace.totalBytes,
                      localPath: workspace.localPath,
                    }
                  : null
              }
              scan={scan}
              plan={plan}
              busy={busy}
              seriesId={selectedSeriesId}
              canSubmit={Boolean(
                workspace &&
                sourceRelativeName.trim() &&
                selected?.bindingRevision &&
                !focusNeedsVisionWorker,
              )}
              onSubmit={() => void submitJob()}
              onIngest={() => void submitIngest()}
              sourceRelativeName={sourceRelativeName}
              onSelectSourceFile={(relName) => setSourceRelativeName(relName)}
              reframe9x16={reframe9x16}
              onReframe9x16Change={setReframe9x16}
              focusX={focusX}
              onFocusXChange={setFocusX}
              focusY={focusY}
              onFocusYChange={setFocusY}
              focusMode={focusMode}
              onFocusModeChange={setFocusMode}
              removeDeadAir={removeDeadAir}
              onRemoveDeadAirChange={setRemoveDeadAir}
              onOpenIntentSettings={() => setIsIntentModalOpen(true)}
              onBuildPlan={() => void buildPlan()}
            /> : null}

            {/* AI-assisted Preprocessing Intent Modal Dialog */}
            {isIntentModalOpen && (
              <div
                className="media-intent-modal-backdrop"
                onClick={() => setIsIntentModalOpen(false)}
              >
                <div
                  className="media-intent-modal-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="media-intent-modal-header">
                    <div className="modal-title-group">
                      <span className="modal-title-icon">⚙️</span>
                      <div>
                        <h3>{copy.intentHeading}</h3>
                        <p className="modal-subtitle">
                          {locale === "th"
                            ? "กำหนดค่า AI Preprocessing Intent ให้สอดคล้องกับ Media Studio"
                            : "Configure AI preprocessing intent in sync with Media Studio"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="modal-close-button"
                      onClick={() => setIsIntentModalOpen(false)}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="media-intent-modal-body">
                    <div className="modal-field-block">
                      <div className="field-label-row">
                        <label className="field-label" htmlFor="source-relative-name">
                          {copy.sourceFile}
                        </label>
                        <span className="sync-badge">⚡ ซิงค์อัตโนมัติจาก Media Explorer</span>
                      </div>
                      <input
                        id="source-relative-name"
                        value={sourceRelativeName}
                        onChange={(event) => setSourceRelativeName(event.target.value)}
                        placeholder="incoming/clip-01.mp4"
                      />
                    </div>

                    <div className="modal-grid-two">
                      <div className="modal-field-block">
                        <label className="field-label">{copy.editingMode}</label>
                        <select
                          value={processingMode}
                          onChange={(event) =>
                            setProcessingMode(
                              event.target.value as "manual_intent" | "automated_ai_editing",
                            )
                          }
                        >
                          <option value="manual_intent">{copy.guided}</option>
                          <option value="automated_ai_editing">{copy.automated}</option>
                        </select>
                      </div>

                      <div className="modal-field-block">
                        <label className="field-label">{copy.maxDuration}</label>
                        <select
                          value={maxDurationMs}
                          onChange={(event) => setMaxDurationMs(Number(event.target.value))}
                        >
                          <option value={30000}>30 {copy.seconds}</option>
                          <option value={60000}>60 {copy.seconds}</option>
                          <option value={90000}>90 {copy.seconds}</option>
                          <option value={120000}>120 {copy.seconds}</option>
                        </select>
                      </div>
                    </div>

                    <div className="modal-toggles-row">
                      <label className="modal-checkbox-label">
                        <input
                          type="checkbox"
                          checked={removeDeadAir}
                          onChange={(event) => setRemoveDeadAir(event.target.checked)}
                        />
                        <span>🔇 {copy.removeDeadAir}</span>
                      </label>
                      <label className="modal-checkbox-label">
                        <input
                          type="checkbox"
                          checked={reframe9x16}
                          onChange={(event) => setReframe9x16(event.target.checked)}
                        />
                        <span>📱 {copy.reframe}</span>
                      </label>
                    </div>

                    <div className="modal-grid-two">
                      <div className="modal-field-block">
                        <label className="field-label">{copy.focus}</label>
                        <select
                          value={focusMode}
                          onChange={(event) => setFocusMode(event.target.value)}
                        >
                          <option value="auto_subject">{copy.autoSubject}</option>
                          <option value="auto_person">{copy.autoPerson}</option>
                          <option value="auto_object">{copy.autoObject}</option>
                          <option value="manual_region">{copy.manualRegion}</option>
                        </select>
                      </div>

                      <div className="modal-field-block">
                        <label className="field-label">{copy.stillMotion}</label>
                        <select
                          value={stillMotion ?? "none"}
                          onChange={(event) =>
                            setStillMotion(
                              event.target.value === "none" ? null : event.target.value,
                            )
                          }
                        >
                          <option value="none">{copy.noMotion}</option>
                          <option value="zoom_in">Zoom in</option>
                          <option value="zoom_out">Zoom out</option>
                          <option value="pan_left">Pan left</option>
                          <option value="pan_right">Pan right</option>
                          <option value="pan_down">Pan down</option>
                          <option value="pan_up">Pan up</option>
                        </select>
                      </div>
                    </div>

                    <div className="modal-sliders-block">
                      <div className="modal-slider-row">
                        <div className="slider-label-wrap">
                          <span>{copy.focusX}</span>
                          <strong className="slider-val">{(focusX * 100).toFixed(0)}%</strong>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={focusX}
                          onChange={(event) => setFocusX(Number(event.target.value))}
                        />
                      </div>
                      <div className="modal-slider-row">
                        <div className="slider-label-wrap">
                          <span>{copy.focusY}</span>
                          <strong className="slider-val">{(focusY * 100).toFixed(0)}%</strong>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={focusY}
                          onChange={(event) => setFocusY(Number(event.target.value))}
                        />
                      </div>
                    </div>

                    {focusNeedsVisionWorker ? (
                      <p className="field-help warning" role="note">
                        {copy.focusWarning}
                      </p>
                    ) : null}
                    {processingMode === "automated_ai_editing" ? (
                      <p className="field-help warning" role="note">
                        {copy.automatedWarning}
                      </p>
                    ) : null}

                    {plan ? (
                      <div className="modal-plan-result" role="status">
                        <div className="plan-badge-icon">✅</div>
                        <div>
                          <strong>แผน {plan.planId} พร้อมส่งเข้าคิว</strong>
                          <p>
                            {locale === "th" ? "ตัดถึง" : "Trimmed to"}{" "}
                            {Math.round(plan.trimEndMs / 1000)}s · Output: {plan.outputRelativeName} · {copy.planReady}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="media-intent-modal-footer">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setIsIntentModalOpen(false)}
                    >
                      {locale === "th" ? "ปิด" : "Close"}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void buildPlan()}
                      disabled={!workspace || !sourceRelativeName.trim() || busy || focusNeedsVisionWorker}
                    >
                      {busy ? "กำลังสร้างแผน..." : copy.buildPlan}
                    </button>
                    {plan ? (
                      <button
                        type="button"
                        className="modal-submit-job-btn"
                        onClick={() => {
                          setIsIntentModalOpen(false);
                          void submitJob();
                        }}
                        disabled={
                          !workspace ||
                          !sourceRelativeName.trim() ||
                          !selected?.bindingRevision ||
                          focusNeedsVisionWorker ||
                          busy
                        }
                      >
                        🚀 {copy.submit}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </article>
    </section>
  );
}

export function MediaWorkspacePanel({ onNavigate }: WorkspacePanelProps = {}) {
  return <SeriesWorkspacePanel mode="media" onNavigate={onNavigate} />;
}
