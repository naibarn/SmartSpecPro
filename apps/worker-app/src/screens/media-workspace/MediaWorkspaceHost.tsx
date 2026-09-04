import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkerAppContext } from "../../app/workerContext";
import { MediaExplorerView, isAudioFile, isImageFile, type DirectoryEntry } from "./MediaExplorerView";
import { parseProjectDraft } from "./projectPersistence";
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
}: MediaWorkspaceHostProps) {
  const { locale } = useWorkerAppContext();
  const [activeTab, setActiveTab] = useState<"explorer" | "stages">("explorer");
  const [stage, setStage] = useState<WorkspaceStage>("intake");
  const [selectedVideo, setSelectedVideo] = useState<DirectoryEntry | null>(null);
  const [loadedProjectDraft, setLoadedProjectDraft] = useState<SmartSpecProjectDraft | null>(null);
  const [importedAsset, setImportedAsset] = useState<ProjectAsset | null>(null);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  const [projectError, setProjectError] = useState<string | null>(null);
  const projectRequest = useRef(0);
  const workspacePath = useRef(workspace?.localPath);
  useEffect(() => {
    if (workspacePath.current !== workspace?.localPath) {
      workspacePath.current = workspace?.localPath;
      handleNewProject();
    }
    return () => { projectRequest.current += 1; };
  }, [workspace?.localPath]);

  const handleSelectVideo = (entry: DirectoryEntry) => {
    projectRequest.current += 1;
    setProjectError(null);
    setLoadedProjectDraft(null);
    setImportedAsset(null);
    setSelectedVideo(entry);
    if (onSelectSourceFile) {
      let relName = entry.name;
      const root = workspace?.localPath?.replace(/\\/g, "/").replace(/\/+$/, "");
      const entryPath = entry.path.replace(/\\/g, "/");
      if (root && entryPath.startsWith(`${root}/`)) {
        relName = entryPath.slice(root.length).replace(/^[/\\]+/, "");
      }
      onSelectSourceFile(relName, entry.path);
    }
  };

  const handleOpenProjectFile = async (entry: DirectoryEntry) => {
    const requestId = ++projectRequest.current;
    setProjectError(null);
    try {
      const jsonContent = await invoke<string>("worker_app_load_nle_project", {
        projectPath: entry.path,
      });
      const draft = parseProjectDraft(jsonContent);
      if (requestId !== projectRequest.current) return;
      const sourcePath = draft.metadata?.originalSourceVideo || draft.tracks.find((track) => track.type === "video_main")?.clips.find((clip) => clip.sourcePath)?.sourcePath;
      if (!sourcePath) throw new Error("โปรเจกต์นี้ไม่มีไฟล์วิดีโอต้นฉบับสำหรับเปิดใน editor");
      setLoadedProjectDraft(draft);
      setImportedAsset(null);
      if (sourcePath) {
        setSelectedVideo({
          name: draft.title || entry.name.replace(/\.[^/.]+$/, ""),
          path: sourcePath,
          isDirectory: false,
          sizeBytes: 0,
          modifiedUnixMs: Date.now(),
          extension: "mp4",
          isVideo: true,
        });
      }
    } catch (err) {
      if (requestId === projectRequest.current) setProjectError(String(err));
    }
  };

  const handleImportMedia = (entry: DirectoryEntry) => {
    if (!selectedVideo) {
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

  const handleNewProject = () => {
    projectRequest.current += 1;
    setProjectError(null);
    setLoadedProjectDraft(null);
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
            {selectedVideo && (
              <>
                <span className="crumb-sep">›</span>
                <span className="crumb-file" title={selectedVideo.path}>
                  📹 {selectedVideo.name}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="studio-topbar-right">
          {workspace?.localPath && (
            <div className="studio-path-chip" title={workspace.localPath}>
              <span className="folder-icon">📂</span>
              <span className="folder-name">
                {workspace.localPath.replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join("/")}
              </span>
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
          <div className={`studio-explorer-pane ${isExplorerCollapsed ? "collapsed" : ""}`}>
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
                onNewProject={handleNewProject}
                selectedFilePath={selectedVideo?.path}
                onCollapse={() => setIsExplorerCollapsed(true)}
              />
            )}
          </div>
          <div className="studio-player-pane">
            <MediaVideoEditorPlayer
              key={`${selectedVideo?.path ?? "empty"}:${loadedProjectDraft?.projectId ?? "source"}`}
              videoFile={selectedVideo}
              seriesId={seriesId}
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
