import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useWorkerAppContext } from "../../app/workerContext";
import { MediaExplorerView, isAudioFile, isImageFile, isProjectFile, type DirectoryEntry } from "./MediaExplorerView";
import { parseProjectDraft, saveNleProject, isProjectFilePath } from "./projectPersistence";
import { MediaVideoEditorPlayer } from "./MediaVideoEditorPlayer";
import type { SmartSpecProjectDraft, ProjectAsset } from "../../types/nleProject";

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

export interface MediaWorkspaceHostProps {
  workspace: WorkspaceStatus;
  scan: ScanStatus;
  plan: PlanStatus;
  busy: boolean;
  seriesId?: string | null;
  canSubmit?: boolean;
  onSubmit?: () => void;
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
  onBuildPlan?: () => void;
  onWorkspacePathChange?: (path: string) => void;
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
  sourceRelativeName: _sourceRelativeName,
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
}: MediaWorkspaceHostProps) {
  const { locale } = useWorkerAppContext();
  const [activeTab, setActiveTab] = useState<"explorer" | "stages">("explorer");
  const [stage, setStage] = useState<WorkspaceStage>("intake");
  const [selectedVideo, setSelectedVideo] = useState<DirectoryEntry | null>(null);
  const [loadedProjectDraft, setLoadedProjectDraft] = useState<SmartSpecProjectDraft | null>(null);
  const [importedAsset, setImportedAsset] = useState<ProjectAsset | null>(null);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
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
  const workspacePath = useRef(workspace?.localPath);

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
    if (workspacePath.current !== workspace?.localPath) {
      workspacePath.current = workspace?.localPath;
      setSelectedVideo(null);
      setLoadedProjectDraft(null);
    }
    return () => { projectRequest.current += 1; };
  }, [workspace?.localPath]);

  const handleSelectVideo = (entry: DirectoryEntry) => {
    // If it's a project file or JSON, redirect directly to handleOpenProjectFile
    if (isProjectFile(entry) || isProjectFilePath(entry.path) || entry.extension?.toLowerCase() === "json") {
      void handleOpenProjectFile(entry);
      return;
    }
    setSelectedVideo(entry);
    setLoadedProjectDraft(null);
    setImportedAsset(null);
    if (onSelectSourceFile) {
      let relativeName = entry.name;
      const root = workspace?.localPath?.replace(/[\/\\]+$/, "");
      if (root) {
        const prefixSlash = `${root}/`;
        const prefixBackslash = `${root}\\`;
        if (entry.path.startsWith(prefixSlash)) {
          relativeName = entry.path.slice(prefixSlash.length);
        } else if (entry.path.startsWith(prefixBackslash)) {
          relativeName = entry.path.slice(prefixBackslash.length);
        }
      }
      onSelectSourceFile(relativeName, entry.path);
    }
  };

  const handleOpenProjectFile = async (entry: DirectoryEntry) => {
    const requestId = (projectRequest.current += 1);
    setProjectError(null);
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
        setSelectedVideo({
          name: draft.title || entry.name.replace(/\.[^/.]+$/, ""),
          path: sourcePath,
          isDirectory: false,
          sizeBytes: 0,
          modifiedUnixMs: Date.now(),
          extension: sourcePath.split(".").pop() || "mp4",
          isVideo: true,
        });
      } else {
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
    setImportedAsset(null);
    setSelectedVideo(null);
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
            {workspace?.localPath ? (
              <>
                <span className="crumb-sep">›</span>
                <span
                  className="crumb-file"
                  title={`ตำแหน่ง Workspace บน Harddisk: ${workspace.localPath}`}
                  style={{ color: "#cbd5e1", background: "rgba(15, 23, 42, 0.7)", borderColor: "rgba(148, 163, 184, 0.3)" }}
                >
                  📂 Workspace: {workspace.localPath}
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
          {workspace?.localPath && (
            <div className="studio-path-banner-inline" title={`ตำแหน่งโฟลเดอร์ Workspace บน Disk: ${workspace.localPath}`}>
              <span className="path-label">📍 Path:</span>
              <code className="path-text">{workspace.localPath}</code>
              <button
                type="button"
                className="path-inline-btn"
                onClick={async () => {
                  if (workspace?.localPath) {
                    try {
                      await invoke("worker_app_reveal_file", { path: workspace.localPath });
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
                  if (workspace?.localPath) {
                    navigator.clipboard.writeText(workspace.localPath);
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
                initialPath={workspace?.localPath}
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
            <MediaVideoEditorPlayer
              key={`${selectedVideo?.path ?? "empty"}:${loadedProjectDraft?.projectId ?? "source"}`}
              videoFile={selectedVideo}
              onSelectVideoFile={handleSelectVideo}
              onOpenProjectFile={handleOpenProjectFile}
              seriesId={seriesId || loadedProjectDraft?.metadata?.seriesId}
              workspacePath={workspace?.localPath}
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
              plan={plan}
              onBuildPlan={onBuildPlan}
              onSubmitJob={onSubmit}
              canSubmitJob={canSubmit}
              isBusy={busy}
              loadedProjectDraft={loadedProjectDraft}
              importedAsset={importedAsset}
              onProjectDraftChange={setLoadedProjectDraft}
            />
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
                onClick={onSubmit}
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
