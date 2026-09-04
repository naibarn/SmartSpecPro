import { useState, useEffect, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { NleClip } from "../../types/nleProject";

export interface AssetDrawerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentTimeMs: number;
  seriesId?: string | null;
  onAddClip: (trackId: string, clip: NleClip) => void;
  sourceVideoFile?: { name: string; path: string; sizeBytes?: number } | null;
  projectAssets?: import("../../types/nleProject").ProjectAsset[];
}

export interface MediaAssetItem {
  id: string;
  title: string;
  category: "video" | "broll" | "music" | "sfx" | "image";
  durationMs: number;
  thumbnailUrl?: string;
  sourceUrl: string;
  filePath?: string;
  isSeriesMedia?: boolean;
  assetKind?: string;
  updatedAt?: string | null;
  fileSizeLabel?: string;
}

function AssetThumbnailCard({ item }: { item: MediaAssetItem }) {
  const [imgError, setImgError] = useState(false);

  if (item.thumbnailUrl && !imgError) {
    return (
      <div className="drawer-thumb-box">
        <img
          src={item.thumbnailUrl}
          alt={item.title}
          className="drawer-asset-thumb"
          onError={() => setImgError(true)}
          loading="lazy"
        />
        {(item.category === "video" || item.category === "broll") && (
          <span className="drawer-media-badge video-badge">🎬 MP4</span>
        )}
      </div>
    );
  }

  // Premium Fallback Poster Graphic (Never show broken image)
  const isVideo = item.category === "video" || item.category === "broll";
  const isAudio = item.category === "music" || item.category === "sfx";

  return (
    <div
      className={`drawer-thumb-box fallback-box ${
        isVideo ? "fallback-video" : isAudio ? "fallback-audio" : "fallback-image"
      }`}
    >
      <div className="fallback-inner">
        <span className="fallback-symbol">
          {item.category === "video"
            ? "🎬"
            : item.category === "broll"
            ? "🎥"
            : item.category === "music"
            ? "🎵"
            : item.category === "sfx"
            ? "💥"
            : "🖼️"}
        </span>
        <span className="fallback-ext">{isVideo ? "VIDEO" : isAudio ? "AUDIO" : "IMAGE"}</span>
      </div>
    </div>
  );
}

export function AssetDrawerPanel({
  isOpen,
  onClose,
  currentTimeMs,
  seriesId,
  onAddClip,
  sourceVideoFile,
  projectAssets = [],
}: AssetDrawerPanelProps) {
  const [storageMode, setStorageMode] = useState<"local" | "cloud">("local");
  const [tab, setTab] = useState<"all" | "bin" | "history" | "broll" | "music" | "sfx">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [seriesAssets, setSeriesAssets] = useState<MediaAssetItem[]>([]);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);

  const binAssets: MediaAssetItem[] = useMemo(() => {
    if (!projectAssets) return [];
    return projectAssets.map((pa) => ({
      id: pa.id,
      title: pa.name,
      category: (pa.mediaType === "video" ? "video" : pa.mediaType === "audio" ? "music" : "image") as any,
      durationMs: pa.durationMs || 5000,
      sourceUrl: convertFileSrc(pa.filePath),
      filePath: pa.filePath,
      isSeriesMedia: false,
      updatedAt: pa.importedAt,
    }));
  }, [projectAssets]);

  // Fetch real SmartAIHub Media Workspace / History for this series + local render history & custom imports
  useEffect(() => {
    let isCancelled = false;
    const localHistoryItems: MediaAssetItem[] = [];

    // 1. Current Working Video File (if open)
    if (sourceVideoFile?.path) {
      localHistoryItems.push({
        id: `current_source_${sourceVideoFile.path}`,
        title: `[ไฟล์ปัจจุบัน] ${sourceVideoFile.name}`,
        category: "video",
        durationMs: 60000,
        sourceUrl: convertFileSrc(sourceVideoFile.path),
        filePath: sourceVideoFile.path,
        isSeriesMedia: true,
        updatedAt: new Date().toISOString(),
        fileSizeLabel: sourceVideoFile.sizeBytes
          ? `${(sourceVideoFile.sizeBytes / 1024 / 1024).toFixed(1)} MB`
          : undefined,
      });
    }

    // 2. Previously Rendered Files from LocalStorage
    try {
      const historyStr = localStorage.getItem("smartspec_render_history");
      if (historyStr) {
        const parsed = JSON.parse(historyStr);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            localHistoryItems.push({
              id: item.id || `local_render_${Math.random().toString(36).slice(2, 6)}`,
              title: item.fileName || item.title || "Rendered Video",
              category: "video",
              durationMs: item.durationMs || 5000,
              thumbnailUrl: item.thumbnailUrl,
              sourceUrl: item.outputPath ? convertFileSrc(item.outputPath) : item.sourceUrl || "",
              filePath: item.outputPath,
              isSeriesMedia: true,
              updatedAt: item.timestamp,
              fileSizeLabel: item.sizeBytes ? `${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB` : undefined,
            });
          }
        }
      }
    } catch (e) {
      console.warn("Error reading local render history:", e);
    }

    // 3. Custom Imported Local Assets from LocalStorage
    try {
      const customStr = localStorage.getItem("smartspec_custom_assets");
      if (customStr) {
        const parsed = JSON.parse(customStr);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (!localHistoryItems.some((x) => x.filePath === item.filePath)) {
              localHistoryItems.push(item);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Error reading custom assets:", e);
    }

    if (!seriesId) {
      setIsLoadingSeries(false);
      setSeriesAssets(localHistoryItems);
      return;
    }

    setIsLoadingSeries(true);

    invoke<{
      series?: { seriesId: string; title: string };
      assets?: Array<{
        id: string | number;
        assetKind: string;
        pipelineState: string;
        sourceMetadataJson?: string | Record<string, unknown> | null;
        derivedArtifactJson?: string | Record<string, unknown> | null;
        updatedAt?: string | null;
      }>;
    }>("worker_app_get_series_media_workspace", { seriesId: String(seriesId) })
      .then((res) => {
        if (isCancelled) return;
        const cloudMapped: MediaAssetItem[] = (res?.assets || []).map((a, idx) => {
          let meta: Record<string, unknown> = {};
          let derived: Record<string, unknown> = {};
          try {
            meta = typeof a.sourceMetadataJson === "string" ? JSON.parse(a.sourceMetadataJson) : (a.sourceMetadataJson || {});
          } catch {
            meta = {};
          }
          try {
            derived = typeof a.derivedArtifactJson === "string" ? JSON.parse(a.derivedArtifactJson) : (a.derivedArtifactJson || {});
          } catch {
            derived = {};
          }

          const kind = (a.assetKind || "").toLowerCase();
          const isVid = kind.includes("video") || meta.format === "mp4" || meta.type === "video";
          const isAud = kind.includes("audio") || kind.includes("music") || kind.includes("sound");
          const isSfx = kind.includes("sfx");

          let cat: "video" | "broll" | "music" | "sfx" | "image" = "broll";
          if (isVid) cat = "video";
          else if (isSfx) cat = "sfx";
          else if (isAud) cat = "music";
          else if (kind.includes("image")) cat = "image";

          const title = (meta.title as string) || (meta.filename as string) || (derived.name as string) || `Series Media #${a.id || idx + 1}`;
          const dur = (meta.durationMs as number) || (derived.durationMs as number) || (isVid ? 4500 : isAud ? 30000 : 3500);
          const thumb = (derived.thumbnailUrl as string) || (meta.thumbnailUrl as string) || (meta.previewUrl as string) || (meta.url as string);
          const src = (derived.videoUrl as string) || (meta.url as string) || (meta.path as string) || "";

          return {
            id: `series_${a.id || idx}`,
            title,
            category: cat,
            durationMs: dur,
            thumbnailUrl: thumb,
            sourceUrl: src,
            isSeriesMedia: true,
            assetKind: a.assetKind,
            updatedAt: a.updatedAt,
            fileSizeLabel: meta.size ? `${Math.round(Number(meta.size) / 1024 / 1024)} MB` : undefined,
          };
        });

        setSeriesAssets([...localHistoryItems, ...cloudMapped]);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.warn("Series media workspace fetch fallback:", err);
        setSeriesAssets(localHistoryItems);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingSeries(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [seriesId, sourceVideoFile?.path]);

  // Only persisted local/Series assets are offered. A stock catalog needs verified media metadata.
  const stockAssets: MediaAssetItem[] = useMemo(() => [], []);

  // Combined asset list
  const allAssets = useMemo(() => {
    return [...binAssets, ...seriesAssets, ...stockAssets];
  }, [binAssets, seriesAssets, stockAssets]);

  const filteredAssets = useMemo(() => {
    return allAssets.filter((item) => {
      // Storage mode filtering
      if (storageMode === "local" && !item.filePath && !binAssets.some((b) => b.id === item.id)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!item.title.toLowerCase().includes(q)) return false;
      }
      if (tab === "bin") return binAssets.some((b) => b.id === item.id);
      if (tab === "history") return item.isSeriesMedia === true;
      if (tab === "broll") return item.category === "video" || item.category === "broll" || item.category === "image";
      if (tab === "music") return item.category === "music";
      if (tab === "sfx") return item.category === "sfx";
      return true;
    });
  }, [allAssets, binAssets, searchQuery, tab, storageMode]);

  if (!isOpen) return null;

  const handleImportLocalFiles = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media Files",
            extensions: ["mp4", "mov", "mkv", "avi", "webm", "mp3", "wav", "aac", "ogg", "jpg", "jpeg", "png", "webp"],
          },
        ],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const newItems: MediaAssetItem[] = paths.map((p) => {
        const name = p.split(/[\\/]/).pop() || "Imported Media";
        const ext = name.split(".").pop()?.toLowerCase() || "";
        const isAudio = ["mp3", "wav", "aac", "ogg", "flac", "m4a"].includes(ext);
        const isImage = ["jpg", "jpeg", "png", "webp", "svg"].includes(ext);
        const cat = isAudio ? "music" : isImage ? "image" : "video";
        return {
          id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: name,
          category: cat,
          durationMs: isAudio ? 30000 : isImage ? 3000 : 5000,
          sourceUrl: convertFileSrc(p),
          filePath: p,
          isSeriesMedia: true,
          updatedAt: new Date().toISOString(),
        };
      });

      try {
        const stored = localStorage.getItem("smartspec_custom_assets");
        const list = stored ? JSON.parse(stored) : [];
        const combined = [...newItems, ...list].slice(0, 100);
        localStorage.setItem("smartspec_custom_assets", JSON.stringify(combined));
      } catch (e) {
        console.warn("Save custom assets error:", e);
      }

      setSeriesAssets((prev) => [...newItems, ...prev]);
      setTab("history");
    } catch (err) {
      console.warn("Import files error:", err);
    }
  };

  const handleAddAsset = (asset: MediaAssetItem) => {
    let targetTrack = "track_v2";
    if (asset.category === "music") targetTrack = "track_a2";
    if (asset.category === "sfx") targetTrack = "track_a3";

    const clip: NleClip = {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: asset.title,
      timelineStartMs: currentTimeMs,
      durationMs: asset.durationMs,
      sourceType: asset.filePath ? "local_file" : "smartaihub_library",
      sourcePath: asset.filePath,
      sourceUrl: asset.sourceUrl,
      volume: asset.category === "music" ? 0.35 : 0.85,
      transform:
        asset.category === "broll" || asset.category === "video" || asset.category === "image"
          ? {
              x: 0.5,
              y: 0.5,
              scale: 1.0,
              opacity: 1.0,
            }
          : undefined,
    };

    onAddClip(targetTrack, clip);
  };

  return (
    <aside className="asset-drawer-right-panel" onClick={(e) => e.stopPropagation()}>
      {/* Header with Import and Collapse Buttons */}
      <div className="drawer-header">
        <div className="drawer-title-group">
          <span className="drawer-icon">🗂️</span>
          <div>
            <h3>SmartAIHub Cloud Media & Library</h3>
            <p className="drawer-subtitle">
              {seriesId ? `ซีรีส์ #${seriesId} • ` : ""}ลาก Drag & Drop หรือคลิกวางลงบนแทร็ก Timeline
            </p>
          </div>
        </div>
        <div className="drawer-header-actions">
          <button
            type="button"
            className="drawer-import-btn"
            onClick={() => void handleImportLocalFiles()}
            title="นำเข้าไฟล์วิดีโอ/เสียง/ภาพจากเครื่องเข้าสู่ Library"
          >
            ➕ นำเข้าไฟล์
          </button>
          <button
            type="button"
            className="drawer-collapse-btn"
            onClick={onClose}
            title="ยุบปิดพาเนลไปทางขวา (Collapse)"
          >
            ▶ ยุบแผง
          </button>
        </div>
      </div>

      {/* Storage Mode Toggle (Local vs Cloud Server) */}
      <div className="drawer-mode-toggle-bar">
        <button
          type="button"
          className={`drawer-mode-pill ${storageMode === "local" ? "active" : ""}`}
          onClick={() => setStorageMode("local")}
        >
          💻 ไฟล์ในเครื่อง (Local)
        </button>
        <button
          type="button"
          className={`drawer-mode-pill ${storageMode === "cloud" ? "active" : ""}`}
          onClick={() => setStorageMode("cloud")}
        >
          ☁️ SmartAIHub Server
        </button>
      </div>

      {/* Search Input */}
      <div className="drawer-search-row">
        <input
          type="text"
          className="drawer-search-input"
          placeholder="🔍 ค้นหา Media Bin, History, วิดีโอ หรือเสียง..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="drawer-search-clear-btn"
            onClick={() => setSearchQuery("")}
            title="ล้างคำค้นหา"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="drawer-tabs-scroller">
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "all" ? "active" : ""}`}
          onClick={() => setTab("all")}
        >
          📋 ทั้งหมด ({allAssets.length})
        </button>
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "bin" ? "active" : ""}`}
          onClick={() => setTab("bin")}
          style={{ borderColor: tab === "bin" ? "#f59e0b" : undefined, color: tab === "bin" ? "#f59e0b" : undefined }}
        >
          📦 Media Bin ({binAssets.length})
        </button>
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          🕒 Media History {seriesAssets.length > 0 ? `(${seriesAssets.length})` : ""}
        </button>
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "broll" ? "active" : ""}`}
          onClick={() => setTab("broll")}
        >
          🎬 วิดีโอ & B-Roll
        </button>
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "music" ? "active" : ""}`}
          onClick={() => setTab("music")}
        >
          🎵 เพลง BGM
        </button>
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "sfx" ? "active" : ""}`}
          onClick={() => setTab("sfx")}
        >
          💥 Sound FX
        </button>
      </div>

      {/* Items List / Cards */}
      <div className="drawer-items-container">
        {isLoadingSeries && (
          <div className="drawer-loading-indicator">
            <span>⏳ กำลังดึงประวัติ Media จาก SmartAIHub Series...</span>
          </div>
        )}

        {filteredAssets.length === 0 ? (
          <div className="drawer-empty-state">
            <span className="drawer-empty-icon">📂</span>
            <p>ไม่พบรายการสื่อที่ตรงกับเงื่อนไข</p>
            <button
              type="button"
              className="drawer-empty-import-btn"
              onClick={() => void handleImportLocalFiles()}
            >
              ➕ เลือกไฟล์จากเครื่องเข้าสู่ Library
            </button>
            {tab === "history" && (
              <span className="drawer-empty-hint">
                วิดีโอที่ Render เสร็จในเครื่อง หรือไฟล์ที่นำเข้ามาจะปรากฏที่นี่โดยอัตโนมัติ
              </span>
            )}
          </div>
        ) : (
          filteredAssets.map((item) => {
            const isAudio = item.category === "music" || item.category === "sfx";
            const targetTrackLabel =
              item.category === "music"
                ? "BGM (A2)"
                : item.category === "sfx"
                ? "SFX (A3)"
                : "B-Roll (V2)";

            return (
              <div
                key={item.id}
                className="drawer-asset-item-card"
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({
                      type: "smartaihub_asset",
                      id: item.id,
                      title: item.title,
                      category: item.category,
                      sourceUrl: item.sourceUrl,
                      durationMs: item.durationMs,
                      thumbnailUrl: item.thumbnailUrl,
                    })
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title="สามารถคลิกปุ่มวาง หรือลากการ์ดนี้ไปวางบน Timeline / Canvas ได้ทันที"
              >
                <div className="drawer-card-left">
                  <AssetThumbnailCard item={item} />
                </div>

                <div className="drawer-card-content">
                  <div className="drawer-card-top-row">
                    <strong className="drawer-card-title">{item.title}</strong>
                    {item.isSeriesMedia && (
                      <span className="drawer-history-tag">Series Hub</span>
                    )}
                  </div>

                  <div className="drawer-card-meta">
                    <span className="drawer-meta-pill">
                      ⏱ {(item.durationMs / 1000).toFixed(1)}s
                    </span>
                    <span className="drawer-meta-pill category-pill">
                      {isAudio ? "Audio" : item.category === "video" ? "Video" : "Overlay"}
                    </span>
                    {item.fileSizeLabel && (
                      <span className="drawer-meta-pill size-pill">{item.fileSizeLabel}</span>
                    )}
                  </div>

                  <div className="drawer-card-actions">
                    <button
                      type="button"
                      className="drawer-add-btn"
                      onClick={() => handleAddAsset(item)}
                      title={`วางลงในแทร็ก ${targetTrackLabel}`}
                    >
                      ➕ วางลง {targetTrackLabel}
                    </button>
                    <span className="drawer-drag-hint">✥ ลากไปวางได้</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="drawer-footer-bar">
        <span className="footer-drag-info">
          💡 สามารถ Drag & Drop การ์ดไปวางบน Timeline หรือหน้าจอ Preview Canvas ได้โดยตรง
        </span>
      </div>
    </aside>
  );
}
