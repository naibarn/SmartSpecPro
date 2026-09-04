import { useEffect, useState, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedUnixMs: number;
  extension: string | null;
  isVideo: boolean;
}

export interface DirectoryBreadcrumb {
  name: string;
  path: string;
}

export interface DirectoryBrowseResult {
  currentPath: string;
  parentPath: string | null;
  entries: DirectoryEntry[];
  breadcrumbs: DirectoryBreadcrumb[];
  totalFolders: number;
  totalFiles: number;
  totalVideoFiles: number;
}

export interface MediaExplorerViewProps {
  initialPath?: string;
  onSelectVideoFile: (entry: DirectoryEntry) => void;
  onOpenProjectFile?: (entry: DirectoryEntry) => void;
  onImportMediaToProject?: (entry: DirectoryEntry) => void;
  onNewProject?: () => void;
  selectedFilePath?: string | null;
  onCollapse?: () => void;
}

type SortField = "name" | "type" | "size" | "date";
type ViewMode = "details" | "grid";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(unixMs: number): string {
  if (!unixMs || unixMs <= 0) return "—";
  const d = new Date(unixMs);
  if (isNaN(d.getTime())) return "—";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function stripVerbatimPrefix(pathStr: string): string {
  if (!pathStr) return "";
  let clean = pathStr.trim();
  if (clean.startsWith("\\\\?\\") || clean.startsWith("//?/")) {
    clean = clean.slice(4);
  }
  return clean;
}

export function isProjectFile(entry: DirectoryEntry): boolean {
  if (entry.isDirectory) return false;
  const name = entry.name.toLowerCase();
  const ext = entry.extension?.toLowerCase();
  return (
    name.endsWith(".smartspec.json") ||
    name.endsWith(".ssproj") ||
    (ext === "json" && (name.includes("project") || name.includes("draft") || name.includes("nle")))
  );
}

export function isAudioFile(entry: DirectoryEntry): boolean {
  if (entry.isDirectory) return false;
  const ext = entry.extension?.toLowerCase() ?? "";
  return ["mp3", "wav", "aac", "m4a", "flac", "ogg"].includes(ext);
}

export function isImageFile(entry: DirectoryEntry): boolean {
  if (entry.isDirectory) return false;
  const ext = entry.extension?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(ext);
}

export function MediaExplorerView({
  initialPath,
  onSelectVideoFile,
  onOpenProjectFile,
  onImportMediaToProject,
  onNewProject,
  selectedFilePath,
  onCollapse,
}: MediaExplorerViewProps) {
  const [currentPath, setCurrentPath] = useState<string | null>(initialPath ? stripVerbatimPrefix(initialPath) : null);
  const [browseData, setBrowseData] = useState<DirectoryBrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Path Editing State
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInputValue, setPathInputValue] = useState("");

  // View Mode: Details vs Grid Preview
  const [viewMode, setViewMode] = useState<ViewMode>("details");

  // Sorting State
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const browseRequest = useRef(0);

  const loadDirectory = async (path?: string | null) => {
    const requestId = ++browseRequest.current;
    setLoading(true);
    setError(null);
    try {
      const cleanTarget = path ? stripVerbatimPrefix(path) : null;
      const res = await invoke<DirectoryBrowseResult>("worker_app_browse_directory", {
        path: cleanTarget || null,
      });
      if (requestId !== browseRequest.current) return;
      const cleaned: DirectoryBrowseResult = {
        ...res,
        currentPath: stripVerbatimPrefix(res.currentPath),
        parentPath: res.parentPath ? stripVerbatimPrefix(res.parentPath) : null,
        breadcrumbs: (res.breadcrumbs || []).map((b) => ({
          ...b,
          path: stripVerbatimPrefix(b.path),
        })),
        entries: (res.entries || []).map((e) => ({
          ...e,
          path: stripVerbatimPrefix(e.path),
        })),
      };
      setBrowseData(cleaned);
      setCurrentPath(cleaned.currentPath);
      setPathInputValue(cleaned.currentPath);
      setIsEditingPath(false);
    } catch (err) {
      if (requestId === browseRequest.current) setError(String(err));
    } finally {
      if (requestId === browseRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadDirectory(initialPath ?? null);
    return () => { browseRequest.current += 1; };
  }, [initialPath]);

  const handlePickFolder = async () => {
    try {
      const selected = await openFolderDialog({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        void loadDirectory(selected);
      }
    } catch (err) {
      setError(`ไม่สามารถเปิดโฟลเดอร์ได้: ${String(err)}`);
    }
  };

  const handlePathSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pathInputValue.trim()) {
      void loadDirectory(pathInputValue.trim());
    } else {
      setIsEditingPath(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      // For date and size, default to descending (newest / largest first)
      setSortAsc(field === "name");
    }
  };

  const sortedAndFilteredEntries = useMemo(() => {
    if (!browseData?.entries) return [];
    let list = browseData.entries;

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((entry) => entry.name.toLowerCase().includes(q));
    }

    // Sort: Folders always first, then files sorted by selected column
    return [...list].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      let compareVal = 0;
      if (sortField === "name") {
        compareVal = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      } else if (sortField === "type") {
        const typeA = a.isDirectory ? "0_folder" : a.isVideo ? "1_video" : a.extension || "9_other";
        const typeB = b.isDirectory ? "0_folder" : b.isVideo ? "1_video" : b.extension || "9_other";
        compareVal = typeA.localeCompare(typeB);
      } else if (sortField === "size") {
        compareVal = a.sizeBytes - b.sizeBytes;
      } else if (sortField === "date") {
        compareVal = a.modifiedUnixMs - b.modifiedUnixMs;
      }

      return sortAsc ? compareVal : -compareVal;
    });
  }, [browseData?.entries, searchQuery, sortField, sortAsc]);

  return (
    <div className="explorer-container">
      {/* Top Explorer Action Bar */}
      <div className="explorer-toolbar">
        {onNewProject && (
          <div className="explorer-top-action-row">
            <button
              type="button"
              className="explorer-new-project-top-btn"
              onClick={onNewProject}
              title="สร้างโปรเจกต์ NLE ใหม่ (New Project)"
            >
              ✨ ＋ โปรเจกต์ใหม่ (New Project)
            </button>
          </div>
        )}

        <div className="explorer-nav-buttons">
          <button
            type="button"
            className="explorer-nav-btn"
            disabled={!browseData?.parentPath || loading}
            onClick={() => browseData?.parentPath && void loadDirectory(browseData.parentPath)}
            title="ขึ้นไป 1 ระดับ (Parent folder)"
          >
            ⬆️ ขึ้น
          </button>
          <button
            type="button"
            className="explorer-nav-btn"
            disabled={loading}
            onClick={() => void loadDirectory(currentPath)}
            title="รีเฟรชโฟลเดอร์"
          >
            🔄 รีเฟรช
          </button>
          <button
            type="button"
            className="explorer-pick-btn"
            onClick={() => void handlePickFolder()}
            title="เลือกโฟลเดอร์จากเครื่อง"
          >
            📁 เลือกโฟลเดอร์...
          </button>

          {/* View Mode Toggle */}
          <div className="explorer-view-toggle-group">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "details" ? "active" : ""}`}
              onClick={() => setViewMode("details")}
              title="แสดงแบบรายละเอียด (Details List)"
            >
              ☰ รายการ
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="แสดงแบบตารางภาพตัวอย่าง (Grid / Thumbnails)"
            >
              ⊞ ตาราง
            </button>
          </div>

          {onCollapse && (
            <button
              type="button"
              className="explorer-collapse-btn"
              onClick={onCollapse}
              title="ย่อแผงเบราว์เซอร์ไปทางซ้ายเพื่อขยายพื้นที่ทำงาน Media Studio"
            >
              ◀ ยุบแผง
            </button>
          )}
        </div>

        {/* Breadcrumb / Direct Path Input Bar */}
        <div className="explorer-breadcrumb-bar">
          <span className="explorer-breadcrumb-icon">📂</span>
          {isEditingPath ? (
            <form className="explorer-path-edit-form" onSubmit={handlePathSubmit}>
              <input
                type="text"
                className="explorer-path-text-input"
                value={pathInputValue}
                onChange={(e) => setPathInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsEditingPath(false);
                    setPathInputValue(currentPath || "");
                  }
                }}
                autoFocus
                placeholder="พิมพ์หรือวาง Path เช่น D:\Videos หรือ /home/dev/..."
              />
              <button type="submit" className="explorer-path-go-btn" title="ไปที่พาธนี้">
                ➔ ไป
              </button>
              <button
                type="button"
                className="explorer-path-cancel-btn"
                onClick={() => {
                  setIsEditingPath(false);
                  setPathInputValue(currentPath || "");
                }}
                title="ยกเลิก"
              >
                ✕
              </button>
            </form>
          ) : (
            <div
              className="explorer-breadcrumbs"
              onClick={() => {
                setPathInputValue(currentPath || "");
                setIsEditingPath(true);
              }}
              title="คลิกเพื่อพิมพ์หรือแก้ไข Path โดยตรง"
            >
              {browseData?.breadcrumbs.map((crumb, idx) => (
                <span key={crumb.path} className="breadcrumb-segment">
                  {idx > 0 && <span className="breadcrumb-separator">›</span>}
                  <button
                    type="button"
                    className={`breadcrumb-link ${crumb.path === currentPath ? "active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void loadDirectory(crumb.path);
                    }}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
              {!browseData?.breadcrumbs.length && (
                <span className="breadcrumb-empty">{currentPath || "ยังไม่ได้เลือกโฟลเดอร์"}</span>
              )}
              <button
                type="button"
                className="explorer-edit-path-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setPathInputValue(currentPath || "");
                  setIsEditingPath(true);
                }}
                title="พิมพ์หรือคัดลอก Path"
              >
                ✏️
              </button>
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="explorer-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="explorer-search-input"
            placeholder="ค้นหาไฟล์หรือโฟลเดอร์..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Error Message if any */}
      {error && (
        <div className="explorer-error-banner" role="alert">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => void loadDirectory(null)}>
            กลับไปโฟลเดอร์หลัก
          </button>
        </div>
      )}

      {/* Main File View Area (Details Table or Grid Cards) */}
      <div className="explorer-view-area">
        {loading && (
          <div className="explorer-loading-overlay">
            <div className="spinner" />
            <span>กำลังโหลดรายการไฟล์...</span>
          </div>
        )}

        {viewMode === "details" ? (
          <>
            <div className="explorer-table-header">
              <div
                className={`col col-name sortable ${sortField === "name" ? "sorted" : ""}`}
                onClick={() => handleSort("name")}
                title="คลิกเพื่อเรียงตามชื่อไฟล์"
              >
                ชื่อไฟล์ {sortField === "name" && (sortAsc ? "▲" : "▼")}
              </div>
              <div
                className={`col col-date sortable ${sortField === "date" ? "sorted" : ""}`}
                onClick={() => handleSort("date")}
                title="คลิกเพื่อเรียงตามวันที่แก้ไข (ใหม่ ⇄ เก่า)"
              >
                วันที่แก้ไข {sortField === "date" && (sortAsc ? "▲" : "▼")}
              </div>
              <div
                className={`col col-size sortable ${sortField === "size" ? "sorted" : ""}`}
                onClick={() => handleSort("size")}
                title="คลิกเพื่อเรียงตามขนาด"
              >
                ขนาด {sortField === "size" && (sortAsc ? "▲" : "▼")}
              </div>
              <div className="col col-actions">คำสั่ง</div>
            </div>

            <div className="explorer-table-body">
              {sortedAndFilteredEntries.map((entry) => {
                const isSelected = selectedFilePath === entry.path;
                const isProj = isProjectFile(entry);
                const isAud = isAudioFile(entry);
                const isImg = isImageFile(entry);

                return (
                  <div
                    key={entry.path}
                    className={`explorer-row ${entry.isDirectory ? "is-folder" : "is-file"} ${
                      entry.isVideo ? "is-video" : ""
                    } ${isProj ? "is-project" : ""} ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      if (entry.isDirectory) {
                        void loadDirectory(entry.path);
                      } else if (isProj && onOpenProjectFile) {
                        onOpenProjectFile(entry);
                      } else if (entry.isVideo) {
                        onSelectVideoFile(entry);
                      }
                    }}
                    onDoubleClick={() => {
                      if (entry.isDirectory) {
                        void loadDirectory(entry.path);
                      } else if (isProj && onOpenProjectFile) {
                        onOpenProjectFile(entry);
                      } else if (entry.isVideo) {
                        onSelectVideoFile(entry);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="col col-name" title={entry.name}>
                      <span className="entry-icon">
                        {entry.isDirectory
                          ? "📁"
                          : isProj
                          ? "⭐"
                          : entry.isVideo
                          ? "🎬"
                          : isAud
                          ? "🎵"
                          : isImg
                          ? "🖼️"
                          : "📄"}
                      </span>
                      <span className="entry-title">
                        {entry.name}
                      </span>
                      {isProj && <span className="badge-project">Project</span>}
                      {entry.isVideo && <span className="badge-video">MP4</span>}
                      {isAud && <span className="badge-audio">Audio</span>}
                    </div>
                    <div className="col col-date" title={formatDate(entry.modifiedUnixMs)}>
                      {formatDate(entry.modifiedUnixMs)}
                    </div>
                    <div className="col col-size">
                      {entry.isDirectory ? "—" : formatBytes(entry.sizeBytes)}
                    </div>
                    <div className="col col-actions" onClick={(e) => e.stopPropagation()}>
                      {isProj && onOpenProjectFile && (
                        <button
                          type="button"
                          className="btn-action-open-proj"
                          onClick={() => onOpenProjectFile(entry)}
                          title="เปิดโปรเจกต์นี้ใน Media Studio"
                        >
                          📂 เปิด
                        </button>
                      )}
                      {(entry.isVideo || isAud || isImg) && onImportMediaToProject && (
                        <button
                          type="button"
                          className="btn-action-import"
                          onClick={() => onImportMediaToProject(entry)}
                          title="นำเข้าไฟล์นี้ไปยัง Media Pool ของ Project"
                        >
                          📥 Bin
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {!loading && sortedAndFilteredEntries.length === 0 && (
                <div className="explorer-empty-state">
                  <span className="empty-icon">📂</span>
                  <p>
                    {searchQuery
                      ? `ไม่พบไฟล์ที่ตรงกับ "${searchQuery}"`
                      : "โฟลเดอร์นี้ว่างเปล่า ไม่มีไฟล์หรือโฟลเดอร์ย่อย"}
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handlePickFolder()}
                  >
                    เลือกโฟลเดอร์อื่น
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Grid / Preview Cards Mode */
          <div className="explorer-grid-container">
            {sortedAndFilteredEntries.map((entry) => {
              const isSelected = selectedFilePath === entry.path;
              const isProj = isProjectFile(entry);
              const isAud = isAudioFile(entry);
              const isImg = isImageFile(entry);

              return (
                <div
                  key={entry.path}
                  className={`explorer-grid-card ${entry.isDirectory ? "is-folder" : "is-file"} ${
                    entry.isVideo ? "is-video" : ""
                  } ${isProj ? "is-project" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    if (entry.isDirectory) {
                      void loadDirectory(entry.path);
                    } else if (isProj && onOpenProjectFile) {
                      onOpenProjectFile(entry);
                    } else if (entry.isVideo) {
                      onSelectVideoFile(entry);
                    }
                  }}
                  onDoubleClick={() => {
                    if (entry.isDirectory) {
                      void loadDirectory(entry.path);
                    } else if (isProj && onOpenProjectFile) {
                      onOpenProjectFile(entry);
                    } else if (entry.isVideo) {
                      onSelectVideoFile(entry);
                    }
                  }}
                  title={`${entry.name} (${formatBytes(entry.sizeBytes)})`}
                >
                  <div className="card-thumb-area">
                    <span className="card-big-icon">
                      {entry.isDirectory
                        ? "📁"
                        : isProj
                        ? "⭐"
                        : entry.isVideo
                        ? "🎬"
                        : isAud
                        ? "🎵"
                        : isImg
                        ? "🖼️"
                        : "📄"}
                    </span>
                    {isProj && <span className="card-badge badge-proj">PROJECT</span>}
                    {entry.isVideo && <span className="card-badge badge-vid">VIDEO</span>}
                    {isAud && <span className="card-badge badge-aud">AUDIO</span>}
                  </div>
                  <div className="card-info">
                    <div className="card-name" title={entry.name}>
                      {entry.name}
                    </div>
                    <div className="card-meta">
                      <span>{entry.isDirectory ? "โฟลเดอร์" : formatBytes(entry.sizeBytes)}</span>
                      <span title={formatDate(entry.modifiedUnixMs)}>📅 {formatDate(entry.modifiedUnixMs)}</span>
                    </div>
                    {/* Quick Card Action Buttons */}
                    <div className="card-action-bar" onClick={(e) => e.stopPropagation()}>
                      {isProj && onOpenProjectFile && (
                        <button
                          type="button"
                          className="btn-card-action"
                          onClick={() => onOpenProjectFile(entry)}
                        >
                          📂 เปิด
                        </button>
                      )}
                      {(entry.isVideo || isAud || isImg) && onImportMediaToProject && (
                        <button
                          type="button"
                          className="btn-card-action"
                          onClick={() => onImportMediaToProject(entry)}
                        >
                          📥 Bin
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && sortedAndFilteredEntries.length === 0 && (
              <div className="explorer-empty-state">
                <span className="empty-icon">📂</span>
                <p>
                  {searchQuery
                    ? `ไม่พบไฟล์ที่ตรงกับ "${searchQuery}"`
                    : "โฟลเดอร์นี้ว่างเปล่า ไม่มีไฟล์หรือโฟลเดอร์ย่อย"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Explorer Bottom Status Bar */}
      <div className="explorer-status-bar">
        <span>
          {browseData?.totalFolders ?? 0} โฟลเดอร์, {browseData?.totalFiles ?? 0} ไฟล์ (
          {browseData?.totalVideoFiles ?? 0} ไฟล์วิดีโอ)
        </span>
        {selectedFilePath && (
          <span className="status-selected-file">
            🎬 เลือกอยู่: <strong>{selectedFilePath.split("/").pop()?.split("\\").pop()}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
